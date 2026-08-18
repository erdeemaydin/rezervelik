// Minimal cookie-header parser — avoids pulling in the `cookie-parser`
// dependency just to read one or two named cookies. Express's `res.cookie()`
// already handles setting/serializing cookies natively; this is only for
// reading `req.headers.cookie` on the way in.
export function parseCookies(header?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
