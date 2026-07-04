import path from 'node:path';

// Point the app at the isolated test database and give it a deterministic JWT
// secret. Set BEFORE any module that imports the Prisma client or jwt util, so
// keep this file as the vitest `setupFiles` entry.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || `file:${path.join(process.cwd(), 'prisma', 'test.db')}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SETUP_SECRET_TOKEN = process.env.SETUP_SECRET_TOKEN || 'test-setup-secret';
