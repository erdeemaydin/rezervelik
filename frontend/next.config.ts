import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function originOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// The frontend talks to its backend via NEXT_PUBLIC_API_URL, baked in at build
// time (see frontend/.env.example). In production this is expected to be a
// same-origin HTTPS path proxied by Nginx (so 'self' alone would cover it),
// but we add the configured origin explicitly too in case a deployment points
// the frontend at a different host. In dev, when NEXT_PUBLIC_API_URL is left
// unset, src/lib/api.ts falls back to `http://<current-host>:3000/api` so the
// app also works from other devices on the LAN -- that host isn't knowable
// statically, so dev-only widen to "any host, port 3000" to match that
// documented fallback without loosening the production policy.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const connectSrc = ["'self'", apiOrigin, isDev ? "http://*:3000" : null]
  .filter(Boolean)
  .join(" ");

const cspDirectives = [
  `default-src 'self'`,
  // Next's App Router injects small inline bootstrap/RSC-streaming scripts
  // (`self.__next_f.push(...)`) into every page, and there is no
  // developer-authored inline <script> elsewhere in this app. A nonce-based
  // CSP would avoid 'unsafe-inline' here, but per Next's own CSP guide it
  // also forces every route into dynamic rendering (no static optimization
  // or ISR) -- a much bigger behavior change than this task asked for, and
  // one we have no way to verify without a real browser. 'unsafe-inline' is
  // the conservative choice given that constraint.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // The public booking layouts (ClassicLayout/PremiumLayout/OldenLayout/
  // GardenLayout) render per-tenant customization colors as inline
  // style={{...}} attributes. CSP's style-src also governs inline style=""
  // attributes (not just <style> elements), and nonces cannot cover
  // attributes at all -- so this genuinely needs 'unsafe-inline', not just a
  // cargo-culted default.
  `style-src 'self' 'unsafe-inline'`,
  // 'https:' is intentionally broad here: uploaded restaurant/menu images are
  // currently served from the backend's local-disk /uploads path, but a
  // sibling change is moving them to S3-compatible object storage, so we
  // don't want to hardcode one bucket hostname we can't know yet. `data:` is
  // required by the html-to-image export used for the shift-schedule export
  // (ShiftAssigner.tsx `toPng`), which rasterizes the DOM via a `data:`
  // SVG <img> internally.
  `img-src 'self' data: blob: https:`,
  // next/font/google self-hosts the font files at build time under
  // /_next/static -- no runtime request to Google's font CDN is made.
  `font-src 'self'`,
  `connect-src ${connectSrc}`,
  // /pay/[ref] embeds the PayTR-hosted secure card-entry iframe (see
  // src/services/payments/PayTRProvider.ts); /pay/mock (PAYMENT_PROVIDER=mock)
  // is a same-origin route.
  `frame-src 'self' https://www.paytr.com`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'self'`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

const ContentSecurityPolicy = cspDirectives.join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: ContentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
