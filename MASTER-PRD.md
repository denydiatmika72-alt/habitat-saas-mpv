nexEvent — Product Requirements Document (Investor Edition)

Music Event Operating System
PRD v4.0 · Juli 2026
Rahasia — Hanya untuk Calon Investor & Mitra Strategis

28+ Modul Backend Live · 136 API Endpoint Aktif · 36 Model Data Produksi


01 — Ringkasan Eksekutif

nexEvent adalah platform SaaS B2B yang berfungsi sebagai "sistem operasi terpadu" bagi promotor musik Indonesia — menyatukan perencanaan anggaran (RAB), akuisisi sponsor, penjualan tiket B2C, penjualan merchandise, dan pelaporan keuangan otomatis dalam satu dashboard.

Sejak konsep awal disusun Juni 2026, produk telah berkembang jauh melampaui MVP: seluruh siklus hidup event — dari perencanaan anggaran hingga pencairan dana pasca-event — kini berjalan end-to-end di production, dipakai oleh promotor pertama, dan sudah melalui tiga lapis audit teknis internal untuk memastikan akurasi dokumentasi terhadap kode yang benar-benar berjalan.


STATUS: LIVE DI PRODUCTION — nexeventapp.tech



Yang membedakan nexEvent: kombinasi RAB Builder + manajemen sponsor otomatis (Magic Link) + ticketing B2C dengan sistem anti-calo terintegrasi + laporan keuangan otomatis dalam satu platform — kombinasi yang belum ada satupun kompetitor lokal menawarkannya secara terpadu.


02 — Masalah yang Diselesaikan

Promotor musik skala kecil-menengah di Indonesia saat ini mengelola satu event dengan 5–7 tools terpisah: Excel untuk RAB, WhatsApp untuk negosiasi sponsor, Loket/Tix.id untuk tiket, dan Google Sheets untuk kas. Tidak ada koneksi antar tools, sehingga data harus diinput ulang di setiap platform, laporan laba/rugi harus dihitung manual setelah event selesai, dan risiko overselling tiket tinggi karena tidak ada sistem locking real-time.

Tiga Celah Pasar Utama


Tidak ada ERP operasional untuk promotor skala kecil-menengah — kompetitor (LOKET, Wukong) fokus di ticketing, bukan manajemen keuangan/RAB.
Tidak ada platform digital untuk manajemen sponsor event musik — proses pitching sponsor di Indonesia masih 100% manual via WhatsApp/pertemuan langsung.
Sistem anti-calo terintegrasi belum ada di pasar — validasi NIK + booking-lock real-time adalah solusi yang belum dikembangkan kompetitor lokal manapun secara terpadu.



03 — Solusi: Platform Terpadu

nexEvent menghubungkan seluruh alur operasional event dalam satu sistem, dengan empat persona pengguna yang saling terhubung:

PersonaPeranAksesPromotor / EOPengendali utama operasional & keuangan eventDashboard penuhSponsor (B2B)Brand yang menjadi sponsor eventMagic Link — tanpa loginPenonton (B2C)Pembeli tiket & merchandise publikStorefront publikField Crew & ScannerTim lapangan (kas harian, validasi tiket venue)Portal mobile khusus


04 — Snapshot Produk: Yang Sudah Live

Berbeda dari draft PRD awal (Juni 2026) yang masih berupa rencana, seluruh modul di bawah ini adalah fitur yang sudah dibangun, diverifikasi, dan berjalan di production nexeventapp.tech per Juli 2026.

A. Perencanaan & Operasional Event


RAB Builder — perencanaan anggaran per kategori & item, auto-hitung dana cadangan, export proposal PDF.
Purchase Order — PO terstruktur dengan impor langsung dari item RAB, status draft/terkirim/lunas, export PDF.
Expense Tracker & Petty Cash — pencatatan pengeluaran promotor + sistem kas lapangan harian untuk Field Crew (top-up → belanja → sisa dikembalikan), dengan pemisahan akuntansi yang ketat agar tidak mencemari laporan laba/rugi.


B. Manajemen Sponsor


Generate kode undangan sponsor per event → sponsor mendaftar via portal publik tanpa perlu akun.
Katalog benefit, paket sponsorship bertingkat, dan invoice otomatis begitu deal disetujui.
Kredensial akun sponsor dikirim otomatis dengan kontrol penuh di tangan promotor (kapan dan lewat kanal apa).


C. Ticketing & Storefront B2C


Storefront publik per event (nexeventapp.tech/event/[slug]) — banner, deskripsi, fasilitas, tiket, merchandise, dan paket bundling dalam satu halaman checkout.
Sistem anti-calo: validasi NIK 16-digit dengan verifikasi tanggal lahir yang valid secara kalender (bukan sekadar cek format), limit maksimal 4 tiket per NIK per event, dihitung kumulatif lintas semua kanal penjualan.
Booking lock 15 menit dengan pelepasan otomatis (CRON job) mencegah overselling.
Ticket Box Offline — kanal penjualan tunai/transfer di lokasi fisik untuk pasar yang belum siap online-only, tetap tercatat penuh di sistem (bukan di luar buku).
E-tiket QR terenkripsi dikirim otomatis via email, dapat divalidasi lewat aplikasi Scanner berbasis web saat masuk venue.


D. Monetisasi & Model Fee


Fee platform bertingkat (3.5% standar → 2% volume besar → 1.5% kartu truf khusus), dipecah per jenis transaksi (tiket/merchandise/bundling), dapat ditanggung penonton atau promotor sesuai pilihan sebelum storefront live.
Pajak opsional 10% per event, dihitung transparan hanya dari komponen tiket.
Sistem rekonsiliasi hutang fee untuk transaksi tunai yang tidak melalui payment gateway.


