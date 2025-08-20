/**
 * src/service/matchingService.ts
 * Versi canggih dengan logika Ride-Pooling Dinamis dan Pengecekan Ketersediaan.
 */
import { PrismaClient, Booking, DriverProfile, Trip } from '@prisma/client';
import { sendMessage } from './whatsappService';

const prisma = new PrismaClient();
const DRIVER_SEARCH_RADIUS_KM = 5;
const DRIVER_SEARCH_RADIUS_EXTENDED_KM = 20;

type DriverWithDistance = DriverProfile & { distance: number };

/**
 * Mensimulasikan Google Geocoding API.
 * Mengubah nama lokasi menjadi koordinat GPS.
 */
export async function getCoordinatesFromLocationName(locationName: string): Promise<{ lat: number; lon: number } | null> {
  console.log(`[GEOCODING] Mengubah "${locationName}" menjadi koordinat...`);
  const lowerCaseLocation = locationName.toLowerCase();

  const locationMap: { [key: string]: { lat: number; lon: number } } = {
    'kambang iwak': { lat: -2.9812, lon: 104.7524 },
    'unsri bukit': { lat: -2.9909, lon: 104.7393 },
    'palembang (unsri bukit besar)': { lat: -2.9909, lon: 104.7393 },
    'demang': { lat: -2.9678, lon: 104.7411 },
    'plaju': { lat: -3.0084, lon: 104.7930 },
  };

  for (const key in locationMap) {
    if (lowerCaseLocation.includes(key)) {
      console.log(`[GEOCODING] Lokasi ditemukan: ${key}`);
      return locationMap[key];
    }
  }

  console.log(`[GEOCODING] Lokasi "${locationName}" tidak ditemukan.`);
  return null;
}

/**
 * Menghitung jarak antara dua titik koordinat GPS (rumus Haversine).
 */
function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius bumi dalam km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * [AKTIF] Mencari supir yang tersedia di sekitar lokasi tertentu untuk AVAILABILITY_CHECK.
 * @param userLocation Koordinat GPS pengguna.
 * @returns Objek yang berisi jumlah supir di dalam dan di luar radius 5 km.
 */
