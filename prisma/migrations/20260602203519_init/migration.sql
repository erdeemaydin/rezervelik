-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "businessType" TEXT NOT NULL DEFAULT 'RESTAURANT',
    "subscriptionPlan" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "subscriptionEndsAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "sysAdminNotes" TEXT,
    "hasHostedFrontend" BOOLEAN NOT NULL DEFAULT false,
    "customDomain" TEXT,
    "customDomainVerifiedAt" TIMESTAMP(3),
    "hasReservationWidget" BOOLEAN NOT NULL DEFAULT false,
    "publicApiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrontendCustomization" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "layoutStyle" TEXT NOT NULL DEFAULT 'CLASSIC_LIST',
    "typography" TEXT NOT NULL DEFAULT 'SANS',
    "colorPalette" TEXT NOT NULL DEFAULT 'OBSIDIAN',
    "primaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "announcementText" TEXT,
    "showAboutUs" BOOLEAN NOT NULL DEFAULT false,
    "aboutUsText" TEXT,
    "showLegal" BOOLEAN NOT NULL DEFAULT false,
    "legalText" TEXT,
    "socialLinks" TEXT,
    "reservationInfoText" TEXT,
    "reservationWarningText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrontendCustomization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPriceUpdate" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "isIncrease" BOOLEAN NOT NULL DEFAULT true,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledPriceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSettings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "isReservationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "logic" TEXT NOT NULL DEFAULT 'DYNAMIC_DURATION',
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "isPaidReservationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" DOUBLE PRECISION,
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
    "hasEventPipeline" BOOLEAN NOT NULL DEFAULT false,
    "hasInstallmentPlans" BOOLEAN NOT NULL DEFAULT false,
    "hasGuestList" BOOLEAN NOT NULL DEFAULT false,
    "hasVendors" BOOLEAN NOT NULL DEFAULT false,
    "staffScheduleView" TEXT NOT NULL DEFAULT 'OWN_ONLY',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorRoles" TEXT NOT NULL DEFAULT '',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'tr',
    "showAuditLogToTenant" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "restaurantId" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "metadata" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitTimeConfig" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "isWaitlistOpen" BOOLEAN NOT NULL DEFAULT false,
    "isWaitTimeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isWaitTimeCalculated" BOOLEAN NOT NULL DEFAULT false,
    "manualWaitTimeLower" INTEGER,
    "manualWaitTimeUpper" INTEGER,
    "peopleWaiting" INTEGER NOT NULL DEFAULT 0,
    "waitTimePerPersonLower" INTEGER NOT NULL DEFAULT 5,
    "waitTimePerPersonUpper" INTEGER NOT NULL DEFAULT 8,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitTimeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "quotedWaitTime" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notes" TEXT,
    "targetDate" TEXT,
    "offerToken" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "offeredTime" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "permissions" TEXT,
    "phone" TEXT,
    "setupToken" TEXT,
    "setupTokenExpiresAt" TIMESTAMP(3),
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "otpRequired" BOOLEAN NOT NULL DEFAULT false,
    "otpSecret" TEXT,
    "otpConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shiftId" TEXT,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableType" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,

    CONSTRAINT "TableType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableTypeId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shape" TEXT NOT NULL DEFAULT 'rectangle',
    "width" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "color" TEXT DEFAULT '#ffffff',

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorElement" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableTypeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'box',
    "label" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "color" TEXT DEFAULT '#f8fafc',

    CONSTRAINT "FloorElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaySetting" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "eventTitle" TEXT,
    "isReservationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isFullyBooked" BOOLEAN NOT NULL DEFAULT false,
    "autoConfirm" BOOLEAN NOT NULL DEFAULT false,
    "maxCapacityOverride" INTEGER,

    CONSTRAINT "DaySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCategory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReservationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "internalNote" TEXT,
    "isVIP" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reservationId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'PAYTR',
    "merchantOid" TEXT NOT NULL,
    "providerRef" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "linkTokenHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "failReason" TEXT,
    "rawCallback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "footnotes" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "daysOfWeek" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isHighlight" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "dietaryTags" TEXT,
    "allergens" TEXT,
    "spiceLevel" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "ingredients" TEXT,
    "calories" INTEGER,
    "containsAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "containsPork" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemModifier" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "minChoices" INTEGER NOT NULL DEFAULT 0,
    "maxChoices" INTEGER,

    CONSTRAINT "MenuItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierOption" (
    "id" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAdjust" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemPairing" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "pairedItemId" TEXT NOT NULL,

    CONSTRAINT "MenuItemPairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftDayRequirement" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "requiredStaff" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ShiftDayRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL DEFAULT 'global_1',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "publicRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enforce2FAForAdmins" BOOLEAN NOT NULL DEFAULT true,
    "measurementSystem" TEXT NOT NULL DEFAULT 'METRIC',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "resourceId" TEXT,
    "packageId" TEXT,
    "coordinatorId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'WEDDING',
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientEmail" TEXT,
    "eventDate" TEXT NOT NULL,
    "slot" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "quotedTotal" INTEGER,
    "notes" TEXT,
    "contractUrl" TEXT,
    "contractSignedAt" TIMESTAMP(3),
    "proposalSentAt" TIMESTAMP(3),
    "publicToken" TEXT,
    "invitationMessage" TEXT,
    "venueName" TEXT,
    "venueAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstallment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "label" TEXT,
    "dueDate" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "resourceId" TEXT,
    "name" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "rsvp" TEXT NOT NULL DEFAULT 'PENDING',
    "dietary" TEXT,
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVendor" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "role" TEXT,
    "cost" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_customDomain_key" ON "Restaurant"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_publicApiKey_key" ON "Restaurant"("publicApiKey");

-- CreateIndex
CREATE UNIQUE INDEX "FrontendCustomization_restaurantId_key" ON "FrontendCustomization"("restaurantId");

-- CreateIndex
CREATE INDEX "ScheduledPriceUpdate_status_scheduledFor_idx" ON "ScheduledPriceUpdate"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledPriceUpdate_restaurantId_idx" ON "ScheduledPriceUpdate"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSettings_restaurantId_key" ON "RestaurantSettings"("restaurantId");

-- CreateIndex
CREATE INDEX "AuditLog_restaurantId_createdAt_idx" ON "AuditLog"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_category_idx" ON "AuditLog"("category");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitTimeConfig_restaurantId_key" ON "WaitTimeConfig"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_offerToken_key" ON "WaitlistEntry"("offerToken");

-- CreateIndex
CREATE INDEX "WaitlistEntry_restaurantId_idx" ON "WaitlistEntry"("restaurantId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_setupToken_key" ON "User"("setupToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");

-- CreateIndex
CREATE INDEX "User_restaurantId_idx" ON "User"("restaurantId");

-- CreateIndex
CREATE INDEX "TimeEntry_restaurantId_idx" ON "TimeEntry"("restaurantId");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_idx" ON "TimeEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_userId_date_shiftId_key" ON "TimeEntry"("userId", "date", "shiftId");

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
CREATE INDEX "Reservation_serviceId_idx" ON "Reservation"("serviceId");

-- CreateIndex
CREATE INDEX "Reservation_startTime_idx" ON "Reservation"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantOid_key" ON "Payment"("merchantOid");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_linkTokenHash_key" ON "Payment"("linkTokenHash");

-- CreateIndex
CREATE INDEX "Payment_restaurantId_idx" ON "Payment"("restaurantId");

-- CreateIndex
CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

-- CreateIndex
CREATE INDEX "Payment_code_idx" ON "Payment"("code");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Menu_restaurantId_idx" ON "Menu"("restaurantId");

-- CreateIndex
CREATE INDEX "MenuCategory_menuId_idx" ON "MenuCategory"("menuId");

-- CreateIndex
CREATE INDEX "MenuCategory_parentId_idx" ON "MenuCategory"("parentId");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");

-- CreateIndex
CREATE INDEX "MenuItemModifier_menuItemId_idx" ON "MenuItemModifier"("menuItemId");

-- CreateIndex
CREATE INDEX "ModifierOption_modifierId_idx" ON "ModifierOption"("modifierId");

-- CreateIndex
CREATE INDEX "MenuItemPairing_menuItemId_idx" ON "MenuItemPairing"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemPairing_pairedItemId_idx" ON "MenuItemPairing"("pairedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemPairing_menuItemId_pairedItemId_key" ON "MenuItemPairing"("menuItemId", "pairedItemId");

-- CreateIndex
CREATE INDEX "Shift_restaurantId_idx" ON "Shift"("restaurantId");

-- CreateIndex
CREATE INDEX "ShiftDayRequirement_shiftId_idx" ON "ShiftDayRequirement"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDayRequirement_shiftId_dayOfWeek_key" ON "ShiftDayRequirement"("shiftId", "dayOfWeek");

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

-- CreateIndex
CREATE UNIQUE INDEX "Event_publicToken_key" ON "Event"("publicToken");

-- CreateIndex
CREATE INDEX "Event_restaurantId_idx" ON "Event"("restaurantId");

-- CreateIndex
CREATE INDEX "Event_eventDate_idx" ON "Event"("eventDate");

-- CreateIndex
CREATE INDEX "Event_stage_idx" ON "Event"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_eventId_key" ON "PaymentPlan"("eventId");

-- CreateIndex
CREATE INDEX "PaymentPlan_restaurantId_idx" ON "PaymentPlan"("restaurantId");

-- CreateIndex
CREATE INDEX "PaymentInstallment_planId_idx" ON "PaymentInstallment"("planId");

-- CreateIndex
CREATE INDEX "PaymentInstallment_status_idx" ON "PaymentInstallment"("status");

-- CreateIndex
CREATE INDEX "Guest_restaurantId_idx" ON "Guest"("restaurantId");

-- CreateIndex
CREATE INDEX "Guest_eventId_idx" ON "Guest"("eventId");

-- CreateIndex
CREATE INDEX "Vendor_restaurantId_idx" ON "Vendor"("restaurantId");

-- CreateIndex
CREATE INDEX "EventVendor_restaurantId_idx" ON "EventVendor"("restaurantId");

-- CreateIndex
CREATE INDEX "EventVendor_eventId_idx" ON "EventVendor"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVendor_eventId_vendorId_key" ON "EventVendor"("eventId", "vendorId");

-- AddForeignKey
ALTER TABLE "FrontendCustomization" ADD CONSTRAINT "FrontendCustomization_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPriceUpdate" ADD CONSTRAINT "ScheduledPriceUpdate_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSettings" ADD CONSTRAINT "RestaurantSettings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitTimeConfig" ADD CONSTRAINT "WaitTimeConfig_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableType" ADD CONSTRAINT "TableType_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TableType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableType" ADD CONSTRAINT "TableType_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_tableTypeId_fkey" FOREIGN KEY ("tableTypeId") REFERENCES "TableType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_tableTypeId_fkey" FOREIGN KEY ("tableTypeId") REFERENCES "TableType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DaySetting" ADD CONSTRAINT "DaySetting_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCategory" ADD CONSTRAINT "ReservationCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReservationCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemModifier" ADD CONSTRAINT "MenuItemModifier_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "MenuItemModifier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPairing" ADD CONSTRAINT "MenuItemPairing_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPairing" ADD CONSTRAINT "MenuItemPairing_pairedItemId_fkey" FOREIGN KEY ("pairedItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftDayRequirement" ADD CONSTRAINT "ShiftDayRequirement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAvailability" ADD CONSTRAINT "EmployeeAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAvailability" ADD CONSTRAINT "EmployeeAvailability_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstallment" ADD CONSTRAINT "PaymentInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

