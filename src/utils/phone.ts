// Phone helpers. Numbers are stored in E.164-ish form: "+" + country code +
// national number with no leading zero (e.g. "+905551234567"). The public/staff
// forms collect a country code (default +90) and the national number separately.

/** Strip everything but digits. */
const digitsOnly = (s: string) => (s || '').replace(/\D/g, '');

/**
 * Combine a country code (e.g. "+90" or "90") and a national number into E.164.
 * Drops a leading zero from the national part (Turkish users habitually type it).
 */
export function normalizePhone(countryCode: string, nationalNumber: string): string {
  const cc = digitsOnly(countryCode);
  let nn = digitsOnly(nationalNumber);
  if (nn.startsWith('0')) nn = nn.replace(/^0+/, '');
  return `+${cc}${nn}`;
}

/**
 * Validate a full phone. Accepts an already-combined "+90555..." string.
 * Requires a country code and a national number of 7–12 digits (covers TR's 10).
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) return false;
  const digits = digitsOnly(trimmed);
  // country code (1-3) + national (7-12) => total 8-15, per E.164 max of 15.
  return digits.length >= 8 && digits.length <= 15;
}

/** True when a Turkish (+90) number has exactly 10 national digits. */
export function isValidTurkishPhone(phone: string): boolean {
  const digits = digitsOnly(phone);
  return digits.startsWith('90') && digits.length === 12;
}
