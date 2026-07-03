import crypto from 'crypto';
import prisma from '../config/prisma';
import { getPaymentProvider } from './payments';

export const PAYMENT_LINK_TTL_MS = 60 * 60 * 1000; // 1 hour

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity

function genCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function genMerchantOid(): string {
  // PayTR requires an alphanumeric order id, unique per attempt.
  return ('RSV' + Date.now().toString(36) + crypto.randomBytes(5).toString('hex')).replace(/[^A-Za-z0-9]/g, '');
}

export const hashLinkToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

// Normalise our stored currency to the provider's expected code.
export const toProviderCurrency = (c?: string | null) => (c === 'TRY' || c === 'TL' || !c ? 'TL' : c);

export interface CreatedPayment {
  paymentId: string;
  rawLinkToken: string;
  code: string;
  paymentUrl: string;
  amountMinor: number;
  currency: string;
  expiresAt: Date;
}

// Create a pending Payment row for a reservation's deposit and return the
// customer-facing access details. Does NOT contact the gateway — the provider
// checkout (iframe token) is created lazily when the payment page loads, so the
// token is always fresh. Returns null if the deposit amount is not positive.
export async function createPaymentForReservation(
  reservation: { id: string; restaurantId: string },
  settings: { depositAmount?: number | null; currency?: string | null }
): Promise<CreatedPayment | null> {
  const amountMinor = Math.round((settings.depositAmount || 0) * 100);
  if (amountMinor <= 0) return null;

  const rawLinkToken = crypto.randomBytes(32).toString('hex');
  const code = genCode();
  const currency = toProviderCurrency(settings.currency);
  const expiresAt = new Date(Date.now() + PAYMENT_LINK_TTL_MS);

  const payment = await prisma.payment.create({
    data: {
      restaurantId: reservation.restaurantId,
      reservationId: reservation.id,
      provider: getPaymentProvider().name,
      merchantOid: genMerchantOid(),
      amount: amountMinor,
      currency,
      status: 'PENDING',
      linkTokenHash: hashLinkToken(rawLinkToken),
      code,
      expiresAt,
    },
  });

  const base = process.env.APP_PUBLIC_URL || 'http://localhost:3001';
  return {
    paymentId: payment.id,
    rawLinkToken,
    code,
    paymentUrl: `${base}/pay/${rawLinkToken}`,
    amountMinor,
    currency,
    expiresAt,
  };
}

// Look up a live payment by either the raw link token or the short code.
export async function findPaymentByRef(ref: string) {
  const byToken = await prisma.payment.findUnique({ where: { linkTokenHash: hashLinkToken(ref) } });
  if (byToken) return byToken;
  // Fall back to the human code (case-insensitive), newest first.
  return prisma.payment.findFirst({
    where: { code: ref.toUpperCase() },
    orderBy: { createdAt: 'desc' },
  });
}

// Process a verified provider callback (source of truth). Idempotent: repeated
// notifications for an already-final payment are safely acknowledged.
export async function applyCallback(body: Record<string, any>): Promise<{ ack: boolean; ackText: string }> {
  const provider = getPaymentProvider();
  const result = provider.verifyCallback(body);
  const ackText = provider.callbackAck();

  if (!result.valid) {
    // Bad signature — do not acknowledge; let the caller return a non-OK status.
    return { ack: false, ackText };
  }

  const payment = await prisma.payment.findUnique({ where: { merchantOid: result.merchantOid } });
  // Unknown or already-final payments: acknowledge so the provider stops retrying.
  if (!payment) return { ack: true, ackText };
  if (payment.status === 'PAID' || payment.status === 'FAILED') return { ack: true, ackText };

  const rawCallback = JSON.stringify(body);

  // Guard against amount tampering.
  if (result.status === 'success' && result.amountMinor !== payment.amount) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failReason: 'amount_mismatch', rawCallback, providerRef: result.providerRef },
    });
    return { ack: true, ackText };
  }

  if (result.status === 'success') {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: new Date(), providerRef: result.providerRef, rawCallback },
      }),
      ...(payment.reservationId
        ? [prisma.reservation.update({
            where: { id: payment.reservationId },
            data: { isPaid: true, paymentId: payment.id, status: 'CONFIRMED' },
          })]
        : []),
    ]);
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failReason: result.failReason || 'payment_failed', rawCallback, providerRef: result.providerRef },
    });
    // Reservation stays AWAITING_PAYMENT so the guest can retry until the link expires.
  }

  return { ack: true, ackText };
}
