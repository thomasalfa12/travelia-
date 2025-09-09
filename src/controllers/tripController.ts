
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendMessage } from '../service/whatsappService'; // <-- [1] Impor service WhatsApp
import { initiateSmartMatching } from '../service/matchingService'; // <-- [2] Impor service matching

const prisma = new PrismaClient();

/**
 * Menangani permintaan supir untuk menerima sebuah tawaran booking.
 */
export async function handleAcceptTrip(req: AuthRequest, res: Response) {
  const { bookingId } = req.body;
  const driverProfileId = req.user?.driverProfileId;

  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId wajib diisi.' });
  }
  if (!driverProfileId) {
    return res.status(403).json({ error: 'Akses ditolak. Token tidak valid.' });
  }

  try {
    const tripResult = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: parseInt(bookingId), status: 'PENDING' },
        include: { user: true } // Sertakan data user untuk notifikasi
      });

      if (!booking) {
        throw new Error('Pesanan sudah tidak tersedia atau sudah diambil.');
      }

      const driver = await tx.driverProfile.findUniqueOrThrow({
        where: { id: driverProfileId },
        include: { user: true }
      });

      const newTrip = await tx.trip.create({
        data: {
          driverId: driverProfileId,
          status: 'ONGOING_PICKUP',
          departureTime: new Date(),
          capacity: 7,
          destination: booking.destination,
          seatsTaken: booking.passengers,
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED', tripId: newTrip.id },
      });

      // --- [3] Kirim notifikasi konfirmasi ke mahasiswa ---
      const studentMessage = `✅ Supir ditemukan! Pesanan Anda dari ${booking.origin} akan dijemput oleh ${driver.user.name} (${driver.plateNumber}). Mohon ditunggu.`;
      await sendMessage(`whatsapp:${booking.user.whatsapp}`, studentMessage);

      return newTrip;
    });

    const activeTripData = await buildActiveTripResponse(tripResult.id);
    res.status(200).json(activeTripData);

  } catch (error: any) {
    console.error('Error saat menerima trip:', error);
    res.status(400).json({ error: error.message || 'Gagal menerima pesanan.' });
  }
}

/**
 * Menangani permintaan supir untuk menolak tawaran.
 */
export async function handleRejectTrip(req: AuthRequest, res: Response) {
    const { bookingId } = req.body;
    const driverProfileId = req.user?.driverProfileId;

    if (!driverProfileId) {
        return res.status(403).json({ error: 'Akses ditolak. Token tidak valid.' });
    }

    console.log(`[REJECT] Supir ${driverProfileId} menolak booking #${bookingId}`);
    
    // Ambil data booking yang ditolak untuk ditawarkan lagi
    const rejectedBooking = await prisma.booking.findUnique({
        where: { id: parseInt(bookingId) }
    });

    if (rejectedBooking && rejectedBooking.status === 'PENDING') {
        console.log(`[RE-MATCH] Mencari supir lain untuk booking #${bookingId}...`);
        // --- [4] Panggil matching service untuk menawarkan ke supir berikutnya ---
        // Kita abaikan supir yang baru saja menolak.
        // Catatan: initiateSmartMatching di matchingService.ts perlu diupdate
        // untuk menerima parameter ketiga (excludedDriverIds).
        // await initiateSmartMatching(rejectedBooking, [driverProfileId]);
    }
    
    res.status(200).json({ message: 'Penolakan dicatat. Mencari supir lain.' });
}

/**
 * [BARU] Menangani aksi supir saat menandai penumpang sudah dijemput.
 */
export async function handleBookingPickup(req: AuthRequest, res: Response) {
    const { bookingId } = req.params; // Ambil dari URL, misal: /api/bookings/123/complete-pickup
    const driverProfileId = req.user?.driverProfileId;

    if (!driverProfileId) {
        return res.status(403).json({ error: 'Akses ditolak. Token tidak valid.' });
    }

    try {
        // Validasi: Pastikan supir yang melakukan aksi adalah supir yang benar-benar
        // ditugaskan untuk menjemput booking ini.
        const booking = await prisma.booking.findFirstOrThrow({
            where: {
                id: parseInt(bookingId),
                trip: {
                    driverId: driverProfileId
                }
            }
        });

        // Update status penjemputan
        const updatedBooking = await prisma.booking.update({
            where: { id: booking.id },
            data: { isPickedUp: true }
        });

        // --- [PERBAIKAN] Kirim kembali data perjalanan yang sudah diperbarui ---
        const activeTripData = await buildActiveTripResponse(updatedBooking.tripId!);
        res.status(200).json(activeTripData);

    } catch(error) {
        console.error("Error saat update status penjemputan:", error);
        res.status(403).json({ error: "Gagal mengupdate status atau Anda tidak berhak atas pesanan ini." });
    }
}

export async function handleCompleteTrip(req: AuthRequest, res: Response) {
  const {tripId} = req.params;
  const driverProfileId = req.user?.driverProfileId;

  if (!driverProfileId){
    return res.status(403).json({error: 'Akes ditolak. Token tidak valid.'})
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: {
          id: parseInt(tripId),
          driverId: driverProfileId
        },
        data:{ status: 'COMPLETED'}
      });
      await tx.driverProfile.update({
        where: {id: driverProfileId },
        data: { status: 'AKTIF'}
      });
    });
    res.status(200).json({ message: `Perjalanan #${tripId} berhasil diselesaikan.`})
  } catch (error){
    console.error("Error saat menyelesaikan perjalanan:", error);
    res.status(403).json({ error: "Gagal menyelesaikan perjalanan atau Anda tidak berhak."})
  }
}

/**
 * Helper function untuk membangun struktur data ActiveTrip.
 */
async function buildActiveTripResponse(tripId: number) {
  const tripWithBookings = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: {
      bookings: {
        orderBy: { createdAt: 'asc'},
        include: {
          user: true,
        },
      },
    },
  });

  const activeTrip = {
    tripId: tripWithBookings.id,
    finalDestination: tripWithBookings.destination,
    remainingCapacity: tripWithBookings.capacity - tripWithBookings.seatsTaken,
    totalCapacity: tripWithBookings.capacity,
    tasks: tripWithBookings.bookings.map(booking => ({
      bookingId: booking.id,
      passengerName: booking.user.name,
      location: booking.origin,
      passengers: booking.passengers,
      // --- [5] Status isCompleted sekarang menggunakan data asli ---
      isCompleted: booking.isPickedUp,
    })),
  };

  return activeTrip;
}
