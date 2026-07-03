import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

export const generateToken = (userId: string, restaurantId: string | null | undefined, role: string) => {
  return jwt.sign({ userId, restaurantId, role }, JWT_SECRET, {
    expiresIn: '1d', // Hardcoded literal to satisfy strict StringValue type
  });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET) as { userId: string; restaurantId?: string; role: string };
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
  const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string; setupSecret?: string };
  if (decoded.purpose !== 'otp_challenge') {
    throw new Error('Invalid OTP challenge token');
  }
  return decoded;
};
