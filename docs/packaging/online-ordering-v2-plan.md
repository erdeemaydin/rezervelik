# Online Ordering v2 — Implementation Plan & Progress

## Shipped

**2026-08-29** — branch `agent/ordering-v2`, 11 commits off `agent/telegram-bot`
(`74deb75..HEAD`, 52 files, ~7.8k insertions), one additive migration
(`prisma/migrations/20260829111123_ordering_v2_schema`). A1–A9 complete; docs updated in
`PROJECT_LOGIC.md` §15, `API_DOCS.md` §5 and `ROADMAP.md`. Backend `npm run build`, frontend
`npm run build`, `tsc --noEmit` and `eslint` on every changed file all clean; `prisma migrate
status` up to date; backend and frontend i18n dictionaries are at exact key parity and every
`errors.order_*` key used in a controller exists in both. **Not yet exercised against a running
app** — no agent ran the flow end to end against a non-prod database, so the click-through list
under "Follow-ups" below is still outstanding.

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
- [x] **A6 — Frontend customer ordering redesign.** Delivery-app shell in
  `OrderExperience`: `RestaurantHero` (cover = `Restaurant.logoUrl`, else a
  brand-derived gradient; logo + name + prep-window/distance/min-order stats),
  a compact `fixed` header that fades in past 80px of scroll, and a persistent
  bottom cart bar. `MenuStep` gained a sticky category rail (`top-14`, keyed
  `${isOrderOnlyCategory}:${id}`) with a rAF-throttled scroll-spy and anchored
  sections, image-forward cards, a "Popular" ribbon for `isHighlight`, and the
  temporarily-unavailable state (`PAUSED` → "back around {time}" when
  `resumesAt` is still ahead, else "temporarily unavailable"; `OUT_OF_STOCK` →
  "currently unavailable") rendered dimmed and un-addable. `ItemCustomizeDialog`
  is now a bottom sheet (hero image, dietary/allergen/spice/calorie chips,
  radio/checkbox modifier groups with min/max hints, quantity stepper, per-item
  note, sticky "Add · price"). New `CartSheet` is the only mutable view of the
  cart; `CartFulfillmentStep` became the checkout screen (read-only summary +
  segmented fulfillment cards + map/zone address + pickup card with a
  non-interactive `LeafletMap` + fee breakdown), keeping both delivery modes and
  A5's lifted state. `OrderPlacedView` polls every 20s and renders a
  fulfillment-aware timeline from the new `lib/orderStatusFlow.ts`, with `NEW`
  promoted to a "waiting for {restaurant} to confirm" banner and dedicated
  `REJECTED`/`CANCELLED`/`NOT_PICKED_UP` panels. `withinOrderHours === false`
  shows a closed banner and blocks cart building. `orderTheme` gained
  `primaryTint`/`primarySoft`/`shadow`/`shadowLg`/`heroGradient`. One backend
  change: `getOrderableMenu` re-emits `isHighlight`, `dietaryTags`, `allergens`,
  `spiceLevel`, `calories`.
