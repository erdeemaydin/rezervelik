-- AlterTable
ALTER TABLE "DaySetting" ADD COLUMN     "allowOverbookingOverride" BOOLEAN,
ADD COLUMN     "overbookingMaxExtraCoversOverride" INTEGER,
ADD COLUMN     "overbookingMaxExtraReservationsOverride" INTEGER;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "isOverbooked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RestaurantSettings" ADD COLUMN     "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overbookingMaxExtraCovers" INTEGER,
ADD COLUMN     "overbookingMaxExtraReservations" INTEGER;
