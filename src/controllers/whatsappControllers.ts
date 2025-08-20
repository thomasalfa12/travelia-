import { PrismaClient } from '@prisma/client';
import { createNewBooking } from '../service/bookingService';
import { analyzeMessageWithAI, AIResponse } from '../service/openai';
import { findAvailableDriversNearby, getCoordinatesFromLocationName } from '../service/matchingService';
import { sendMessage } from '../service/whatsappService';

const prisma = new PrismaClient();

// Implementasi Memori Sederhana (untuk development)
const conversationHistories: { [key: string]: string[] } = {};

// --- Handler untuk Pesanan Baru (Mahasiswa) ---
async function handleNewBookingRequest(aiResponse: AIResponse, senderWA: string): Promise<string> {
  const { name, origin, destination, time, passengers } = aiResponse.extractedInfo;

  if (name && origin && destination && time && passengers) {
    try {
      await createNewBooking({
        whatsapp: senderWA,
        name: name,
        origin: origin,
        destination: destination,
        passengers: passengers,
      });
      // Gunakan balasan dari AI yang sudah dikontekstualisasikan
      return aiResponse.replySuggestion;
    } catch (error) {
      console.error(error);
      return 'Waduh, ada kesalahan di sistem kami pas nyatet pesanan. Coba lagi yo.';
    }
  }
  // Ini adalah fallback jika karena suatu alasan statusnya COMPLETE tapi datanya tidak lengkap.
  return 'Terjadi kesalahan internal: Data booking tidak lengkap.';
}

// --- Handler untuk Pengecekan Ketersediaan ---
async function handleAvailabilityCheck(aiResponse: AIResponse, senderWA: string): Promise<string> {
  const origin = aiResponse.extractedInfo.origin;
  if (!origin) {
    return "Untuk mengecek supir terdekat, mohon infokan lokasi penjemputan Anda saat ini.";
  }

  const userLocation = await getCoordinatesFromLocationName(origin);
  if (!userLocation) {
    return `Maaf, lokasi "${origin}" tidak kami kenali. Mohon berikan nama tempat yang lebih spesifik.`;
  }

  const availability = await findAvailableDriversNearby(userLocation);
  if (availability.within5km > 0) {
    return `Ditemukan ${availability.within5km} travel aktif dalam radius 5 km dari lokasi Anda.`;
  } else if (availability.outside5km > 0) {
    return `Saat ini tidak ada travel dalam 5 km. Tersedia ${availability.outside5km} travel dalam radius lebih jauh (terdekat ~${availability.nearestOutsideDistanceKm} km).`;
  } else {
    return "Mohon maaf, saat ini tidak ada travel yang aktif di sekitar Anda.";
  }
}

// --- Handler untuk Perintah dari Supir: Mengambil Booking ---
async function handleAcceptBooking(bookingId: number, senderWA: string): Promise<string> {
    const driver = await prisma.user.findUnique({
      where: { whatsapp: senderWA, role: 'SUPIR' },
      include: { driverProfile: true },
    });
  
    if (!driver || !driver.driverProfile) {
      return 'Perintah ini hanya untuk supir terdaftar.';
    }
  
    try {
      const confirmedBooking = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: { user: true },
        });
  
        if (!booking || booking.status !== 'PENDING') {
          throw new Error('Tawaran sudah diambil atau tidak valid.');
        }
  
        const newTrip = await tx.trip.create({
          data: {
            driverId: driver.driverProfile!.id,
            status: 'ONGOING_PICKUP',
            destination: booking.destination,
            departureTime: new Date(),
            capacity: 7,
          },
        });
  
        return await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CONFIRMED', tripId: newTrip.id },
          include: { user: true },
        });
      });
      
      const studentWhatsapp = `whatsapp:${confirmedBooking.user.whatsapp}`;
      const studentMessage = `✅ Supir ditemukan! Pesanan Anda #${confirmedBooking.id} akan dijemput oleh ${driver.name} (${driver.driverProfile.plateNumber}).`;
      await sendMessage(studentWhatsapp, studentMessage);
  
      return `✅ Anda berhasil mengambil booking #${confirmedBooking.id} untuk dijemput.`;
    } catch (error: any) {
      return `Gagal mengambil booking: ${error.message}`;
    }
}

// --- Handler untuk mengubah status supir ---
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
 * [FUNGSI UTAMA] yang telah diperbarui untuk menjadi Orchestrator.
 */
export async function handleIncomingMessage(incomingMsg: string, senderWA:string): Promise<string> {
  const lowerCaseMsg = incomingMsg.toLowerCase();

  // Prioritaskan perintah supir (tidak perlu AI)
  const ambilMatch = lowerCaseMsg.match(/^ambil\s+(\d+)/);
  if (ambilMatch) {
    const bookingId = parseInt(ambilMatch[1]);
    return await handleAcceptBooking(bookingId, senderWA);
  }

  const statusMatch = lowerCaseMsg.match(/^(aktif|nonaktif)$/);
  if (statusMatch) {
    const newStatus = statusMatch[1].toUpperCase() as 'AKTIF' | 'NONAKTIF';
    return await handleUpdateStatus(newStatus, senderWA);
  }

  // Manajemen Memori
  if (!conversationHistories[senderWA]) {
    conversationHistories[senderWA] = [];
  }
  conversationHistories[senderWA].push(`User: ${incomingMsg}`);
  const fullConversation = conversationHistories[senderWA].join('\n');

  // Panggil AI dengan seluruh riwayat percakapan
  const aiResponse = await analyzeMessageWithAI(fullConversation);

  if (!aiResponse) {
    conversationHistories[senderWA].pop(); 
    return 'Waduh, lagi ado masalah samo AI nyo. Coba bentar lagi yo.';
  }

  // Simpan balasan AI ke riwayat
  conversationHistories[senderWA].push(`AI: ${aiResponse.replySuggestion}`);

  // Logika Orkestrasi berdasarkan niat dari AI
  switch (aiResponse.intent) {
    case 'BOOKING_REQUEST':
      // Hanya buat booking jika AI menyatakan formulir sudah siap diproses
      if (aiResponse.bookingStatus === 'COMPLETE' || aiResponse.bookingStatus === 'PENDING_DRIVER') {
        return await handleNewBookingRequest(aiResponse, senderWA);
      }
      return aiResponse.replySuggestion;

    case 'AVAILABILITY_CHECK':
      return await handleAvailabilityCheck(aiResponse, senderWA);
    
    case 'GREETING':
    case 'OTHER':
    default:
      return aiResponse.replySuggestion;
  }
}
