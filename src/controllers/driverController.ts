import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken'; // <-- [1] Impor library JWT
import { sendMessage } from '../service/whatsappService'; 
const prisma = new PrismaClient();

export async function handleDriverLogin(req: Request, res: Response) {
  const { whatsapp } = req.body;

  if (!whatsapp) {
    return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi.' });
  }

  try {
    const driverUser = await prisma.user.findFirst({
      where: {
        whatsapp: whatsapp,
        role: 'SUPIR',
      },
      include: {
        driverProfile: true,
      },
    });

    if (!driverUser || !driverUser.driverProfile) {
      return res.status(404).json({ error: 'Supir dengan nomor ini tidak ditemukan.' });
    }

    // --- [2] Membuat Token JWT yang Sebenarnya ---
    // Payload berisi data yang ingin kita simpan di dalam token.
    const payload = {
      userId: driverUser.id,
      driverProfileId: driverUser.driverProfile.id,
      role: driverUser.role
    };

    // Ambil kunci rahasia dari environment variable
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
        throw new Error("JWT_SECRET tidak ditemukan di .env");
    }

    // "Tandatangani" token dengan masa berlaku 7 hari
    const token = jwt.sign(payload, secretKey, { expiresIn: '7d' });

    // --- [3] Kirim Response dengan Token Asli ---
    res.status(200).json({
      message: 'Login berhasil',
      driverId: driverUser.driverProfile.id,
      name: driverUser.name,
      token: token, // <-- Menggunakan token yang baru dibuat
    });

  } catch (error) {
    console.error('Error saat login supir:', error);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
}
export async function handleRequestOtp(req: Request, res: Response) {
  const { whatsapp } = req.body;
  if (!whatsapp) {
    return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi.' });
  }

  try {
    // 1. Pastikan nomor terdaftar sebagai supir
    const driverUser = await prisma.user.findFirst({
      where: { whatsapp: whatsapp, role: 'SUPIR' },
    });
    if (!driverUser) {
      return res.status(404).json({ error: 'Supir dengan nomor ini tidak terdaftar.' });
    }

    // 2. Generate kode OTP 6 digit
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Berlaku 5 menit

    // 3. Simpan OTP ke database (update jika sudah ada)
    await prisma.otp.upsert({
      where: { whatsapp: whatsapp },
      update: { code: otpCode, expiresAt: expiresAt },
      create: { whatsapp: whatsapp, code: otpCode, expiresAt: expiresAt },
    });

    // 4. Kirim OTP via WhatsApp
    const message = `[Agent Travel Unsri] Kode OTP Anda adalah: *${otpCode}*. Jangan bagikan kode ini. Berlaku selama 5 menit.`;
    await sendMessage(`whatsapp:${whatsapp}`, message);

    res.status(200).json({ message: 'OTP telah dikirim ke nomor WhatsApp Anda.' });
  } catch (error) {
    console.error('Error saat meminta OTP:', error);
    res.status(500).json({ error: 'Gagal mengirim OTP.' });
  }
}

// --- [BARU] Fungsi untuk verifikasi OTP & Login ---
export async function handleVerifyOtp(req: Request, res: Response) {
  const { whatsapp, otp } = req.body;
  if (!whatsapp || !otp) {
    return res.status(400).json({ error: 'Nomor WhatsApp dan OTP wajib diisi.' });
  }

  try {
    // 1. Cari OTP di database
    const savedOtp = await prisma.otp.findUnique({ where: { whatsapp: whatsapp } });
    if (!savedOtp) {
      return res.status(400).json({ error: 'OTP tidak ditemukan atau salah.' });
    }

    // 2. Validasi OTP
    const isExpired = new Date() > savedOtp.expiresAt;
    const isCorrect = savedOtp.code === otp;

    if (isExpired || !isCorrect) {
      return res.status(400).json({ error: 'OTP salah atau sudah kedaluwarsa.' });
    }

    // 3. Jika valid, hapus OTP & generate JWT
    await prisma.otp.delete({ where: { whatsapp: whatsapp } });

    const driverUser = await prisma.user.findFirstOrThrow({
      where: { whatsapp: whatsapp, role: 'SUPIR' },
      include: { driverProfile: true },
    });

    const payload = {
      userId: driverUser.id,
      driverProfileId: driverUser.driverProfile!.id,
      role: driverUser.role,
    };
    const secretKey = process.env.JWT_SECRET!;
    const token = jwt.sign(payload, secretKey, { expiresIn: '7d' });

    res.status(200).json({
      message: 'Login berhasil',
      driverId: driverUser.driverProfile!.id,
      name: driverUser.name,
      token: token,
    });
  } catch (error) {
    console.error('Error saat verifikasi OTP:', error);
    res.status(500).json({ error: 'Gagal verifikasi OTP.' });
  }
}

export async function handleUpdateDriverStatus(req: Request, res: Response) {
  // Menggunakan driverProfileId dari token JWT akan lebih aman,
  // tapi untuk saat ini kita gunakan dari body request.
  const { driverProfileId, status } = req.body;

  if (!driverProfileId || !status) {
    return res.status(400).json({ error: 'driverProfileId dan status wajib diisi.' });
  }

  if (status !== 'AKTIF' && status !== 'NONAKTIF') {
    return res.status(400).json({ error: 'Status tidak valid. Gunakan AKTIF atau NONAKTIF.' });
  }

  try {
    const updatedProfile = await prisma.driverProfile.update({
      where: {
        // Pastikan driverProfileId adalah angka
        id: parseInt(driverProfileId, 10),
      },
      data: {
        status: status,
      },
    });

    res.status(200).json({
      message: `Status berhasil diubah menjadi ${updatedProfile.status}`,
      driver: updatedProfile,
    });

  } catch (error) {
    console.error('Error saat update status supir:', error);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
}

export async function handleUpdateDriverLocation(req: Request, res: Response) {
  const { driverProfileId, latitude, longitude } = req.body;

  if (!driverProfileId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'driverProfileId, latitude, dan longitude wajib diisi.' });
  }

  try {
    // --- SIMPAN LOKASI KE DATABASE ---
    await prisma.driverProfile.update({
      where: { id: parseInt(driverProfileId, 10) },
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
    });

    res.status(200).json({ message: 'Lokasi berhasil diperbarui' });

  } catch (error) {
    console.error('Error saat update lokasi supir:', error);
    res.status(500).json({ error: 'Gagal memperbarui lokasi.' });
  }
}
export async function handleRegisterFcmToken(req: Request, res: Response) {
  const { driverProfileId, fcmToken } = req.body;

  if (!driverProfileId || !fcmToken) {
    return res.status(400).json({ error: 'driverProfileId dan fcmToken wajib diisi.' });
  }

  try {
    await prisma.driverProfile.update({
      where: { id: parseInt(driverProfileId, 10) },
      data: { fcmToken: fcmToken },
    });
    res.status(200).json({ message: 'Token FCM berhasil disimpan.' });
  } catch (error) {
    console.error('Error saat menyimpan token FCM:', error);
    res.status(500).json({ error: 'Gagal menyimpan token.' });
  }
}


