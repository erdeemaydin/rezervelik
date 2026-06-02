-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionPlan" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trialEndsAt" DATETIME,
    "currentPeriodEnd" DATETIME,
    "stripeCustomerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "isReservationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "logic" TEXT NOT NULL DEFAULT 'DYNAMIC_DURATION',
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "isPaidReservationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" REAL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "operatingHours" TEXT,
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

-- CreateTable
CREATE TABLE "WaitTimeConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "isWaitlistOpen" BOOLEAN NOT NULL DEFAULT false,
    "isWaitTimeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isWaitTimeCalculated" BOOLEAN NOT NULL DEFAULT false,
    "manualWaitTimeLower" INTEGER,
    "manualWaitTimeUpper" INTEGER,
    "peopleWaiting" INTEGER NOT NULL DEFAULT 0,
    "waitTimePerPersonLower" INTEGER NOT NULL DEFAULT 5,
    "waitTimePerPersonUpper" INTEGER NOT NULL DEFAULT 8,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WaitTimeConfig_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "quotedWaitTime" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notes" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" DATETIME,
    "seatedAt" DATETIME,
    CONSTRAINT "WaitlistEntry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "permissions" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TableType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    CONSTRAINT "TableType_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TableType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TableType_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tableTypeId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "positionX" REAL NOT NULL DEFAULT 0,
    "positionY" REAL NOT NULL DEFAULT 0,
    "shape" TEXT NOT NULL DEFAULT 'rectangle',
    "width" REAL NOT NULL DEFAULT 60,
    "height" REAL NOT NULL DEFAULT 60,
    CONSTRAINT "Table_tableTypeId_fkey" FOREIGN KEY ("tableTypeId") REFERENCES "TableType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Table_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FloorElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tableTypeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'box',
    "label" TEXT,
    "positionX" REAL NOT NULL DEFAULT 0,
    "positionY" REAL NOT NULL DEFAULT 0,
    "width" REAL NOT NULL DEFAULT 200,
    "height" REAL NOT NULL DEFAULT 200,
    "color" TEXT DEFAULT '#f8fafc',
    CONSTRAINT "FloorElement_tableTypeId_fkey" FOREIGN KEY ("tableTypeId") REFERENCES "TableType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FloorElement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DaySetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "eventTitle" TEXT,
    "isReservationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoConfirm" BOOLEAN NOT NULL DEFAULT false,
    "maxCapacityOverride" INTEGER,
    CONSTRAINT "DaySetting_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReservationCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ReservationCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "categoryId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "internalNote" TEXT,
    "isVIP" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReservationCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Menu_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    CONSTRAINT "MenuCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MenuCategory_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "dietaryTags" TEXT,
    "allergens" TEXT,
    "spiceLevel" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "requiredStaff" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shift_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeAvailability_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSettings_restaurantId_key" ON "RestaurantSettings"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitTimeConfig_restaurantId_key" ON "WaitTimeConfig"("restaurantId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_restaurantId_idx" ON "WaitlistEntry"("restaurantId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_restaurantId_idx" ON "User"("restaurantId");

-- CreateIndex
CREATE INDEX "TableType_restaurantId_idx" ON "TableType"("restaurantId");

-- CreateIndex
CREATE INDEX "TableType_parentId_idx" ON "TableType"("parentId");

-- CreateIndex
CREATE INDEX "Table_restaurantId_idx" ON "Table"("restaurantId");

-- CreateIndex
CREATE INDEX "Table_tableTypeId_idx" ON "Table"("tableTypeId");

-- CreateIndex
CREATE INDEX "FloorElement_restaurantId_idx" ON "FloorElement"("restaurantId");

-- CreateIndex
CREATE INDEX "FloorElement_tableTypeId_idx" ON "FloorElement"("tableTypeId");

-- CreateIndex
CREATE INDEX "DaySetting_restaurantId_idx" ON "DaySetting"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "DaySetting_restaurantId_date_key" ON "DaySetting"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "ReservationCategory_restaurantId_idx" ON "ReservationCategory"("restaurantId");

-- CreateIndex
CREATE INDEX "Reservation_restaurantId_idx" ON "Reservation"("restaurantId");

-- CreateIndex
CREATE INDEX "Reservation_tableId_idx" ON "Reservation"("tableId");

-- CreateIndex
CREATE INDEX "Reservation_categoryId_idx" ON "Reservation"("categoryId");

-- CreateIndex
CREATE INDEX "Reservation_startTime_idx" ON "Reservation"("startTime");

-- CreateIndex
CREATE INDEX "Menu_restaurantId_idx" ON "Menu"("restaurantId");

-- CreateIndex
CREATE INDEX "MenuCategory_menuId_idx" ON "MenuCategory"("menuId");

-- CreateIndex
CREATE INDEX "MenuCategory_parentId_idx" ON "MenuCategory"("parentId");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "Shift_restaurantId_idx" ON "Shift"("restaurantId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_shiftId_idx" ON "ShiftAssignment"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_userId_idx" ON "ShiftAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_shiftId_userId_date_key" ON "ShiftAssignment"("shiftId", "userId", "date");

-- CreateIndex
CREATE INDEX "EmployeeAvailability_userId_idx" ON "EmployeeAvailability"("userId");

-- CreateIndex
CREATE INDEX "EmployeeAvailability_shiftId_idx" ON "EmployeeAvailability"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAvailability_userId_shiftId_date_key" ON "EmployeeAvailability"("userId", "shiftId", "date");
