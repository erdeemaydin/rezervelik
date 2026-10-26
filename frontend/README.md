# Rezervelik — Frontend

Next.js 16 (App Router) + React 19 + Tailwind CSS 4. One app serves every surface of the platform:

| Route | Audience | Notes |
|---|---|---|
| `/r/[slug]` | Guests | Tenant booking page, rendered by one of eight layout components chosen by `layoutStyle` (`src/components/public/`) |
| `/r/[slug]/menu` | Guests | QR-friendly menu-only view: same layouts, rendered with `menuOnly` |
| `/r/[slug]/order` | Guests | Online ordering with delivery-zone checks |
| `/r/[slug]/waitlist`, `/offer/[token]` | Guests | Date waitlist and accept/decline offers |
| `/r/[slug]/invite/[token]` | Event guests | Public e-invitation with RSVP |
| `/dashboard/*` | Tenant staff | Shared persistent layout (`app/dashboard/layout.tsx`) |
| `/order-station` | Kitchen / counter | Live order board over SSE |
| `/system-admin/*` | Platform admins | Tenant provisioning, feature flags, layouts |

## Conventions

- **API access** goes through the single Axios instance in `src/lib/api.ts`. It attaches the JWT and `X-Restaurant-ID` and handles 401s, so pages never call `fetch`/`axios` directly.
- **Auth state** lives in the Zustand store `src/store/useAuthStore.ts`.
- **i18n**: every user-facing string is in both `src/i18n/locales/tr.json` and `en.json` (default locale `tr`).
- **Never show raw IDs** in selects: the shared Select wrapper maps values to labels.

## Commands

```bash
cp .env.example .env   # NEXT_PUBLIC_API_URL is optional in local dev
npm install
npm run dev            # http://localhost:3001
npm run lint
npm test               # Vitest unit tests
npm run build
```

See the [root README](../README.md) for architecture and backend setup.
