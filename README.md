# SEPEDA ABANG - Administrative Portal

Portal Administrasi Berbasis Web untuk sistem manajemen presensi, *operational geofencing*, dan komunikasi terpadu staf/karyawan tingkat Kecamatan hingga Desa.

## 📌 Fitur Utama

1. **Dashboard Ringkasan (Real-time Insights)**
   * Menampilkan metrik total karyawan terdaftar.
   * Total kehadiran/presensi staf secara *real-time* berdasarkan hari berjalan.
   * Jumlah wilayah operasional (desa) yang aktif terpantau.

2. **Log Absensi Karyawan (Advanced Logging & Pagination)**
   * Sistem pelacakan riwayat presensi masuk staf.
   * Dilengkapi fitur **Pencarian Nama** dan **Filter berdasarkan Wilayah/Desa**.
   * Integrasi data **Pagination** untuk optimasi pemuatan data skala besar.
   * Tombol **Detail Absensi** untuk melihat foto presensi serta mapping koordinat akurat pengguna.

3. **Manajemen Wilayah Operasional (Geofence System)**
   * Modul CRUD (*Create, Read, Update, Delete*) batas wilayah tugas instansi.
   * Sinkronisasi data koordinat spasial presisi (Latitude & Longitude) langsung dengan skema database Firestore.
   * Pengaturan radius *geofencing* (dalam satuan meter) untuk membatasi ruang absensi aplikasi *mobile client*.

4. **Manajemen Akun Karyawan**
   * Pendaftaran akun perangkat desa dan admin desa baru secara tersentralisasi.
   * Manajemen penempatan wilayah kerja staf.

5. **Panel Broadcast & Notifikasi**
   * Mengirimkan pengumuman penting (*push notification*) langsung ke gawai milik staf.
   * Mendukung opsi target spesifik per desa maupun siaran masal ke seluruh wilayah kecamatan.
   * Pengelolaan pesan penuh dengan fitur Edit dan Hapus *broadcast*.

6. **Pengaturan Global Aplikasi (Branding & Parameter UI)**
   * Manajemen jam masuk dan jam keluar kerja *default*.
   * Pengaturan status operasional sistem absensi (*Open* / *Maintenance Mode*).
   * **Custom UI Branding**: Mengubah tema warna utama panel (*Hex Color*) dan menyematkan logo kustom instansi via URL secara dinamis.

---

## 🏗️ Spesifikasi Teknis & Arsitektur

* **Front-End Framework**: HTML5, Vanilla JavaScript (ES6+ Modules global scoping).
* **Styling Engine**: Tailwind CSS v4 (Modern & Mobile-responsive Light Mode layout).
* **Icon Pack**: Lucide Icons.
* **Database & Backend**: Firebase Firestore (Real-time Document-oriented database).

### 🗄️ Sinkronisasi Skema Firestore
Aplikasi ini dikonfigurasi secara ketat untuk menjaga konsistensi skema database yang telah ada:
* **Koleksi `desas`**: Field bujur geografis wajib dipetakan ke atribut data `lon` untuk menghindari inkonsistensi data `0` pada pemetaan wilayah.
* **Koleksi `broadcasts`**: Menyimpan redundansi field isi pesan ke atribut `body`, `pesan`, dan `message` demi kompatibilitas lintas versi aplikasi *mobile client*.

---

## 🚀 Panduan Instalasi & Penggunaan Lokal

### 1. Prasyarat
Pastikan Anda memiliki peramban (*web browser*) modern (Chrome, Edge, Firefox, atau Safari) dan ekstensi **Live Server** (jika menggunakan VS Code) untuk menghindari isu CORS saat memuat skrip modul eksternal.

### 2. Kloning Repositori
```bash
git clone [https://github.com/username/sepeda-abang-admin.git](https://github.com/username/sepeda-abang-admin.git)
cd sepeda-abang-admin
