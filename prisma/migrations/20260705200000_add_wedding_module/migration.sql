-- Wedding/organization vertical (Phase 4): Event pipeline, installment payment
-- plans, guest list/RSVP/seating. Additive; new capability flags default off.

ALTER TABLE "RestaurantSettings" ADD COLUMN "hasEventPipeline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN "hasInstallmentPlans" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantSettings" ADD COLUMN "hasGuestList" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Event" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Event_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Event_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Event_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MenuItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Event_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Event_restaurantId_idx" ON "Event"("restaurantId");
CREATE INDEX "Event_eventDate_idx" ON "Event"("eventDate");
CREATE INDEX "Event_stage_idx" ON "Event"("stage");

CREATE TABLE "PaymentPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PaymentPlan_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaymentPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentPlan_eventId_key" ON "PaymentPlan"("eventId");
CREATE INDEX "PaymentPlan_restaurantId_idx" ON "PaymentPlan"("restaurantId");

CREATE TABLE "PaymentInstallment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "label" TEXT,
  "dueDate" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidAt" DATETIME,
  "paymentId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PaymentInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PaymentPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PaymentInstallment_planId_idx" ON "PaymentInstallment"("planId");
CREATE INDEX "PaymentInstallment_status_idx" ON "PaymentInstallment"("status");

CREATE TABLE "Guest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "resourceId" TEXT,
  "name" TEXT NOT NULL,
  "partySize" INTEGER NOT NULL DEFAULT 1,
  "rsvp" TEXT NOT NULL DEFAULT 'PENDING',
  "dietary" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Guest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Guest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Guest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Guest_restaurantId_idx" ON "Guest"("restaurantId");
CREATE INDEX "Guest_eventId_idx" ON "Guest"("eventId");
