MASTER PRD: NEXEVENT (Music Event SaaS)
1. Ringkasan Eksekutif & Visi Produk
Platform SaaS B2B end-to-end yang berfungsi sebagai sistem operasi terpadu bagi promotor untuk mengelola siklus operasional event musik, mulai dari perencanaan finansial (RAB), pendanaan (Sponsor), penjualan tiket (B2C), penyewaan lapak, hingga pelaporan laba/rugi akhir.
Target Pengguna Utama:
•	Promotor/EO (B2B): Pengendali utama sistem operasional dan keuangan.
•	Sponsor (B2B): Pengguna via akses Magic Link untuk memilih paket benefit dan menerima invoice.
•	Tenant/Lapak (B2B): Pengguna untuk pendaftaran mandiri dan pembayaran sewa booth.
•	Penonton (B2C): Pembeli tiket publik dan merchandise (tanpa perlu mendaftar akun).
2. Arsitektur & Tech Stack (Teknologi Inti)
Aplikasi ini akan dibangun menggunakan ekosistem mandiri (Full Coding) untuk memastikan keamanan data dan kemampuan skalabilitas tinggi:
•	Frontend (Antarmuka): Next.js (React.js) untuk menghasilkan dasbor B2B yang interaktif dan Storefront publik B2C yang sangat responsif.
•	Backend (Logika Server): Node.js (Express.js) menggunakan ekosistem Full JavaScript untuk mempercepat pengembangan aplikasi.
•	Database: PostgreSQL (Relational Database) sebagai harga mati untuk menjaga integritas transaksi uang dan mencegah selisih/ overselling kuota tiket menggunakan skema penguncian baris data (Row-Level Locking).
•	File Storage: Amazon S3 / Supabase Storage khusus untuk menyimpan aset berat seperti PDF Invoice, cetakan RAB, QR Code, dan foto nota bukti kas agar performa server utama tetap cepat.
3. Fitur Utama & Peta Jalan Rilis (Sprints)
Pembangunan akan dibagi menjadi fase modular (Sprints) agar fokus pada Minimum Viable Product (MVP) penghasil omzet terlebih dahulu.
SPRINT 1: "The Promotor's ERP" (Fokus Perencanaan & Pendanaan B2B)
Fokus pada mesin perencanaan dan akuisisi modal.
•	Event Setup Dashboard: Input data fundamental (Nama, Tanggal, Kapasitas, Target Profit, Target Sponsor).
•	RAB Builder: Tersedia 2 mode pengisian: Mode Cepat (Lump Sum) dan Mode Detail (Itemized per item pengeluaran).
•	Dynamic Ticket Calculator: Kalkulator pintar berbasis kehadiran penonton (100% hingga 20%) dengan 2 opsi perhitungan:
o	Opsi 1 (Mode Ekspansi): Menyertakan target subsidi sponsor di perhitungan.
o	Opsi 2 (Mode Bootstrapping): Perhitungan independen murni dari total biaya RAB + Target profit untuk event pemula tanpa ekspektasi sponsor.
•	Generator RAB Otomatis: Sistem yang merangkum data dan mengekspor dokumen RAB ke dalam format PDF yang rapi.
•	Sponsorship Package Builder: Etalase benefit ala a la carte bagi promotor untuk menentukan harga tiap item benefit. Dilengkapi dengan sistem gamifikasi Auto-Tagging (misal: "Tambah Rp 3jt untuk menjadi Main Sponsor", jika di bawah batas akan masuk kategori Custom).
•	Automated P&L & Live Expense Tracker: Pencatatan pengeluaran harian dan uang masuk yang pada akhir acara akan dicocokkan untuk menghasilkan papan skor Laba & Rugi (Profit & Loss) otomatis.
SPRINT 2: "The Storefront & Ekosistem" (Fokus Publik & Penjualan Tambahan)
Fokus pada eksekusi lapangan dan ekspansi omzet di luar tiket.
•	Ticketing Storefront (B2C Publik): Web penjualan tiket publik.
•	Fair-Play Checkout & Timeout Automation: Batas maksimal 4 tiket, validasi 16 digit NIK wajib (anti-calo), dan booking timeout 15 menit. Jika dalam 15 menit tidak lunas, CRON Job (skrip otomatis) akan mengembalikan tiket yang on-hold ke publik.
•	Automated E-Ticket & Gate Management App: Pengiriman e-tiket berbekal UUID terenkripsi dalam QR Code otomatis via email. Di lapangan, tiket akan divalidasi menggunakan Aplikasi Scanner Offline-First.
•	Merchandise PO & Bundling: Sistem penjualan barang dengan sistem Pre-Order (PO) yang mengunci stok berdasarkan varian (misal ukuran kaos). Terintegrasi sebagai upselling saat pengguna membeli tiket (bundling) atau toko mandiri. Pembeli akan mendapat E-Receipt (QR) untuk pengambilan hari H.
•	Tenant Booking B2B: Dasbor pemilihan peta booth interaktif bagi tenant/penjual makanan, pendaftaran mandiri, kurasi (Approve/Reject) oleh promotor, dan tagihan invoice otomatis yang terintegrasi Payment Gateway.
ROADMAP EKSPANSI (Masa Depan)
•	Vendor Marketplace: Integrasi dengan direktori vendor panggung, suara, dan cahaya dengan sistem lelang Request for Quotation (RFQ) dan pembayaran Secure Escrow.
4. Diagram Skema Alur Pengguna (User Flow Blueprint)
Berikut adalah cetak biru alur untuk menjaga logika sistem tidak melenceng saat diinstruksikan ke AI/Tim Teknis.
A. Skema Alur Promotor (Tenant B2B Inti)
Plaintext
[ LOGIN PROMOTOR ] -> Autentikasi via Email & Password
       |
