'use client';

// Map + address search + reverse geocode, built on OpenStreetMap data:
// Leaflet for the tiles/pin and Nominatim for geocoding. Deliberately
// key-less and billing-free (docs/packaging/online-ordering-v2-plan.md
// decision #2), which is also why the Nominatim etiquette rules matter here:
// at most ~1 request/second, and a language hint on every call. Both search
// and reverse geocode are debounced, and reverse geocode only fires when the
// pin actually settles (dragend / click / search pick), never per drag frame.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/provider';
import type { OrderTheme } from '@/lib/orderTheme';
import type { LatLngValue } from './LeafletMap';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div className="h-64 w-full animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-700/40" />
  );
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const SEARCH_DEBOUNCE_MS = 600;
const REVERSE_DEBOUNCE_MS = 600;
const MIN_QUERY_LENGTH = 3;

interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

export interface AddressPickerValue extends LatLngValue {
  label?: string;
}

export default function AddressPicker({
  value,
  onChange,
  restaurantLocation,
  theme,
}: {
  value: LatLngValue | null;
  onChange: (v: AddressPickerValue) => void;
  restaurantLocation?: LatLngValue | null;
  theme: OrderTheme;
}) {
  const { t, locale } = useTranslation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [locating, setLocating] = useState(false);

  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseAbort = useRef<AbortController | null>(null);

  const center = useMemo(() => restaurantLocation || undefined, [restaurantLocation]);

  // --- search -------------------------------------------------------------
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const url =
          `${NOMINATIM}/search?format=json&addressdetails=1&limit=5` +
          `&accept-language=${encodeURIComponent(locale)}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('search failed');
        const data = (await res.json()) as NominatimPlace[];
        setResults(Array.isArray(data) ? data : []);
        setSearched(true);
      } catch {
        // Geocoding is a convenience on top of the map — a failed lookup must
        // never block the customer, who can still drop the pin by hand.
        if (!controller.signal.aborted) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, locale]);

  // --- reverse geocode ----------------------------------------------------
  const scheduleReverse = useCallback(
    (pin: LatLngValue) => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseAbort.current?.abort();
      const controller = new AbortController();
      reverseAbort.current = controller;
      reverseTimer.current = setTimeout(async () => {
        try {
          const url =
            `${NOMINATIM}/reverse?format=json&lat=${pin.lat}&lon=${pin.lng}` +
            `&accept-language=${encodeURIComponent(locale)}`;
          const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
          if (!res.ok) return;
          const data = (await res.json()) as { display_name?: string };
          if (controller.signal.aborted || !data?.display_name) return;
          onChange({ ...pin, label: data.display_name });
        } catch {
          // Silent: keep the pin, just no prefilled label.
        }
      }, REVERSE_DEBOUNCE_MS);
    },
    [locale, onChange]
  );

  useEffect(
    () => () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseAbort.current?.abort();
    },
    []
  );

  const handlePinChange = useCallback(
    (pin: LatLngValue) => {
      onChange(pin); // instant feedback; the label catches up when Nominatim answers
      scheduleReverse(pin);
    },
    [onChange, scheduleReverse]
  );

  const handlePick = (place: NominatimPlace) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setResults([]);
    setSearched(false);
    setQuery('');
    onChange({ lat, lng, label: place.display_name });
  };

  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        handlePinChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: theme.muted }} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('publicOrder.address.searchPlaceholder')}
          aria-label={t('publicOrder.address.searchLabel')}
          className="h-11 pl-9 pr-9 text-sm"
        />
        {(searching || query) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.muted }} />
            ) : (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('publicOrder.address.clearSearch')}
                className="hover:opacity-70"
                style={{ color: theme.muted }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </span>
        )}

        {results.length > 0 && (
          <ul
            className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-60 overflow-y-auto rounded-xl border shadow-lg"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          >
            {results.map((place) => (
              <li key={place.place_id}>
                <button
                  type="button"
                  onClick={() => handlePick(place)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs hover:opacity-80"
                  style={{ color: theme.text }}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: theme.primary }} />
                  <span className="min-w-0">{place.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searched && !searching && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && (
        <p className="text-xs" style={{ color: theme.muted }}>{t('publicOrder.address.noResults')}</p>
      )}

      <LeafletMap value={value} onChange={handlePinChange} center={center} heightClass="h-64" />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: theme.muted }}>{t('publicOrder.address.dragHint')}</p>
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          className="flex shrink-0 items-center gap-1 text-xs font-semibold hover:opacity-70 disabled:opacity-50"
          style={{ color: theme.primary }}
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          {t('publicOrder.address.useMyLocation')}
        </button>
      </div>
    </div>
  );
}
