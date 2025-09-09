import OpenAI from 'openai';
import { systemPrompt } from '../prompt/basic';

// Inisialisasi client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIResponse {
  intent: "GREETING" | "AVAILABILITY_CHECK" | "BOOKING_REQUEST" | "OUTSIDE_HOURS" | "OTHER";
  bookingStatus: "INCOMPLETE" | "COMPLETE" | null;
  bookingMode: "ON_THE_SPOT" | "PRE_BOOK" | null;
  extractedInfo: {
    name: string | null;
    origin: string | null;
    destination: string | null;
    time: string | null;
    passengers: number | null;
  };
  replySuggestion: string;
}

export async function analyzeConversationWithAI(contextualHistory: string): Promise<AIResponse | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextualHistory }, // Kirim riwayat yang sudah diringkas
      ],
      response_format: { type: 'json_object' },
    });

    const result = response.choices[0]?.message?.content;
    if (result) {
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