# 🔥 Panduan Setup Firebase Firestore

Panduan ini menjelaskan cara menghubungkan sistem dispensasi ke Firebase Firestore agar database tetap persisten saat di-deploy ke hosting.

---

## 1. Buat Project Firebase

1. Buka [Firebase Console](https://console.firebase.google.com)
2. Klik **"Add project"** / **"Tambah project"**
3. Beri nama project (contoh: `dispensasi-smp1kudus`)
4. Ikuti langkah-langkah hingga project dibuat

## 2. Aktifkan Firestore Database

1. Di sidebar Firebase Console, klik **"Firestore Database"**
2. Klik **"Create database"**
3. Pilih lokasi server terdekat (contoh: `asia-southeast2` untuk Jakarta)
4. Pilih **"Start in production mode"**
5. Klik **"Create"**

## 3. Dapatkan Service Account Key

1. Di Firebase Console, klik ⚙️ **Settings** → **"Project settings"**
2. Buka tab **"Service accounts"**
3. Klik **"Generate new private key"**
4. Download file JSON → simpan sebagai `serviceAccountKey.json` di folder project

> ⚠️ **JANGAN upload file ini ke GitHub!** File ini berisi kredensial rahasia.

## 4. Set Environment Variables

### Opsi A: Menggunakan File JSON (Rekomendasi untuk Vercel/Railway)

Set environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` dengan **seluruh isi** file `serviceAccountKey.json`.

Contoh di **Vercel**:
1. Buka Dashboard Vercel → project kamu → **Settings** → **Environment Variables**
2. Tambahkan:
   - **Key:** `FIREBASE_SERVICE_ACCOUNT_JSON`
   - **Value:** *(paste seluruh isi file `serviceAccountKey.json`)*
3. Klik **Save**

### Opsi B: Menggunakan 3 Variable Terpisah

Alternatif, set 3 variable ini dari isi `serviceAccountKey.json`:
- `FIREBASE_PROJECT_ID` → nilai dari `project_id`
- `FIREBASE_CLIENT_EMAIL` → nilai dari `client_email`
- `FIREBASE_PRIVATE_KEY` → nilai dari `private_key`

## 5. Migrasi Data dari db.json ke Firestore

Jalankan script migrasi untuk memindahkan data yang sudah ada:

```bash
# Set environment variable dulu
# Windows (PowerShell):
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content serviceAccountKey.json -Raw
node migrate-to-firebase.js

# Linux/Mac:
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" node migrate-to-firebase.js
```

Script akan memindahkan semua data teachers, dispensations, dan photoDispensations ke Firestore.

## 6. Tes di Lokal

```bash
# Windows (PowerShell):
$env:FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content serviceAccountKey.json -Raw
node server.js

# Linux/Mac:
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" node server.js
```

Jika berhasil, kamu akan melihat:
```
📦 Database: Firebase Firestore
🚀 Server berjalan di port 3000
```

## 7. Deploy ke Hosting

Deploy seperti biasa. Pastikan environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` sudah di-set di platform hosting kamu.

### Vercel
```bash
npm i -g vercel
vercel --prod
```

### Railway
1. Push ke GitHub
2. Connect repo di Railway dashboard
3. Set environment variable di Settings

---

## ✅ Checklist

- [ ] Firebase project dibuat
- [ ] Firestore Database diaktifkan
- [ ] Service Account Key di-download
- [ ] Environment variable di-set di hosting
- [ ] Script migrasi dijalankan
- [ ] Server berjalan dengan "Database: Firebase Firestore"
