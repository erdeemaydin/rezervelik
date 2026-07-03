// Outbound notifications (SMS / e-mail). Currently a logging stub — wiring a real
// provider (Netgsm / İleti Merkezi / Twilio for SMS, SendGrid/Resend for e-mail,
// WhatsApp Business API) means implementing the two functions below. Every call
// site already passes the fully-rendered message, link and code.
//
// See PAYMENTS.md §"Notifications & anti-phishing".

interface PaymentRequestPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  restaurantName: string;
  amountLabel: string;   // e.g. "₺250,00"
  paymentUrl: string;    // branded link on our domain: {APP_PUBLIC_URL}/pay/<token>
  code: string;          // short human code as an SMS-link-free fallback
  reservationLabel: string; // e.g. "Sat 12 Jul, 20:00 · 4 guests"
}

export async function sendPaymentRequest(p: PaymentRequestPayload): Promise<void> {
  const smsText =
    `${p.restaurantName}: ${p.reservationLabel} rezervasyonunuz için ${p.amountLabel} kapora gerekiyor. ` +
    `Güvenli ödeme: ${p.paymentUrl} — veya ${p.restaurantName} sitesinde ödeme kodu: ${p.code}. ` +
    `Kart bilgilerinizi asla telefonda/SMS ile paylaşmayın; ödeme yalnızca güvenli sayfada alınır.`;

  console.log(`[Notification/SMS] -> ${p.customerPhone}: ${smsText}`);
  if (p.customerEmail) {
    console.log(`[Notification/Email] -> ${p.customerEmail}: Subject "Ödeme talebi - ${p.restaurantName}" | ${smsText}`);
  }
  // TODO: integrate a real SMS/e-mail provider here.
}
