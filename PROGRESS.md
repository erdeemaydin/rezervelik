# Progress Log

Day-to-day record of substantial work sessions on this project. Newest entry first.

---

## 2026-07-02

**Public website redesign (all 3 existing layouts + new 4th layout)**
- Redesigned `ClassicLayout`, `PremiumLayout`, `OldenLayout` (the public restaurant pages) with a modern, minimalist visual pass in each one's own spirit, replaced a mismatched stock photo, and fixed real bugs found along the way: a broken day-availability check in two of the three layouts (`isBookingOpen` was never set, so "fully booked" messaging silently never showed), theme colors being ignored in CTA buttons/menu headers, fabricated business info (fake address/hours) shown to every tenant, and a missing language switcher on one layout.
- Added a dedicated `/r/[slug]/menu` route (for QR codes) that renders each tenant's own branded layout in a lightweight "menu only" mode instead of a generic page, and pointed `QRCodePDFGenerator` at it.
- Added day/time quick-pick chips (previously only in `ClassicLayout`) to `PremiumLayout` and `OldenLayout`'s reservation forms, and moved the day-availability status panel to right after date/time selection with a clear "Thursday, July 2"-style label in all layouts.
- Added the `MenuItem.allergens` field (existed in the schema, was never rendered) to all menu item cards, with a new `public.allergens` i18n key.
- Built a new 4th public layout, `GardenLayout` (`layoutStyle: GARDEN_FRESH`) — light, warm, photography-forward, less minimalist than the others — and assigned it to Moss & Stone. Registered the new style in the SysAdmin tenant-settings dropdown so it can be assigned to other tenants too.
- Verified all four public layouts (hero, menu page, booking flow) at a 390px mobile viewport: zero console errors, zero horizontal overflow anywhere.

**Reservation window, conflicts & auto-confirm**
- `defaultDurationMinutes` (admin-adjustable, defaults to 90 min) already existed as a setting, but the actual table-conflict check was hardcoded to 90 minutes regardless of that setting — fixed to use the real configured duration.
- Added a distinct `409 TABLE_CONFLICT` response so staff can be shown a warning dialog and knowingly double-book a table on purpose (public/customer bookings are always hard-blocked, never allowed to override).
- Auto-confirm now only fires when a table is actually free at that moment; when nothing's free (but the party size could physically fit somewhere in the restaurant) the reservation is still accepted as `PENDING` with a `possiblyFullyBooked` flag, and the public booking flow shows a soft "we may be fully booked" hint instead of a hard rejection.

**Reservation Timeline tab**
- Added a third tab to the admin Reservations page: tables as rows, time-of-day as columns, reservation bars positioned by start time/duration, defaults to the current time on open with day navigation and a "jump to now" button.

**Reservation date-waitlist**
- Found this was already ~90% built (public join flow, `WaitlistEntry.targetDate`, admin "Future Dates" tab, offer/accept/decline flow) from prior work — just decoupled it from the unrelated walk-in wait-time `isWaitlistOpen` toggle, since a guest queueing for a future fully-booked date shouldn't be blocked by today's walk-in queue being closed. SMS notification stays a logged placeholder (no provider configured); staff manage/notify guests from the dashboard directly.

**No-show / repeat-guest tracking**
- `getReservations` now returns a per-phone-number `phoneHistory: { totalVisits, noShowCount }` (computed via a single grouped query, no schema change), and the admin reservation list shows a warning badge when a phone number has prior no-shows.

**Floor plan**
- Added a `color` field to `Table` (previously only floor elements had one) with a color picker in the table dialog.
- Tables can now be resized by dragging their corner directly on the canvas, matching floor elements (previously resize was element-only, tables were drag-move only).
- Fixed the floor plan canvas to render on a fixed logical coordinate system (1400×800) scaled via CSS transform to fit any container width, instead of raw pixel positions that didn't adapt to different screen sizes.

**Docs**
- Updated `PROJECT_LOGIC.md`, `API_DOCS.md`, `ROADMAP.md`, and `CLAUDE.md` to reflect all of the above.

**Note on local test data:** two seeded dev accounts (`hello@rusticoven.com`, `admin@myrestaurant.com`) had their passwords reset to a known test value while verifying the admin dashboard changes in a browser. This only touches the local SQLite dev database, not any real credentials.
