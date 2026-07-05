# Sales Guide — Booking Packages

**Audience:** you and anyone selling the platform to tenants (restaurants, salons,
clinics, venues — *our* paying customers). This is about selling to the **business
owner**, not to their end customers.

> Placeholders: brand name is written as **`[Platform]`** and prices in **₺ (TRY)**
> with example figures — replace both with your real brand and price book before
> sharing externally.

---

## 1. The one-sentence pitch

> "You have a booking engine either way. The only question is **where it lives** —
> on a site we build and run for you on your own domain, or embedded straight into
> the website you already have."

Every tenant gets reservations, tables/resources, waitlist, and the dashboard. The
two packages below are **only about the public-facing booking surface**. Never sell
them as "the booking feature" — that's included. Sell them as *distribution*.

---

## 2. The two packages

### 📦 Package A — Hosted Booking Site
*"We build and run your booking website, on your own domain."*

- We host the full branded booking experience (hero, menu, reservation flow, about,
  legal) on **the tenant's own domain** — `reservations.theirbrand.com` or even
  their apex domain.
- The end customer **only ever sees the tenant's domain**. Our platform/subdomain is
  invisible. No "powered by" in the address bar.
- The tenant controls their branding (colours, typography, announcement banner,
  about/legal text) from the dashboard. The layout style is set by us during
  onboarding.
- Tenant does **one thing**: point a DNS record (CNAME) at us. We handle hosting,
  HTTPS certificates (auto-renewing), and uptime.

**Ideal customer:** doesn't have a website, has a bad/outdated one, or doesn't want
to maintain one. Wants to "just have a professional booking page" without touching
code or hiring an agency.

### 📦 Package B — Reservation Widget & API
*"Keep your website. Add live booking to it in five minutes."*

- A drop-in **booking widget** the tenant pastes into their existing website with a
  single snippet — works on **any** site regardless of what it's built with
  (WordPress, Wix, Squarespace, a custom PHP/Rails/.NET site, a Linktree-style page).

  ```html
  <div id="resv-widget" data-key="pk_live_xxx"></div>
  <script async src="https://embed.[platform].com/v1.js"></script>
  ```

- For customers with a developer who wants full control, we also ship **native SDKs**
  (Node/TypeScript, PHP, Python) over a documented public API, so they can build a
  fully custom booking UI in their own site's look and feel.
- Bookings still flow into the same dashboard, waitlist, and notifications as everyone
  else. The widget is just another front door.

**Ideal customer:** already has a website they're happy with and an audience that
lands there. Wants bookings *in* that site, not on a separate page.

---

## 3. Which one does this customer need?

Use this as a qualifying script on the first call:

| Ask them… | If **yes** → | If **no** → |
|-----------|-------------|-------------|
| "Do you already have a website you're happy with?" | **Package B (Widget)** | **Package A (Hosted Site)** |
| "Do you have someone who can edit your website / add code?" | Either works; Widget is cheaper | **Package A** (we do everything) |
| "Do you want customers to book without ever leaving your site?" | **Package B** | — |
| "Do you want us to just handle the whole online presence?" | **Package A** | — |

**They are not mutually exclusive.** A tenant can run the Hosted Site *and* embed the
widget on a partner/aggregator page. But for most, it's one or the other — lead with
the qualifying question above and recommend a single package.

---

## 4. Feature comparison (for a slide or one-pager)

| | Core plan (no add-on) | + Hosted Booking Site | + Reservation Widget |
|---|:---:|:---:|:---:|
| Dashboard, tables, waitlist, notifications | ✅ | ✅ | ✅ |
| Public booking page on **our** URL (`/r/their-name`) | ✅ | ✅ | ✅ |
| Booking on **their own domain** | — | ✅ | — |
| Our branding hidden from end customers | — | ✅ | ✅ (their site) |
| Embed booking into their existing website | — | — | ✅ |
| Native SDKs / custom API integration | — | — | ✅ |
| HTTPS + hosting managed by us | — | ✅ | n/a (their host) |
| Tenant effort to launch | none | 1 DNS record | 1 paste of a snippet |

---

## 5. Positioning & value (why they pay)

**Package A — Hosted Booking Site**
- **Credibility:** `reservations.theirbrand.com` looks professional; a shared
  platform URL doesn't.
- **Zero maintenance:** no hosting bills, no SSL expiry panics, no web developer on
  retainer. "It just works and it's always up."
- **Speed:** live in a day, not the weeks an agency site takes.
- **Anchor the price against the alternative:** a freelance web agency in Turkey
  charges ₺15,000–₺60,000+ up front for a site, plus hosting/maintenance. We're a
  small monthly fee with the booking engine already built in.