E. Keuangan & Pelaporan


Laporan Laba/Rugi otomatis — menggabungkan pendapatan tiket/merchandise, sponsor, dan pemasukan lain, dikurangi seluruh biaya, real-time tanpa hitung manual.
Payout / Pencairan Dana — promotor dapat menarik hasil penjualan kapan saja, dengan pelunasan hutang fee otomatis terintegrasi ke dalam alur pencairan.
Laporan Pendapatan Platform (internal nexEvent) untuk memantau revenue perusahaan per sumber dan per promotor.
Data Audiens — laporan demografis pembeli tiket (usia & gender diturunkan otomatis dari NIK) yang dapat diunduh promotor sebagai materi kredibel untuk pitching ke sponsor berikutnya.
Laporan Akhir Event — ringkasan menyeluruh (keuangan, sponsor, tiket, audiens) dikirim otomatis via email begitu promotor menandai event selesai.



05 — Model Bisnis & Monetisasi

TierHargaCakupanStarterGratisRAB Builder + export PDF, 1 event aktifPro Per-EventRp 499.000Semua fitur, 1 event, aktif 90 hariPerpanjangan ProRp 99.000+30 hari, dapat diperpanjang berkali-kali

Sumber Revenue kedua — Fee Transaksi: nexEvent mengambil fee 1.5–3.5% dari setiap transaksi tiket/merchandise/bundling yang terjadi di platform, terlepas dari status langganan Pro promotor. Model dual-revenue ini (langganan + transaction fee) memberi kombinasi pendapatan berulang yang dapat diprediksi (Pro subscription) dan pendapatan yang tumbuh seiring skala transaksi platform (fee).


06 — Estimasi Ukuran Pasar

LevelDefinisiEstimasiTAMPasar tiket event Indonesia 2025–2028 (proyeksi Statista, USD ~460 jt di 2028)~Rp 7,1 TriliunSAMSegmen promotor musik kecil–menengah yang belum terdigitalisasi penuh (~10% TAM)~Rp 600 MiliarSOMTarget realistis tahun 1–2 (~100 promotor aktif × Rp 5 jt/tahun)~Rp 6 Miliar


07 — Lanskap Kompetitif

PlatformRABSponsorTicketingP&L OtomatisAnti-CalonexEvent (kami)YaYaYaYaYa, terintegrasiLOKET.com (GoTo)TidakTidakYaTidakTidakWukong.co.idTidakTidakYaParsialTidakEventbriteTidakParsialYaTidakTidak

nexEvent adalah satu-satunya platform di pasar Indonesia yang menggabungkan kelima kapabilitas ini dalam satu produk terpadu — kompetitor eksisting seluruhnya berhenti di ticketing murni.


08 — Kematangan Teknis & Kualitas Engineering

Produk dibangun dengan disiplin dokumentasi dan verifikasi yang ketat, relevan untuk due diligence teknis calon investor:


Seluruh fitur finansial (payout, fee platform, pajak, hutang fee) melalui proses verifikasi ulang dan koreksi eksplisit berbasis keputusan founder, dengan jejak audit terdokumentasi.
Setiap perubahan pada sistem checkout, pembayaran, dan pencairan dana diverifikasi end-to-end terhadap database produksi sebelum dan sesudah deploy, dengan protokol rollback yang jelas.
Dokumentasi teknis internal (CLAUDE.md + log 60+ entri histori perbaikan) telah melalui tiga lapis audit independen — memastikan seluruh dokumentasi status fitur akurat 1:1 terhadap kode yang benar-benar berjalan di production, bukan sekadar rencana.
Arsitektur: Next.js 16 (frontend) + Express 5 (backend) + PostgreSQL via Supabase + Prisma ORM, dideploy di Vercel (frontend) dan VPS terkelola (backend) dengan protokol deploy terverifikasi (SHA-check sebelum & sesudah setiap rilis).



09 — Roadmap & Kebutuhan Investasi

Prioritas Segera


Migrasi Midtrans ke mode Production (saat ini masih Sandbox, menunggu proses KYC) — syarat mutlak sebelum penerimaan pembayaran nyata dari publik.
Penyelesaian fitur operasional lanjutan: edit & pindah stok tiket antar kategori.
Evaluasi kelanjutan fitur Tenant/Lapak Booth Booking (B2B) yang ada di rencana awal namun belum dieksekusi.


Visi Jangka Menengah


Ekspansi Growth Plan (paket langganan multi-event, saat ini ditunda untuk MVP).
Migrasi ke aplikasi mobile native (App Store / Play Store) — prioritas terendah, dieksekusi setelah seluruh fitur web matang dan produk siap go-to-market penuh.
Perluasan basis promotor dari 100 pengguna aktif tahun pertama menuju skala SAM (~Rp 600 Miliar).



10 — Mengapa Sekarang

Kasus calo tiket konser besar di Indonesia (mis. kontroversi tiket Coldplay 2023) menunjukkan urgensi nyata pasar terhadap sistem anti-calo yang kredibel — sesuatu yang nexEvent sudah bangun dan jalankan di production, bukan sekadar janji roadmap. Kombinasi kesiapan teknis, kejelasan model monetisasi dual-stream, dan celah pasar yang belum terisi kompetitor manapun menjadikan momentum ini tepat untuk mempercepat akuisisi promotor dan menyelesaikan proses menuju status pembayaran production penuh.


nexEvent SaaS — Dokumen Rahasia | PRD v4.0 Investor Edition | Juli 2026