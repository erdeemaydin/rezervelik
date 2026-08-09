import crypto from 'crypto';
import { PaymentProvider, CreateCheckoutInput, CreateCheckoutResult, CallbackResult, RefundInput, RefundResult } from './types';

// Development/testing provider. Lets the whole payment flow be exercised
// end-to-end without live PayTR credentials, and proves the abstraction: swapping
// the provider is an env change. The "iframe" points at our own /pay/mock page,
// which offers Simulate-success / Simulate-fail buttons that hit the mock
// callback endpoint (guarded to PAYMENT_PROVIDER=mock).
const MOCK_SECRET = process.env.MOCK_PAYMENT_SECRET || 'mock-payment-secret';

export class MockProvider implements PaymentProvider {
  readonly name = 'MOCK';

  private sign(merchantOid: string, status: string, totalAmount: string): string {
    return crypto.createHmac('sha256', MOCK_SECRET).update(merchantOid + status + totalAmount).digest('base64');
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const base = process.env.APP_PUBLIC_URL || 'http://localhost:3001';
    const url = `${base}/pay/mock?oid=${encodeURIComponent(input.merchantOid)}&amount=${input.amountMinor}`;
    return { iframeUrl: url, providerRef: `mock_${input.merchantOid}` };
  }

  verifyCallback(body: Record<string, any>): CallbackResult {
    const merchantOid = String(body.merchant_oid || '');
    const status = String(body.status || '');
    const totalAmount = String(body.total_amount || '');
    const expected = this.sign(merchantOid, status, totalAmount);
    const provided = String(body.hash || '');
    const valid = expected === provided;
    return {
      valid,
      merchantOid,
      status: status === 'success' ? 'success' : 'failed',
      amountMinor: parseInt(totalAmount || '0', 10),
    };
  }

  callbackAck(): string {
    return 'OK';
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { success: true, providerRef: `mock_refund_${input.merchantOid}` };
  }

  // Helper (mock-only) to build a correctly-signed callback body, used by the
  // dev "simulate" endpoint.
  buildCallbackBody(merchantOid: string, outcome: 'success' | 'failed', amountMinor: number) {
    const total = String(amountMinor);
    return {
      merchant_oid: merchantOid,
      status: outcome,
      total_amount: total,
      hash: this.sign(merchantOid, outcome, total),
    };
  }
}
