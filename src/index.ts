import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import { createNewBooking } from './service/bookingService';
import { registerDriver } from './service/driverService';
import { handleIncomingMessage } from './controllers/whatsappControllers'; // <-- Impor controller utama
import { 
  handleRequestOtp, 
  handleVerifyOtp,
  handleUpdateDriverStatus, 
  handleUpdateDriverLocation, 
  handleRegisterFcmToken } from './controllers/driverController';
import { authMiddleware } from './middleware/authMiddleware';
import { handleAcceptTrip, handleRejectTrip } from './controllers/tripController';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient(); // prisma client tetap dibutuhkan untuk endpoint user

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =================================================================
// ENDPOINTS API 
// =================================================================
app.post('/api/drivers/login/request-otp', handleRequestOtp);
app.post('/api/drivers/login/verify-otp', handleVerifyOtp);
app.post('/api/drivers/status', authMiddleware, handleUpdateDriverStatus);
app.post('/api/drivers/location', authMiddleware, handleUpdateDriverLocation);
app.post('/api/drivers/fcm-token', authMiddleware,  handleRegisterFcmToken);
app.post('/api/trips/accept', authMiddleware, handleAcceptTrip);
app.post('/api/trips/reject', authMiddleware, handleRejectTrip);

app.get('/', (req: Request, res: Response) => {
  res.send('Selamat datang di API Agent Travel Unsri!');
});


app.post('/api/users', async (req: Request, res: Response) => {
    // (kode endpoint ini tidak berubah)
    try {
        const { whatsapp, name, role } = req.body;
        if (!whatsapp || !name) {
            return res.status(400).json({ error: 'Nomor WhatsApp dan Nama wajib diisi' });
        }
        const newUser = await prisma.user.create({
            data: { whatsapp, name, role },
        });
        res.status(201).json(newUser);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Gagal membuat user baru' });
    }
});



app.post('/api/drivers', async (req: Request, res: Response) => {
  try {
    const newDriver = await registerDriver(req.body);
    res.status(201).json(newDriver);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal mendaftarkan supir' });
  }
});

// --- Endpoint Booking (SEKARANG MEMANGGIL SERVICE) ---
app.post('/api/bookings', async (req: Request, res: Response) => {
  try {
    const newBooking = await createNewBooking(req.body);
    res.status(201).json(newBooking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gagal membuat pesanan' });
  }
});

// =================================================================
// WEBHOOK WHATSAPP
// =================================================================

app.post('/api/whatsapp', async (req: Request, res: Response) => {
  try {
    const incomingMsg = req.body.Body;
    const senderWA = req.body.From.replace('whatsapp:', '');

    console.log(`Pesan masuk dari ${senderWA}: "${incomingMsg}"`);

    // Cukup panggil satu fungsi controller utama
    const responseMessage = await handleIncomingMessage(incomingMsg, senderWA);

    // Kirim balasan
    res.type('text/xml');
    res.send(`<Response><Message>${responseMessage}</Message></Response>`);
  } catch (error) {
    console.error("Error di webhook:", error);
    // Kirim respons error generik jika terjadi masalah tak terduga
    res.type('text/xml').send('<Response><Message>Terjadi kesalahan, coba lagi.</Message></Response>');
  }
});

app.listen(port, () => {
  console.log(`🚀 Server berjalan di http://localhost:${port}`);
});