- [x] **A7 — Frontend dashboard Order Menu + settings.** New `/dashboard/orders/menu`
  window: an "Add items" dialog over `sourceItems` (grouped by source category,
  `inCatalog` rows disabled), then a catalog editor whose sections are the
  order-only categories by `sortOrder` followed by a "From menu categories"
  grouping of every `orderCategoryId === null` row (grouped by
  `menuItem.category`, groups ordered by their lowest `menuItem.order`). Each
  row carries Listed/Available switches, a pause popover (1h / 2h / next local
  midnight / indefinite / resume — the ISO instant is computed client-side, so
  "until tomorrow" is the staff member's own midnight), an overrides dialog
  (name / description / price / photo / prep time, each with a
  "reset to menu default" that sends `''` = clear, plus an order-only category
  `Select` with "(from menu category)" = `null`), remove-with-confirm, and a
  `@dnd-kit/sortable` drag handle persisting through `PUT .../reorder`
  (per-section 0..n indexes; ties preserve the server's `createdAt` order). A
  categories dialog adds / inline-renames / deletes / drag-reorders order-only
  categories. Order settings gained an auto-confirm switch (the boolean is
  always sent — an omitted field is a server-side no-op, so "turn it off" would
  otherwise be unsaveable), `noShowWarnThreshold` + "enforced at checkout" notes
  on the capacity/hours cards, and a Delivery range card: max distance edited in
  km (`maxDeliveryMeters / 1000`, empty ⇒ `null`) plus a `LeafletMap` pin picker
  with a dashboard-styled Nominatim search and an `addressText` line, saved
  through a second sequential `PUT /orders/restaurant-location` only when the
  pin/address actually changed. `dashboard/menus` lost its inline
  `isOrderableOnline` switch and prep-time input (and the `menus.table
  .onlineOrdering` column) in favour of a one-line pointer to the new window,
  shown only when the add-on is on and the user holds `manage_orders`. Nav
  unchanged — `AdminLayout`'s Orders entry is flat and its `/dashboard/orders`
  permission prefix already covers the new route.
- [x] **A8 — Frontend Active Orders + bans.** The order-station's shared pieces
  moved to `frontend/src/lib/orders/` (`types.ts`, `statusRules.ts`, `stream.ts`,
  plus a new `badges.ts`) now that two routes consume them; `OrderStatus` gained
  `NOT_PICKED_UP`, `StaffOrder` gained `customer.noShowCount` + `customerBanned`,
  and `statusRules` gained `canMarkNotPickedUp` (deliberately never returned by
  `nextStatusFor` — a no-show is not a happy-path advance). `dashboard/orders`
  leads with a new default **Active** tab (`components/orders/ActiveOrdersTable`):
  the five active statuses fetched once then kept live over the SSE stream, a
  live/reconnecting pill, an amber "needs confirmation" treatment on `NEW` rows,
  inline confirm / reject / advance / not-picked-up / cancel per row (Confirm
  hidden when `autoConfirmOrders`), and 409 → "changed elsewhere" + refetch.
  Bans: red/⚠ badges on the Active, Customers and order-detail views, a ban
  dialog with reason (409 → "already banned", not a generic error), lift via
  `useConfirm`, and a ban-history list with actor names in the customer detail.
  `/order-station` gained a "Not picked up" card action + confirm dialog, an
  "Accept" label on `NEW` cards, and the same no-show/banned badges.
- [x] **A9 — Review + docs + ship.** Full-diff review pass across all 48 changed files.
  Verified: every new Prisma query in `orderMenuController` / `orderController` /
  `customerOrderController` / `orderPricingService` / `geoService` is tenant-scoped
  (`OrderMenuItem`/`OrderMenuCategory`/`CustomerBan` by their own `restaurantId`,
  `MenuItem` through the `category.menu.restaurantId` chain, `reorder` via
  `updateMany` with `restaurantId` in the WHERE, and every update-by-id preceded by an
  ownership `findFirst`); the status machine agrees across all three modules
  (`src/utils/orderStatus.ts`, `lib/orders/statusRules.ts`, `lib/orderStatusFlow.ts` —
  same transitions, all four terminal statuses including `NOT_PICKED_UP`,
  `nextStatusFor` never returns it) and the delivery guards are an `else if` chain that
  can't block `READY→NOT_PICKED_UP` or `OUT_FOR_DELIVERY→NOT_PICKED_UP`; A2 and A3 both
  survive intact in `orderPricingService` (pin/zone resolution *and* catalog gating,
  `priceOverride` driving both `unitPrice` and the min-order check, modifiers still read
  off the source `MenuItem`, `effectiveName` snapshotted into `nameSnapshot`); geo maths,
  the three accepted polygon encodings, open/closed rings and all three
  `resolveDeliveryZone` branches (including `NO_RESTAURANT_LOCATION` falling back to the
  manual `zoneId` rather than throwing); bans enforced in `requestOtp` + `verifyOtp` +
  `placeOrder` with matching `.trim()` normalization on both the store and the check
  sides; the menu payload shape matching `lib/orderApi.ts` exactly and `MenuStep` /
  `ItemCustomizeDialog` reading `menuItemId`; `OrderExperience` withholding the quote
  until a positive range verdict and sending `zoneId` XOR `lat`/`lng`; the
  `NOT_PICKED_UP` + `noShowCount` transaction only incrementing on `count === 1`; i18n
  key-set parity in both dictionaries; no `LeafletMap` import outside
  `next/dynamic({ssr:false})`; and an additive-only migration on a clean
  `prisma migrate status`.
  **One bug found and fixed:** `PATCH /api/orders/:id/status` returned a bare `Order`
  (`include: { items: true }`) while both live staff surfaces merge that response
  straight into list state — so confirming/advancing a row on the dashboard Active
  Orders table or the `/order-station` board blanked out the customer name/phone column
  and dropped the no-show/banned badges on that row until an SSE event happened to
  repair it (and never, if the stream was reconnecting). `lib/orders/types.ts` already
  documented this endpoint as carrying `customer` + `customerBanned`; the controller now
  actually does.

## Follow-ups (not blockers, ordered by likelihood of being hit)

1. **`AREA` delivery zones can't be created from the UI.** The zone dialog on
   `/dashboard/orders/settings` offers `matchType: AREA` but there is no polygon drawing
   tool, so the zone is saved with `polygon: null` and `pointInPolygon` can never match
   it. Pre-v2 this was survivable (the customer picked the zone by hand from the
   dropdown); now that a tenant with coordinates gets *automatic* resolution, an AREA
   zone is silently dead and every address reads as out of range. Until a polygon editor
   ships, tenants that set a restaurant pin should use `RADIUS` zones only. Deliberately
   not "fixed" by removing the AREA option — that's a product call.
2. **`orderHours` is now enforced, and the settings editor materialises a default week.**
   `WeeklyHoursEditor` pre-dates v2 and defaults every day to 09:00–22:00, so any tenant
   who ever opened and saved the order-settings page has a full weekly schedule stored —
   which A4 now enforces at checkout (`errors.online_ordering_closed`). Before deploying,
   sanity-check existing rows: `SELECT "restaurantId", "orderHours" FROM "OrderSettings"
   WHERE "orderHours" IS NOT NULL;` — a tenant that takes orders round the clock should
   have its days marked open with a wrapping window (or the column cleared to `NULL`,
   which `isWithinOrderHours` treats as permissive).
3. **A tenant with a pin but no delivery zones blocks all delivery.**
   `resolveDeliveryZone` returns `OUT_OF_RANGE` when no zone matches, so the customer
   sees "outside our delivery area" rather than a setup hint. (Not a regression — pre-v2
   the same tenant got `errors.order_zone_required` — but it's the first thing to check
   when delivery "doesn't work".)
4. **Ban matching is exact-string on the phone.** `+905551112233` and `05551112233` are
   different bans. Fine today because every stored `Customer.phone` comes from the same
   OTP path, but a normalizer (`src/utils/phone.ts`) would make this robust.
5. **`GET /api/orders/bans` has no frontend consumer.** Bans are managed per-customer from
   the customer-detail dialog; a tenant-wide bans list page could use this endpoint.
6. **`POST /api/public/order/check-address` is rate-limited to 30/min per IP.** A customer
   who drags the pin a lot can exhaust it, and the failure path leaves `addressCheck` null
   (Continue stays disabled) for up to a minute. Consider raising the cap or surfacing a
   "try again in a moment" message.
7. **`/order-station`'s `submitNotPickedUp` doesn't special-case `409`** the way the
   dashboard's `ActiveOrdersTable.patchStatus` does; it shows a generic error toast
   instead of "changed elsewhere" + refetch.
8. **`getOrderMenu` returns catalog rows whose source menu is inactive**, while the
   customer menu filters them out (`menu.isActive`). Harmless — staff can see and remove
   the stale row — but the two lists can disagree on count.

## Non-negotiables (carry into every agent)

- Every tenant-scoped query filtered by `restaurantId`; new routes mounted behind
  `tenantMiddleware` in `src/app.ts`.
- Recompute all prices/fees/eligibility server-side; never trust client values.
- New user-facing strings added to `en.json` **and** `tr.json` together.
- Never expose raw UUIDs in dashboard selects — map id → human name.
- Postgres everywhere; schema changes go through `prisma migrate` + `prisma generate`.
- `frontend/` is Next.js 16 / React 19 — check `node_modules/next/dist/docs/`
  before relying on remembered APIs; Leaflet components need `ssr:false`.
