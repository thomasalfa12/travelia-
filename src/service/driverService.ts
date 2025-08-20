import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DriverData {
  userId: number;
  plateNumber: string;
  vehicleType: string;
}

export async function registerDriver(data: DriverData) {
  const { userId, plateNumber, vehicleType } = data;

  // Gunakan transaksi untuk memastikan kedua operasi berhasil
  const driverProfile = await prisma.$transaction(async (tx) => {
    // 1. Update role user menjadi SUPIR
    await tx.user.update({
      where: { id: userId },
      data: { role: 'SUPIR' },
    });

    // 2. Buat profil supir yang terhubung dengan user tersebut
    const profile = await tx.driverProfile.create({
      data: {
        userId: userId,
        plateNumber: plateNumber,
        vehicleType: vehicleType,
      },
    });

    return profile;
  });

  return driverProfile;
}