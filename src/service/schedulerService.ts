import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

class SchedulerService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  public initializeAllJobs() {
    this._startNightlyPublishJob();
    this._startMorningQueueProcessor();
    this._startHourlyCleanupJob();
    console.log('✅ Semua scheduler (Malam, Pagi, Pembersih) telah dimulai.');
  }

  /**
   * [TUGAS MALAM] Menjadwalkan publikasi pra-pesan setiap pukul 23:00 WIB.
   */
  private _startNightlyPublishJob() {
    cron.schedule('0 23 * * *', async () => {
      await this._processAndPublishSchedules();
    }, { timezone: "Asia/Jakarta" });
  }

  /**
   * [ALARM PAGI] Menjadwalkan pemrosesan antrian semalam setiap pukul 06:00 WIB.
   */
  private _startMorningQueueProcessor() {
    cron.schedule('0 6 * * *', async () => {
      await this._processOvernightQueue();
    }, { timezone: "Asia/Jakarta" });
  }

  /**
   * [PEMBERSIH] Menjadwalkan pembersihan jadwal kedaluwarsa setiap jam.
   */
  private _startHourlyCleanupJob() {
    cron.schedule('0 * * * *', async () => {
      await this._cleanupExpiredSchedules();
    }, { timezone: "Asia/Jakarta" });
  }

  // --- LOGIKA INTI SCHEDULER ---

  private async _processAndPublishSchedules() {
    console.log('[SCHEDULER] Menjalankan tugas malam (23:00) untuk publikasi jadwal...');
  
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0));
    const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999));

    const scheduledBookings = await this.prisma.booking.findMany({
      where: {
        status: 'SCHEDULED',
        scheduleId: null,
        scheduledDepartureTime: {
          gte: startOfTomorrow,
          lte: endOfTomorrow,
        },
      },
    });

    if (scheduledBookings.length === 0) {
      console.log('[SCHEDULER] Tidak ada pesanan terjadwal baru untuk diproses.');
      return;
    }
    
    const bookingsBySchedule = scheduledBookings.reduce((acc, booking) => {
      const timeKey = booking.scheduledDepartureTime!.toISOString();
      const destinationKey = booking.destination.toLowerCase().includes('indralaya') ? 'Indralaya' : 'Palembang';
      const groupKey = `${timeKey}_${destinationKey}`;
      
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(booking);
      return acc;
    }, {} as { [key: string]: typeof scheduledBookings });

    console.log(`[SCHEDULER] Ditemukan ${Object.keys(bookingsBySchedule).length} grup jadwal untuk dipublikasikan.`);

    for (const key in bookingsBySchedule) {
      const bookingsInGroup = bookingsBySchedule[key];
      const firstBooking = bookingsInGroup[0];
      const totalPassengers = bookingsInGroup.reduce((sum, b) => sum + b.passengers, 0);

      const newSchedule = await this.prisma.schedule.create({
        data: {
          status: 'AVAILABLE',
          departureTime: firstBooking.scheduledDepartureTime!,
          destination: firstBooking.destination,
          originArea: `Grup Jemputan (${bookingsInGroup.length} lokasi)`,
          totalPassengers: totalPassengers,
          bookings: {
            connect: bookingsInGroup.map(b => ({ id: b.id })),
          },
        },
      });
      console.log(`  - Jadwal #${newSchedule.id} dipublikasikan dengan ${totalPassengers} penumpang.`);
    }
  }

  private async _processOvernightQueue() {
    console.log('[SCHEDULER] Menjalankan prosesor pagi (06:00)...');
    const overnightBookings = await this.prisma.booking.findMany({
      where: { status: 'QUEUED_OVERNIGHT' },
    });

    if (overnightBookings.length === 0) {
      console.log('[SCHEDULER] Tidak ada pesanan semalam untuk diproses.');
      return;
    }

    await this.prisma.booking.updateMany({
      where: { id: { in: overnightBookings.map(b => b.id) } },
      data: { status: 'SCHEDULED' },
    });

    console.log(`[SCHEDULER] ${overnightBookings.length} pesanan semalam berhasil diubah menjadi SCHEDULED.`);
  }

  private async _cleanupExpiredSchedules() {
    console.log('[SCHEDULER] Menjalankan pembersih jadwal kedaluwarsa...');
    const now = new Date();
    
    const result = await this.prisma.schedule.updateMany({
        where: {
            status: 'AVAILABLE',
            departureTime: {
                lt: now // Cari jadwal yang waktunya sudah lewat
            }
        },
        data: {
            status: 'EXPIRED'
        }
    });

    if (result.count > 0) {
        console.log(`[SCHEDULER] ${result.count} jadwal kedaluwarsa berhasil dibersihkan.`);
    }
  }
}

// Ekspor satu instance dari service agar bisa digunakan di seluruh aplikasi
export const schedulerService = new SchedulerService();

