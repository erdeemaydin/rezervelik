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
