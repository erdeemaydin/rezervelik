# Work Log — Autonomous Session 2026-07-03

You left the 7-point list and asked me to implement, choose defaults where needed,
document decisions, commit properly, and shut down when finished. This is the
record of what was done. Both the backend (`tsc`) and the frontend (`next build`)
compile cleanly at the end of the session.

Legend: ✅ done · 🔶 partial (see notes) · ⬜ not done · ❓ decision I made for you

Commits are small and themed — `git log --oneline` on `main` shows each item.

---

## 1. Analytics dashboard
- ✅ 1.1 Heatmap orientation fixed. Root bug: the grid declared `repeat(12,1fr)`
      but rendered 14 hour cells, so columns misaligned. Now days = rows, hours =
      columns, aligned.
- ✅ 1.2 Heatmap hour axis now spans only the restaurant's open hours.
- ✅ 1.3 NEW admin-configurable opening/closing hours (`RestaurantSettings.openingHour`
      /`closingHour`), edited under Settings.
- ✅ 1.4 Custom from/to date-range picker on the analytics page (alongside the period select).
- ✅ 1.5 Average waitlist-to-seated wait time (already computed; still shown).
- ✅ 1.6 New stats added: cancellation rate, no-show rate, booking lead time
      (avg hours/days in advance), and new/returning/regular customer segmentation.
      (Segmentation is by phone lifetime count: 1 = new, 2–4 = returning, 5+ = regular.)

## 2. Main dashboard (Today's Operations)
- ✅ 2.1 Day selector — any day's stats can be viewed; live auto-refresh and the
      "Now" marker apply only when today is selected. Backend `GET /restaurants/today?date=`.
- ✅ 2.2 Removed the redundant "Upcoming Timeline" card.

## 3. Reservation overlap bug (CRITICAL)
- ✅ 3.1 Two root causes fixed: (a) the occupancy check ignored `AWAITING_PAYMENT`
      and `SEATED`, so accepted-but-unpaid bookings didn't hold their table; (b) the
      check-then-insert was non-transactional (race). New `src/utils/reservationConflict.ts`
      centralizes blocking statuses + conflict/availability queries; create now runs
      selection+recheck+insert inside one `$transaction`. Also fixed
      `publicController.acceptOffer`, which created reservations with no `endTime`
      and no conflict check.
- ✅ 3.2 When every fitting table is booked for a public slot, we now flag the day
      `isFullyBooked` (manual control) and reject with `errors.fully_booked` instead
      of silently creating an unassigned booking. ❓ "switch to manual control" was
      interpreted as marking that specific date fully-booked (targeted), NOT flipping
      the whole restaurant's reservation logic mode. Staff can still force an
      unassigned pending booking.

## 4. Tables/floor + categories + payment
- ✅ 4.1 Floor-plan dragging still gated behind edit mode (unchanged).
- ✅ 4.2 List-view Edit/Delete are now always visible.
- ✅ 4.3 Standardized statuses + colors in one source of truth
      (`frontend/src/lib/reservationStatus.ts`); CONFIRMED is blue everywhere.
      Reservations list, timeline blocks, analytics charts and status dots all read it.
- ✅ 4.4 Corrected flow: Pending → (accept) → Awaiting Payment → (pay) → Confirmed.
- ✅ 4.5 Tiered deposit deadline: 30 min if reservation < 2h away, 1h same-day,
      otherwise 2h, capped at reservation start (`computePaymentDeadline`).
- ✅ 4.6 Manual "Skip payment" action next to Accept / on awaiting-payment rows.
- ❓ Payment UX = your Option C (SMS link + short code fallback) — that scaffolding
      already existed; provider is PayTR (also pre-existing). SMS now actually routes
      through the messaging layer (placeholder until Netgsm keys are set).

## 5. Locale + readability + UI
- 🔶 5.1 Turkish naturalization. The root problem you felt was **stripped diacritics**
      (e.g. "Karsilama" → should be "Karşılama"). I fixed the high-traffic blocks:
      admin nav, dashboard, analytics, settings (new keys), staff dialog, reservation
      statuses/confirmations, tables delete. REMAINING (still ASCII-stripped): the
      `menus`, `public`, `waitTime`, `scheduling`, `systemAdmin`, `customization`, and
      the rest of `settings` blocks in `frontend/src/i18n/locales/tr.json`. This is a
      big line-by-line pass; see "How to finish the Turkish pass" below.
- ✅ 5.2 "saat 13" not "zaman 13" — confirmation prompts label time as "Saat";
      the reservation detail rows use the time value directly.
- ✅ 5.3 Fixed the "big İ" issue (removed Turkish dotted capital İ from English
      strings) within the blocks I touched; new English keys use plain ASCII.
- 🔶 5.4 Bigger, more readable fonts — done for the admin sidebar (was text-xs/8px,
      now text-sm/10px). A broader typography pass across every page was not done.
- 🔶 5.5 Live & Pending readability — status badges/rows now use the standardized
      higher-contrast colors + slightly larger badge text. Not a full redesign.
- 🔶 5.6 Dropdowns — the app already uses a good component (Radix/base-ui `Select`)
      in most places; I did not replace it. Two raw `<select>` remain
      (`dashboard/host`, `system-admin/tenants`) and could be migrated later.
