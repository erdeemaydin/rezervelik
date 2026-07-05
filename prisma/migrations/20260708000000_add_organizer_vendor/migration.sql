-- Organizer / vendor coordination + contract tracking + e-davetiye (Phase 5).
-- Additive: new capability flag defaults off, new columns are nullable.

-- Feature flag
ALTER TABLE "RestaurantSettings" ADD COLUMN "hasVendors" BOOLEAN NOT NULL DEFAULT false;

-- Event: contract/proposal tracking + invitation microsite
ALTER TABLE "Event" ADD COLUMN "contractUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN "contractSignedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "proposalSentAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "Event" ADD COLUMN "invitationMessage" TEXT;
ALTER TABLE "Event" ADD COLUMN "venueName" TEXT;
ALTER TABLE "Event" ADD COLUMN "venueAddress" TEXT;
CREATE UNIQUE INDEX "Event_publicToken_key" ON "Event"("publicToken");

-- Guest: self-serve RSVP timestamp from the invitation microsite
ALTER TABLE "Guest" ADD COLUMN "respondedAt" TIMESTAMP(3);

-- Vendor directory (per-tenant)
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
CREATE INDEX "Vendor_restaurantId_idx" ON "Vendor"("restaurantId");

-- Vendor booked for a specific event
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
CREATE UNIQUE INDEX "EventVendor_eventId_vendorId_key" ON "EventVendor"("eventId", "vendorId");
CREATE INDEX "EventVendor_restaurantId_idx" ON "EventVendor"("restaurantId");
CREATE INDEX "EventVendor_eventId_idx" ON "EventVendor"("eventId");

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
