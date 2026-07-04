import { describe, it, expect } from 'vitest';
import { generateOtpSecret, generateTotp, verifyTotp } from '../../src/utils/totp';

describe('TOTP (2FA codes)', () => {
  it('verifies a freshly generated code', () => {
    const secret = generateOtpSecret();
    expect(verifyTotp(secret, generateTotp(secret))).toBe(true);
  });

  it('rejects a code generated for a different secret', () => {
    const s1 = generateOtpSecret();
    const s2 = generateOtpSecret();
    expect(verifyTotp(s2, generateTotp(s1))).toBe(false);
  });

  it('rejects an empty / malformed code', () => {
    const secret = generateOtpSecret();
    expect(verifyTotp(secret, '')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
  });
});
