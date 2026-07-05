-- Tier-1 appointment verticals: per-service duration + link a booking to its service.
ALTER TABLE "MenuItem" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "Reservation" ADD COLUMN "serviceId" TEXT;
CREATE INDEX "Reservation_serviceId_idx" ON "Reservation"("serviceId");
