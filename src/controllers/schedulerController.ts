import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';
import {sendMessage} from '../service/whatsappService';
const prisma = new PrismaClient();

// TODO: Implementasikan fungsi untuk menampilkan jadwal yang tersedia
export async function getAvailableSchedules(req: AuthRequest, res: Response) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0));
    const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999));
    
    try {
        const schedules = await prisma.schedule.findMany({
            where: {
                status: 'AVAILABLE',
                departureTime: { gte: startOfTomorrow, lte: endOfTomorrow },
            },
            select: {
                id: true,
                departureTime: true,
                originArea: true,
                destination: true,
                totalPassengers: true,
            },
            orderBy: {
                departureTime: 'asc',
            },
        });
        res.status(200).json(schedules);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Gagal mengambil jadwal yang tersedia" });
    }
}

export async function claimSchedule(req: AuthRequest, res: Response) {
    const { scheduleId } = req.body;
    const driverProfileId = req.user?.driverProfileId;

    if (!driverProfileId) {
        return res.status(403).json({ error: 'Token tidak valid.' });
    }
    if (!scheduleId) {
        return res.status(400).json({ error: 'scheduleId wajib diisi.' });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Kunci jadwal dan pastikan masih AVAILABLE
            const schedule = await tx.schedule.findFirstOrThrow({
                where: { id: parseInt(scheduleId), status: 'AVAILABLE' }
            });

            // 2. Update status jadwal menjadi CLAIMED agar tidak bisa diambil lagi
            await tx.schedule.update({
                where: { id: schedule.id },
                data: { status: 'CLAIMED' }
            });

            // 3. Buat Trip baru untuk supir ini berdasarkan jadwal
            const newTrip = await tx.trip.create({
                data: {
                    driverId: driverProfileId,
                    status: 'CONFIRMED', // Statusnya sudah dikonfirmasi, tinggal menunggu jam berangkat
                    departureTime: schedule.departureTime,
                    destination: schedule.destination,
                    capacity: 7, // Kapasitas default, bisa diambil dari profil supir
                    seatsTaken: schedule.totalPassengers,
                }
            });

            // 4. Tautkan trip ke jadwal dan semua booking di dalamnya
            await tx.schedule.update({
                where: { id: schedule.id },
                data: { tripId: newTrip.id }
            });
            
            const updatedBookings = await tx.booking.updateMany({
                where: { scheduleId: schedule.id },
                data: { tripId: newTrip.id, status: 'CONFIRMED' }
            });

            return { schedule, updatedBookingsCount: updatedBookings.count, tripId: newTrip.id };
        });

        // 5. Kirim notifikasi konfirmasi ke semua mahasiswa (di luar transaksi)
        const bookingsToNotify = await prisma.booking.findMany({
            where: { scheduleId: result.schedule.id },
            include: { user: true }
        });

        const driver = await prisma.driverProfile.findUniqueOrThrow({
            where: { id: driverProfileId },
            include: { user: true }
        });

        for (const booking of bookingsToNotify) {
            const message = `✅ Jadwal Anda besok jam ${result.schedule.departureTime.getHours()}:00 telah dikonfirmasi! Anda akan dijemput oleh ${driver.user.name} (${driver.plateNumber}).`;
            await sendMessage(`whatsapp:${booking.user.whatsapp}`, message);
        }
        
        // 6. Kirim kembali data ActiveTrip agar aplikasi bisa langsung menampilkan "Daftar Tugas"
        const activeTripData = await buildActiveTripResponse(result.tripId);
        res.status(200).json(activeTripData);

    } catch (error) {
        console.error("Gagal mengklaim jadwal:", error);
        res.status(400).json({ error: "Jadwal sudah tidak tersedia atau terjadi kesalahan." });
    }
}

async function buildActiveTripResponse(tripId: number) {
    const tripWithBookings = await prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        bookings: {
          include: {
            user: true,
          },
          orderBy: {
            // Bisa diurutkan berdasarkan sesuatu nanti, misal jarak
            createdAt: 'asc',
          }
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
        isPickedUp: booking.isPickedUp,
      })),
    };
  
    return activeTrip;
}