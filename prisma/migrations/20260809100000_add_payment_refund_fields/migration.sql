-- Additive: support refunding a deposit (Payment.status can already be
-- 'REFUNDED' per the existing comment on that column; these columns record
-- when/why/what the gateway returned).
ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "refundReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "rawRefund" TEXT;
