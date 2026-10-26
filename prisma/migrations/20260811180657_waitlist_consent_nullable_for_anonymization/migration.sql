-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ALTER COLUMN "customerName" DROP NOT NULL,
ALTER COLUMN "customerPhone" DROP NOT NULL;
