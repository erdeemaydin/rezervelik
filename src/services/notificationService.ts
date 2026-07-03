// Outbound notifications (SMS / e-mail). SMS now goes through the messaging layer
// (Netgsm), which stays in placeholder/log mode until credentials are configured.
// E-mail is still a log stub. Every call site passes the fully-rendered message.
//
// See PAYMENTS.md §"Notifications & anti-phishing".
import { sendSms } from './messaging';

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

  await sendSms(p.customerPhone, smsText);
  if (p.customerEmail) {
    // TODO: integrate a real e-mail provider (SendGrid/Resend).
    console.log(`[Notification/Email] -> ${p.customerEmail}: Subject "Ödeme talebi - ${p.restaurantName}" | ${smsText}`);
  }
}

interface ShiftPlanPayload {
  staffPhone: string;
  staffName: string;
  restaurantName: string;
  periodLabel: string;   // e.g. "14–20 Temmuz"
  shiftLines: string[];  // each staff member's own shifts, pre-rendered
}

/**
 * WhatsApp the published shift plan to one staff member (#7.2). Only their own
 * shifts (respecting the admin's chosen visibility) are passed in by the caller.
 * Staff with no shifts should not be messaged — callers skip them (#7.5).
 */
export async function sendShiftPlan(p: ShiftPlanPayload): Promise<void> {
  const { sendWhatsApp } = await import('./messaging');
  const body =
    `${p.restaurantName} — ${p.periodLabel} vardiya planı\n` +
    `Merhaba ${p.staffName},\n` +
    (p.shiftLines.length ? p.shiftLines.map(l => `• ${l}`).join('\n') : 'Bu dönem için vardiyanız bulunmuyor.');
  await sendWhatsApp(p.staffPhone, body);
}
