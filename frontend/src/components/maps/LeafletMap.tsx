'use client';

// Reusable Leaflet pin-picker. Leaflet touches `document`/`window` at import
// time (its Browser feature-detection runs on module evaluation), so this file
// must never be pulled into a server render — consumers load it through
// next/dynamic(..., { ssr: false }). Nothing imports it directly.

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface LatLngValue {
  lat: number;
  lng: number;
}

/** Istanbul — a sane fallback when neither a pin nor a restaurant location
 *  is known yet (the tenant base is Turkey-first). */
export const DEFAULT_MAP_CENTER: LatLngValue = { lat: 41.0082, lng: 28.9784 };

const DEFAULT_ZOOM = 16;
const OVERVIEW_ZOOM = 12;

// Leaflet's default marker icon resolves its PNGs by relative URL, which
// bundlers rewrite/hash and break ("marker-icon.png 404"). The usual fix is to
// re-point Leaflet at unpkg's CDN copies; we use an inline divIcon instead so
// the pin renders with no network dependency at all and inherits the tenant's
// brand colour through `currentColor` (the ordering flow sets --order-primary
// on an ancestor).
const PIN_SVG = `
<span style="display:block;width:30px;height:40px;color:var(--order-primary,#0f172a)">
  <svg viewBox="0 0 30 40" width="30" height="40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M15 39s12-14.2 12-24A12 12 0 1 0 3 15c0 9.8 12 24 12 24z"
          fill="currentColor" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="15" cy="15" r="4.5" fill="#ffffff"/>
  </svg>
</span>`;

function usePinIcon() {
  return useMemo(
    () =>
      L.divIcon({
        html: PIN_SVG,
        className: 'order-map-pin', // suppress Leaflet's default divIcon box styling
        iconSize: [30, 40],
        iconAnchor: [15, 40],
      }),
    []
  );
}

/** Click-to-move: any tap on the map relocates the pin. */
function ClickCapture({ onChange, enabled }: { onChange: (v: LatLngValue) => void; enabled: boolean }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Keeps the viewport in sync: follow an externally-set pin (search result,
 *  geolocation), and re-centre on `center` while there is no pin yet. */
function Recenter({ value, center }: { value: LatLngValue | null; center?: LatLngValue }) {
  const map = useMap();
  const lastValueKey = useRef<string | null>(null);
  const lastCenterKey = useRef<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const key = `${value.lat},${value.lng}`;
    if (lastValueKey.current === key) return;
    lastValueKey.current = key;
    // Only chase the pin when it lands off-screen (a search hit, geolocation).
    // Re-centring after every drag would yank the map out from under the
    // finger that just moved it.
    const latlng = L.latLng(value.lat, value.lng);
    if (map.getBounds().pad(-0.15).contains(latlng)) return;
    map.setView(latlng, Math.max(map.getZoom(), DEFAULT_ZOOM));
  }, [map, value]);

  useEffect(() => {
    if (value || !center) return;
    const key = `${center.lat},${center.lng}`;
    if (lastCenterKey.current === key) return;
    lastCenterKey.current = key;
    map.setView([center.lat, center.lng], OVERVIEW_ZOOM);
  }, [map, center, value]);

  return null;
}

/** Leaflet measures its container on init; when the map mounts inside a
 *  freshly-revealed panel the first measurement can be zero-height, leaving
 *  grey tiles until something resizes the window. */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

export default function LeafletMap({
  value,
  onChange,
  center,
  heightClass = 'h-64',
  interactive = true,
}: {
  value: LatLngValue | null;
  onChange: (v: LatLngValue) => void;
  center?: LatLngValue;
  heightClass?: string;
  interactive?: boolean;
}) {
  const icon = usePinIcon();
  const initialCenter = value || center || DEFAULT_MAP_CENTER;
  const initialZoom = value ? DEFAULT_ZOOM : center ? OVERVIEW_ZOOM : 11;

  // `isolate` on the wrapper matters: Leaflet gives its panes/controls
  // z-indices up to 1000 and .leaflet-container itself opens no stacking
  // context, so without it the tiles paint straight over the ordering flow's
  // sticky header (z-30) and bottom action bar.
  return (
    <div className={`relative isolate z-0 ${heightClass} w-full overflow-hidden rounded-xl`}>
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={initialZoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        zoomControl={interactive}
        touchZoom={interactive}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <InvalidateOnMount />
        <Recenter value={value} center={center} />
        <ClickCapture onChange={onChange} enabled={interactive} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable={interactive}
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                onChange({ lat, lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
