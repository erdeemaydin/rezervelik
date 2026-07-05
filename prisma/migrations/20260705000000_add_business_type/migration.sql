-- Per-tenant business vertical (RESTAURANT, SALON, SPORTS, COWORKING, CLINIC, WEDDING).
-- Drives terminology labels + default feature profile. Set by SysAdmin only.
ALTER TABLE "Restaurant" ADD COLUMN "businessType" TEXT NOT NULL DEFAULT 'RESTAURANT';
