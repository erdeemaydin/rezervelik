// Outbound SMS + WhatsApp messaging.
//
// Both providers are implemented against their documented HTTP APIs but stay in
// PLACEHOLDER mode until the matching env vars are set — so nothing is actually
// sent (calls are logged) while real provider accounts are not yet available.
//
//   SMS      -> Netgsm  (https://www.netgsm.com.tr/dokuman/)
//   WhatsApp -> Meta WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api)
//
// Env vars (see docs/journal/WORK_LOG.md):
//   NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_MSGHEADER
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN

const smsConfigured = () =>
  !!(process.env.NETGSM_USERCODE && process.env.NETGSM_PASSWORD && process.env.NETGSM_MSGHEADER);

const whatsappConfigured = () =>
  !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

export interface SendResult {
  ok: boolean;
  placeholder: boolean;
  error?: string;
}

/** Send an SMS via Netgsm. No-ops (logs) until Netgsm credentials are configured. */
export async function sendSms(toPhone: string, text: string): Promise<SendResult> {
  if (!smsConfigured()) {
    console.log(`[SMS/placeholder] -> ${toPhone}: ${text}`);
    return { ok: true, placeholder: true };
  }
  try {
    // Netgsm REST "get" endpoint. Number without '+', digits only.
    const params = new URLSearchParams({
      usercode: process.env.NETGSM_USERCODE!,
      password: process.env.NETGSM_PASSWORD!,
      gsmno: toPhone.replace(/\D/g, ''),
      message: text,
      msgheader: process.env.NETGSM_MSGHEADER!,
    });
    const resp = await fetch(`https://api.netgsm.com.tr/sms/send/get/?${params.toString()}`);
    const body = await resp.text();
    // Netgsm returns a status code prefix ("00"/"01"/"02" = accepted).
    const ok = /^0[0-2]/.test(body.trim());
    return { ok, placeholder: false, error: ok ? undefined : `netgsm:${body}` };
  } catch (e: any) {
    console.error('[SMS] send failed', e?.message);
    return { ok: false, placeholder: false, error: e?.message };
  }
}

/** Send a WhatsApp text via the Meta Cloud API. No-ops (logs) until configured. */
export async function sendWhatsApp(toPhone: string, text: string): Promise<SendResult> {
  if (!whatsappConfigured()) {
    console.log(`[WhatsApp/placeholder] -> ${toPhone}: ${text}`);
    return { ok: true, placeholder: true };
  }
  try {
    const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone.replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      }),
    });
    const ok = resp.ok;
    const body = ok ? '' : await resp.text();
    return { ok, placeholder: false, error: ok ? undefined : `whatsapp:${body}` };
  } catch (e: any) {
    console.error('[WhatsApp] send failed', e?.message);
    return { ok: false, placeholder: false, error: e?.message };
  }
}

export const messagingStatus = () => ({
  sms: smsConfigured(),
  whatsapp: whatsappConfigured(),
});
