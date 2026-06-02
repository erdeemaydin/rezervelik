# Project Roadmap & Checklist

## Documentation Rule (Important!)
*Every time a feature is implemented using only a frontend mockup or a backend placeholder (e.g., `console.log` for SMS, mocked payment gateways), a corresponding documentation file MUST be created in the `docs/MOCK_IMPLEMENTATIONS.md` file. This document must explain and document all of the API requests, webhooks, and integrations that need to be built to bring that feature to life in a production environment.*

## Phase 1: Core Architecture & Backend (Current)

### Architecture Setup
- [x] Initialize Node.js/Express/TypeScript project
- [x] Configure Prisma with PostgreSQL
- [x] Design Multi-tenant Database Schema
- [x] Set up i18n (Turkish & English)
- [x] Implement Tenant Middleware (`X-Restaurant-ID`)
- [x] Standardize API Response format

### Features to Implement
- [x] **Authentication & Authorization**
  - [x] Install JWT and bcrypt
  - [x] User login and registration (for tenant admins)
  - [x] Role-based access control middleware (Admin, Manager, Staff)
- [x] **Table & Capacity Management**
  - [x] CRUD API for `TableType`
  - [x] CRUD API for `Table`
- [x] **Reservation Management**
  - [x] API to create reservations
  - [x] Logic handler for `FIXED_TIME_SLOT`, `DYNAMIC_DURATION`, `MANUAL_AVAILABILITY`
  - [x] API to list/update reservations (for staff)
- [x] **Restaurant Settings**
  - [x] API to manage global reservation toggles and deposit settings
- [x] **AI Menu Importer Placeholder**
  - [x] Scaffold service wrapper for future OCR/LLM integration

## Phase 2: Frontend Dashboard (Next)
- [x] Initialize Next.js/React project
- [x] Set up UI Library (shadcn/ui or Tabler)
- [x] Implement Dashboard Layout
- [x] Connect Authentication
- [x] Build Table Management UI
- [x] Build Reservation Calendar/List UI

## Phase 3: External Integrations
- [ ] Implement SMS Gateway wrapper
- [ ] Implement iyzico/PayTR payment integration for deposits
- [ ] Real AI Menu implementation

## Phase 4: Customization & Bulk Operations (Completed)
- [x] **Frontend Customization CMS**
  - [x] Add `FrontendCustomization` model for Theme, Primary Color, Announcements, and Static Text
  - [x] Integrate `/api/customization` endpoints
- [x] **Scheduled Bulk Menu Pricing**
  - [x] Add `ScheduledPriceUpdate` model for bulk price changes
  - [x] Create worker logic for scheduled execution
  - [x] Implement `/api/menus/prices/bulk` endpoint
