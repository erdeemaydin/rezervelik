# Dining Reservation SaaS - Roadmap

## Phase 1: Core Foundation & Minimum Viable Product (MVP) - COMPLETED
- [x] Basic multi-tenancy architecture (Database schema, `X-Restaurant-ID` middleware).
- [x] Super Admin dashboard structure.
- [x] Tenant onboarding & registration (with security configurations).
- [x] Core Authentication (JWT, Role-Based Access Control).
- [x] Table & Floor plan management (Areas, Tables, Capacities).
- [x] Reservation Engine (Fixed slot vs. Dynamic duration).
- [x] Digital Menu System (Categories, Items, Dietary tags).
- [x] Frontend Customization (Basic themes, typography, custom colors).
- [x] Shift Management MVP (Daily availability, assignment limits, scheduling warnings).

## Phase 2: Enhanced Operations & Integrations (IN PROGRESS)
- [ ] **Payment Gateway Integration:** Implement stripe/iyzico adapters to actually charge the `depositAmount` during public booking.
- [ ] **SMS Integration (Twilio/AWS SNS):** Send actual SMS notifications when the Waitlist status changes to `NOTIFIED`.
- [ ] **AI Menu Importer:** Service layer to parse photos of physical menus via LLM/OCR and bulk insert items.
- [x] **Interactive Floor Plan:** Visual drag-and-drop floor plan builder with per-table color and resize, scaling to any screen resolution via a fixed logical canvas.
- [x] **Reservation Conflict Handling:** Table-conflict checks now respect the configurable reservation window, staff can knowingly override with a warning, and auto-confirm only fires when a table is actually free (soft "possibly fully booked" pending state otherwise).
- [x] **Reservation Timeline:** Tables × time-of-day Gantt-style view added to the admin Reservations page.
- [x] **KVKK consent & retention (PROJECT_LOGIC.md §14):** required booking-consent checkbox (server-enforced) + separate optional WhatsApp/marketing consent on the public booking form, a bilingual privacy notice page (`/r/[slug]/privacy`, tenant-overridable), and a daily retention/anonymization worker for `Reservation`/`WaitlistEntry` PII. Still open: data-processing-agreement template, VERBİS threshold check (PRODUCTION_ROADMAP.md §7.3).
- [ ] **Advanced Analytics:** Charting daily revenue (from deposits), reservation drop-off rates, and table turnover times.

## Phase 3: Scaling & Guest Experience
- [ ] **CRM & Loyalty:** Guest profiles, visit history, total spend, and automated VIP tagging based on booking frequency. *(First step done: reservation list now shows a per-phone visit/no-show tally.)*
- [ ] **Marketing Automation:** Mailchimp/Sendgrid integrations to email guests based on their reservation tags (e.g., "Birthday").
- [ ] **Custom Domains:** Allow tenants to point their own domains (e.g., `bookings.myrestaurant.com`) instead of just `tenant.saas.com`.
- [ ] **POS Integration Layer:** Webhooks to sync orders from the table to legacy Point of Sale systems (e.g., Micros, NCR).

## Technical Debt / Optimization Queue
- [ ] **Redis Caching:** Cache public endpoints (like `GET /api/public/restaurant/:slug`) to reduce database load during traffic spikes.
- [ ] **Database Indexing:** Optimize indices on `Reservation` (date ranges) and `WaitlistEntry` (status).
- [ ] **Automated Testing:** Implement E2E testing for the reservation flow using Cypress or Playwright.
