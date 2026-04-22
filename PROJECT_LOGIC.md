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

## 6. AI Menu Importer (Phase 2 Placeholder)
- A decoupled service layer is planned. It will take an uploaded image, send it to an OCR/LLM provider, and return a structured JSON representing the menu categories and items.

## 7. UI/UX Rules & Guidelines
- **Dropdown/Select Menus:** Never display raw database IDs (UUIDs) to the user in any dropdown or select menu on the admin panels. Always ensure the `<SelectValue>` or equivalent component maps the selected `id` to its corresponding `name` or `identifier` (e.g., displaying the Category Name instead of Category ID, or Table Identifier instead of Table ID).
