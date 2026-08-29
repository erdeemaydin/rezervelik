# Dining Reservation SaaS - Comprehensive API Documentation

## Base Architecture
- **Base URL:** `/api`
- **Authentication:** `Authorization: Bearer <token>` required for protected routes.
- **Multi-tenancy:** `X-Restaurant-ID: <restaurant_uuid>` required for all tenant-specific routes.

---

## 1. Authentication & Onboarding
### `POST /api/auth/register`
*   **Description:** Provisions a new restaurant and creates the initial Admin user. *Note: Controlled globally by `publicRegistrationEnabled`.*
*   **Payload:** `{ email, password, firstName, lastName, restaurantName }`
*   **Response:** JWT token and user/restaurant objects.

### `POST /api/auth/login`
*   **Description:** Authenticates staff or admins.
*   **Payload:** `{ email, password }`
*   **Response:** JWT token and user info (including role and restaurantId).

---

## 2. System Administration (Requires `SUPER_ADMIN` role)
Every `SUPER_ADMIN` account has a `User.isRootAdmin` flag (default `true`). A **root**
admin (`isRootAdmin: true`) has unrestricted access to everything below, exactly as
before this field existed. A **restricted sub-admin** (`isRootAdmin: false`) only
passes `requireSystemPermission(key)` on the routes it's been explicitly granted a
matching `sys_*` key for on `User.permissions` (comma-separated, whitelisted server-side
— see `src/config/systemPermissions.ts`); everything else 403s. Sub-admins also lose the
SUPER_ADMIN tenant-route bypass entirely (`middlewares/auth.ts`) — they have zero access
to any tenant-scoped `/api/*` endpoint, the same as an unrelated outside user, unless they
impersonate a tenant (see `sys_impersonate_tenants` below).

Managing other platform administrators (creating them, deactivating them, or changing
their root/permission status) is **root-only** and is never a grantable `sys_*`
permission — a sub-admin can never create a new root or escalate its own access.

| `sys_*` permission | Gates |
|---|---|
| `sys_manage_tenants` | `GET/POST /tenants`, `PUT /tenants/:id/settings` |
| `sys_manage_subscriptions` | `PUT /tenants/:id/subscription` |
| `sys_manage_tenant_users` | `PUT /users/:userId/permissions`, `POST /users/:userId/reset-link`, `PUT /users/:userId/otp` — rejects `SUPER_ADMIN` targets even for a root-granted sub-admin; those three are root-only when the target is another platform administrator |
| `sys_impersonate_tenants` | `POST /tenants/:id/impersonate` |
| `sys_manage_global_settings` | `GET/PUT /settings/global` |
| `sys_view_audit_log` | `GET /audit` |
| `sys_view_metrics` | `GET /metrics` |

### `POST /api/system/setup-super-admin`
*   **Description:** Initializes root admin (requires secure matching `SETUP_SECRET_TOKEN` environment variable).
### `GET /api/system/tenants`
*   **Description:** Lists all provisioned tenants on the platform, including their settings and users.
### `POST /api/system/tenants`
*   **Description:** Provisions a new tenant manually from the SysAdmin dashboard. Also auto-generates `FrontendCustomization` default records.
### `PUT /api/system/tenants/:id/subscription`
*   **Description:** Updates a tenant's subscription plan, status, and trial end date.
### `PUT /api/system/tenants/:id/settings`
*   **Description:** Toggles tenant feature flags (Waitlist, Scheduling, Payments, etc.) globally, and assigns `layoutStyle` (Design Architecture) to the tenant.
### `PUT /api/system/users/:userId/permissions`
*   **Description:** Modifies a *tenant* user's granular module permissions. `400`s if the target isn't a tenant-scoped user (i.e. is itself a `SUPER_ADMIN`) — that column means something different for platform administrators and is only settable via `PUT /system/admins/:id/permissions` below.
### `GET /api/system/admins` / `POST /api/system/admins` (root-only)
*   **Description:** Lists / creates platform administrators. `POST` accepts `{ email, password, firstName, lastName, isRootAdmin?, permissions? }` — `isRootAdmin` defaults to `false` (restricted, zero capabilities) unless explicitly set `true`; `permissions` is an array of `sys_*` keys, silently filtered to the whitelist.
### `PUT /api/system/admins/:id/active` (root-only)
*   **Description:** Deactivates/reactivates a platform administrator. A root admin cannot deactivate their own account.
### `PUT /api/system/admins/:id/permissions` (root-only)
*   **Description:** Changes an existing platform administrator's `{ isRootAdmin, permissions }`. A root admin cannot remove root access from their own account (prevents a platform with zero root admins left).

