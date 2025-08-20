import { PrismaClient, Booking } from '@prisma/client';
// --- [1] Impor fungsi matching cerdas yang baru ---
import { initiateSmartMatching } from './matchingService';

const prisma = new PrismaClient();

interface BookingData {
  whatsapp: string;
  name: string;
  origin: string;
  destination: string;
  passengers: number;
}

/**
 * Menghitung harga total berdasarkan rute, zona tujuan, dan jumlah penumpang.
 */
function calculatePrice(origin: string, destination: string, passengers: number): number {
  // Harga dasar untuk rute utama Palembang-Indralaya
  const basePrice = 25000;

  let additionalCost = 0;
  const lowerCaseDestination = destination.toLowerCase();

  // Daftar zona di Palembang dengan biaya tambahan
  const surcharges: { [key: string]: number } = {
    'kenten': 8000,
    'sako': 8000,
    'plaju':8000,
  };

  for (const zone in surcharges) {
    if (lowerCaseDestination.includes(zone)) {
      additionalCost = surcharges[zone];
      console.log(`[PRICING] Zona terdeteksi: ${zone}, biaya tambahan: ${additionalCost}`);
      break;
    }
  }

  const pricePerPerson = basePrice + additionalCost;
  
  return pricePerPerson * passengers;
}

export async function createNewBooking(data: BookingData): Promise<Booking> {
  const { whatsapp, origin, destination, passengers } = data;

  const user = await prisma.user.upsert({
    where: { whatsapp: whatsapp },
    update: {},
    create: {
      whatsapp: whatsapp,
      name: `User ${whatsapp.slice(-4)}`,
    },
  });

  const tripPrice = calculatePrice(origin, destination, passengers);

  const newBooking = await prisma.booking.create({
    data: {
      origin: origin,
      destination: destination,
      passengers: passengers,
      price: tripPrice,
      status: 'PENDING',
      userId: user.id,
    },
  });

  // --- [2] Panggil fungsi matching cerdas yang baru ---
  await initiateSmartMatching(newBooking);

  return newBooking;
}
