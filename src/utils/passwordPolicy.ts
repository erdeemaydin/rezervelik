/**
 * Single source of truth for the password policy, mirrored on the frontend in
 * `frontend/src/lib/passwordPolicy.ts`. Keep the two in sync.
 *
 * The policy is only enforced when a password is *chosen* (setup, reset,
 * change-password). Login never re-validates against it — legacy accounts with
 * older/weaker passwords must still be able to sign in, since we only have the
 * bcrypt hash and can't (and shouldn't) block them.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId = 'length' | 'lowercase' | 'uppercase' | 'number';

export const PASSWORD_RULES: { id: PasswordRuleId; test: (pw: string) => boolean }[] = [
  { id: 'length', test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { id: 'lowercase', test: (pw) => /[a-z]/.test(pw) },
  { id: 'uppercase', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'number', test: (pw) => /[0-9]/.test(pw) },
];

/** Returns which rules the password fails; `valid` is true only when none fail. */
export function validatePassword(password: unknown): { valid: boolean; failed: PasswordRuleId[] } {
  if (typeof password !== 'string') {
    return { valid: false, failed: PASSWORD_RULES.map((r) => r.id) };
  }
  const failed = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.id);
  return { valid: failed.length === 0, failed };
}
