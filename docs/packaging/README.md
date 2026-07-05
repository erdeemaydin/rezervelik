# Packaging: Hosted Frontend & Reservation Widget

This folder is the home for the **two-track packaging initiative** — offering the
public booking experience as two separately-sold commercial packages instead of a
single bundled frontend.

| Track | Package | Who it's for | What we ship |
|-------|---------|--------------|--------------|
| **A** | **Hosted Booking Site** | Tenants without their own website (or who want us to run it) | We host their full booking site on **their own domain** (`reservations.theirbrand.com`). End customers never see our subdomain. |
| **B** | **Reservation Widget & API** | Tenants who already have a website | An embeddable booking module: one language-agnostic **JS/iframe embed** + native **SDKs** (Node, PHP, Python) over a hardened public API. |

Both are **add-on packages toggled by the SysAdmin** (root admin), never self-served
by the tenant — consistent with how `layoutStyle`, `businessType`, and the other
per-tenant capability flags already work.

## Documents

- **[SALES_GUIDE.md](./SALES_GUIDE.md)** — how to position, pitch, price, and sell
  these two packages to tenants (our paying customers). Start here for the
  commercial side.
- `ARCHITECTURE.md` *(added in a later phase)* — technical design: schema, domain
  routing, Caddy on-demand TLS, widget bundle, SDK generation.

## Data model (Phase 1 — done)

Commercial state lives on `Restaurant` (set only via `PUT /api/system/tenants/:id/settings`):

| Field | Meaning |
|-------|---------|
| `hasHostedFrontend` | Track A package active |
| `customDomain` | The tenant's own domain we serve their site on (CNAME'd to us) |
| `customDomainVerifiedAt` | Set once the domain's DNS resolves to us |
| `hasReservationWidget` | Track B package active |
| `publicApiKey` | `pk_live_…` publishable key that scopes widget/SDK calls to this tenant without exposing the internal UUID |

## Build phases

1. **Foundation** *(done)* — schema, `publicApiKey` minting, SysAdmin toggles.
2. Hardened public API + OpenAPI spec (unblocks widget + SDKs).
3. Widget bundle (`embed.js` + iframe booking route).
4. Hosted-domain routing (host→slug resolution, Next.js rewrite, `Caddyfile`).
5. Native SDKs generated from the OpenAPI spec (`/sdks`).
6. i18n (tr + en) for all new UI.
