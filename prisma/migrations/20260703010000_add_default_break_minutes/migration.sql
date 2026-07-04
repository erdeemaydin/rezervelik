-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RestaurantSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "isReservationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "logic" TEXT NOT NULL DEFAULT 'DYNAMIC_DURATION',
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isPaidReservationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "maxPartySize" INTEGER NOT NULL DEFAULT 8,
    "operatingHours" TEXT,
    "openingHour" INTEGER NOT NULL DEFAULT 10,
    "closingHour" INTEGER NOT NULL DEFAULT 23,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "schedulingSystem" TEXT NOT NULL DEFAULT 'MONTHLY',
    "isVipEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isInternalNotesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isCategoriesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hasWaitTimeFeature" BOOLEAN NOT NULL DEFAULT true,
    "hasShiftFeature" BOOLEAN NOT NULL DEFAULT true,
    "hasMenuFeature" BOOLEAN NOT NULL DEFAULT true,
    "hasPaymentFeature" BOOLEAN NOT NULL DEFAULT true,
    "staffScheduleView" TEXT NOT NULL DEFAULT 'OWN_ONLY',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RestaurantSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RestaurantSettings" ("closingHour", "currency", "defaultDurationMinutes", "depositAmount", "hasMenuFeature", "hasPaymentFeature", "hasShiftFeature", "hasWaitTimeFeature", "id", "isCategoriesEnabled", "isInternalNotesEnabled", "isPaidReservationEnabled", "isReservationEnabled", "isVipEnabled", "logic", "maxPartySize", "openingHour", "operatingHours", "restaurantId", "schedulingSystem", "staffScheduleView", "timezone", "updatedAt") SELECT "closingHour", "currency", "defaultDurationMinutes", "depositAmount", "hasMenuFeature", "hasPaymentFeature", "hasShiftFeature", "hasWaitTimeFeature", "id", "isCategoriesEnabled", "isInternalNotesEnabled", "isPaidReservationEnabled", "isReservationEnabled", "isVipEnabled", "logic", "maxPartySize", "openingHour", "operatingHours", "restaurantId", "schedulingSystem", "staffScheduleView", "timezone", "updatedAt" FROM "RestaurantSettings";
DROP TABLE "RestaurantSettings";
ALTER TABLE "new_RestaurantSettings" RENAME TO "RestaurantSettings";
CREATE UNIQUE INDEX "RestaurantSettings_restaurantId_key" ON "RestaurantSettings"("restaurantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

