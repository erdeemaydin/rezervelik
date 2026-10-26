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
  // Only meaningful when role === 'SUPER_ADMIN': true = full platform root,
  // false = a restricted sub-admin (see src/config/systemPermissions.ts).
  // Carried in the token so non-SUPER_ADMIN requests never pay a DB lookup for
  // it; authMiddleware re-checks it live against the DB on every SUPER_ADMIN
  // request specifically (tenant-scoped routes included, not just
  // /api/system/*), the same way it already does for isActive.
  isRootAdmin?: boolean;
  // Set only on a token minted by the impersonate flow — the SUPER_ADMIN's own
  // user id, so audit-log entries written while impersonating can be traced
  // back to who was actually driving the session (see auditService).
  impersonatedBy?: string;
}

export const generateToken = (
  userId: string,
  restaurantId: string | null | undefined,
  role: string,
  isRootAdmin?: boolean,
  impersonatedBy?: string
) => {
  const payload: SessionTokenPayload = {
    userId,
    restaurantId,
    role,
    ...(role === 'SUPER_ADMIN' ? { isRootAdmin: isRootAdmin !== false } : {}),
    ...(impersonatedBy ? { impersonatedBy } : {}),
  };
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

// --- Customer (online-ordering) session tokens -----------------------------
//
// Deliberately a *separate* token family from the staff session token above,
// not a `role: 'CUSTOMER'` value on the same shape — verifyToken() (staff)
// rejects anything carrying a `purpose` claim, so a customer token can never
// be replayed against a staff-only route, and verifyCustomerToken() below
// requires `purpose === 'customer_session'` plus a `customerId`, so a staff
// token (no `purpose`, no `customerId`) can never be replayed the other way
// either. Same mutual-exclusion trick as the otp_challenge token above, just
// long-lived enough to actually hold a session (see CUSTOMER_JWT_EXPIRES_IN).
const CUSTOMER_JWT_EXPIRES_IN = (process.env.CUSTOMER_JWT_EXPIRES_IN || '12h') as SignOptions['expiresIn'];

export interface CustomerTokenPayload {
  customerId: string;
  restaurantId: string;
  phone: string;
  purpose: 'customer_session';
}

export const generateCustomerToken = (customerId: string, restaurantId: string, phone: string): string => {
  const payload: CustomerTokenPayload = { customerId, restaurantId, phone, purpose: 'customer_session' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: CUSTOMER_JWT_EXPIRES_IN, algorithm: 'HS256' });
};

export const verifyCustomerToken = (token: string): CustomerTokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as Record<string, unknown>;
  if (decoded.purpose !== 'customer_session' || typeof decoded.customerId !== 'string') {
    throw new Error('Not a customer session token');
  }
  return decoded as unknown as CustomerTokenPayload;
};
