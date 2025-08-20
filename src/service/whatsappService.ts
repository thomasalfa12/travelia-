import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

/**
 * Mengirim pesan WhatsApp ke nomor tujuan
 * @param to Nomor tujuan dalam format 'whatsapp:+628xxxx'
 * @param body Isi pesan
 */
export async function sendMessage(to: string, body: string) {
  if (!accountSid || !authToken || !twilioNumber) {
    console.error("Kredensial Twilio tidak diatur di .env");
    return;
  }

  try {
    await client.messages.create({
      from: twilioNumber,
      to: to,
      body: body,
    });
    console.log(`Pesan berhasil dikirim ke ${to}`);
  } catch (error) {
    console.error(`Gagal mengirim pesan ke ${to}:`, error);
  }
}