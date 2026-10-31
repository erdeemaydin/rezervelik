# Dining Reservation SaaS - Project Logic

## 1. System Overview
This is a Multi-tenant Software as a Service (SaaS) platform designed for restaurants. A single backend server and database handle multiple, distinct restaurants. 

The primary features include:
- **Table & Capacity Management:** Defining table types (e.g., Indoor, Terrace) and individual tables.
- **Flexible Reservations:** Supporting different reservation styles based on restaurant preference.
- **QR Menu Integration:** A digital menu system, eventually supporting AI-powered imports from physical menus.
- **Multi-language Support (i18n):** Full support for Turkish and English for both the UI and backend messages.

## 2. Multi-tenancy Architecture
- **Strict Data Isolation:** Every piece of data (Tables, Reservations, Users) belongs to a specific restaurant.
- **Identification:** The backend identifies which restaurant is making a request using a custom HTTP header: `X-Restaurant-ID`. In the future, this can be mapped to subdomains (e.g., `burgerking.our-saas.com` -> Backend uses `burgerking`'s ID).
- **Middleware:** A central `tenantMiddleware` intercepts every API request, ensures the header is present, and attaches the `restaurantId` to the request object. This guarantees that queries only fetch data for that specific restaurant.

## 3. Reservation Logic
The system supports three distinct operational modes, configurable per restaurant in `RestaurantSettings`:

1.  **FIXED_TIME_SLOT:** 
    - The restaurant defines specific, rigid time blocks (e.g., 18:00 - 20:00, 20:00 - 22:00).
    - Customers book these exact slots.

2.  **DYNAMIC_DURATION:**
    - Customers choose an arrival time.
    - The system calculates the `endTime` based on a `defaultDurationMinutes` setting (e.g., 90 minutes).
    - The table is booked from `startTime` to `startTime + 90 mins`.

3.  **MANUAL_AVAILABILITY:**
    - Reservations are accepted without strict end times.
    - The table's status is manually toggled to "Available" or "Occupied" by the restaurant staff.
    - Subsequent reservations for the same table rely on the staff clearing the table in the system.

## 4. Paid Reservations (Future-ready)
- Infrastructure is in place to require deposits for reservations to reduce no-shows.
- The `RestaurantSettings` table holds `isPaidReservationEnabled` and `depositAmount`.
- The actual integration with payment gateways (like iyzico or PayTR) will be implemented as modular external services later.

## 5. Security & Roles
- **Role-Based Access Control (RBAC):** Users belong to a specific restaurant and have roles: `ADMIN`, `MANAGER`, or `STAFF`.
- **JWT Authentication:** Secure token-based authentication for all staff members accessing the dashboard.
- **UUIDs:** All publicly exposed IDs are UUIDs to prevent guessing and scraping.
- **Production Security:** Registration is controlled by `globalSettings.publicRegistrationEnabled`. Super admin bootstrapping requires a securely injected server-side environment variable (`SETUP_SECRET_TOKEN`).
- **Platform-level sub-admins:** `SUPER_ADMIN` is not all-or-nothing. `User.isRootAdmin` (default `true`) distinguishes a full **root** admin from a restricted **sub-admin**, whose access is limited to a whitelisted set of `sys_*` capabilities on `User.permissions` (see the table in `docs/architecture/API_DOCS.md` §2 and `src/config/systemPermissions.ts`). A sub-admin has zero access to any tenant-scoped API and cannot manage other platform administrators under any circumstance — see `requireSystemPermission`/`requireRootSystemAdmin` in `src/middlewares/auth.ts`.

## 6. AI Menu Importer (Phase 2 Placeholder)
- A decoupled service layer is planned. It will take an uploaded image, send it to an OCR/LLM provider, and return a structured JSON representing the menu categories and items.

## 7. UI/UX Rules & Guidelines
- **Dropdown/Select Menus:** Never display raw database IDs (UUIDs) to the user in any dropdown or select menu on the admin panels. Always ensure the `<SelectValue>` or equivalent component maps the selected `id` to its corresponding `name` or `identifier` (e.g., displaying the Category Name instead of Category ID, or Table Identifier instead of Table ID).

## 8. Frontend Customization CMS
- A `FrontendCustomization` model allows tailoring the public-facing booking and menu page (`/r/[slug]`).
- The **Design Architecture** — one of 8 curated layout components, chosen via `layoutStyle` — is controlled exclusively by the root SysAdmin via tenant settings (`system-admin/tenants`), not by the tenant themselves:
  - `CLASSIC_LIST` → `ClassicLayout` — modern minimal, multi-view (welcome/menu/booking/success).
  - `EDITORIAL_IMAGE` → `PremiumLayout` — dark botanical editorial, single-page scroll.
  - `ANIMATED` → `OldenLayout` — vintage/old-world diner feel.
  - `GARDEN_FRESH` → `GardenLayout` — light, warm, organic.
  - `NOIR_LOUNGE` → `NoirLoungeLayout` — dark, neon-accented nightlife/lounge; glass-card bento menu grid instead of a photo gallery.
  - `NORDIC_MINIMAL` → `NordicMinimalLayout` — ultra-clean neutral palette, no hero photo (huge-whitespace typographic hero instead), hairline-divided menu list.
  - `TRATTORIA_RUSTIC` → `TrattoriaRusticLayout` — warm terracotta/wood tones, wavy section dividers, two-column welcome hero instead of full-bleed.
  - `BOLD_EDITORIAL` → `BoldEditorialLayout` — stark black/white with one loud accent, asymmetric split-screen hero, asymmetric bento-grid menu.
  All 8 share the same functional core (day-status/capacity/overbooking checks, waitlist fallback, i18n where established) — only the visual/structural treatment differs. New layout components live in `frontend/src/components/public/` and are dispatched by `layoutStyle` in both `frontend/src/app/r/[slug]/page.tsx` and `.../menu/page.tsx`.
- Configurable elements available to the tenant include:
  - **Typography & Color Palette.**
  - **Announcement Banner:** Temporary text for promotions or important notices.
  - **Static Pages:** Configurable "About Us" and "Legal" text sections.

## 9. Scheduled Bulk Menu Pricing
- Tenant admins can easily update all menu prices at once using the `ScheduledPriceUpdate` model.
- Prices can be adjusted by a percentage or a fixed amount (increase or decrease).
- Updates can be applied immediately or scheduled for a specific date/time in the future, seamlessly executed by a background worker task.

## 10. Staff Scheduling & Shift Management
- Staff assignments are managed based on Shifts.
- **Shift Requirements:** Managed daily via `ShiftDayRequirement`, defining how many staff members are required for a particular shift on a specific day of the week (e.g., 5 staff for Friday Night).
- **Warnings & Constraints:** The scheduling assigner warns managers of `DOUBLE_SHIFT` conflicts, `CONSECUTIVE_REST` violations (minimum 11 hours rest required between shifts), and assigning staff on days they are `UNAVAILABLE`.

## 11. Reservation Table-Conflict, Duration & Auto-Confirm Logic
- **Reservation window:** Each reservation blocks its assigned table for `RestaurantSettings.defaultDurationMinutes` (admin-adjustable in Settings > Reservation Logic; defaults to 90 minutes / 1.5 hours). Table-conflict checks in `createReservation`/`updateReservation` use this value consistently (no hardcoded window).
- **Conflict blocking vs. override:** Public/customer bookings are always hard-blocked from double-booking a table. An authenticated staff member (valid JWT) may explicitly override a conflict by resubmitting with `overrideConflict: true` after the API returns a `409` with `details.code === 'TABLE_CONFLICT'`. The admin Reservations dialog shows a warning confirmation before doing this.
- **Availability-gated auto-confirm:** A reservation is only auto-confirmed (`status: CONFIRMED`) when `DaySetting.autoConfirm` is true *and* a table was actually assigned without conflict. If no table is free at that moment (but the party size could physically fit somewhere in the restaurant), a public booking is **hard-rejected by default** (`409 FULLY_BOOKED`) and `DaySetting.isFullyBooked` is set so the public page offers the date-waitlist instead. If literally no table in the restaurant could ever seat the party size, the request is rejected outright (`NO_TABLE_CAPACITY`) regardless of overbooking.
- **Overbooking (opt-in soft-accept):** Tenant admins can enable `RestaurantSettings.allowOverbooking` with two required caps — `overbookingMaxExtraCovers` and `overbookingMaxExtraReservations` (both must be set to a positive integer for the feature to take effect at all; see `getEffectiveOverbookingConfig` in `reservationConflict.ts`). When enabled and the day is still under both caps, the "no table free but party could fit somewhere" case above is soft-accepted instead: the reservation is saved `PENDING` with no table assigned and `isOverbooked: true` (surfaced to API callers as `possiblyFullyBooked: true`), and the public booking flow shows a "may need manual review" hint. Caps are counted per calendar day across all overbooked reservations, re-checked inside the booking transaction so concurrent requests can't jointly exceed them. `DaySetting` can override the restaurant-wide setting per date (`allowOverbookingOverride` + its own pair of caps) — turning the override on for a day requires its own two caps the same way; leaving it unset inherits the restaurant default. Staff-initiated bookings bypass all of this, same convention as `maxPartySize`/`maxCapacityOverride`.
- **Day covers cap:** `DaySetting.maxCapacityOverride` caps total covers (not table count) for a specific date, independent of table availability — public bookings that would push the day's confirmed/pending covers over this cap get `409 DAY_CAPACITY_EXCEEDED`. `GET /api/public/day-status` surfaces `remainingCapacity`/`isCapacityFull` when a cap is set so the public page can warn before a booking is attempted; the 4 public layout components show this as a banner.
- **Reservation Timeline tab:** The admin Reservations page has a Timeline tab (tables as rows, time-of-day as columns) showing reservation bars for a selected day, defaulting to the current time period with day navigation and a "jump to now" control.
- **No-show / repeat-guest tracking:** `getReservations` returns a `phoneHistory: { totalVisits, noShowCount }` per reservation (grouped by `customerPhone` within the tenant), and the admin list shows a warning badge when a phone number has prior no-shows.
- **Reservation date-waitlist:** Guests can join a waitlist for a specific fully-booked date (`WaitlistEntry.targetDate`) from the public booking flow — this is independent of the real-time walk-in wait-time queue and is not gated by `WaitTimeConfig.isWaitlistOpen`. Staff manage these under Wait Time > Future Dates and can send an accept/decline offer link; SMS delivery is currently a logged placeholder (no provider wired in).

## 12. Floor Plan Rendering
- Tables and floor elements are positioned in a fixed logical canvas (1400×800 units); the admin floor plan view scales this canvas via CSS `transform: scale()` to fit any container width, so it adapts to any screen resolution without distorting stored positions/sizes.
- Tables support a `color` field (like floor elements already did) and can be resized by dragging their bottom-right corner directly on the canvas (in addition to typing width/height in the edit dialog), not just floor elements.

## 13. Multi-Business Verticals (Event / Organizer Module)
The platform is being generalized from a restaurant SaaS into a multi-vertical booking engine. See `docs/planning/MULTI_BUSINESS_ROADMAP.md` for the full plan and per-phase build log; this section captures the shipped domain logic.
- **businessType-driven verticals:** `Restaurant.businessType` (RESTAURANT, SALON, SPORTS, COWORKING, CLINIC, WEDDING) selects a terminology table (`src/config/terminology.ts`, businessType×locale labels) and a default feature profile (`src/config/businessProfiles.ts`, `FEATURE_PROFILES`). The same engine powers every vertical — differences are labels + which feature flags default on. Dashboard nav/titles and the `AdminLayout` icon set resolve from `businessType` instead of hardcoded restaurant labels (never show restaurant-specific copy to a non-restaurant tenant).
- **Feature flags** live on `RestaurantSettings` (e.g. `hasEventPipeline`, `hasInstallmentPlans`, `hasGuestList`, `hasVendors`), default off, toggled on per vertical by the profile and overridable by the SysAdmin per tenant. Provisioning seeds them from the profile; explicit sysadmin toggles win.
- **Event pipeline (WEDDING):** `Event` runs a validated stage machine LEAD→VISIT→QUOTE→CONTRACT→CONFIRMED→COMPLETED→CANCELED with a coordinator (staff), hall (`resourceId`→BookableResource), package (`packageId`→MenuItem, drives per-person quote = round(package.price×100)×guestCount), `PaymentPlan`/`PaymentInstallment` (kapora + taksit), and a `Guest` list with RSVP + seating (`resourceId`→BookableResource). Relational pickers on the detail page always display human-readable names, never raw UUIDs.
- **Vendors (organizer coordination):** `Vendor` is a tenant-scoped directory (photographer/DJ/florist/… `category`, contact fields). `EventVendor` links a vendor to an event with `role`/`cost`/`status`, unique per (event, vendor); links reject vendors owned by another tenant and duplicates. Managed under `/dashboard/vendors` and per-event on the detail page.
- **Contract/proposal tracking:** `Event` carries `contractUrl`, `contractSignedAt`, `proposalSentAt`, plus `venueName`/`venueAddress`/`invitationMessage`.
- **e-davetiye (public RSVP microsite):** `Event.publicToken` (unique, minted/rotated by staff via `generateInvitation`, `crypto.randomBytes`) exposes a public invitation at `/r/[slug]/invite/[token]`. The public payload is **display-safe** — event details, venue, and branding only, **never financials**. Public RSVP dedupes guests by case-insensitive name and stamps `Guest.respondedAt`. This reuses the public `/r/[slug]` + offer-token infrastructure.

## 14. KVKK Consent & Data Retention
See `docs/planning/PRODUCTION_ROADMAP.md` §7 for the legal background (direction, not legal advice — this platform is a **veri işleyen**/data processor; each tenant is the **veri sorumlusu**/data controller for its own customers).
- **Booking consent (required):** Every public layout component's reservation form (`frontend/src/components/public/*Layout.tsx`) renders a shared `ConsentFields` component (`frontend/src/components/public/ConsentFields.tsx`) with a required "açık rıza" checkbox linked to the bilingual privacy notice at `/r/[slug]/privacy`, plus a visually and semantically **separate**, optional WhatsApp/marketing consent checkbox — the two are never bundled (§7.3). Both flags live on each layout's local `resForm` state and ride along in the existing `...resForm` spread already POSTed to `POST /api/reservations`.
- **Server-side enforcement:** `reservationController.createReservation` rejects a guest-initiated (non-staff) booking with `errors.consent_required` (400) unless `consentAccepted === true` is present in the request body — the frontend checkbox is not trusted alone. Staff-entered bookings (dashboard/host screen — phone, walk-in) are exempt, same convention as `maxPartySize`/`overrideConflict` (there's no browser checkbox for staff to check on a guest's behalf).
- **Storage:** `Reservation.consentAccepted` (Boolean), `Reservation.marketingConsent` (Boolean), `Reservation.consentTimestamp` (DateTime?) capture the choice and when it was made.
- **Retention/anonymization:** `src/workers/retentionAnonymizer.ts` runs daily (in-process, alongside `priceUpdater`), nulling out `customerName`/`customerEmail`/`customerPhone`/`notes`/`internalNote` on `Reservation` rows (anchored on `startTime`) and `customerName`/`customerPhone`/`notes` on `WaitlistEntry` rows (anchored on `joinedAt`) once they pass `RETENTION_DAYS` (env, default 400 days ≈ 1 year + buffer) — see docs/planning/PRODUCTION_ROADMAP.md §3's storage-limitation guidance. Aggregate/statistical fields (guestCount, startTime, status, table, isVIP, etc.) are preserved; each row's `anonymizedAt` timestamp marks it as done so it's never reprocessed.
- **Privacy notice (aydınlatma metni):** `FrontendCustomization.privacyNoticeText` is an optional per-tenant override (sanitized via the same `sanitize-html` pipeline as `reservationInfoText`/`reservationWarningText`, since it's rendered via `dangerouslySetInnerHTML`), editable in `dashboard/customization` alongside the existing legal/about-text fields. When unset, `/r/[slug]/privacy` falls back to generic bilingual placeholder content (`public.privacyNotice.*` i18n keys) — structurally correct (what/why/how-long/who-with) but deliberately generic, since neither this platform nor its code should invent Turkish legal specifics.

## 15. Online Ordering (Sipariş)
A per-tenant commercial add-on gated by `Restaurant.hasOnlineOrdering` (SysAdmin-toggled, like every other feature flag). Off ⇒ the public `/r/[slug]/order` page and every `/api/orders/*` route are invisible. Staff access is additionally gated by the `manage_orders` permission. Planning/build history: `docs/packaging/online-ordering-spec.md`, `docs/packaging/online-ordering-plan.md` (Phase 1) and `docs/packaging/online-ordering-v2-plan.md` (v2).

### 15.1 Order menu = curated from the main menu, never forked
- The online catalog is `OrderMenuItem`, a row that **points at a source `MenuItem`** and layers online-only deltas on top of it: `priceOverride`, `nameOverride`, `descriptionOverride`, `imageUrlOverride`, `prepTimeMinutes`, `orderCategoryId`, `sortOrder`, `isListed`, `isAvailable`, `pausedUntil`, `pausedIndefinitely`. There is **no duplicated menu data** — anything not overridden falls back to the `MenuItem`, so editing a dish once keeps the printed menu and the delivery menu in step.
- `OrderMenuCategory` is an order-only grouping so the online catalog can be arranged differently from the in-house `MenuCategory` tree. An item with `orderCategoryId = null` falls back to its source `MenuCategory` section. Order-only categories sort **ahead of** the mirrored menu categories.
- All effective-value rules (`effectiveName/Description/ImageUrl/Price/PrepTime`, `isOrderItemPaused`, `unavailableReason`) live in **one** module, `src/utils/orderMenu.ts`, shared by the staff editor, the customer menu and the pricing authority. Drift between those three is what makes a customer see one price and get charged another, so they are never re-implemented per call site.
- **Temporary pause** ("bugün kalmadı") is distinct from permanent availability: `pausedUntil` is a timed pause that lapses on its own (nothing sweeps the column — the timestamp comparison *is* the expiry), `pausedIndefinitely` is open-ended. The two are mutually exclusive and every pause write sets both columns.
- Paused / out-of-stock items are **returned to the customer, not hidden** — a greyed-out "temporarily unavailable — back around 20:00" card reads as "come back later", a vanished dish reads as "they stopped selling it". The pricing service independently refuses them at checkout, so showing them can never turn into selling them.
- Tenant surface: `/dashboard/orders/menu`. The old per-item `isOrderableOnline` switch on `dashboard/menus` is gone; the legacy `PATCH /api/orders/menu/:id/orderable` endpoint remains and mirrors its writes into `OrderMenuItem` (off ⇒ `isListed: false`, overrides preserved) so nothing can disagree about what is sellable online.

### 15.2 Delivery range is resolved server-side from the customer's map pin
- Maps are **Leaflet + OpenStreetMap tiles + Nominatim geocoding** — no API key, no billing. Leaflet touches `document` at import time, so every map component is loaded through `next/dynamic(..., { ssr: false })` and is never part of a server render.
- `Restaurant.latitude/longitude/addressText` is the origin every distance measurement starts from, set by the tenant with a pin picker on `/dashboard/orders/settings`.
- `src/services/geoService.ts` owns the maths: `haversineMeters`, a ray-cast `pointInPolygon`, and `resolveDeliveryZone({ restaurantId, lat, lng })`. Resolution order is: reject beyond `OrderSettings.maxDeliveryMeters` (null = no hard cap) → smallest matching `RADIUS` zone (they're concentric on the restaurant, so smallest = tightest/cheapest tier) → first containing `AREA` polygon → out of range.
- Canonical `DeliveryZone.polygon` storage format is `{ "points": [{ "lat": …, "lng": … }, …] }`. A bare `{lat,lng}[]` array and a bare GeoJSON-ordered `[lng, lat][]` array are also *read* for interop; the object form is the one to write.
- **Never trust the client:** fees, minimums and eligibility are always recomputed in `orderPricingService.computeOrderQuote`, which ignores any client-sent `zoneId` whenever a usable pin resolves a zone.
- A tenant with **no coordinates set** is not an error state — `resolveDeliveryZone` returns `NO_RESTAURANT_LOCATION` and every caller falls back to the pre-v2 manual zone dropdown rather than blocking checkout. This is what keeps every tenant that predates the location picker working unchanged.
- `POST /api/public/order/check-address` is a *verdict* endpoint, not a gate: it answers "do you deliver here?" for a pin before there is a cart, and never throws for out-of-range. `/quote` and order placement are what actually block.

### 15.3 Order lifecycle, auto-confirm and no-shows
- The status machine lives in `src/utils/orderStatus.ts` and is the single authority: `NEW → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY (delivery only) / COMPLETED (pickup) → COMPLETED`. `CANCELLED`/`REJECTED` are reachable from any non-terminal status. Two frontend mirrors exist for button/label purposes only (`frontend/src/lib/orders/statusRules.ts` for staff, `frontend/src/lib/orderStatusFlow.ts` for the customer) — the backend re-validates every transition.
- **`NOT_PICKED_UP`** is a terminal *forward* transition from `READY` (never collected) or `OUT_FOR_DELIVERY` (nobody home / refused), never a cancel-like one — the food has to exist and have been offered first. Reaching it increments `Customer.noShowCount` inside the **same transaction** as the concurrency-safe conditional status write, so a duplicate tap can't double-count and a lost race can't punish the customer. It is audited as its own action (`ORDER_MARKED_NOT_PICKED_UP`), never folded into a generic status change, and it is deliberately never what a one-tap "advance" button does.
- **Auto-confirm** (`OrderSettings.autoConfirmOrders`, default off): off ⇒ orders are created `NEW` and the customer's tracking screen shows "waiting for the restaurant to confirm" until staff accept or reject. On ⇒ orders are created `ACCEPTED`. Auto-confirm never means "accept anything": the opening-hours, kitchen-capacity, ban and delivery-range gates all still run.
- **Gates at placement:** the manual `onlineOrderingOpen` kill-switch, the weekly `OrderSettings.orderHours` schedule evaluated in the **tenant's own timezone** (`src/utils/orderHours.ts` — deliberately permissive for an absent/malformed schedule, so an unconfigured tenant is never accidentally closed), `maxConcurrentOrders` counted as non-terminal orders in flight (a completed order frees a slot), a per-customer creation throttle, and the phone ban.
- **Active Orders** (`/dashboard/orders`, default tab) is a dense live table for a manager: the five active statuses fetched once then kept live over SSE, an amber "needs confirmation" treatment on `NEW` rows, inline confirm/reject/advance/not-picked-up/cancel, and a 409 → "changed elsewhere" + refetch. It is distinct from the History tab and from the touch-optimised kitchen board at `/order-station`, which share the same feed via `frontend/src/lib/orders/`.

### 15.4 Customer bans
- `CustomerBan` is scoped to the **phone number**, not to a `Customer` row, and that is the whole point: a banned person who deletes their account and re-registers with the same number stays banned, and a number that has never completed an OTP flow can still be banned pre-emptively. A ban carries a free-text reason and the staff member who set it; lifting it stamps `liftedAt`/`liftedByUserId` rather than deleting the record, so the history survives.
- Enforced in **three** places, because a trusted-device session skips OTP entirely: `requestOtp` (so a banned number never burns SMS credits), `verifyOtp` (a ban placed between the two calls must not still yield a session) and `placeOrder` (the point of sale).
- **Bans are manual only.** `Customer.noShowCount` never bans anyone by itself — at or above `OrderSettings.noShowWarnThreshold` (default 2, `0` disables) it raises a ⚠ badge on the Active Orders, Customers, order-detail and kitchen-card surfaces, and a human decides.
- Per §7, ban actors are resolved to display names via one batched `user.findMany` — the dashboard never renders the raw `bannedByUserId`/`liftedByUserId` UUID (a deleted staff member resolves to `null`, not to the id).
