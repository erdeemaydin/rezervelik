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
The platform is being generalized from a restaurant SaaS into a multi-vertical booking engine. See `MULTI_BUSINESS_ROADMAP.md` for the full plan and per-phase build log; this section captures the shipped domain logic.
- **businessType-driven verticals:** `Restaurant.businessType` (RESTAURANT, SALON, SPORTS, COWORKING, CLINIC, WEDDING) selects a terminology table (`src/config/terminology.ts`, businessType×locale labels) and a default feature profile (`src/config/businessProfiles.ts`, `FEATURE_PROFILES`). The same engine powers every vertical — differences are labels + which feature flags default on. Dashboard nav/titles and the `AdminLayout` icon set resolve from `businessType` instead of hardcoded restaurant labels (never show restaurant-specific copy to a non-restaurant tenant).
- **Feature flags** live on `RestaurantSettings` (e.g. `hasEventPipeline`, `hasInstallmentPlans`, `hasGuestList`, `hasVendors`), default off, toggled on per vertical by the profile and overridable by the SysAdmin per tenant. Provisioning seeds them from the profile; explicit sysadmin toggles win.
- **Event pipeline (WEDDING):** `Event` runs a validated stage machine LEAD→VISIT→QUOTE→CONTRACT→CONFIRMED→COMPLETED→CANCELED with a coordinator (staff), hall (`resourceId`→BookableResource), package (`packageId`→MenuItem, drives per-person quote = round(package.price×100)×guestCount), `PaymentPlan`/`PaymentInstallment` (kapora + taksit), and a `Guest` list with RSVP + seating (`resourceId`→BookableResource). Relational pickers on the detail page always display human-readable names, never raw UUIDs.
- **Vendors (organizer coordination):** `Vendor` is a tenant-scoped directory (photographer/DJ/florist/… `category`, contact fields). `EventVendor` links a vendor to an event with `role`/`cost`/`status`, unique per (event, vendor); links reject vendors owned by another tenant and duplicates. Managed under `/dashboard/vendors` and per-event on the detail page.
- **Contract/proposal tracking:** `Event` carries `contractUrl`, `contractSignedAt`, `proposalSentAt`, plus `venueName`/`venueAddress`/`invitationMessage`.
- **e-davetiye (public RSVP microsite):** `Event.publicToken` (unique, minted/rotated by staff via `generateInvitation`, `crypto.randomBytes`) exposes a public invitation at `/r/[slug]/invite/[token]`. The public payload is **display-safe** — event details, venue, and branding only, **never financials**. Public RSVP dedupes guests by case-insensitive name and stamps `Guest.respondedAt`. This reuses the public `/r/[slug]` + offer-token infrastructure.

## 14. KVKK Consent & Data Retention
See `PRODUCTION_ROADMAP.md` §7 for the legal background (direction, not legal advice — this platform is a **veri işleyen**/data processor; each tenant is the **veri sorumlusu**/data controller for its own customers).
- **Booking consent (required):** Every public layout component's reservation form (`frontend/src/components/public/*Layout.tsx`) renders a shared `ConsentFields` component (`frontend/src/components/public/ConsentFields.tsx`) with a required "açık rıza" checkbox linked to the bilingual privacy notice at `/r/[slug]/privacy`, plus a visually and semantically **separate**, optional WhatsApp/marketing consent checkbox — the two are never bundled (§7.3). Both flags live on each layout's local `resForm` state and ride along in the existing `...resForm` spread already POSTed to `POST /api/reservations`.
- **Server-side enforcement:** `reservationController.createReservation` rejects a guest-initiated (non-staff) booking with `errors.consent_required` (400) unless `consentAccepted === true` is present in the request body — the frontend checkbox is not trusted alone. Staff-entered bookings (dashboard/host screen — phone, walk-in) are exempt, same convention as `maxPartySize`/`overrideConflict` (there's no browser checkbox for staff to check on a guest's behalf).
- **Storage:** `Reservation.consentAccepted` (Boolean), `Reservation.marketingConsent` (Boolean), `Reservation.consentTimestamp` (DateTime?) capture the choice and when it was made.
- **Retention/anonymization:** `src/workers/retentionAnonymizer.ts` runs daily (in-process, alongside `priceUpdater`), nulling out `customerName`/`customerEmail`/`customerPhone`/`notes`/`internalNote` on `Reservation` rows (anchored on `startTime`) and `customerName`/`customerPhone`/`notes` on `WaitlistEntry` rows (anchored on `joinedAt`) once they pass `RETENTION_DAYS` (env, default 400 days ≈ 1 year + buffer) — see PRODUCTION_ROADMAP.md §3's storage-limitation guidance. Aggregate/statistical fields (guestCount, startTime, status, table, isVIP, etc.) are preserved; each row's `anonymizedAt` timestamp marks it as done so it's never reprocessed.
- **Privacy notice (aydınlatma metni):** `FrontendCustomization.privacyNoticeText` is an optional per-tenant override (sanitized via the same `sanitize-html` pipeline as `reservationInfoText`/`reservationWarningText`, since it's rendered via `dangerouslySetInnerHTML`), editable in `dashboard/customization` alongside the existing legal/about-text fields. When unset, `/r/[slug]/privacy` falls back to generic bilingual placeholder content (`public.privacyNotice.*` i18n keys) — structurally correct (what/why/how-long/who-with) but deliberately generic, since neither this platform nor its code should invent Turkish legal specifics.
