import OpenAI from 'openai';
import { systemPrompt } from '../prompt/basic';

// Inisialisasi client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- [PERUBAHAN 1] Interface baru yang sesuai dengan output JSON dari prompt ---
// Ini mendefinisikan struktur lengkap dari respons AI.
export interface AIResponse {
  intent: "GREETING" | "AVAILABILITY_CHECK" | "BOOKING_REQUEST" | "OTHER";
  bookingStatus: "INCOMPLETE" | "COMPLETE" | "PENDING_DRIVER" | "CONFIRMED" | "CANCELLED" | null;
  bookingMode: "ON_THE_SPOT" | "PRE_BOOK" | null;
  possibleWaitlist: boolean;
  extractedInfo: {
    name: string | null;
    origin: string | null;
    destination: string | null;
    time: string | null;
    passengers: number | null;
  };
  availability: {
    within5km: number;
    outside5km: number;
    nearestOutsideDistanceKm: number | null;
  };
  driverProposal: {
    driverId: string | null;
    driverName: string | null;
    driverPhoneMasked: string | null;
    driverAccepted: boolean;
  };
  contactExchange: {
    userConfirmed: boolean;
    driverContactShared: boolean;
    userContactSharedToDriver: boolean;
  };
  replySuggestion: string;
}

/**
 * Menganalisis teks dari user menggunakan AI dan mengembalikan respons terstruktur.
 * @param text Pesan mentah dari user.
 * @returns Sebuah objek AIResponse atau null jika terjadi error.
 */
// --- [PERUBAHAN 2] Nama fungsi dan tipe data yang dikembalikan diubah ---
export async function analyzeMessageWithAI(text: string): Promise<AIResponse | null> {
  try {
    const response = await openai.chat.completions.create({
      // Anda bisa ganti ke 'gpt-4o' jika model 'gpt-5-nano' belum tersedia
      model: 'gpt-5-mini', 
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    });

    const result = response.choices[0]?.message?.content;
    if (result) {
      // --- [PERUBAHAN 3] Parsing JSON ke interface AIResponse yang baru ---
      try {
        return JSON.parse(result) as AIResponse;
      } catch (e) {
        console.error('Gagal parse JSON:', e, 'Output AI:', result);
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error('Error saat menghubungi OpenAI:', error);
    return null;
  }
}
