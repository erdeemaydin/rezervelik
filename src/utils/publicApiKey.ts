import crypto from 'crypto';

// Publishable key for the embeddable reservation widget + native SDKs. It scopes
// public booking calls to a single tenant WITHOUT exposing the internal Restaurant
// UUID, and is safe to ship in third-party website markup (like a Stripe pk_).
// It is NOT a secret/bearer credential: it only unlocks the same public booking
// surface an end customer already reaches through /r/[slug].
export const PUBLIC_API_KEY_PREFIX = 'pk_live_';

export const generatePublicApiKey = (): string =>
  PUBLIC_API_KEY_PREFIX + crypto.randomBytes(24).toString('hex');
