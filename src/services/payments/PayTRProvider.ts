import crypto from 'crypto';
import { PaymentProvider, CreateCheckoutInput, CreateCheckoutResult, CallbackResult, RefundInput, RefundResult } from './types';

// PayTR adapter — hosted "iFrame API" flow.
//
// Flow: we call get-token with a signed request; PayTR returns a token; the
// customer's browser embeds https://www.paytr.com/odeme/guvenli/<token> in an
// iframe and enters the card THERE (PayTR is BDDK-licensed; card data never
// reaches us → PCI SAQ A). On completion PayTR POSTs a signed notification to
// our callbackUrl, which is the source of truth for marking a payment paid.
//
// Hash formulas are taken from PayTR's documentation / the provided samples and
// are intentionally isolated here so a spec change is a one-file edit.
const GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const IFRAME_BASE_URL = 'https://www.paytr.com/odeme/guvenli/';
const REFUND_URL = 'https://www.paytr.com/odeme/iade';

export class PayTRProvider implements PaymentProvider {
  readonly name = 'PAYTR';
  private merchantId: string;
  private merchantKey: string;
  private merchantSalt: string;
  private testMode: string;

  constructor() {
    this.merchantId = process.env.PAYTR_MERCHANT_ID || '';
    this.merchantKey = process.env.PAYTR_MERCHANT_KEY || '';
    this.merchantSalt = process.env.PAYTR_MERCHANT_SALT || '';
    this.testMode = process.env.PAYTR_TEST_MODE === '0' ? '0' : '1';
  }

  private hmacBase64(input: string): string {
    return crypto.createHmac('sha256', this.merchantKey).update(input).digest('base64');
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new Error('PayTR credentials are not configured (PAYTR_MERCHANT_ID/KEY/SALT)');
    }

    const paymentAmount = String(input.amountMinor); // PayTR expects the amount in kuruş (integer)
    const noInstallment = '0';
    const maxInstallment = '0';
    const currency = input.currency || 'TL';
    const userBasket = Buffer.from(
      JSON.stringify([[input.itemName, (input.amountMinor / 100).toFixed(2), 1]])
    ).toString('base64');

    // Token hash (iFrame API): order of fields is significant.
    const hashStr =
      this.merchantId + input.userIp + input.merchantOid + input.email +
      paymentAmount + userBasket + noInstallment + maxInstallment + currency + this.testMode;
    const paytrToken = this.hmacBase64(hashStr + this.merchantSalt);

    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: input.userIp,
      merchant_oid: input.merchantOid,
      email: input.email,
      payment_amount: paymentAmount,
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: '1',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: input.userName,
      user_address: input.itemName,
      user_phone: input.userPhone,
      merchant_ok_url: input.okUrl,
      merchant_fail_url: input.failUrl,
      timeout_limit: '30',
      currency,
      test_mode: this.testMode,
      lang: input.lang,
    });

    const resp = await fetch(GET_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data: any = await resp.json().catch(() => ({}));

    if (data?.status !== 'success' || !data?.token) {
      throw new Error(`PayTR get-token failed: ${data?.reason || 'unknown error'}`);
    }

    return {
      iframeUrl: `${IFRAME_BASE_URL}${data.token}`,
      providerRef: data.token,
      raw: data,
    };
  }

  verifyCallback(body: Record<string, any>): CallbackResult {
    const merchantOid = String(body.merchant_oid || '');
    const status = String(body.status || '');
    const totalAmount = String(body.total_amount || '');

    // Callback hash: merchant_oid + merchant_salt + status + total_amount
    const expected = this.hmacBase64(merchantOid + this.merchantSalt + status + totalAmount);
    const provided = String(body.hash || '');
    const valid =
      expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

    return {
      valid,
      merchantOid,
      status: status === 'success' ? 'success' : 'failed',
      amountMinor: parseInt(totalAmount || '0', 10),
      providerRef: body.payment_id ? String(body.payment_id) : undefined,
      failReason: body.failed_reason_msg ? String(body.failed_reason_msg) : undefined,
    };
  }

  callbackAck(): string {
    return 'OK';
  }

  // PayTR's refund ("İade API") endpoint — like get-token/callback above, the
  // exact hash formula is taken from PayTR's documentation but kept isolated
  // here (and un-live-tested, same as those two) since we don't have merchant
  // credentials to verify against; correct against the merchant panel before
  // going live with real refunds.
  async refund(input: RefundInput): Promise<RefundResult> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      return { success: false, error: 'PayTR credentials are not configured (PAYTR_MERCHANT_ID/KEY/SALT)' };
    }

    const returnAmount = String(input.amountMinor); // kuruş, same integer convention as get-token
    const hashStr = this.merchantId + input.merchantOid + returnAmount + this.merchantSalt;
    const paytrToken = this.hmacBase64(hashStr);

    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: input.merchantOid,
      return_amount: returnAmount,
      paytr_token: paytrToken,
    });

    try {
      const resp = await fetch(REFUND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (data?.status !== 'success') {
        return { success: false, error: data?.err_msg || data?.reason || 'PayTR refund failed', raw: data };
      }
      return { success: true, providerRef: data?.return_id ? String(data.return_id) : undefined, raw: data };
    } catch (e: any) {
      return { success: false, error: e?.message };
    }
  }
}
