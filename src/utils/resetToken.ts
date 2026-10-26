import crypto from 'crypto';

// Password reset tokens are single-use, high-entropy, and short-lived. The raw
// token is only ever exposed once (in the reset link); the database stores only
// its SHA-256 hash, so a database leak cannot be used to reset anyone's password.

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// SHA-256 hex of the raw token — the value persisted in User.resetTokenHash.
export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Mint a new reset token: 256 bits of CSPRNG entropy plus its at-rest hash and expiry.
export function generateResetToken() {
  return generateHashedToken(RESET_TOKEN_TTL_MS);
}

// Same CSPRNG-token-plus-hash shape as generateResetToken, but with a caller-chosen
// TTL — used for longer-lived tokens like a tenant's one-time setup invite.
export function generateHashedToken(ttlMs: number) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}
