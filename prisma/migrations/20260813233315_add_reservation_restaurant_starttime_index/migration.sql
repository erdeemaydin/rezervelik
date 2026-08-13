-- CreateIndex
CREATE INDEX "Reservation_restaurantId_startTime_idx" ON "Reservation"("restaurantId", "startTime");
