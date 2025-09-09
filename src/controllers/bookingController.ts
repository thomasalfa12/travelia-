import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

/**
 * Mengambil daftar semua booking yang tersedia (status PENDING)
 * untuk ditampilkan di "Daftar Orderan Hari Ini" pada aplikasi driver.
 */
export async function getAvailableBookings(req: AuthRequest, res: Response) {
  try {
    // 1. Ambil semua data booking yang masih menunggu supir
    const availableBookings = await prisma.booking.findMany({
      where: {
        status: 'PENDING',
      },
      select: {
        id: true,
        origin: true,
        destination: true,
        price: true,
        passengers: true,
      },
      orderBy: {
        createdAt: 'asc', // Tampilkan yang paling lama menunggu di atas
      },
    });

    // 2. Transformasi data agar sesuai dengan format yang diminta oleh Android
    const formattedBookings = availableBookings.map(booking => ({
      bookingId: booking.id,
      route: `${booking.origin} -> ${booking.destination}`,
      fare: booking.price,
      passengerCount: booking.passengers,
      pickupPoint: booking.origin, // Gunakan 'origin' sebagai titik jemput utama
    }));

    // 3. Kirim respons dengan data yang sudah diformat
    res.status(200).json(formattedBookings);

  } catch (error) {
    console.error('Error saat mengambil booking yang tersedia:', error);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
}
