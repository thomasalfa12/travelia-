import { PrismaClient, Booking, Trip, DriverProfile } from '@prisma/client';
import { initiateSmartMatching } from './matchingService';
import { sendFcmNotification } from './fcmService';

const prisma = new PrismaClient();

interface BookingData {
  whatsapp: string;
  name: string;
  origin: string;
  destination: string;
  passengers: number;
  time: string;
}

// --- FUNGSI HELPER ---

/**
 * [DIROMBAK TOTAL] Mengubah input waktu natural menjadi objek Date yang valid.
 * Sekarang bisa memahami "besok jam 8", "jam 8 pagi", "jam 9 malam", dll.
 */
function parseTime(timeString: string): Date | null {
  const lowerCaseTime = timeString.toLowerCase();
  const now = new Date();
  
  let targetDate = new Date(); // Mulai dengan hari ini
  let hour = -1;

  // Cek kata kunci "besok"
  if (lowerCaseTime.includes('besok')) {
    targetDate.setDate(now.getDate() + 1);
  }

  // Ekstrak jam dari string (misal: "jam 8", "21.00")
  const timeMatch = lowerCaseTime.match(/(\d+)/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
  } else {
    return null; // Tidak bisa menemukan angka jam
  }

  // Sesuaikan jam untuk format AM/PM
  if ((lowerCaseTime.includes('malam') || lowerCaseTime.includes('sore')) && hour < 12) {
    hour += 12;
  }
  // Cegah jam 12 malam menjadi jam 24
  if (hour === 24) hour = 0; 
  if (lowerCaseTime.includes('pagi') && hour === 12) { // Jam 12 pagi -> 00:00
    hour = 0;
  }

  targetDate.setHours(hour, 0, 0, 0);

  // Jika tidak ada kata "besok" dan waktu yang diminta sudah lewat,
  // asumsikan pengguna memesan untuk keesokan harinya.
  if (!lowerCaseTime.includes('besok') && targetDate < now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  return targetDate;
}

/**
 * Menghitung harga total berdasarkan rute, zona tujuan, dan jumlah penumpang.
 */
function calculatePrice(origin: string, destination: string, passengers: number): number {
  const basePrice = 25000;
  let additionalCost = 0;
  const lowerCaseDestination = destination.toLowerCase();

  const surcharges: { [key: string]: number } = {
    'kenten': 8000,
    'sako': 8000,
    'plaju': 8000,
  };

  for (const zone in surcharges) {
    if (lowerCaseDestination.includes(zone)) {
      additionalCost = surcharges[zone];
      break;
    }
  }
  return (basePrice + additionalCost) * passengers;
}

// --- FUNGSI UTAMA ---

export async function createOnTheSpotBooking(data: BookingData) {
  const { whatsapp, name, origin, destination, passengers } = data;

  const user = await prisma.user.upsert({
    where: { whatsapp: whatsapp },
    update: {},
    create: { whatsapp: whatsapp, name: name || `User ${whatsapp.slice(-4)}` },
  });

  const requestedTime = new Date();

  const existingTrip = await findCompatibleTripForWaitlist(destination, requestedTime, passengers);
  
  if (existingTrip) {
    // [ALUR WAITLIST DINAMIS]
    console.log(`[WAITLIST] Ditemukan Trip #${existingTrip.id}. Menambahkan penumpang...`);
    
    const newBooking = await prisma.booking.create({
      data: {
        origin,
        destination,
        passengers,
        price: calculatePrice(origin, destination, passengers),
        status: 'CONFIRMED',
        isPickedUp: false,
        scheduledDepartureTime: existingTrip.departureTime,
        userId: user.id,
        tripId: existingTrip.id,
      },
    });

    await prisma.trip.update({
      where: { id: existingTrip.id },
      data: { seatsTaken: { increment: passengers } },
    });

    if (existingTrip.driver.fcmToken) {
        await sendFcmNotification(existingTrip.driver.fcmToken, 
            'Penumpang Baru Ditambahkan', 
            `${name} telah ditambahkan ke perjalanan Anda`, 
            { type: 'PASSENGER_ADDED', bookingId: newBooking.id.toString(), passengerName: name, pickupLocation: origin }
        );
    }
    
  } else {
    // [ALUR NORMAL]
    console.log(`[MATCHING] Tidak ada Trip yang cocok. Mencari supir baru...`);
    const newBooking = await prisma.booking.create({
        data: {
            origin,
            destination,
            passengers,
            price: calculatePrice(origin, destination, passengers),
            status: 'PENDING',
            isPickedUp: false,
            scheduledDepartureTime: requestedTime,
            userId: user.id,
        },
    });
    await initiateSmartMatching(newBooking); 
  }
}

export async function createPreBooking(data: BookingData): Promise<Booking> {
  const { whatsapp, name, origin, destination, passengers, time } = data;
  
  const scheduledTime = parseTime(time);
  if(!scheduledTime){
    throw new Error("Format waktu pra-pesan tidak dikenali.");
  }

  const user = await prisma.user.upsert({
      where: { whatsapp: whatsapp }, 
      update: { name: name },
      create: { whatsapp: whatsapp, name: name },
  });

  const tripPrice = calculatePrice(origin, destination, passengers);

  const newBooking = await prisma.booking.create({
      data: {
        origin: origin,
        destination: destination, 
        passengers: passengers,
        price: tripPrice,
        status: 'SCHEDULED',
        scheduledDepartureTime: scheduledTime,
        userId: user.id,
      },
    });

  console.log(`[PRA-PESAN] Booking #${newBooking.id} berhasil dicatat untuk ${scheduledTime.toLocaleString()}`);
  return newBooking;
}

async function findCompatibleTripForWaitlist(destination: string, requestedTime: Date, passengers: number): Promise<(Trip & { driver: DriverProfile }) | null> {
    const startTime = new Date(requestedTime.getTime() - 30 * 60 * 1000);
    const endTime = new Date(requestedTime.getTime() + 30 * 60 * 1000);

    const compatibleTrips = await prisma.trip.findMany({
        where: {
            destination: destination,
            status: { in: ['CONFIRMED', 'ONGOING_PICKUP'] },
            departureTime: {
                gte: startTime,
                lte: endTime,
            },
        },
        include: {
            driver: true,
        }
    });

    const availableTrips = compatibleTrips.filter(
      trip => (trip.seatsTaken + passengers) <= trip.capacity
    );

    return availableTrips.length > 0 ? availableTrips[0] : null;
}
