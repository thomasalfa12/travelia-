import { PrismaClient } from '@prisma/client';
import { createOnTheSpotBooking, createPreBooking } from '../service/bookingService';
import { analyzeConversationWithAI, AIResponse } from '../service/openai';
// --- [FIX] Impor instance `geoService` dari file yang benar ---
import { geoService } from '../service/geoService';

const prisma = new PrismaClient();

// Implementasi Memori Sederhana (untuk development)
const conversationHistories: { [key: string]: { history: string[], lastActivity: number } } = {};

// --- Handler untuk Aksi-Aksi Spesifik ---

async function handleBookingIntent(aiResponse: AIResponse, senderWA: string): Promise<string> {
  const { name, origin, destination, time, passengers } = aiResponse.extractedInfo;

  if (!name || !origin || !destination || !time || !passengers) {
    return aiResponse.replySuggestion;
  }

  const bookingData = { whatsapp: senderWA, name, origin, destination, time, passengers };

  try {
    if (aiResponse.bookingMode === 'PRE_BOOK') {
      await createPreBooking(bookingData);
    } else {
      await createOnTheSpotBooking(bookingData);
    }
    return aiResponse.replySuggestion;
  } catch (error: any) {
    console.error("Error saat membuat booking:", error);
    return `Waduh, terjadi kesalahan: ${error.message}`;
  }
}

async function handleAvailabilityCheck(aiResponse: AIResponse): Promise<string> {
  const origin = aiResponse.extractedInfo.origin;
  if (!origin) {
    return aiResponse.replySuggestion;
  }

  // --- [FIX] Gunakan `geoService` untuk mengonversi lokasi ---
  const userLocation = await geoService.getCoordinatesFromLocation(origin);
  if (!userLocation) {
    return `Maaf, lokasi "${origin}" tidak kami kenali. Mohon berikan nama tempat yang lebih spesifik.`;
  }

  // --- [FIX] Gunakan `geoService` untuk mencari supir ---
  const availability = await geoService.findAvailableDriversNearby(userLocation);
  
  if (availability.within5km > 0) {
    return `Ditemukan ${availability.within5km} travel aktif dalam radius 5 km dari lokasi Anda.`;
  } else if (availability.outside5km > 0) {
    return `Saat ini tidak ada travel dalam 5 km. Tersedia ${availability.outside5km} travel dalam radius lebih jauh (terdekat ~${availability.nearestOutsideDistanceKm?.toFixed(1)} km).`;
  } else {
    return "Mohon maaf, saat ini tidak ada travel yang aktif di sekitar Anda.";
  }
}

async function handleUpdateStatus(newStatus: 'AKTIF' | 'NONAKTIF', senderWA: string): Promise<string> {
  const driver = await prisma.user.findUnique({
    where: { whatsapp: senderWA, role: 'SUPIR' },
    include: { driverProfile: true },
  });

  if (!driver || !driver.driverProfile) {
    return 'Perintah ini hanya untuk supir terdaftar.';
  }

  try {
    await prisma.driverProfile.update({
      where: { id: driver.driverProfile.id },
      data: { status: newStatus },
    });
    return `Status Anda berhasil diubah menjadi *${newStatus}*.`;
  } catch (error) {
    return 'Gagal mengubah status.';
  }
}

/**
 * [FUNGSI UTAMA] Bertindak sebagai "Orchestrator" dan "Manajer Konteks".
 */
export async function handleIncomingMessage(incomingMsg: string, senderWA: string): Promise<string> {
  const lowerCaseMsg = incomingMsg.toLowerCase();

  // 1. Prioritaskan perintah supir (cepat, tanpa AI)
  const statusMatch = lowerCaseMsg.match(/^(aktif|nonaktif)$/);
  if (statusMatch) {
    const newStatus = statusMatch[1].toUpperCase() as 'AKTIF' | 'NONAKTIF';
    return await handleUpdateStatus(newStatus, senderWA);
  }

  // 2. Persiapkan "Paket Konteks" untuk AI (Memori Cerdas)
  const now = Date.now();
  if (!conversationHistories[senderWA] || (now - conversationHistories[senderWA].lastActivity > 10 * 60 * 1000)) {
    conversationHistories[senderWA] = { history: [], lastActivity: now };
  }
  conversationHistories[senderWA].history.push(`User: ${incomingMsg}`);
  conversationHistories[senderWA].lastActivity = now;
  
  const user = await prisma.user.findUnique({ where: { whatsapp: senderWA } });
  const userSummary = `(Info Pengguna: Nama=${user?.name || 'Belum Diketahui'})`;

  const currentTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  const timeContext = `(Waktu saat ini: ${currentTime} WIB)`;

  const recentHistory = conversationHistories[senderWA].history.slice(-15).join('\n');
  const contextualHistory = `${userSummary}\n${timeContext}\n\n${recentHistory}`;

  // 3. Panggil AI dengan paket konteks yang sudah siap
  const aiResponse = await analyzeConversationWithAI(contextualHistory);

  if (!aiResponse) {
    conversationHistories[senderWA].history.pop();
    return 'Waduh, lagi ada masalah sama AI-nya. Coba bentar lagi ya.';
  }

  conversationHistories[senderWA].history.push(`AI: ${aiResponse.replySuggestion}`);

  // 4. Logika Orkestrasi Berdasarkan Niat dari AI
  switch (aiResponse.intent) {
    case 'BOOKING_REQUEST':
      if (aiResponse.bookingStatus === 'COMPLETE') {
        return await handleBookingIntent(aiResponse, senderWA);
      }
      return aiResponse.replySuggestion;

    case 'AVAILABILITY_CHECK':
      return await handleAvailabilityCheck(aiResponse);
    
    case 'OUTSIDE_HOURS':
      if (aiResponse.extractedInfo.origin && aiResponse.extractedInfo.destination) {
          await handleBookingIntent(aiResponse, senderWA);
      }
      return aiResponse.replySuggestion;

    case 'GREETING':
    case 'OTHER':
    default:
      return aiResponse.replySuggestion;
  }
}

