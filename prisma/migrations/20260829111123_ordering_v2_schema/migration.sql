-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'NOT_PICKED_UP';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "noShowCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderSettings" ADD COLUMN     "autoConfirmOrders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDeliveryMeters" INTEGER,
ADD COLUMN     "noShowWarnThreshold" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "addressText" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CustomerBan" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "bannedByUserId" TEXT,
    "liftedAt" TIMESTAMP(3),
    "liftedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMenuCategory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderMenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMenuItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "orderCategoryId" TEXT,
    "isListed" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "pausedUntil" TIMESTAMP(3),
    "pausedIndefinitely" BOOLEAN NOT NULL DEFAULT false,
    "priceOverride" DOUBLE PRECISION,
    "nameOverride" TEXT,
    "descriptionOverride" TEXT,
    "imageUrlOverride" TEXT,
    "prepTimeMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBan_restaurantId_phone_idx" ON "CustomerBan"("restaurantId", "phone");

-- CreateIndex
CREATE INDEX "OrderMenuCategory_restaurantId_idx" ON "OrderMenuCategory"("restaurantId");

-- CreateIndex
CREATE INDEX "OrderMenuItem_restaurantId_idx" ON "OrderMenuItem"("restaurantId");

-- CreateIndex
CREATE INDEX "OrderMenuItem_menuItemId_idx" ON "OrderMenuItem"("menuItemId");

-- CreateIndex
CREATE INDEX "OrderMenuItem_orderCategoryId_idx" ON "OrderMenuItem"("orderCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMenuItem_restaurantId_menuItemId_key" ON "OrderMenuItem"("restaurantId", "menuItemId");

-- AddForeignKey
ALTER TABLE "CustomerBan" ADD CONSTRAINT "CustomerBan_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMenuCategory" ADD CONSTRAINT "OrderMenuCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMenuItem" ADD CONSTRAINT "OrderMenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMenuItem" ADD CONSTRAINT "OrderMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMenuItem" ADD CONSTRAINT "OrderMenuItem_orderCategoryId_fkey" FOREIGN KEY ("orderCategoryId") REFERENCES "OrderMenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data backfill: seed the curated online catalog (OrderMenuItem) from the
-- existing MenuItem.isOrderableOnline flag so tenants that already had online
-- ordering keep exactly the same sellable items after the switch to the new
-- catalog model. restaurantId is resolved through MenuItem -> MenuCategory ->
-- Menu. Idempotent: re-running inserts nothing new.
INSERT INTO "OrderMenuItem" (
    "id",
    "restaurantId",
    "menuItemId",
    "isListed",
    "isAvailable",
    "prepTimeMinutes",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    m."restaurantId",
    mi."id",
    true,
    mi."isAvailable",
    mi."prepTimeMinutes",
    mi."order",
    now(),
    now()
FROM "MenuItem" mi
JOIN "MenuCategory" mc ON mc."id" = mi."categoryId"
JOIN "Menu" m ON m."id" = mc."menuId"
WHERE mi."isOrderableOnline" = true
ON CONFLICT ("restaurantId", "menuItemId") DO NOTHING;
