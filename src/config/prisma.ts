import { PrismaClient } from '@prisma/client';

// Allow the datasource URL to be overridden at runtime via DATABASE_URL. This is
// backward compatible: when DATABASE_URL is unset the client falls back to the URL
// baked into the Prisma schema. It lets each environment (dev / CI test DB / prod)
// point at its own database without editing the schema.
const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? { datasources: { db: { url: process.env.DATABASE_URL } } }
    : undefined
);

export default prisma;
