import jwt, { SignOptions } from 'jsonwebtoken';

// A hardcoded fallback secret here would mean any deployment that forgot to
// set JWT_SECRET silently signs every session token with a public, guessable
// string — anyone could forge a valid token for any user/role, including
// SUPER_ADMIN. Fail startup instead of running insecurely.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required and must not be empty — refusing to start with an insecure default.');
}
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'];

export interface SessionTokenPayload {
  userId: string;
  restaurantId?: string | null;
  role: string;
  // Set only on a token minted by the impersonate flow — the SUPER_ADMIN's own
  // user id, so audit-log entries written while impersonating can be traced
  // back to who was actually driving the session (see auditService).
  impersonatedBy?: string;
}

export const generateToken = (
  userId: string,
  restaurantId: string | null | undefined,
  role: string,
  impersonatedBy?: string
) => {
  const payload: SessionTokenPayload = { userId, restaurantId, role, ...(impersonatedBy ? { impersonatedBy } : {}) };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' });
};

export const verifyToken = (token: string): SessionTokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as Record<string, unknown>;
  // Reject anything that isn't a real session token. Every special-purpose
  // token this app mints (the OTP challenge token, most notably) carries a
  // `purpose` claim and no `role` — without this check, authMiddleware would
  // accept a 5-minute "you passed the password step" challenge token as a
  // full session, letting anyone who merely knows a password call any
  // non-tenant-scoped authenticated endpoint (e.g. re-provisioning 2FA)
  // without ever completing the second factor.
  if (decoded.purpose || !decoded.role) {
    throw new Error('Not a session token');
  }
  return decoded as unknown as SessionTokenPayload;
};

// Short-lived token issued between the password step and the OTP step of a
// two-factor login. It only proves "this user just passed the password check";
// it is NOT a session token and grants no access on its own.
//
// For a first-time enrollment the freshly-minted (still unconfirmed) secret is
// carried inside this signed token instead of being persisted — so an abandoned
// setup leaves nothing in the database and every new login attempt gets its own
// secret. The secret is only written to the DB once the user proves possession.
export const generateOtpChallengeToken = (userId: string, setupSecret?: string) => {
  return jwt.sign(
    { userId, purpose: 'otp_challenge', ...(setupSecret ? { setupSecret } : {}) },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
};

export const verifyOtpChallengeToken = (token: string) => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { userId: string; purpose?: string; setupSecret?: string };
  if (decoded.purpose !== 'otp_challenge') {
    throw new Error('Invalid OTP challenge token');
  }
  return decoded;
};
