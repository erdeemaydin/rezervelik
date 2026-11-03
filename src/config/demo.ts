// Public showcase tenant ("Harbour & Vine") — a fictional restaurant whose
// logins are published in the README so reviewers can try the dashboard.
//
// The restaurant id is fixed so that (a) scripts/demo-tenant.ts can wipe and
// rebuild the tenant nightly without the id changing under live sessions, and
// (b) demoGuard can recognise demo sessions straight from the JWT without a DB
// lookup. Everything under this id is disposable mock data.
export const DEMO_RESTAURANT_ID = 'de300000-0000-4000-8000-000000000001';
export const DEMO_RESTAURANT_SLUG = 'harbour-and-vine';

// example.com is reserved for documentation (RFC 2606), so these can never
// collide with a real customer's login.
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = {
  admin: 'admin@demo.example.com',
  manager: 'manager@demo.example.com',
  host: 'host@demo.example.com',
} as const;
