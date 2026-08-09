-- Additive: revocation switch for User accounts (SUPER_ADMIN deactivation,
-- security-audit finding — no product path existed to revoke a
-- compromised/offboarded admin credential).
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
