-- AlterTable
ALTER TABLE "FrontendCustomization" ADD COLUMN     "privacyNoticeText" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentTimestamp" TIMESTAMP(3),
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "customerName" DROP NOT NULL,
ALTER COLUMN "customerPhone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Reservation_anonymizedAt_idx" ON "Reservation"("anonymizedAt");