---

## 3. Public Endpoints (No Auth Required)
### `GET /api/public/restaurant/:slug`
*   **Description:** Fetches restaurant details, wait time configurations, active menus, and dynamic customization settings (e.g., Theme, About Us, Legal Text, Announcements).
### `POST /api/public/restaurant/:slug/waitlist`
*   **Description:** Allows a guest to join the virtual waitlist directly via QR code.
*   **Payload:** `{ customerName, customerPhone, partySize }`
### `GET /api/public/day-status`
*   **Description:** Checks overarching reservation availability for a specific date (coarse check). When `DaySetting.maxCapacityOverride` is set for the date, the response also includes `remainingCapacity`/`isCapacityFull` so the public page can warn before a booking is attempted; omitted entirely when no cap is set.

---

## 4. Tenant Operations (Requires `X-Restaurant-ID`)
### Waitlist & Virtual Queue
*   **`GET /api/wait-time/config`** - Retrieves wait time display settings.
*   **`PUT /api/wait-time/config`** - Updates wait time logic (Calculated vs Manual) and thresholds.
*   **`GET /api/wait-time/entries`** - Retrieves the active virtual queue (WAITING and NOTIFIED statuses).
*   **`POST /api/wait-time/entries`** - Adds a walk-in guest to the waitlist from the host dashboard.
*   **`PUT /api/wait-time/entries/:entryId/status`** - Updates an entry (e.g., NOTIFIED or SEATED). *Triggers SMS hook.*

### Reservations & Calendar
*   **`GET /api/reservations`** - Lists reservations. Each entry includes `phoneHistory: { totalVisits, noShowCount }`, a per-phone-number tally within the tenant, used to flag repeat no-shows in the dashboard.
*   **`POST /api/reservations`** - Creates a new reservation. Public (no auth). Blocks table double-booking within `defaultDurationMinutes` of an existing CONFIRMED/PENDING reservation on that table; returns `409` with `details.code: 'TABLE_CONFLICT'` on conflict. An authenticated staff caller may pass `overrideConflict: true` to book anyway. Auto-confirms only if `DaySetting.autoConfirm` is true *and* a table was actually assigned. If no table is free at that moment, the request is hard-rejected (`409 FULLY_BOOKED`) unless the restaurant has overbooking enabled and configured (`RestaurantSettings.allowOverbooking` + both caps, optionally overridden per-day via `DaySetting`) and the day is still under both caps — in that case it's saved `PENDING` with no table and the response includes `possiblyFullyBooked: true`. If the party size can never fit anywhere in the restaurant, that's always a hard `400` regardless of overbooking. Also enforces `DaySetting.maxCapacityOverride` (total covers cap for the date) with `409 DAY_CAPACITY_EXCEEDED`. **KVKK consent (PROJECT_LOGIC.md §14):** a guest-initiated (non-staff) request must include `consentAccepted: true` or the request is rejected `400` with `code: 'errors.consent_required'` — the public booking form's required consent checkbox is re-checked server-side, not just trusted from the client. `marketingConsent` (boolean, optional) is accepted separately for the WhatsApp/marketing opt-in; both are stored with a `consentTimestamp`. Staff-initiated requests are exempt (no consent fields recorded).
*   **`PUT /api/reservations/:id`** - Updates a reservation (e.g., status changes to CONFIRMED or CANCELLED, table/time changes). Staff-only; same table-conflict check as creation, overridable with `overrideConflict: true`.
*   **`GET /api/categories`** - Manages reservation source categories (Phone, Online, Walk-in).

Reservation Timeline (tables × time-of-day) is a frontend-only view built from `GET /api/reservations` + `GET /api/tables` — no dedicated endpoint.

### Tables & Floor Plan
*   **`GET /api/table-types`** - Lists table areas (e.g., Indoor, Terrace).
*   **`POST /api/table-types`** - Creates a new area.
*   **`GET /api/tables`** - Lists all individual tables and their capacities.
*   **`POST /api/tables`** / **`PUT /api/tables/:id`** - Create/update a table, including floor-plan visuals (`positionX/Y`, `width`, `height`, `shape`, `color`).

