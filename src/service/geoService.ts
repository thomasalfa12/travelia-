import { Client, GeocodeRequest } from '@googlemaps/google-maps-services-js';

const client = new Client({});

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Mengubah alamat teks menjadi koordinat GPS menggunakan Google Geocoding API.
 * @param address Alamat teks dari user (misal: "Kambang Iwak", "Depan Hotel Amaris").
 * @returns Objek berisi latitude dan longitude, atau null jika tidak ditemukan.
 */
export async function getCoordsFromAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  if (!API_KEY) {
    console.error('[GEOCODING] Google Maps API Key tidak ditemukan di .env');
    return null;
  }

  // Tambahkan konteks "Palembang" untuk hasil yang lebih akurat
  const fullAddress = `${address}, Palembang`;

  const request: GeocodeRequest = {
    params: {
      address: fullAddress,
      key: API_KEY,
      region: 'id', // Prioritaskan hasil dari Indonesia
    },
  };

  try {
    const response = await client.geocode(request);
    const result = response.data.results[0];

    if (result && result.geometry) {
      const { lat, lng } = result.geometry.location;
      console.log(`[GEOCODING] Berhasil: "${address}" -> lat: ${lat}, lon: ${lng}`);
      return { lat, lon: lng };
    }
    
    console.log(`[GEOCODING] Gagal menemukan koordinat untuk: "${address}"`);
    return null;
  } catch (error) {
    console.error('[GEOCODING] Error saat menghubungi Google Maps API:', error);
    return null;
  }
}

// TODO: Nanti kita akan tambahkan fungsi untuk Directions API di sini
// export async function getRouteDetails(origin, destination, waypoints) { ... }
