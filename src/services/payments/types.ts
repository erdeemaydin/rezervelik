// Provider-agnostic payment abstraction.
//
// Everything the rest of the app uses goes through the `PaymentProvider`
// interface, so switching gateways (PayTR → iyzico/Stripe/…) means writing one
// new adapter and changing an env var — no controller/route/DB changes. See
// docs/architecture/PAYMENTS.md §"Swapping providers".

export interface CreateCheckoutInput {
  merchantOid: string;      // our unique order id (alphanumeric); echoed back on callback
  amountMinor: number;      // amount in minor units (kuruş/cents)
  currency: string;         // 'TL', 'USD', 'EUR', …
  email: string;
  userName: string;
  userPhone: string;
  userIp: string;
  itemName: string;         // human description shown in the gateway basket
  okUrl: string;            // provider redirects here on success (informational)
  failUrl: string;          // provider redirects here on failure (informational)
  callbackUrl: string;      // server-to-server notification URL (source of truth)
  lang: 'tr' | 'en';
}

export interface CreateCheckoutResult {
  // URL to embed in an iframe (hosted flow) — card entry happens here, never on our page.
  iframeUrl: string;
  providerRef?: string;     // any provider-side token/ref, for debugging
  raw?: unknown;            // raw provider response, stored for audit
}

export interface CallbackResult {
  valid: boolean;           // did the signature/hash verify?
  merchantOid: string;      // maps back to our Payment row
  status: 'success' | 'failed';
  amountMinor: number;      // amount the provider actually reports (validate against ours)
  providerRef?: string;
  failReason?: string;
}

export interface RefundInput {
  merchantOid: string;      // the original payment's order id
  amountMinor: number;      // amount to refund, in minor units (full or partial)
  currency: string;
}

export interface RefundResult {
  success: boolean;
  providerRef?: string;     // provider-side refund transaction id, if any
  raw?: unknown;             // raw provider response, stored for audit
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;    // e.g. 'PAYTR', 'MOCK'
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyCallback(body: Record<string, any>): CallbackResult;
  // What to write back in the HTTP response body so the provider stops retrying
  // the notification (PayTR expects the literal string "OK").
  callbackAck(): string;
  refund(input: RefundInput): Promise<RefundResult>;
}
