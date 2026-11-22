# Changelog — FADE Pods Showcase

Seluruh perubahan penting pada proyek *FADE Pods Showcase v0.2* didokumentasikan di sini.
Format berbasis [Keep a Changelog](https://keepachangelog.com/id/1.0.0/).

---

## [0.2.0-alpha] — 2026-11-22

### Ditambahkan
- **Technical Direction Amendment (DEC-005):**
  - Mengadopsi arsitektur *Local Development → GitHub Repository → Vercel Static Hosting*.
  - Mengeliminasi requirement Docker & Nginx untuk efisiensi eksekusi Showcase v0.2.
- **Standalone Workspace & Repository Setup:**
  - Inisialisasi struktur repositori `fade-pods-showcase` di `08_FADE Pods Showcase v0.2/`.
  - Konfigurasi branch strategy: `main` (stable approved) dan `develop` (active development).
  - Berkas `.gitignore`, `README.md`, `CHANGELOG.md`, dan `vercel.json`.
- **Shared Application Shell (Phase 04.2):**
  - **Unified Entry Point (`index.html`):** Portal masuk tunggal untuk peran Admin dan Sales Representative dengan seeder otomatis ke `localStorage`.
  - **Master Desktop Sidebar:** Navigasi 240px presisi (Dashboard Bulanan, Dashboard YTD, Invoice & Pembayaran, Upload Master Excel), profil pengguna, tombol ganti tema (Dark/Light), dan tombol keluar.
  - **Master Desktop Header:** Breadcrumb, badge status periode aktif, segmented toggle *Bulanan vs YTD*, filter tanggal, dan dropdown filter sales.
  - **Master Mobile Header & Bottom Navigation:** Fixed header dengan safe-area padding dan bottom bar 5 menu (Dashboard, YTD, Invoice, Upload, Profil).
  - **KPI Drill-down Drawer (`#dr`):** Panel geser samping interaktif untuk memeriksa rincian transaksi invoice yang mendasari metrik.
  - **Pencegahan Rute Rusak:** Routing berbasis hash URL (`#dashboard`, `#ytd`, `#invoices`, `#upload`) yang sepenuhnya kompatibel dengan static hosting tanpa reload error.
- **Porting Technical Foundation:**
  - Menyertakan `validator.js`, `excel-importer.js`, dan `business-engine.js` ke dalam aset runtime internal.
  - Pembaca berkas Excel berbasis browser tanpa dependensi eksternal (`xlsx-reader.js`).
  - Dataset sintetis 210 rekaman transaksi QA (`synthetic-seed.js`).
