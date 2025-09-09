/**
 * src/service/geoService.ts
 * Pusat untuk semua logika geografis: Geocoding, Jarak, dan Pengecekan Ketersediaan.
 */
import { PrismaClient, DriverProfile, Trip } from '@prisma/client';

const prisma = new PrismaClient();
const DRIVER_SEARCH_RADIUS_KM = 5;
const DRIVER_SEARCH_RADIUS_EXTENDED_KM = 20;

export type DriverWithDistance = DriverProfile & { distance: number };

class GeoService {
  /**
   * Mengubah input teks lokasi menjadi koordinat GPS.
   * TODO: Ganti kamus statis ini dengan panggilan ke Google Geocoding API.
   */
  async getCoordinatesFromLocation(locationName: string): Promise<{ lat: number; lon: number } | null> {
    const locationMap: { [key: string]: { lat: number; lon: number } } = {
      'kambang iwak': { lat: -2.9812, lon: 104.7524 },
      'unsri bukit': { lat: -2.9909, lon: 104.7393 },
      'palembang (unsri bukit besar)': { lat: -2.9909, lon: 104.7393 },
      'demang': { lat: -2.9678, lon: 104.7411 },
      'plaju': { lat: -3.0084, lon: 104.7930 },
    };
    const lowerCaseLocation = locationName.toLowerCase();
    for (const key in locationMap) {
      if (lowerCaseLocation.includes(key)) return locationMap[key];
    }
    return null;
  }

  /**
   * Menghitung jarak lurus antara dua titik koordinat.
   */
  getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius Bumi
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  /**
   * [DITAMBAHKAN] Mencari supir yang tersedia di sekitar lokasi untuk AVAILABILITY_CHECK.
   */
  async findAvailableDriversNearby(userLocation: { lat: number; lon: number }) {
    const activeDrivers = await prisma.driverProfile.findMany({
      where: { status: 'AKTIF', latitude: { not: null }, longitude: { not: null } },
    });

    const driversWithDistance = activeDrivers.map(driver => ({
      ...driver,
      distance: this.getDistanceInKm(userLocation.lat, userLocation.lon, driver.latitude!, driver.longitude!),
    }));

    const within5km = driversWithDistance.filter(d => d.distance <= DRIVER_SEARCH_RADIUS_KM).length;
    let outside5km = 0;
    let nearestOutsideDistanceKm: number | null = null;

    if (within5km === 0) {
      const outsideDrivers = driversWithDistance.sort((a, b) => a.distance - b.distance);
      outside5km = outsideDrivers.length;
      if (outsideDrivers.length > 0) {
        nearestOutsideDistanceKm = Math.round(outsideDrivers[0].distance);
      }
    }

    return { within5km, outside5km, nearestOutsideDistanceKm };
  }
}

// Ekspor satu instance saja untuk digunakan di seluruh aplikasi
export const geoService = new GeoService();
