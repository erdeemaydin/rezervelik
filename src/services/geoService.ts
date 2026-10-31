import { DeliveryZone } from '@prisma/client';
import prisma from '../config/prisma';

// Geo helpers for online ordering: distance from the restaurant to the
// customer's map pin, and which DeliveryZone that pin falls into.
//
// Delivery-range resolution is server-side only (spec §4: never trust
// client-sent fees/eligibility). The customer's Leaflet pin is the input;
// everything else — distance, matched zone, fee, minimum — is computed here
// and in orderPricingService.
//
// IMPORTANT — canonical polygon storage format for DeliveryZone.polygon:
//
//     { "points": [ { "lat": 41.0082, "lng": 28.9784 }, ... ] }
//
// Object pairs, `lat`/`lng` named explicitly, wrapped in a `points` key so the
// column can grow extra metadata later without a format migration. The
// dashboard zone editor (A7) and the customer map (A5) must write this shape.
// pointInPolygon() additionally *reads* two legacy/interop shapes so a
// hand-seeded or GeoJSON-pasted zone still works: a bare array of {lat,lng}
// objects, and a bare array of numeric pairs. Numeric pairs are interpreted as
// GeoJSON order — [lng, lat] — matching what any OSM/Leaflet `toGeoJSON()`
// export produces. Prefer the object form; it is unambiguous.

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8; // IUGG mean earth radius

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two lat/lng points, in meters.
 * Accurate to well within a few meters at city delivery ranges, which is far
 * finer than any delivery-zone boundary needs.
 */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Normalize any of the accepted polygon encodings into GeoPoint[]. */
function normalizePolygon(polygon: unknown): GeoPoint[] {
  if (!polygon) return [];

  // Canonical: { points: [...] }
  const raw: unknown = Array.isArray(polygon)
    ? polygon
    : typeof polygon === 'object' && Array.isArray((polygon as any).points)
      ? (polygon as any).points
      : null;

  if (!Array.isArray(raw)) return [];

  const points: GeoPoint[] = [];
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      // Numeric pair — GeoJSON order, [lng, lat].
      const [lng, lat] = entry;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({ lat: Number(lat), lng: Number(lng) });
      }
      continue;
    }
    if (entry && typeof entry === 'object') {
      const lat = Number((entry as any).lat);
      const lng = Number((entry as any).lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({ lat, lng });
      }
    }
  }
  return points;
}

/**
 * Ray-casting point-in-polygon test on raw lat/lng degrees. City-scale
 * delivery polygons are small enough that treating degrees as a flat plane
 * introduces no meaningful error, and the test is projection-independent for
 * a simple (non-self-intersecting, non-antimeridian-crossing) ring.
 *
 * The ring may be open or closed (last point equal to the first) — both work.
 * Accepts the canonical `{ points: [{lat,lng}, ...] }` object, a bare
 * `{lat,lng}[]` array, or a bare `[lng, lat][]` GeoJSON-ordered pair array.
 */
export function pointInPolygon(
  point: GeoPoint,
  polygon: GeoPoint[] | number[][] | { points: GeoPoint[] } | unknown
): boolean {
  const ring = normalizePolygon(polygon);
  if (ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

export type ResolveZoneResult =
  | { zone: DeliveryZone; distanceMeters: number }
  | {
      zone: null;
      distanceMeters: number | null;
      reason: 'OUT_OF_RANGE' | 'NO_RESTAURANT_LOCATION';
      /** The tenant's hard distance cap, when one is configured — so callers
       *  can tell the customer how far out of range they are. */
      maxDeliveryMeters?: number | null;
    };

/**
 * Resolve which delivery zone a customer pin falls into, for one tenant.
 *
 * `NO_RESTAURANT_LOCATION` is not an error — every tenant that predates the
 * dashboard location picker has null lat/lng, and those tenants must keep
 * working exactly as before (the customer picks a zone explicitly). Callers
 * fall back to the manual `zoneId` path on that reason rather than blocking
 * checkout.
 */
export async function resolveDeliveryZone(params: {
  restaurantId: string;
  lat: number;
  lng: number;
}): Promise<ResolveZoneResult> {
  const { restaurantId, lat, lng } = params;

  const [restaurant, orderSettings] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { latitude: true, longitude: true },
    }),
    prisma.orderSettings.findUnique({
      where: { restaurantId },
      select: { maxDeliveryMeters: true },
    }),
  ]);

  if (
    !restaurant ||
    restaurant.latitude == null ||
    restaurant.longitude == null ||
    !Number.isFinite(restaurant.latitude) ||
    !Number.isFinite(restaurant.longitude)
  ) {
    return { zone: null, distanceMeters: null, reason: 'NO_RESTAURANT_LOCATION' };
  }

  const point: GeoPoint = { lat, lng };
  const distanceMeters = Math.round(
    haversineMeters({ lat: restaurant.latitude, lng: restaurant.longitude }, point)
  );

  const maxDeliveryMeters = orderSettings?.maxDeliveryMeters ?? null;
  if (maxDeliveryMeters != null && distanceMeters > maxDeliveryMeters) {
    return { zone: null, distanceMeters, reason: 'OUT_OF_RANGE', maxDeliveryMeters };
  }

  const zones = await prisma.deliveryZone.findMany({
    where: { restaurantId, isActive: true },
    // Deterministic tie-breaking: cheapest zone first for AREA matches, and a
    // stable order for equal radii.
    orderBy: [{ deliveryFee: 'asc' }, { name: 'asc' }],
  });

  // RADIUS zones are concentric on the restaurant, so the smallest matching
  // radius is the tightest (and conventionally cheapest) tier the pin
  // qualifies for.
  let bestRadiusZone: DeliveryZone | null = null;
  for (const zone of zones) {
    if (zone.matchType !== 'RADIUS' || zone.radiusMeters == null) continue;
    if (distanceMeters > zone.radiusMeters) continue;
    if (!bestRadiusZone || zone.radiusMeters < bestRadiusZone.radiusMeters!) {
      bestRadiusZone = zone;
    }
  }
  if (bestRadiusZone) {
    return { zone: bestRadiusZone, distanceMeters };
  }

  for (const zone of zones) {
    if (zone.matchType !== 'AREA') continue;
    if (pointInPolygon(point, zone.polygon)) {
      return { zone, distanceMeters };
    }
  }

  return { zone: null, distanceMeters, reason: 'OUT_OF_RANGE', maxDeliveryMeters };
}
