import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { logAudit } from '../services/auditService';

// Resolve a Google Place ID from whatever the tenant pasted. We accept either a
// raw Place ID or a Google Maps URL and try, in order:
//   1. The input already looks like a Place ID (ChIJ… / GhIJ… tokens).
//   2. A `place_id=…` query parameter (present on many share/embed links).
//   3. A `!1s<place_id>` segment in the `/data=` blob of a full maps URL.
// Returns null when nothing usable is found (the UI then asks for a better link).
export const resolvePlaceId = (input?: string | null): string | null => {
  if (!input) return null;
  const raw = input.trim();

  // 1. Bare Place ID (no spaces, no scheme, starts with a known prefix).
  if (/^(ChIJ|GhIJ|Eh|EiC|Ej)[\w-]{5,}$/.test(raw) && !raw.includes('/')) {
    return raw;
  }

  // 2. place_id query param.
  const q = raw.match(/[?&]place_id=([\w-]+)/);
  if (q) return q[1];

  // 3. `!1s<id>` inside a /data= blob. Skip the `0x…:0x…` hex form (that's an
  //    ftid, not a Place ID the Details API accepts); keep ChIJ-style ids.
  const s = raw.match(/!1s((?:ChIJ|GhIJ)[\w-]+)/);
  if (s) return s[1];

  return null;
};

// Pull a business name and @lat,lng out of a full Maps URL, e.g.
// .../maps/place/Some+Restaurant/@41.0082,28.9784,17z/data=... — used to bias
// the Find Place From Text fallback below.
const extractNameAndLocation = (url: string): { name: string | null; lat: number | null; lng: number | null } => {
  const nameMatch = url.match(/\/maps\/place\/([^/@]+)/);
  const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : null;
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return {
    name,
    lat: atMatch ? parseFloat(atMatch[1]) : null,
    lng: atMatch ? parseFloat(atMatch[2]) : null,
  };
};

// Almost every Maps URL a tenant actually pastes — the address-bar URL, or
// "Share > Copy link" — encodes the place as a CID (`!1s0x…:0x…`), which
// resolvePlaceId deliberately skips because the Details API doesn't accept it
// as a place_id. Recover a real Place ID via Find Place From Text, using the
// business name (and @lat,lng, if present) the URL already carries.
const findPlaceIdByTextSearch = async (name: string, lat: number | null, lng: number | null): Promise<string | null> => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({ input: name, inputtype: 'textquery', fields: 'place_id', key });
  if (lat != null && lng != null) params.set('locationbias', `point:${lat},${lng}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`, { signal: controller.signal });
    clearTimeout(timer);
    const body: any = await res.json();
    return body?.candidates?.[0]?.place_id || null;
  } catch {
    return null;
  }
};

// Google Maps *share* links (maps.app.goo.gl / goo.gl/maps) carry no Place ID
// until the redirect is followed — expand those first. Then, for any full
// Maps URL that still doesn't yield a direct match (the common CID case),
// fall back to a name-based text search so a normal pasted link actually
// resolves instead of silently leaving the tenant "not configured".
export const resolvePlaceIdAsync = async (input?: string | null): Promise<string | null> => {
  const direct = resolvePlaceId(input);
  if (direct || !input) return direct;

  const raw = input.trim();
  let expanded = raw;

  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(raw)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(raw, { redirect: 'follow', signal: controller.signal });
      clearTimeout(timer);
      expanded = res.url;
    } catch {
      // Keep the original short link — the text-search fallback below still
      // has a shot if it happens to expand client-side info isn't available.
    }
    const fromExpanded = resolvePlaceId(expanded) || resolvePlaceId(decodeURIComponent(expanded));
    if (fromExpanded) return fromExpanded;
  }

  if (!/^https?:\/\//i.test(expanded)) return null;
  const { name, lat, lng } = extractNameAndLocation(decodeURIComponent(expanded));
  if (!name) return null;
  return findPlaceIdByTextSearch(name, lat, lng);
};

// GET /api/reviews — real Google reviews for this tenant.
// Returns a discriminated shape the UI branches on:
//   { configured:false }                     → no link saved yet
//   { configured:true, apiKeyMissing:true }  → link saved but server has no key
//   { configured:true, error:'…' }           → Google returned a non-OK status
//   { configured:true, rating, total, name, reviews:[…] }
export const getGoogleReviews = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { googleMapsUrl: true, googlePlaceId: true },
    });

    const placeId = settings?.googlePlaceId || resolvePlaceId(settings?.googleMapsUrl);
    const mapsUrl = settings?.googleMapsUrl || null;

    if (!placeId) {
      return successResponse(res, { configured: false, mapsUrl });
    }

    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) {
      return successResponse(res, { configured: true, apiKeyMissing: true, placeId, mapsUrl });
    }

    // Prefer the caller's language for review translations when available.
    const acceptLang = (req.headers['accept-language'] || 'en') as string;
    const lang = acceptLang.split(',')[0].split('-')[0] || 'en';
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,rating,user_ratings_total,reviews,url` +
      `&reviews_sort=newest&language=${encodeURIComponent(lang)}&key=${key}`;

    const gRes = await fetch(url);
    const body: any = await gRes.json();

    if (body.status !== 'OK') {
      return successResponse(res, {
        configured: true,
        placeId,
        mapsUrl,
        error: body.status || 'REQUEST_FAILED',
        errorDetail: body.error_message || null,
      });
    }

    const result = body.result || {};
    const reviews = (result.reviews || []).map((r: any) => ({
      author: r.author_name,
      authorUrl: r.author_url || null,
      photo: r.profile_photo_url || null,
      rating: r.rating,
      text: r.text || '',
      relativeTime: r.relative_time_description || '',
      time: r.time ? r.time * 1000 : null,
    }));

    return successResponse(res, {
      configured: true,
      placeId,
      mapsUrl,
      name: result.name || null,
      googleUrl: result.url || null,
      rating: result.rating ?? null,
      total: result.user_ratings_total ?? 0,
      reviews,
    });
  } catch (error) {
    console.error('Get Google reviews error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// PUT /api/reviews/config — save/clear the tenant's Google Maps link.
export const updateReviewConfig = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { googleMapsUrl } = req.body as { googleMapsUrl?: string };

    const trimmed = typeof googleMapsUrl === 'string' ? googleMapsUrl.trim() : '';
    const placeId = trimmed ? await resolvePlaceIdAsync(trimmed) : null;

    const settings = await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: {
        googleMapsUrl: trimmed || null,
        googlePlaceId: placeId,
      },
      select: { googleMapsUrl: true, googlePlaceId: true },
    });

    logAudit({
      req,
      restaurantId,
      category: 'SETTINGS',
      action: 'REVIEW_SOURCE_UPDATED',
      targetType: 'RestaurantSettings',
      targetId: restaurantId,
      metadata: { hasLink: !!settings.googleMapsUrl, resolved: !!settings.googlePlaceId },
    });

    // Signal whether we could resolve a Place ID so the UI can warn on a bad link.
    return successResponse(res, { ...settings, resolved: !!settings.googlePlaceId });
  } catch (error) {
    console.error('Update review config error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