### Settings & Configuration
*   **`GET /api/settings`** - Retrieves tenant-level settings (Deposit amounts, reservation logic).
*   **`PUT /api/settings`** - Updates tenant-level settings, including the overbooking opt-in (`allowOverbooking`, `overbookingMaxExtraCovers`, `overbookingMaxExtraReservations`). Rejects `400` if `allowOverbooking: true` is submitted without both caps resolving to positive integers (either in this request or already saved).
*   **`GET /api/day-settings`** - Manages exceptional days (e.g., New Year's Eve capacity overrides).
*   **`POST /api/day-settings`** / **`POST /api/day-settings/bulk`** - Upserts one or many exceptional days, including a per-day overbooking override (`allowOverbookingOverride` tri-state: `true`/`false`/unset-to-inherit, plus `overbookingMaxExtraCoversOverride`/`overbookingMaxExtraReservationsOverride`). Same both-caps-required validation as `PUT /api/settings` applies when the override is turned on for a day.
*   **`GET /api/customization`** - Retrieves the frontend page customization settings (typography, color, texts).
*   **`PUT /api/customization`** - Updates the frontend page customization settings.

### Digital Menu Management
*   **`GET /api/menus`** - Lists all menus.
*   **`POST /api/menus`** - Creates a new menu.
*   **`GET /api/menus/:id/categories`** - Gets menu categories.
*   **`POST /api/menus/:id/categories/:categoryId/items`** - Adds items to a menu category.
*   **`POST /api/menus/prices/bulk`** - Schedules or immediately executes a bulk menu price update (percentage or fixed).

### Staff & Scheduling
*   **`GET /api/staff`** - Lists staff members and their daily availability limits.
*   **`POST /api/staff`** - Creates a new staff member account.
*   **`GET /api/scheduling/shifts`** - Lists defined shifts for a tenant.
*   **`GET /api/scheduling/shift-requirements`** - Retrieves shift minimum staffing thresholds on a day-by-day basis.
*   **`POST /api/scheduling/assignments`** - Assigns staff to shifts while honoring limits and consecutive resting constraints.

---

## 5. Online Ordering (add-on)
Gated by `Restaurant.hasOnlineOrdering`. See PROJECT_LOGIC.md §15 for the domain rules.

### 5.1 Staff — `/api/orders/*`
Requires `X-Restaurant-ID` + a staff JWT + the `manage_orders` permission, and 403s when the add-on is off.

#### Orders & status
*   **`GET /api/orders`** - Lists orders. `?status=` accepts a comma-separated `OrderStatus` list (unknown values `400`), plus optional `from`/`to` (`createdAt` range) and `limit` (default 500, max 1000). Each row includes `items`, `customer: { id, name, phone, noShowCount }` and a computed **`customerBanned`** boolean (one batched `CustomerBan` lookup for the whole page, never per row).
*   **`GET /api/orders/stream`** - SSE feed (`created` / `status_changed`) carrying the same per-order shape as `GET /api/orders`. Requires the `X-Restaurant-ID` header, so the browser's native `EventSource` can't be used — see `frontend/src/lib/orders/stream.ts`.
*   **`PATCH /api/orders/:id/status`** - `{ status, reason? }`. Validated against `src/utils/orderStatus.ts`; `OUT_FOR_DELIVERY` is delivery-only and a delivery order may not jump `READY → COMPLETED`. Concurrency-safe: the write is conditional on the status that was validated, so a stale second caller gets `409 errors.order_status_conflict` instead of silently winning. **`status: 'NOT_PICKED_UP'`** is a terminal forward transition from `READY`/`OUT_FOR_DELIVERY` that increments `Customer.noShowCount` in the same transaction and is audited as `ORDER_MARKED_NOT_PICKED_UP`. The response is the same shape as `GET /api/orders` (`items` + `customer` + `customerBanned`), so live surfaces can merge it straight into list state.

#### Customers & bans
*   **`GET /api/orders/customers`** - Lists customers; each row carries `banned` (from the phone-scoped `CustomerBan` table) and `noShowCount`.
*   **`GET /api/orders/customers/:id`** - Customer detail + `addresses`, `orders`, and `bans[]` — the ban history **of the phone number**, with `bannedByName`/`liftedByName` already resolved to display names (never raw user UUIDs) and an `active` flag — plus a top-level `banned` boolean.
*   **`GET /api/orders/bans`** - Lists this tenant's bans (active and lifted, newest first, max 500), same decorated shape.
*   **`POST /api/orders/bans`** - `{ phone, reason? }`. Bans a phone number (validated with the shared `isValidPhone`, stored `.trim()`ed exactly as `verifyOtp` stores a customer's number). `409` when an active ban for that number already exists — a no-op, not a failure. Audited as `CUSTOMER_BANNED`.
*   **`PATCH /api/orders/bans/:id/lift`** - Lifts an active ban (stamps `liftedAt`/`liftedByUserId`; the row is kept as history). Lifting an already-lifted ban returns it unchanged rather than erroring, so a double-tap is harmless. Audited as `CUSTOMER_UNBANNED`.

#### Settings, location & delivery zones
*   **`GET /api/orders/order-settings`** - Upserts-and-returns `OrderSettings`, now including **`autoConfirmOrders`**, **`maxDeliveryMeters`** (metres; `null` = no hard distance cap) and **`noShowWarnThreshold`** (`0` disables the ⚠ badge), plus a nested **`restaurantLocation: { latitude, longitude, addressText }`** so the settings screen can edit the delivery pin alongside the range in one load.
*   **`PUT /api/orders/order-settings`** - Partial update; an omitted field is a no-op. `autoConfirmOrders` must therefore always be sent as a real boolean by any UI that wants to be able to turn it *off*. `maxDeliveryMeters: null` clears the cap.
*   **`PUT /api/orders/restaurant-location`** - `{ latitude, longitude, addressText }` → writes `Restaurant.latitude/longitude/addressText`, the origin every delivery-distance calculation measures from. All three are explicitly clearable with `null`. `latitude` and `longitude` must be set or cleared **together** (`400` otherwise — a half-set pin makes haversine meaningless) and are range-checked. Audited as `RESTAURANT_LOCATION_UPDATED`.
*   **`GET|POST /api/orders/delivery-zones`**, **`PUT|DELETE /api/orders/delivery-zones/:id`** - Zone CRUD. `matchType: 'RADIUS'` uses `radiusMeters`; `matchType: 'AREA'` uses `polygon`, whose canonical format is `{ "points": [{ "lat": …, "lng": … }, …] }`.

#### Order menu (curated online catalog)
*   **`GET /api/orders/order-menu`** - Everything the dashboard "Order Menu" window needs in one round trip: `{ orderCategories, catalog, sourceItems }`. `catalog` rows are `OrderMenuItem` + their source `menuItem` + a computed `paused` flag + an `effective: { name, description, imageUrl, price, prepTimeMinutes }` block. `sourceItems` is the "add items" picker over every `MenuItem` in the tenant's active menus, each with `categoryName` and an `inCatalog` flag (only *listed* rows count, so a de-listed item stays re-addable with its overrides intact).
*   **`POST /api/orders/order-menu/items`** - `{ menuItemId }`. Upsert, not create: a previously de-listed row is revived with its overrides preserved.
*   **`PUT /api/orders/order-menu/items/:id`** - Override editor. Every override field is **tri-state on the wire**: absent = leave the column alone, `null`/`""` = clear the override (fall back to the source `MenuItem`), a value = set it. Accepts `nameOverride`, `descriptionOverride`, `imageUrlOverride`, `priceOverride`, `prepTimeMinutes`, `orderCategoryId` (must belong to this tenant, else `404`), `sortOrder`, `isListed`, `isAvailable`.
*   **`PATCH /api/orders/order-menu/items/:id/pause`** - `{ pausedUntil }` (an absolute ISO instant, computed client-side so "until tomorrow" means the staff member's own midnight) **or** `{ pausedIndefinitely: true }`; `{ pausedUntil: null, pausedIndefinitely: false }` resumes. The two modes are mutually exclusive and every write sets both columns.
*   **`DELETE /api/orders/order-menu/items/:id`** - Drops the item from the online catalog (and its overrides). The source `MenuItem` is never touched.
*   **`POST /api/orders/order-menu/categories`**, **`PUT|DELETE .../categories/:id`** - Order-only category CRUD. Deleting one is `SetNull` on its items — they fall back to grouping under their source `MenuCategory`, they are not deleted.
*   **`PUT /api/orders/order-menu/reorder`** - `{ items: [{ id, sortOrder, orderCategoryId? }], categories: [{ id, sortOrder }] }`. Validates every id/category reference up front, then writes in one transaction via `updateMany` scoped by `restaurantId` (a foreign id updates 0 rows rather than touching another tenant's catalog).
*   **`PATCH /api/orders/menu/:id/orderable`** - *Legacy.* Still writes `MenuItem.isOrderableOnline`/`prepTimeMinutes` and mirrors into `OrderMenuItem` (off ⇒ `isListed: false`, overrides preserved). Superseded by `/order-menu` above.

### 5.2 Customer — `/api/public/order/*`
Anonymous (needs `X-Restaurant-ID`, resolved from `GET /api/public/restaurant/:slug`) except where noted. Rate-limited per IP.

*   **`GET /api/public/order/settings`** - `{ onlineOrderingOpen, deliveryEnabled, pickupEnabled, cashOnDeliveryEnabled, onlineCardEnabled, prepTimeMinutes, orderHours, withinOrderHours }`. **`withinOrderHours`** is the server's verdict on the weekly schedule, computed in the tenant's own timezone — never recompute it client-side. Deliberately reachable while `onlineOrderingOpen` is false, so the UI can render a "we're closed" state.
*   **`GET /api/public/order/menu`** - The curated catalog, grouped: `{ categories: [{ id, name, sortOrder, isOrderOnlyCategory, items: [...] }] }`. Order-only categories come first (by `sortOrder`), then the source `MenuCategory` sections (by `MenuCategory.order`); items sort by `OrderMenuItem.sortOrder` then `MenuItem.order`. Each item is `{ menuItemId, name, description, imageUrl, price, prepTimeMinutes, available, unavailableReason, resumesAt, isHighlight, dietaryTags, allergens, spiceLevel, calories, modifiers }`. Note **`menuItemId`, not `id`** — that is the id every downstream call needs. Name/description/image/price are the *effective* values (override, else source). `unavailableReason` is `'PAUSED' | 'OUT_OF_STOCK' | null`; `resumesAt` is only set for a *timed* pause. Unavailable items are **returned, not hidden**.
*   **`GET /api/public/order/zones`** - Active delivery zones (`id`, `name`, `deliveryFee`, `minOrderAmount`). Backs the manual picker for tenants with no coordinates set, and lets a customer see the fee tiers up front.
*   **`POST /api/public/order/check-address`** - `{ lat, lng }` → `{ inRange, distanceMeters, needsManualZone, zone: { id, name, deliveryFee, minOrderAmount } | null, maxDeliveryMeters? }`. A **verdict**, not a gate: out-of-range is a normal `200` with `inRange: false`, not an error. `needsManualZone: true` means the tenant has no coordinates, so there is nothing to measure from and the customer must pick a zone by hand — that case reports `inRange: true` (they can't be judged out of range).
*   **`POST /api/public/order/quote`** - `{ items, fulfillmentType, zoneId?, lat?, lng? }` → `{ subtotal, deliveryFee, total, zoneId, meetsMinimum, minOrderAmount?, distanceMeters?, prepTimeMinutes, lines }`. **`lat`/`lng`** are the customer's map pin and take precedence: when the tenant has its own coordinates, the zone and fee are resolved from the pin and any client-sent `zoneId` is ignored; `zoneId` is the fallback path for tenants with no location. A pin outside the range 400s with `errors.order_out_of_delivery_range`. Sellability and unit price come from the **curated catalog**: no listed row ⇒ `errors.order_item_not_orderable`, a paused row ⇒ `errors.order_item_paused`, an unavailable row ⇒ `errors.order_item_unavailable`; `priceOverride` (when set) is the unit price *and* what the zone minimum is checked against. Modifiers still come from the source `MenuItem`, and an unrecognised option id is rejected rather than silently ignored.
*   **`POST /api/public/order`** - Requires a verified customer session (OTP) or a trusted-device cookie. Same `lat`/`lng` support as `/quote` (top level, or on the inline `address` object; a saved address's stored coordinates are used when neither is sent). Re-runs the whole quote server-side inside its own transaction — the client's totals are never trusted. Creates the order **`ACCEPTED`** when `OrderSettings.autoConfirmOrders` is on, otherwise **`NEW`**; still subject to the hours (`errors.online_ordering_closed`), capacity (`errors.order_capacity_full`, `429`), ban (`errors.order_customer_banned`, `403`), minimum (`errors.order_below_minimum`) and range gates. A new address is only persisted after the quote succeeds, and is stamped with the *server-resolved* zone.
*   **`POST /api/public/order/otp/request`** / **`POST /api/public/order/otp/verify`** - Phone identification. Both refuse a banned number with `errors.order_customer_banned` (`403`) — `verifyOtp` re-checks because a ban may land between the two calls.
*   **`GET /api/public/order/mine`** - The customer's own recent orders (customer session required). Also used as the silent "am I still signed in?" probe.

`OrderStatus` values: `NEW`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `COMPLETED`, `CANCELLED`, `REJECTED`, **`NOT_PICKED_UP`** (terminal; the customer never collected / refused the order — increments `Customer.noShowCount`).
