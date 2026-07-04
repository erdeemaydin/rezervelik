-- Per-tenant default dashboard UI language, set by the root/system admin.
ALTER TABLE "RestaurantSettings" ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'tr';
