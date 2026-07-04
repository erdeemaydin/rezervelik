-- Stores explicit per-item target prices for scheduled bulk price updates
-- (updateType = 'EXPLICIT_SET') created from the bulk price editor.
ALTER TABLE "ScheduledPriceUpdate" ADD COLUMN "payload" TEXT;