**Package B — Reservation Widget & API**
- **No disruption:** they keep the site, brand, and SEO they already invested in.
- **Higher conversion:** booking happens inline; every click that leaves a site to a
  third-party page loses customers.
- **Developer-friendly:** the SDKs mean a technical customer is never boxed in — they
  can build exactly the UI they want. This closes deals with customers who'd otherwise
  say "we'll build our own."

---

## 6. Pricing guidance (example — set your real numbers)

Sell both as **recurring add-ons** on top of the base subscription, not one-time fees.
Suggested structure (illustrative):

| Package | Setup (one-time) | Monthly add-on |
|---|---|---|
| Hosted Booking Site | ₺2,500 (domain + design onboarding) | ₺750 / mo |
| Reservation Widget | ₺0 (self-serve paste) | ₺400 / mo |
| Widget + SDK/API tier | ₺0 | ₺900 / mo |

Rules of thumb:
- **Hosted Site carries a setup fee**, because it involves real onboarding work
  (domain, layout, content). The Widget shouldn't — friction kills the self-serve
  motion.
- Bundle a package **free for the first 1–3 months** on annual plans to remove the
  "will it work for us?" objection.
- The Widget is the **land**; the Hosted Site and SDK tier are the **expand**.

---

## 7. Objection handling

| Objection | Response |
|---|---|
| *"I already have a website."* | Perfect — that's exactly who the **Widget** is for. You keep your site; we just add live booking inside it. Nothing gets replaced. |
| *"I don't want your branding on my page."* | You won't have it. Package A runs on **your** domain; the Widget lives inside **your** site. Your customers never see us. |
| *"Isn't a custom domain complicated?"* | You change **one DNS record** and send it to us. We do the rest — hosting, security certificate, renewals. |
| *"We'll just build our own booking system."* | You can — and with the **SDK/API tier** you build the exact UI you want on top of our engine, instead of reinventing availability logic, no-show tracking, and payments. Cheaper and faster than building from zero. |
| *"What if I want to change from embed to a full site later?"* | Both run on the same account. Switching is a settings change on our side — your data comes with you. |
| *"Is my data safe on a shared platform?"* | Every tenant is isolated; your bookings are only ever visible to your team. Same infrastructure that already runs your dashboard. |

---

## 8. How activation works (so you can promise timelines honestly)

Both packages are **switched on by us (root admin)** — the tenant can't self-activate,
which means you control provisioning and billing.

**Package A — Hosted Booking Site**
1. We enable *Hosted Booking Site* and set the tenant's domain in the SysAdmin panel.
2. Tenant adds a **CNAME** record at their domain registrar pointing to us (we give
   them the exact target).
3. DNS propagates (minutes to a few hours). We verify, and the HTTPS certificate is
   issued automatically.
4. Their booking site is live on their domain. ✅

**Package B — Reservation Widget**
1. We enable *Reservation Widget*; a publishable key (`pk_live_…`) is generated for
   the tenant automatically.
2. Tenant (or their web person) pastes the snippet into their site — or a developer
   installs the SDK and uses the key.
3. Bookings appear in their dashboard immediately. ✅

> **What the tenant must provide:** Package A needs access to their domain's DNS
> settings (or their web person's help for the one record). Package B needs the
> ability to paste a snippet into their site — nothing else.

---

## 9. Cross-sell & upsell path

```
Base subscription
   └─ land with the Widget (cheap, self-serve, instant "wow")
        └─ upsell Hosted Booking Site when they say "I wish my whole site looked this good"
        └─ upsell SDK/API tier when a developer wants a fully custom flow
```

The Widget's low friction makes it the ideal **entry add-on**. Once a tenant sees
bookings flow in, the Hosted Site and API tiers sell themselves.

---

## 10. Quick FAQ

**Can a tenant have both?** Yes. They're independent flags.

**Does the end customer ever see `[platform].com`?** No — not with either package.
Package A is on the tenant's domain; the Widget is inside the tenant's own site.

**What languages does the widget support?** The end-customer booking UI is bilingual
(Turkish + English), like the rest of the platform. The *embed* works on a site built
in any programming language — that's the whole point of the JS/iframe approach.

**Do we host their email / whole website in Package A?** No — Package A is the
**booking site** on their domain (or a subdomain like `reservations.`). It's not a
general-purpose website/CMS or email hosting. Be explicit about this to avoid scope
creep.

**What if they cancel?** Turning the package off removes the public surface; their
account, data, and dashboard are untouched. For Package A, they repoint their DNS
away.
