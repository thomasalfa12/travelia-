/**
 * src/service/fcmService.ts
 * Menangani semua logika untuk mengirim notifikasi push via Firebase Cloud Messaging (FCM).
 */
import * as admin from 'firebase-admin';

// Inisialisasi Firebase Admin SDK
// Pastikan file serviceAccountKey.json ada di root proyek Anda.
const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/**
 * Mengirim notifikasi push ke satu perangkat Android.
 * @param token Token FCM dari perangkat tujuan.
 * @param title Judul notifikasi.
 * @param body Isi pesan notifikasi.
 * @param data Payload data tambahan yang akan diterima oleh aplikasi.
 */
export async function sendFcmNotification(token: string, title: string, body: string, data: { [key: string]: string }) {
  const message: admin.messaging.Message = {
    notification: {
      title: title,
      body: body,
    },
    token: token,
    data: data,
    android: {
      priority: 'high', // Pastikan notifikasi segera sampai
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('[FCM] Notifikasi berhasil dikirim:', response);
  } catch (error) {
    console.error('[FCM] Gagal mengirim notifikasi:', error);
  }
}