export async function findAvailableDriversNearby(userLocation: { lat: number; lon: number }) {
  const activeDrivers = await prisma.driverProfile.findMany({
    where: {
      status: 'AKTIF',
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  const driversWithDistance: DriverWithDistance[] = activeDrivers.map(driver => ({
    ...driver,
    distance: getDistanceInKm(userLocation.lat, userLocation.lon, driver.latitude!, driver.longitude!),
  }));

  const within5km = driversWithDistance.filter(d => d.distance <= DRIVER_SEARCH_RADIUS_KM).length;

  let outside5km = 0;
  let nearestOutsideDistanceKm: number | null = null;

  if (within5km === 0) {
    const outsideDrivers = driversWithDistance
      .filter(d => d.distance > DRIVER_SEARCH_RADIUS_KM && d.distance <= DRIVER_SEARCH_RADIUS_EXTENDED_KM)
      .sort((a, b) => a.distance - b.distance);
    
    outside5km = outsideDrivers.length;
    if (outsideDrivers.length > 0) {
      nearestOutsideDistanceKm = Math.round(outsideDrivers[0].distance);
    }
  }

  return { within5km, outside5km, nearestOutsideDistanceKm };
}

/**
 * [FUNGSI UTAMA] Otak dari sistem pencocokan untuk BOOKING_REQUEST.
 * @param booking Objek booking yang baru dibuat.
 */
export async function initiateSmartMatching(booking: Booking) {
  const studentLocation = await getCoordinatesFromLocationName(booking.origin);
  if (!studentLocation) {
    console.log(`Lokasi booking #${booking.id} tidak valid.`);
    return;
  }

  const existingTrip = await findCompatibleExistingTrip(booking, studentLocation);
  if (existingTrip) {
    console.log(`[MATCHING] Ditemukan trip #${existingTrip.id} yang kompatibel. Mengirim tawaran tambahan...`);
    await sendRidePoolingOffer(existingTrip.driver, booking);
    return;
  }

  const nearestIdleDriver = await findNearestIdleDriver(studentLocation);
  if (nearestIdleDriver) {
    console.log(`[MATCHING] Supir idle terdekat ditemukan: ID ${nearestIdleDriver.id}. Mengirim penawaran...`);
    await sendNewTripOffer(nearestIdleDriver, booking);
  } else {
    console.log('[MATCHING] Tidak ada supir idle yang tersedia dalam radius.');
  }
}

/**
 * [DIPERBAIKI] Mencari trip yang sedang berjalan, searah, dan masih punya kursi kosong.
 */
async function findCompatibleExistingTrip(booking: Booking, studentLocation: { lat: number, lon: number }): Promise<Trip & { driver: DriverProfile } | null> {
  // 1. Cari semua trip yang potensial (status aktif dan tujuan sama)
  const potentialTrips = await prisma.trip.findMany({
    where: {
      status: { in: ['ONGOING_PICKUP', 'ONGOING'] },
      destination: booking.destination,
    },
    include: {
      driver: true,
    },
  });

  // --- [FIX] Saring berdasarkan kapasitas di dalam kode, bukan di query ---
  const compatibleTrips = potentialTrips.filter(trip => 
    (trip.seatsTaken + booking.passengers) <= trip.capacity
  );

  if (compatibleTrips.length === 0) {
    return null;
  }

  console.log(`[RIDE-POOLING] Ditemukan ${compatibleTrips.length} trip potensial. Memvalidasi rute...`);

  // 2. Iterasi setiap trip yang kompatibel untuk mengecek efisiensi rute
  for (const trip of compatibleTrips) {
    // TODO: Panggil Google Maps Directions API di sini untuk validasi rute.
    // Logika ini akan membandingkan total waktu tempuh trip LAMA vs BARU.
    // Jika penambahan waktunya wajar (misal < 15 menit), maka trip dianggap efisien.
    
    // Untuk saat ini, kita asumsikan semua trip searah adalah efisien.
    const isRouteEfficient = true; // Placeholder untuk hasil validasi Google Maps

    if (isRouteEfficient) {
      // Jika efisien, langsung kembalikan trip ini sebagai trip yang cocok.
      return trip;
    }
  }

  // Jika tidak ada trip yang rutenya efisien setelah dicek semua
  return null;
}

async function findNearestIdleDriver(studentLocation: { lat: number, lon: number }): Promise<DriverWithDistance | null> {
    const { lat: studentLat, lon: studentLon } = studentLocation;
    const idleDrivers = await prisma.driverProfile.findMany({
        where: {
            status: 'AKTIF',
            latitude: { not: null },
            longitude: { not: null },
            trips: { none: { status: { in: ['ONGOING', 'CONFIRMED', 'ONGOING_PICKUP'] } } }
        }
    });

    if (idleDrivers.length === 0) return null;

    const driversWithDistance = idleDrivers
        .map(driver => ({
            ...driver,
            distance: getDistanceInKm(studentLat, studentLon, driver.latitude!, driver.longitude!),
        }))
        .filter(driver => driver.distance <= DRIVER_SEARCH_RADIUS_KM)
        .sort((a, b) => a.distance - b.distance);

    return driversWithDistance.length > 0 ? driversWithDistance[0] : null;
}

async function sendNewTripOffer(driver: DriverWithDistance, booking: Booking) {
  const driverUser = await prisma.user.findUnique({ where: { id: driver.userId } });
  if (!driverUser) return;

  const estimatedEta = `${Math.round(driver.distance * 2.5)} menit`;
  const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(booking.price);

  const messageBody = `
  🚨 **Tawaran Prioritas!** (ID Booking: ${booking.id})
  
  Rute: *${booking.origin} ke ${booking.destination}*
  Jarak Jemput: ~${driver.distance.toFixed(1)} km (${estimatedEta})
  Tarif: *${formattedPrice}*
  
  Buka aplikasi untuk menerima.
  `;
  await sendMessage(`whatsapp:${driverUser.whatsapp}`, messageBody);
}

async function sendRidePoolingOffer(driver: DriverProfile, booking: Booking) {
  const driverUser = await prisma.user.findUnique({ where: { id: driver.userId } });
  if (!driverUser) return;
  
  const formattedPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(booking.price);

  const messageBody = `
  ➕ **Tawaran Tambahan Searah!** (Booking: #${booking.id})
  
  Jemput di: *${booking.origin}*
  Tambahan Pendapatan: *${formattedPrice}*
  
  Buka aplikasi untuk detail & terima.
  `;
  await sendMessage(`whatsapp:${driverUser.whatsapp}`, messageBody);
}
