// Shared numeric parsing for request bodies. Several controllers (mainly
// eventController.ts's guest counts, quoted totals, installment/vendor
// amounts, and publicController.ts's RSVP partySize) used to parseInt/Number
// a client-supplied value with no isNaN guard. A non-numeric string produced
// NaN, which either reaches Prisma's Int columns as an unhandled validation
// error (falls through to a generic 500) or, for Float columns, gets stored
// as-is by Postgres — silently corrupting the row instead of failing loudly.
//
// INVALID is a distinguishable sentinel (not `null`/`undefined`, both of
// which are legitimate "clear this field" / "not provided" values already in
// use at these call sites) so a caller can tell "the client sent garbage"
// apart from "the client sent nothing" with a single `=== INVALID` check.
export const INVALID = Symbol('invalid-numeric-input');

/** Parses a required whole-number count (party size, guest count) that must
 *  be >= min. A missing/empty value returns `fallback` instead of failing. */
export function parseCount(value: unknown, fallback: number, min = 0): number | typeof INVALID {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min ? n : INVALID;
}

/** Parses an optional whole-currency-unit amount, preserving the existing
 *  three-way contract used throughout this codebase: `undefined` (field not
 *  provided, leave unchanged), `null` (explicit clear), or a finite rounded
 *  number. Returns INVALID for anything else (e.g. a non-numeric string). */
export function parseAmount(value: unknown): number | null | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : INVALID;
}
