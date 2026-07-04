import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../../src/utils/jwt';

describe('JWT', () => {
  it('round-trips the claims it signs', () => {
    const token = generateToken('user-1', 'rest-1', 'ADMIN');
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('user-1');
    expect(decoded.restaurantId).toBe('rest-1');
    expect(decoded.role).toBe('ADMIN');
  });

  it('throws on a tampered token', () => {
    const token = generateToken('user-1', 'rest-1', 'ADMIN');
    expect(() => verifyToken(`${token}tampered`)).toThrow();
  });
});
