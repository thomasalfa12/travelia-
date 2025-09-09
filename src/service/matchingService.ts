/**
 * src/service/matchingService.ts
 * Service yang bertanggung jawab untuk semua logika pencocokan cerdas.
 */
import { PrismaClient, Booking, DriverProfile, Trip } from '@prisma/client';
import { sendFcmNotification } from './fcmService';
// --- Impor instance `geoService` dan tipe datanya ---
import { geoService, DriverWithDistance } from './geoService';

const prisma = new PrismaClient();
const DRIVER_SEARCH_RADIUS_KM = 5;

/**
 * [FUNGSI UTAMA] Otak dari sistem pencocokan untuk BOOKING_REQUEST.
 * Alur: Coba ride-pooling dulu, jika gagal baru cari supir baru.
 */
export async function initiateSmartMatching(booking: Booking, excludedDriverIds: number[] = []) {
  const studentLocation = await geoService.getCoordinatesFromLocation(booking.origin);
  if (!studentLocation) {
    console.log(`[MATCH] Lokasi booking #${booking.id} tidak valid, pencocokan dihentikan.`);
    return;
  }

  // --- [LANGKAH 1] Coba cari trip yang sudah berjalan untuk digabungkan (Ride-Pooling) ---
  // const existingTrip = await findCompatibleExistingTrip(booking, studentLocation);
  // if (existingTrip) {
  //   console.log(`[MATCH] Ditemukan trip #${existingTrip.id} yang kompatibel. Mengirim tawaran tambahan...`);
  //   await sendRidePoolingOffer(existingTrip.driver, booking);
  //   return; // Selesai, tidak perlu cari supir baru
  // }

  // --- [LANGKAH 2 - FALLBACK] Jika tidak ada trip yang cocok, cari supir idle terdekat ---
  console.log(`[MATCH] Tidak ada trip yang cocok. Mencari supir idle terdekat...`);
  const nearestIdleDriver = await findNearestIdleDriver(studentLocation, excludedDriverIds);

  if (nearestIdleDriver) {
    console.log(`[MATCH] Supir idle terdekat ditemukan: ID ${nearestIdleDriver.id}. Mengirim penawaran...`);
    await sendNewTripOffer(nearestIdleDriver, booking);
  } else {
    console.log('[MATCH] Tidak ada supir idle yang tersedia.');
    // TODO: Kirim notifikasi ke mahasiswa via WhatsApp bahwa tidak ada supir.
  }
}

/**
 * [DIREFAKTOR] Mencari supir idle terdekat dengan logika pencarian dua-langkah yang cerdas.
 */
async function findNearestIdleDriver(studentLocation: { lat: number, lon: number }, excludedDriverIds: number[]): Promise<DriverWithDistance | null> {
  const idleDrivers = await prisma.driverProfile.findMany({
    where: {
      status: 'AKTIF',
      id: { notIn: excludedDriverIds },
      latitude: { not: null },
      longitude: { not: null },
      trips: { none: { status: { in: ['ONGOING_PICKUP', 'CONFIRMED'] } } }
    }
  });

  if (idleDrivers.length === 0) {
    console.log('[MATCH] Tidak ditemukan supir yang berstatus AKTIF sama sekali.');
    return null;
  }

  // Hitung jarak untuk semua supir yang aktif
  const driversWithDistance = idleDrivers.map(driver => ({
    ...driver,
    distance: geoService.getDistanceInKm(studentLocation.lat, studentLocation.lon, driver.latitude!, driver.longitude!),
  }));

  // --- LANGKAH 1: Cari supir di dalam radius 5 km ---
  const driversWithinRadius = driversWithDistance
    .filter(driver => driver.distance <= DRIVER_SEARCH_RADIUS_KM)
    .sort((a, b) => a.distance - b.distance);

  if (driversWithinRadius.length > 0) {
    console.log(`[MATCH] Ditemukan ${driversWithinRadius.length} supir dalam radius ${DRIVER_SEARCH_RADIUS_KM} km. Menawarkan ke yang terdekat.`);
    return driversWithinRadius[0]; // Kembalikan yang paling dekat
  }

  // --- LANGKAH 2 - FALLBACK: Jika tidak ada, cari supir terdekat dari semua yang aktif ---
  console.log(`[MATCH-FALLBACK] Tidak ada supir dalam radius ${DRIVER_SEARCH_RADIUS_KM} km. Mencari di semua supir aktif...`);
  const allSortedDrivers = driversWithDistance.sort((a, b) => a.distance - b.distance);

  if (allSortedDrivers.length > 0) {
    console.log(`[MATCH-FALLBACK] Ditemukan ${allSortedDrivers.length} supir aktif. Terdekat berjarak ${allSortedDrivers[0].distance.toFixed(1)} km.`);
    return allSortedDrivers[0]; // Kembalikan yang paling dekat dari semua supir
  }

  return null;
}

// --- Fungsi Notifikasi (Tidak berubah) ---

async function sendNewTripOffer(driver: DriverWithDistance, booking: Booking) {
    const driverUser = await prisma.user.findUnique({ where: { id: driver.userId } });
    if (!driverUser) return;
  
    const estimatedEta = `${Math.round(driver.distance * 2.5)} menit`; // Estimasi kasar
    const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(booking.price);
  
    if(driver.fcmToken) {
        await sendFcmNotification(
            driver.fcmToken,
            'Tawaran Penjemputan Prioritas!',
            `Jemput di ${booking.origin} (~${driver.distance.toFixed(1)} km). Tarif: ${formattedPrice}`,
            {
                type: 'NEW_TRIP_OFFER',
                bookingId: booking.id.toString(),
                route: `${booking.origin} -> ${booking.destination}`,
                fare: booking.price.toString(),
                distance: `${driver.distance.toFixed(1)} km`
            }
        );
    }
}

