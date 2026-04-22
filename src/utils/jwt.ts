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