[ DASHBOARD NEXEVENT ]
       |--> 1. SETUP & PERENCANAAN
       |      |-- Input Profil Event & Kapasitas.
       |      |-- Setup Anggaran: Isi RAB (Itemized/Lump Sum).
       |      |-- Setup Tiket: Pilih Mode Kalkulator -> Generate Harga Dasar -> Atur Kuota per Kategori.
       |      |-- Setup Sponsor: Tentukan Menu Benefit & Ambang Batas (Threshold) Harga Paket.
       |      |-- Output: Cetak PDF RAB.
       |
       |--> 2. OPERASIONAL PELAKSANAAN
       |      |-- "Generate Sponsor Link": Kirim tautan unik via WhatsApp ke brand sasaran.
       |      |-- "Publish B2C Link": Bagikan link web penjualan tiket + merch ke audiens publik.
       |      |-- Buka Tenant Portal: Terima kurasi pendaftaran lapak jualan.
       |      |-- Pantau Kas: Input nota pengeluaran ke Expense Tracker.
       |
       |--> 3. HARI PELAKSANAAN & EVALUASI
              |-- Aplikasi Scanner bekerja membaca QR Code.
              |-- Event Selesai: Sistem menyandingkan Uang Masuk (Sponsor+Tiket+Tenant+Merch) vs Uang Keluar (RAB/Expense) di Automated P&L.
B. Skema Alur Sponsor (B2B Eksternal via Magic Link)
Plaintext
[ TERIMA MAGIC LINK ] -> Pihak brand mengklik URL (app.nexevent.com/sponsor/EVT-XYZ)
       |
[ PITCHING DECK & ETALASE INTERAKTIF ] -> Melihat profil event.
       |
[ PILIH BENEFIT (CART SYSTEM) ]
       |-- Pilih A la Carte: (Logo di Gate, Penyebutan MC, Booth).
       |-- Sistem menghitung total secara Live.
       |-- Gamifikasi Auto-Tagging: Menampilkan "Tambah 3jt lagi untuk jadi Main Sponsor".
       |
[ CHECKOUT & DEAL ]
       |-- Input data perusahaan.
       |-- Sistem me-lock status benefit dan otomatis menghasilkan PDF Invoice.
       |-- Data tagihan masuk ke Dasbor Promotor (Status: Pending Payment).
C. Skema Alur Customer Publik (B2C Tiket & Merch)
Plaintext
[ AKSES LINK STOREFRONT EVENT ] -> Tanpa perlu login akun.
       |
[ PEMILIHAN KATEGORI & ADD-ONS ]
       |-- Pilih Kelas Tiket.
       |-- Checkout Upsell: Tawarkan "Bundling Kaos Eksklusif PO Ukuran L".
       |
[ VALIDASI ANTI-CALO & LOCKING ]
       |-- Input Data Pemesan: NIK 16-Digit (Wajib), Nama, Email.
       |-- Sistem: Maksimal 4 Tiket per NIK.
       |-- SISTEM BACKEND: Row-Level Locking aktif. Memotong kuota tiket sementara & kuota varian merch.
       |
[ PEMBAYARAN GATEWAY ] -> Diberikan batas waktu 15 Menit.
       |      |-- JIKA LEWAT WAKTU: Cron Job membatalkan pesanan, kuota tiket & merch dikembalikan.
       |      |-- JIKA LUNAS: Lanjut ke distribusi.
       |
[ DISTRIBUSI OTOMATIS ]
       |-- Generate Kriptografi UUID QR Code.
       |-- Render PDF E-Ticket (Tiket Masuk) & E-Receipt (Tanda Terima Merch).
       |-- Kirim otomatis via layanan API Email.

