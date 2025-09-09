# Agent Travel Unsri - Backend API

Selamat datang di repositori backend untuk **Agent Travel Unsri**, sebuah platform transportasi hiper-lokal yang dirancang khusus untuk ekosistem Universitas Sriwijaya. Sistem ini mengotomatiskan seluruh alur pemesanan travel, dari interaksi awal mahasiswa melalui AI di WhatsApp hingga manajemen perjalanan oleh supir melalui aplikasi Android.

Backend ini berfungsi sebagai otak pusat yang menghubungkan semua komponen, mengelola data, dan menjalankan logika bisnis yang cerdas.

---

## 📑 Daftar Isi
- [Visi & Fitur Utama](#-visi--fitur-utama)
- [Arsitektur & Tumpukan Teknologi](#-arsitektur--tumpukan-teknologi)
- [Panduan Instalasi & Setup Lokal](#-panduan-instalasi--setup-lokal)
- [Dokumentasi API Endpoint](#-dokumentasi-api-endpoint)
- [Struktur Proyek](#-struktur-proyek)

---

## 🎯 Visi & Fitur Utama
Proyek ini bertujuan untuk menggantikan sistem pemesanan travel manual yang tidak efisien dengan platform terpusat yang andal, transparan, dan mudah digunakan.

- 🤖 **Pemesanan via AI WhatsApp:** Mahasiswa dapat memesan, mengecek ketersediaan, dan mengelola pesanan melalui percakapan natural dengan AI Agent di WhatsApp.
- 📅 **Pra-Pesan & "Papan Pekerjaan":** Mahasiswa dapat memesan travel untuk H-1. Pesanan ini akan dikonsolidasikan dan dipublikasikan ke "Papan Pekerjaan" di aplikasi supir.
- 🪑 **Waitlist Dinamis & Ride-Pooling:** Sistem cerdas menawarkan kursi kosong pada perjalanan yang sudah berjalan kepada mahasiswa lain di rute searah.
- 📱 **Integrasi Aplikasi Driver:** API yang aman dan lengkap untuk aplikasi Android supir (otentikasi, manajemen status & lokasi, perjalanan).
- ⏰ **Sistem Penjadwal Otomatis (Scheduler):** Tugas otomatis harian untuk memproses pra-pesan, membersihkan jadwal kedaluwarsa, dan mengelola antrian.

---

## 🛠️ Arsitektur & Tumpukan Teknologi
- **Bahasa & Framework:** TypeScript, Node.js, Express.js  
- **Database:** PostgreSQL (via Docker)  
- **ORM:** Prisma  
- **API Komunikasi:**  
  - Mahasiswa: Twilio WhatsApp API  
  - AI Agent: OpenAI API (GPT-4o)  
  - Aplikasi Driver: Firebase Cloud Messaging (FCM)  
- **Otentikasi:** JWT & OTP  
- **Deployment (Rencana):** Railway.app atau layanan serupa  

---

## 🚀 Panduan Instalasi & Setup Lokal

### Prasyarat
- Node.js (v18 atau lebih baru)  
- Docker & Docker Compose  
- NPM atau Yarn  

### 1. Kloning Repositori
```bash
git clone [URL_REPOSITORI_ANDA]
cd agent-travel-unsri
```

### 2. Instal Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment Variables
Salin file contoh:
```bash
cp .env.example .env
```

Isi variabel sesuai kebutuhan:
```env
DATABASE_URL="postgresql://myuser:mysecretpassword@localhost:5432/unsri_travel"
JWT_SECRET="KUNCI_RAHASIA_ANDA_YANG_SANGAT_PANJANG_DAN_SULIT_DITEBAK"
OPENAI_API_KEY="sk-..."
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="whatsapp:+1415..."
```

### 4. Jalankan Database
```bash
docker-compose up -d
```

### 5. Terapkan Skema Database
```bash
npx prisma migrate dev
```

### 6. Jalankan Server Pengembangan
```bash
npm run dev
```
Server tersedia di: [http://localhost:3000](http://localhost:3000)

---

## 📡 Dokumentasi API Endpoint
Semua endpoint yang dilindungi memerlukan header:  
`Authorization: Bearer <TOKEN_JWT>`

### 🔑 Otentikasi Supir
| Tujuan | Metode | Endpoint | Dilindungi |
|--------|--------|----------|------------|
| Minta OTP | POST | `/api/drivers/login/request-otp` | ❌ |
| Verifikasi OTP & Login | POST | `/api/drivers/login/verify-otp` | ❌ |

### 🚘 Manajemen Supir
| Tujuan | Metode | Endpoint | Dilindungi |
|--------|--------|----------|------------|
| Update Status | POST | `/api/drivers/status` | ✔️ |
| Update Lokasi | POST | `/api/drivers/location` | ✔️ |
| Daftar FCM Token | POST | `/api/drivers/fcm-token` | ✔️ |

### 🛣️ Manajemen Perjalanan
| Tujuan | Metode | Endpoint | Dilindungi |
|--------|--------|----------|------------|
| Terima Tawaran | POST | `/api/trips/accept` | ✔️ |
| Tolak Tawaran | POST | `/api/trips/reject` | ✔️ |
| Tandai Penumpang Dijemput | POST | `/api/bookings/:bookingId/complete-pickup` | ✔️ |
| Selesaikan Perjalanan | POST | `/api/trips/:tripId/complete` | ✔️ |

### 📅 Papan Pekerjaan
| Tujuan | Metode | Endpoint | Dilindungi |
|--------|--------|----------|------------|
| Lihat Jadwal Tersedia | GET | `/api/schedules` | ✔️ |
| Klaim Jadwal | POST | `/api/schedules/claim` | ✔️ |

### 📋 Daftar Orderan Hari Ini
| Tujuan | Metode | Endpoint | Dilindungi |
|--------|--------|----------|------------|
| Lihat Pesanan Tersedia | GET | `/api/bookings/available` | ✔️ |

---

## 📂 Struktur Proyek
```
src/
├── controllers     # Menangani logika request & response HTTP
├── service         # Logika bisnis inti (matchingService, bookingService, dll)
├── middleware      # Middleware Express (authMiddleware, dll)
├── prisma          # Skema database (schema.prisma) & migrasi Prisma
└── utils           # Helper functions
```

---
