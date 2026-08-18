import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { getPaymentProvider, isMockProvider, MockProvider } from '../services/payments';
import { applyCallback, findPaymentByRef, refundPayment, RefundError } from '../services/paymentService';
import { logAudit } from '../services/auditService';

const clientIp = (req: Request) =>
  ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '').replace('::ffff:', '') || '85.34.78.112';

// GET /api/public/payment/session/:ref  (public — ref is the raw link token OR the short code)
// Returns the branded reservation + amount and, if still payable, a fresh hosted
// iframe URL for the gateway. This is what the customer payment page renders.
export const getPublicPaymentSession = async (req: Request, res: Response) => {
  try {
    const { ref } = req.params;
    const payment = await findPaymentByRef(ref);
    if (!payment) return errorResponse(res, 'errors.validation_error', 404, { message: 'Payment not found' });

    // Lazily expire.
    let status = payment.status;
    if (status === 'PENDING' && new Date() > payment.expiresAt) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } });
      status = 'EXPIRED';
    }

    const [restaurant, reservation] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: payment.restaurantId }, include: { customization: true } }),
      payment.reservationId ? prisma.reservation.findUnique({ where: { id: payment.reservationId } }) : Promise.resolve(null),
    ]);

    let iframeUrl: string | null = null;
    if (status === 'PENDING') {
      try {
        const base = process.env.APP_PUBLIC_URL || 'http://localhost:3001';
        const apiBase = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
        const checkout = await getPaymentProvider().createCheckout({
          merchantOid: payment.merchantOid,
          amountMinor: payment.amount,
          currency: payment.currency,
          email: reservation?.customerEmail || 'guest@example.com',
          userName: reservation?.customerName || 'Guest',
          userPhone: reservation?.customerPhone || '',
          userIp: clientIp(req),
          itemName: `${restaurant?.name || 'Restaurant'} - reservation deposit`,
          okUrl: `${base}/pay/${encodeURIComponent(ref)}?result=ok`,
          failUrl: `${base}/pay/${encodeURIComponent(ref)}?result=fail`,
          callbackUrl: `${apiBase}/api/public/payment/callback`,
          lang: 'tr',
        });
        iframeUrl = checkout.iframeUrl;
      } catch (e: any) {
        console.error('[Payment] createCheckout failed:', e?.message);
        return errorResponse(res, 'errors.internal_error', 502, { message: 'Payment gateway is unavailable' });
      }
    }

    return successResponse(res, {
      status,
      amount: payment.amount,
      currency: payment.currency,
      expiresAt: payment.expiresAt,
      iframeUrl,
      provider: payment.provider,
      merchantOid: payment.merchantOid,
      restaurant: restaurant
        ? { name: restaurant.name, slug: restaurant.slug, logoUrl: restaurant.logoUrl, primaryColor: restaurant.customization?.primaryColor || null }
        : null,
      reservation: reservation
        ? { customerName: reservation.customerName, guestCount: reservation.guestCount, startTime: reservation.startTime }
        : null,
    });
  } catch (error) {
    console.error('Get payment session error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /api/public/payment/callback  (public — server-to-server notification)
export const paymentCallback = async (req: Request, res: Response) => {
  try {
    const { ack, ackText } = await applyCallback(req.body);
    if (!ack) return res.status(400).send('BAD HASH');
    return res.send(ackText);
  } catch (error) {
    console.error('Payment callback error', error);
    return res.status(500).send('ERROR');
  }
};

// POST /api/public/payment/mock/complete  (dev only — simulates a gateway result)
export const mockComplete = async (req: Request, res: Response) => {
  if (!isMockProvider()) return errorResponse(res, 'errors.validation_error', 404, { message: 'Not available' });
  try {
    const { oid, outcome } = req.body as { oid: string; outcome: 'success' | 'failed' };
    const payment = await prisma.payment.findUnique({ where: { merchantOid: oid } });
    if (!payment) return errorResponse(res, 'errors.validation_error', 404, { message: 'Payment not found' });
    const mock = new MockProvider();
    const body = mock.buildCallbackBody(oid, outcome === 'failed' ? 'failed' : 'success', payment.amount);
    const { ack } = await applyCallback(body);
    return successResponse(res, { ack, status: outcome });
  } catch (error) {
    console.error('Mock complete error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// GET /api/payments  (admin — tenant-scoped list)
export const getPayments = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const payments = await prisma.payment.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { reservation: { select: { customerName: true, customerPhone: true, startTime: true, guestCount: true, status: true } } },
    });
    return successResponse(res, payments);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /api/payments/:id/refund  (admin — tenant-scoped)
export const refundPaymentHandler = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    const payment = await refundPayment(id, restaurantId, reason);

    logAudit({
      req,
      restaurantId,
      category: 'PAYMENT',
      action: 'PAYMENT_REFUNDED',
      targetType: 'Payment',
      targetId: payment.id,
      targetLabel: payment.merchantOid,
      metadata: { amount: payment.amount, currency: payment.currency, reason: reason || null },
    });

    return successResponse(res, payment);
  } catch (error: any) {
    if (error instanceof RefundError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'NOT_PAID' ? 400 : 502;
      return errorResponse(res, 'errors.validation_error', status, { message: error.message });
    }
    console.error('Refund payment error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
