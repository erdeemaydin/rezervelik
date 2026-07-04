-- Per-restaurant two-factor auth: `twoFactorEnabled` is the root-admin capability
-- flag; `twoFactorRoles` is the comma-separated set of roles the tenant admin
-- requires 2FA for (empty by default, so staff are excluded).
ALTER TABLE "RestaurantSettings" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN "twoFactorRoles" TEXT NOT NULL DEFAULT '';
