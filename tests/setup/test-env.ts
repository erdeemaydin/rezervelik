// Point the app at the isolated PostgreSQL test database and give it a
// deterministic JWT secret. Set BEFORE any module that imports the Prisma client
// or jwt util, so keep this file as the vitest `setupFiles` entry.
//
// The default must match tests/setup/prepare-test-db.mjs (the throwaway local
// Postgres on :5433). CI/custom setups override via TEST_DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5433/dining_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SETUP_SECRET_TOKEN = process.env.SETUP_SECRET_TOKEN || 'test-setup-secret';
