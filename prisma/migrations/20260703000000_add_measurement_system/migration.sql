-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GlobalSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global_1',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "publicRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enforce2FAForAdmins" BOOLEAN NOT NULL DEFAULT true,
    "measurementSystem" TEXT NOT NULL DEFAULT 'METRIC',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GlobalSettings" ("enforce2FAForAdmins", "id", "maintenanceMode", "publicRegistrationEnabled", "updatedAt") SELECT "enforce2FAForAdmins", "id", "maintenanceMode", "publicRegistrationEnabled", "updatedAt" FROM "GlobalSettings";
DROP TABLE "GlobalSettings";
ALTER TABLE "new_GlobalSettings" RENAME TO "GlobalSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

