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
// the frontend at a different host.
//
// When NEXT_PUBLIC_API_URL is left unset, src/lib/api.ts falls back to
// `<page protocol>//<current-host>:3000/api` -- and it does this unconditionally,
// not just in dev (e.g. a `next build && next start` run with no .env
// configured hits this exact path too, which is the common case for someone
// trying the app locally before setting up a real domain). An earlier version
// of this policy only widened connect-src for that fallback when isDev was
// true, which meant a production-mode build/start with NEXT_PUBLIC_API_URL
// unset had connect-src collapse to 'self' alone while lib/api.ts kept trying
// to call :3000 -- the browser silently blocked every API request app-wide
// (symptom: pages load, nothing they fetch ever shows up, e.g. the SysAdmin
// tenant list looking empty). Match lib/api.ts's actual fallback whenever
// NEXT_PUBLIC_API_URL isn't set, in any mode -- both http and https since the
// fallback reuses whatever protocol the page itself was loaded with.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL);
const connectSrc = apiOrigin
  ? ["'self'", apiOrigin]
  : ["'self'", "http://*:3000", "https://*:3000"];

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
  `connect-src ${connectSrc.join(" ")}`,
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
  // Dev-only: lets `next dev` be reached from another device on the LAN or by
  // its public IP (e.g. a throwaway PM2-managed preview instance on a
  // non-default port) without the dev server's cross-origin asset check
  // 403-ing every _next/static chunk. Has no effect on `next build`/`next start`.
  allowedDevOrigins: isDev ? [...(process.env.DEV_ALLOWED_ORIGIN ? [process.env.DEV_ALLOWED_ORIGIN] : []), "localhost", "127.0.0.1"] : undefined,
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