- ✅ 5.7 Status count dots (colored per-status counts) above the reservations list
      and timeline (`components/dashboard/StatusDots.tsx`).
- ✅ 5.8/5.9/5.10 Custom styled confirmation modal replacing `window.confirm`
      (`components/ui/confirm-dialog.tsx`, `useConfirm`), mounted at the root layout.
      Accept/reject/skip-payment/delete (reservations), table/zone/box delete, staff
      delete, and shift force-assign all now prompt with a boxed detail summary
      (e.g. guest, time, pax, table).

## 6. Shifts
- ✅ 6.1 The highlight "pulse" icon on each staff card is replaced by the live count
      of shifts that staff has in the displayed plan; clicking still toggles the
      highlight, unchanged.

## 7. Staff / payments / phone / time tracking
- ✅ 7.1 Admin never sets passwords. Creating a staff member issues a single-use
      reset link (shown in a copyable dialog); editing offers a "send reset link"
      toggle. New `POST /staff/:id/reset-link`.
- ✅ 7.2 Publishing a shift plan schedules a WhatsApp broadcast of each staff
      member's own shifts.
- ✅ 7.3 Publish opens a confirmation popup (period + how many staff will be notified).
- ✅ 7.4 5-minute grace delay before sending; the admin is told "sent to all working
      staff in ~5 minutes". Delay is `SHIFT_PUBLISH_DELAY_MS` (default 300000).
- ✅ 7.5 Staff with no shifts in range (or no phone) are skipped.
- ✅ 7.6 `User.phone` added; staff APIs accept + validate it.
- ✅ 7.7 Standardized `PhoneInput` (+90 country box + separate number field, strips
      leading zero, hint text) with `isValidPhone` validation on the backend.
- ✅ 7.8 Time-tracking portal at `/dashboard/timesheet`: staff (or admin) log actual
      check-in/out + break per day.
- ✅ 7.9 Weekly/monthly worked-hours summary computed from entries.
- ✅ 7.10 When no entry exists, worked hours fall back to the scheduled shift duration.

---

## ❓ Decisions I made for you (please sanity-check)
- **Providers are placeholders.** Netgsm (SMS) and Meta WhatsApp (Cloud API) are
  implemented against their documented HTTP APIs but stay in log-only mode until
  env vars are set (you said you don't have accounts yet). PayTR was already wired.
- **Customer segmentation thresholds**: new=1, returning=2–4, regular=5+ lifetime
  reservations (by phone). Easy to tune in `analyticsController.ts`.
- **"Manual control" on fully-booked** = flag that date `isFullyBooked` + reject the
  public booking (not a global logic-mode switch). See 3.2.
- **Shift-plan WhatsApp visibility**: each staff member receives ONLY their own
  shifts (privacy-safe default), regardless of the roster view setting.
- **5-minute delay is an in-process timer** (`setTimeout`). Fine for a single
  instance; it will NOT survive a server restart. Replace with a durable job queue
  (BullMQ/agenda/cron) for production.
- **DB migrations**: your repo has one stale `init` migration but the schema is far
  ahead, so you've clearly been using `prisma db push`. I matched that (`db push`),
  I did NOT author migration files. Run `npx prisma migrate dev` yourself if you want
  proper migration history for: openingHour/closingHour, User.phone, TimeEntry.

## Provider env vars to fill in later (all optional; placeholders log until set)
```
APP_PUBLIC_URL=https://your-frontend-host        # used in reset + payment links
PAYMENT_PROVIDER=paytr                            # already supported (default: mock)
NETGSM_USERCODE=...
NETGSM_PASSWORD=...
NETGSM_MSGHEADER=...                              # approved SMS header
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
SHIFT_PUBLISH_DELAY_MS=300000                     # optional; default 5 min
```

## New files worth knowing
- Backend: `utils/reservationConflict.ts`, `utils/phone.ts`,
  `services/messaging/index.ts`, `controllers/timeEntryController.ts`,
  `routes/timeEntryRoutes.ts`
- Frontend: `lib/reservationStatus.ts`, `components/ui/confirm-dialog.tsx`,
  `components/ui/phone-input.tsx`, `components/dashboard/StatusDots.tsx`,
  `app/dashboard/timesheet/page.tsx`

## Not done / follow-ups
- Finish the Turkish diacritics pass over the remaining locale blocks (5.1).
- Broader font/readability pass beyond the sidebar (5.4/5.5).
- Migrate the two remaining raw `<select>`s to the Select component (5.6).
- Public booking page: turn the new `errors.fully_booked` 409 into a friendly
  "join the waitlist" prompt (backend is correct; the public UI just shows a toast).
- Replace the in-process shift-publish timer with a durable queue.
- Author real Prisma migrations for the schema additions.

## How to finish the Turkish pass (5.1)
The bug is uniformly stripped diacritics in `frontend/src/i18n/locales/tr.json`
(and a few backend strings). Go block-by-block restoring ç/ş/ğ/ı/ö/ü/İ per word,
exactly as I did for the `admin`, `dashboard`, `analytics`, and `staff.dialog`
blocks. Keep English (`en.json`) ASCII and never use "İ" there.
