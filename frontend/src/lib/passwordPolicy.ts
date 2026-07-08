// Mirror of the backend policy in `src/utils/passwordPolicy.ts`. Keep the two in
// sync — the backend is the real gate; this drives the live checklist/strength
// UI so the user knows the rules *before* submitting.

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId = 'length' | 'lowercase' | 'uppercase' | 'number';

export const PASSWORD_RULES: { id: PasswordRuleId; test: (pw: string) => boolean }[] = [
  { id: 'length', test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { id: 'lowercase', test: (pw) => /[a-z]/.test(pw) },
  { id: 'uppercase', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'number', test: (pw) => /[0-9]/.test(pw) },
];

/** i18n key for each rule's human label (see auth.passwordRules.* in locales). */
export const PASSWORD_RULE_LABEL_KEY: Record<PasswordRuleId, string> = {
  length: 'auth.passwordRules.length',
  lowercase: 'auth.passwordRules.lowercase',
  uppercase: 'auth.passwordRules.uppercase',
  number: 'auth.passwordRules.number',
};

export function evaluatePassword(password: string) {
  const results = PASSWORD_RULES.map((r) => ({ id: r.id, passed: r.test(password) }));
  const passedCount = results.filter((r) => r.passed).length;
  return {
    results,
    valid: passedCount === PASSWORD_RULES.length,
    // 0..1 strength for the meter; empty password reads as 0.
    strength: password.length === 0 ? 0 : passedCount / PASSWORD_RULES.length,
  };
}
