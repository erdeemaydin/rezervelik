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

- [x] **A1 — Schema & migrations.** `Restaurant.latitude/longitude/addressText`;
  `OrderSettings.autoConfirmOrders/maxDeliveryMeters/noShowWarnThreshold`;
  `OrderMenuCategory`; `OrderMenuItem` (menuItemId FK, overrides, isListed,
  isAvailable, pausedUntil, pausedIndefinitely, sortOrder, prepTimeMinutes,
  orderCategoryId); `CustomerBan`; `Customer.noShowCount`; `OrderStatus +=
  NOT_PICKED_UP`. Dev migration + data migration seeding `OrderMenuItem` from
  existing `MenuItem.isOrderableOnline = true`. `prisma generate` + `npm run build`.
- [x] **A2 — Backend geo + delivery range.** `src/services/geoService.ts`
  (haversineMeters, pointInPolygon, resolveDeliveryZone). `orderPricingService`
  accepts `{ lat, lng }`, enforces `maxDeliveryMeters`, returns
  `distanceMeters` and throws `errors.order_out_of_delivery_range`.
  `quoteOrder` + `placeOrder` resolve the zone server-side from the pin
  (saved-address `zoneId` still allowed, and is the automatic fallback for
  tenants with no coordinates set). New `POST /api/public/order/check-address`
  returns the range verdict for a pin before there's a cart. Canonical
  `DeliveryZone.polygon` format: `{ points: [{ lat, lng }, ...] }`. Public
  restaurant payload already exposed `latitude/longitude` (no top-level
  `select` in `getRestaurantBySlug`).
- [x] **A3 — Backend curated order menu.** `orderMenuController` + routes (CRUD for
  order categories & catalog items, pause endpoint). `getOrderableMenu` returns
  the curated catalog with effective name/price/photo + availability/pause.
  Pricing service reads `priceOverride` and rejects paused/unavailable items.
  Effective-value rules (name/description/photo/price/prep-time overrides,
  `paused`, `unavailableReason`) live in one shared module, `src/utils/orderMenu.ts`,
  so the staff editor, the customer menu and the pricing authority can't drift.
  Staff surface: `GET /api/orders/order-menu` (orderCategories + catalog +
  sourceItems picker), `POST|PUT|PATCH .../items[/:id[/pause]]`, `DELETE
  .../items/:id`, `POST|PUT|DELETE .../categories[/:id]`, `PUT .../reorder`.
  Customer `GET /api/public/order/menu` now returns grouped categories whose
  items carry `available` / `unavailableReason` (`PAUSED` | `OUT_OF_STOCK`) /
  `resumesAt` — paused items are **returned, not hidden** (requirement #2).
  Grouping: order-only categories first (by `sortOrder`), then source
  `MenuCategory` sections (by `order`); items by `OrderMenuItem.sortOrder` then
  `MenuItem.order`. The legacy `PATCH /api/orders/menu/:id/orderable` toggle now
  mirrors into `OrderMenuItem` (off ⇒ `isListed: false`, overrides preserved)
  so `dashboard/menus` stays consistent until A7. New i18n key
  `errors.order_item_paused`.
- [x] **A4 — Backend confirm flow + no-show + bans.** `autoConfirmOrders` makes
  `placeOrder` create the order `ACCEPTED` instead of `NEW`; that path also now
  enforces `maxConcurrentOrders` (non-terminal count, `errors.order_capacity_full`)
  and the weekly `orderHours` schedule in the tenant's own timezone
  (`errors.online_ordering_closed`). The status machine moved to
  `src/utils/orderStatus.ts` (shared with the capacity check) and gained
  `NOT_PICKED_UP` as a forward transition from `READY`/`OUT_FOR_DELIVERY`;
  reaching it increments `Customer.noShowCount` inside the same transaction as
  the concurrency-safe conditional status write, audited as
  `ORDER_MARKED_NOT_PICKED_UP`. Phone-scoped `CustomerBan` CRUD
  (`GET|POST /api/orders/bans`, `PATCH /api/orders/bans/:id/lift`, actor names
  resolved via one batched `user.findMany` — no bare UUIDs) with
  `isPhoneBanned` enforced in `requestOtp` / `verifyOtp` / `placeOrder`
  (`errors.order_customer_banned`). `listOrders` / `streamOrders` gained
  `customer.noShowCount` + `customerBanned`, `listCustomers` `banned`,
  `getCustomerDetail` `bans[]` + `banned` — all via batched ban lookups.
  `PUT /api/orders/restaurant-location` writes `Restaurant.latitude/longitude/
  addressText`; `GET /api/orders/order-settings` now also returns
  `restaurantLocation`, and the public `GET /api/public/order/settings` returns
  `orderHours` + a computed `withinOrderHours`.
- [x] **A5 — Frontend map infra + checkout.** `leaflet@1.9` + `react-leaflet@5`
  (React 19 is in v5's peer range — no downgrade needed) + `@types/leaflet`.
  `components/maps/LeafletMap.tsx` (client-only, loaded via `next/dynamic`
  `ssr:false`; inline SVG `divIcon` instead of the broken bundler default
  marker; OSM tiles + attribution; draggable + click-to-move pin; isolated
  stacking context so tiles can't paint over the sticky header/action bar) and
  `components/maps/AddressPicker.tsx` (Nominatim search debounced 600ms/min 3
  chars, reverse geocode on pin settle only, `accept-language` from the current
  locale, geolocation shortcut, silent failure). `lib/orderApi.ts` synced with
  A2–A4: `OrderableMenuItem.menuItemId` (was `id`) + `available` /
  `unavailableReason` / `resumesAt` / `prepTimeMinutes`,
  `OrderableMenuCategory.sortOrder` + `isOrderOnlyCategory`,
  `PublicOrderSettings.orderHours` + `withinOrderHours`,
  `OrderQuote.distanceMeters`, `fetchQuote` accepts `lat`/`lng`, new
  `checkAddress()` + `AddressCheckResult`. `CartFulfillmentStep`'s delivery
  section is now map-first (pin → `check-address` verdict → "delivers here ·
  fee · min order · ~N km" or a blocking out-of-range panel), with the manual
  zone list kept verbatim as the `needsManualZone` fallback. `AddressFormState`
  carries `lat`/`lng` + an `autoFilled` flag, and its setter is now a real
  state dispatcher so a late reverse-geocode label can't clobber typing.
  `OrderExperience` owns the pin/verdict state, sends `lat`/`lng` on both
  `/quote` and `placeOrder`, holds the quote until a positive range verdict,
  and maps `errors.order_out_of_delivery_range` to a friendly message.
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
