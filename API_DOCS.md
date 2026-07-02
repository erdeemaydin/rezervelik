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
*   **Description:** Modifies a tenant user's granular module permissions.

---

## 3. Public Endpoints (No Auth Required)
### `GET /api/public/restaurant/:slug`
*   **Description:** Fetches restaurant details, wait time configurations, active menus, and dynamic customization settings (e.g., Theme, About Us, Legal Text, Announcements).
### `POST /api/public/restaurant/:slug/waitlist`
*   **Description:** Allows a guest to join the virtual waitlist directly via QR code.
*   **Payload:** `{ customerName, customerPhone, partySize }`
### `GET /api/public/day-status`
*   **Description:** Checks overarching reservation availability for a specific date (coarse check).

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
*   **`POST /api/reservations`** - Creates a new reservation. Public (no auth). Blocks table double-booking within `defaultDurationMinutes` of an existing CONFIRMED/PENDING reservation on that table; returns `409` with `details.code: 'TABLE_CONFLICT'` on conflict. An authenticated staff caller may pass `overrideConflict: true` to book anyway. Auto-confirms only if `DaySetting.autoConfirm` is true *and* a table was actually assigned; otherwise saves as `PENDING` and returns `possiblyFullyBooked: true` when no table was free (unless the party size can never fit anywhere, which is a hard `400`).
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
*   **`PUT /api/settings`** - Updates tenant-level settings.
*   **`GET /api/day-settings`** - Manages exceptional days (e.g., New Year's Eve capacity overrides).
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
