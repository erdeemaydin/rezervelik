-- Per-tenant admin dashboard color theme (staff inherit their restaurant's theme).
ALTER TABLE "RestaurantSettings" ADD COLUMN "dashboardTheme" TEXT NOT NULL DEFAULT 'default';

-- Theme for the system-admin (root) surface.
ALTER TABLE "GlobalSettings" ADD COLUMN "dashboardTheme" TEXT NOT NULL DEFAULT 'default';
