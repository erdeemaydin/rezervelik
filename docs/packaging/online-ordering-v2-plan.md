# Online Ordering v2 — Implementation Plan & Progress

Branch: `agent/ordering-v2` (off `agent/telegram-bot`). Executed as a sequence of
focused agents; each is committed and build-verified before the next starts.

## Product decisions (locked with the user, 2026-08-29)

1. **Order menu = curated from the main menu, with overrides.** Same `MenuItem`
   records; a new dedicated "Order Menu" window under `/dashboard/orders` lets the
   tenant choose which items sell online and set online-only **price override**,
   **name/description/photo override**, **order-only categories + sort order**,
   permanent availability, and a **temporary pause** ("temporarily unavailable to
   order"). No forked/duplicated menu data.
2. **Maps = Leaflet + OpenStreetMap tiles + Nominatim geocoding.** No API key, no
   billing. Draggable pin + address search + reverse geocode on the customer side;
   a pin picker for the restaurant's own location on the dashboard.
3. **Delivery range = auto-resolved from the customer's map pin.** Server computes
   haversine distance from the restaurant location, picks the smallest matching
   `RADIUS` zone (concentric on the restaurant) or a containing `AREA` polygon
   zone; outside all zones / beyond `OrderSettings.maxDeliveryMeters` →
   "outside our delivery area", checkout blocked. Manual zone dropdown removed
   from the customer flow (saved-address `zoneId` still honored as a fast path).
4. **Customer bans = manual + no-show tracking.** `CustomerBan` is phone-scoped
   (survives re-registration), has a reason + the staff member who set it, and
   blocks OTP + ordering. New terminal order status `NOT_PICKED_UP` increments
   `Customer.noShowCount`; the dashboard shows a warning badge for repeat
   offenders. No automatic bans.

## Also in scope

- **Auto-confirm** setting: `OrderSettings.autoConfirmOrders`. Off → new orders
  land in `NEW` (pending restaurant confirmation) and the customer sees a
  "waiting for the restaurant to confirm" tracking state; staff confirm/reject.
  On → orders are created `ACCEPTED` (still subject to hours/capacity).
- **Separate "Active Orders" table** in the dashboard: live (SSE) list of
  in-progress orders with confirm / reject / advance and no-show / ban badges,
  distinct from the History tab and from the kitchen `/order-station` board.
- **Customer UI redesign** to a modern delivery-app look (Uber Eats / Yemeksepeti):
  restaurant header with cover image + distance + ETA + min order, sticky category
  nav, image-forward item cards, item sheet with modifiers, persistent bottom cart
  bar, map-based address step, restyled identify / payment / live tracking.

## Agent sequence

- [ ] **A1 — Schema & migrations.** `Restaurant.latitude/longitude/addressText`;
  `OrderSettings.autoConfirmOrders/maxDeliveryMeters/noShowWarnThreshold`;
  `OrderMenuCategory`; `OrderMenuItem` (menuItemId FK, overrides, isListed,
  isAvailable, pausedUntil, pausedIndefinitely, sortOrder, prepTimeMinutes,
  orderCategoryId); `CustomerBan`; `Customer.noShowCount`; `OrderStatus +=
  NOT_PICKED_UP`. Dev migration + data migration seeding `OrderMenuItem` from
  existing `MenuItem.isOrderableOnline = true`. `prisma generate` + `npm run build`.
- [ ] **A2 — Backend geo + delivery range.** `src/services/geoService.ts`
  (haversineMeters, pointInPolygon, resolveDeliveryZone). `orderPricingService`
  accepts `{ lat, lng }`, enforces `maxDeliveryMeters`, returns
  `distanceMeters` / `outOfRange`. `quoteOrder` + `placeOrder` resolve the zone
  server-side from the pin (saved-address `zoneId` still allowed). Public
  restaurant payload exposes `latitude/longitude`.
- [ ] **A3 — Backend curated order menu.** `orderMenuController` + routes (CRUD for
  order categories & catalog items, pause endpoint). `getOrderableMenu` returns
  the curated catalog with effective name/price/photo + availability/pause.
  Pricing service reads `priceOverride` and rejects paused/unavailable items.
- [ ] **A4 — Backend confirm flow + no-show + bans.** `autoConfirmOrders` in
  `placeOrder`; `NOT_PICKED_UP` transition + `noShowCount` increment; `CustomerBan`
  CRUD + enforcement in `requestOtp` / `verifyOtp` / `placeOrder`; order-list &
  customer-detail includes gain `noShowCount` + `banned`. `PUT /api/restaurants/me`
  (or dedicated) accepts location fields.
- [ ] **A5 — Frontend map infra + checkout.** `leaflet` + `react-leaflet` deps;
  `AddressPicker` / `LeafletMap` (dynamic, `ssr:false`, Nominatim search +
  reverse geocode + draggable pin). Rebuild the delivery section of the checkout
  step: pin → auto zone/fee, out-of-range state, structured address fields.
- [ ] **A6 — Frontend customer ordering redesign.** `OrderExperience`, `MenuStep`,
  `ItemCustomizeDialog`, cart sheet, header, sticky category nav, bottom cart bar,
  temporarily-unavailable item state, restyled identify / payment / placed +
  pending-confirmation tracking.
- [ ] **A7 — Frontend dashboard Order Menu + settings.** New "Order Menu" window
  (curate items, overrides, order-only categories, drag sort, pause). Order
  settings: auto-confirm, max delivery distance, no-show threshold, restaurant
  location map picker.
- [ ] **A8 — Frontend Active Orders + bans.** Live "Active Orders" table with
  confirm / reject / advance + no-show / ban badges; customer-detail ban/unban +
  noShowCount; `/order-station` handles `NOT_PICKED_UP` + pending-confirm.
- [ ] **A9 — Review + docs + ship.** Full-diff review pass, fix findings, update
  `PROJECT_LOGIC.md` / `API_DOCS.md` / `ROADMAP.md` / this file, rebuild, restart
  PM2, open PR.

## Non-negotiables (carry into every agent)

- Every tenant-scoped query filtered by `restaurantId`; new routes mounted behind
  `tenantMiddleware` in `src/app.ts`.
- Recompute all prices/fees/eligibility server-side; never trust client values.
- New user-facing strings added to `en.json` **and** `tr.json` together.
- Never expose raw UUIDs in dashboard selects — map id → human name.
- Postgres everywhere; schema changes go through `prisma migrate` + `prisma generate`.
- `frontend/` is Next.js 16 / React 19 — check `node_modules/next/dist/docs/`
  before relying on remembered APIs; Leaflet components need `ssr:false`.
