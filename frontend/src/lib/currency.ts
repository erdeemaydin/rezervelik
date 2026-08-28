// Shared money formatter — mirrors the pattern already established in
// dashboard/menus/page.tsx's formatPrice: use the tenant's configured
// RestaurantSettings.currency, not a hardcoded 'TRY', since restaurants can
// run in other currencies. `Intl.NumberFormat`/`toLocaleString` throws on an
// unrecognized currency code, so fall back to a plain "<amount> <code>"
// string rather than crashing the page over a bad/legacy value.
export function formatMoney(amount: number, currency: string | undefined | null, locale: string): string {
  const code = currency || 'TRY';
  const localeTag = locale === 'tr' ? 'tr-TR' : 'en-US';
  try {
    return amount.toLocaleString(localeTag, { style: 'currency', currency: code });
  } catch {
    return `${amount.toLocaleString(localeTag)} ${code}`;
  }
}
