-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "confirmationCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_restaurantId_confirmationCode_key" ON "Reservation"("restaurantId", "confirmationCode");
