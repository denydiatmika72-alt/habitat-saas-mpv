# nexEvent SaaS — CLAUDE.md

## Ringkasan Project

Platform SaaS untuk manajemen event musik. Stack: **Next.js 15** (client, port 3000) + **Express 5** (server, port 5000) + **PostgreSQL via Supabase** + **Prisma ORM**.

## Struktur

```
nexevent-saas/
├── client/          # Next.js frontend
│   └── src/app/
│       ├── dashboard/         # Halaman promotor
│       ├── sponsor-portal/    # Portal sponsor (public)
│       └── api/[...proxy]/    # Proxy → backend Express
├── server/          # Express backend
│   ├── src/
│   │   ├── index.js            # Entry point (port 5000)
│   │   ├── lib/prisma.js       # Prisma client (pakai adapter-pg)
│   │   └── middleware/auth.middleware.js  # Export: protect & verifyToken (alias)
│   ├── controllers/
│   ├── routes/
│   └── prisma/schema.prisma
└── docs/
    └── known-bugs.md   # Log bug & solusi — WAJIB dicek sebelum debugging baru
```

## Konfigurasi Dev

- **Client**: `client/.env.local` → `BACKEND_URL=http://localhost:5000`
- **Server**: `server/.env` → DATABASE_URL ke Supabase, PORT=5000
- **Proxy API**: Semua call `/api/xxx` dari client di-forward ke `localhost:5000/api/xxx`

## Penting: Auth Middleware

File: `server/src/middleware/auth.middleware.js`
Export: `{ protect, verifyToken: protect }` — kedua nama adalah alias.
Semua route file import `{ verifyToken }`.

## Prisma

- Gunakan `PrismaPg` adapter (bukan engine bawaan Prisma)
- Semua controller gunakan: `const prisma = require('../src/lib/prisma')`
- **Jangan buat `new PrismaClient()` langsung di controller**
- Migration: **selalu gunakan `npx prisma db push`** (bukan `prisma migrate dev` — project tidak punya migration history, akan error drift detection)
- Setelah `db push`, wajib jalankan `npx prisma generate` di VPS

## Fitur Utama

- **Events & RAB**: Buat event, kelola anggaran (RAB)
- **Sponsor Management**: Generate invite code → sponsor daftar di portal → buat deal
- **Invoice**: Generate invoice PDF dari deal sponsor, update status (Belum Dibayar / DP Terbayar / Lunas)
- **Document Table** (`/dashboard`): Tab "Invoice" menampilkan **semua invoice langsung** (bukan filter per event), karena deal historis punya `eventId = null`
- **Plan/Tier System**: Field `plan` di tabel `users`. Values: `"starter"` (default) atau `"pro"`. Hook `useUser.ts` expose `{ user, loading, isPro }` untuk feature gating di frontend. `user_plan` disimpan di localStorage setelah login.

## Alur: Invite Code → Deal → Invoice → Document Table

1. Promotor generate kode di `/dashboard/sponsor` (pilih event dulu)
2. Kode disimpan dengan `eventId` di tabel `invite_codes`
3. Sponsor validasi kode di `/sponsor-portal` → response mengandung `eventId`
4. Sponsor submit form → deal dibuat dengan `eventId`
5. Promotor generate invoice dari deal
6. Document Table tab "Invoice": GET `/api/invoices` → tampilkan semua invoice langsung sebagai baris terpisah (bukan filter event). Kolom: sponsor, tanggal, nomor invoice, nilai, status dropdown, aksi PDF+WA.

## Document Table (`document-table.tsx`)

- Tab "Invoice": render `allInvoices` state langsung (bukan event rows)
- Tab "Semua"/"RAB": render event rows dengan RAB budget info
- `invoiceStatusBadge(status)`: "Lunas" → emerald, "DP Terbayar" → blue, default → amber
- Status dropdown di baris invoice: PATCH `/api/invoices/:id/status`
- PDF download: GET `/api/pdf?path=${pdfUrl}`

## Invoice Model

- Prisma model name: `sponsorInvoice` (bukan `invoice`)
- Valid status values: `"Belum Dibayar"`, `"DP Terbayar"`, `"Lunas"`
- Field `paidAt` diisi otomatis saat status → "Lunas"

## Known Bugs & Fixes

Lihat **`docs/known-bugs.md`** untuk daftar lengkap bug yang sudah pernah terjadi beserta solusinya.

**WAJIB diikuti Claude Code di setiap sesi debugging:**
1. **Sebelum mulai debugging** apapun, cek dulu `docs/known-bugs.md` — kalau gejala mirip dengan entry yang sudah ada, coba solusi tersebut dulu sebelum analisis dari nol.
2. **Setelah fix berhasil diverifikasi**, tambahkan entry baru ke `docs/known-bugs.md` mengikuti format yang sudah ada di file tersebut. Jangan skip langkah ini meskipun bug terasa kecil — tujuannya supaya bug yang sama tidak dianalisis ulang dari nol di masa depan.

## Deployment

- Backend deploy via: `cd /var/www/nexevent/server && bash deploy.sh`
- Frontend deploy: otomatis via Vercel setiap git push
- Jangan pakai Render — sudah tidak aktif, backend di Hostinger VPS
- **Urutan wajib deploy**: `git push` → verifikasi commit SHA di GitHub → baru jalankan `deploy.sh` di VPS (hindari race condition)

## Akses VPS

- **SSH command**: `ssh root@145.79.12.170`
- **Akses**: passwordless via SSH key (sudah di-setup di PC rumah — tidak perlu password)
- **User**: `root`
- **Path project backend**: `/var/www/nexevent/server`
- **Process manager**: PM2 — restart backend dengan `pm2 restart nexevent-api`
- **Cek log real-time**: `pm2 logs nexevent-api`

### Batasan otonom Claude Code di VPS

**Boleh dilakukan sendiri (tanpa konfirmasi):**
- `git pull` untuk sync kode terbaru
- `npm install` untuk install dependencies baru
- `npx prisma generate` untuk regenerate Prisma client
- `npx prisma db push` untuk apply schema changes
- `pm2 restart nexevent-api` untuk restart backend
- `pm2 logs nexevent-api` untuk cek log error

**Wajib konfirmasi ke Mandor dulu sebelum dilakukan:**
- Modifikasi file konfigurasi Nginx
- Perubahan apapun yang menyentuh port atau firewall
- Menghapus file atau folder di VPS
- Operasi database langsung (DROP, DELETE tanpa WHERE, ALTER TABLE manual)
- Install package system-level (apt install, dll)

## Infrastruktur Production

- Frontend: https://nexeventapp.tech (Vercel)
- Backend: http://145.79.12.170:3001 (Hostinger VPS, PM2)
- Nginx: port 3001 → proxy ke Express port 5000
- Docker okupasi port 80 dan 8080 — jangan pakai port ini untuk Nginx
- Database: Supabase PostgreSQL

## Email

- Provider: Resend v6
- Domain `nexeventapp.tech` sudah diverifikasi di Resend (per 2026-07-02) — email bisa deliver ke alamat eksternal mana pun, bukan cuma email owner akun Resend
- Sender: `nexEvent <noreply@nexeventapp.tech>` — semua fungsi kirim email di `server/services/email.service.js` pakai sender ini
- Jangan pakai `onboarding@resend.dev` lagi (sender testing lama, sudah tidak dipakai)

## PDF Generation

- Library: `pdfkit` v0.19.1
- Dipakai untuk: Invoice PDF dan PO (Purchase Order) PDF

## Database Connection (SSL)

- Koneksi ke Supabase via PrismaPg adapter wajib pakai opsi `ssl: { rejectUnauthorized: false }`
- Tanpa opsi ini, koneksi akan gagal (lihat known-bugs.md untuk histori)

## Petty Cash System — Aturan Akuntansi (WAJIB DIBACA SEBELUM CODING)

### Konteks
Petty Cash adalah sistem kas lapangan harian untuk Field Crew.
Promotor top-up kas ke crew → crew belanja di lapangan → sisa dikembalikan ke promotor.
Siklus ini berulang setiap hari event berlangsung.

### 3 Jenis Transaksi (WAJIB DIBEDAKAN)

| Type | Arah | Deskripsi | Masuk P&L? |
|------|------|-----------|------------|
| `"topup"` | Promotor → Crew | Promotor kasih uang kas ke crew | ❌ TIDAK — mutasi internal |
| `"expense"` | Crew → Vendor/Kebutuhan | Crew belanja/bayar sesuatu | ✅ YA — biaya nyata event |
| `"return"` | Crew → Promotor | Crew kembalikan sisa kas | ❌ TIDAK — mutasi internal |

### Aturan Kritis

1. **P&L Report HANYA boleh menghitung transaksi `type: "expense"`**
   - Jangan pakai `direction: "out"` sebagai filter — tidak cukup
   - `"topup"` dan `"return"` sama-sama ada `direction` tapi BUKAN biaya

2. **Saldo crew dihitung sebagai:**
   ```
   Saldo Crew = total topup - total expense - total return
   ```

3. **Kas utama promotor dihitung sebagai:**
   ```
   Kas Promotor = pemasukan event - total topup + total return
   ```
   (topup mengurangi kas promotor, return menambah kas promotor kembali)

4. **JANGAN campur tabel `expenses` dengan petty cash**
   - Tabel `expenses`: pengeluaran resmi event yang diinput promotor langsung
   - Tabel `petty_cash_transactions`: semua transaksi kas lapangan crew
   - P&L Report menggabungkan keduanya, tapi dari tabel yang berbeda

5. **PEMASUKAN P&L Report = 3 sumber TERPISAH (deployed 2026-07-11, commit `edca24d`)**
   - **Tiket & Merchandise (nexEvent)**: `SUM(TicketOrder.totalAmount - feeAmount)` untuk order `status:"paid"` di event tsb (net setelah fee platform — pola SAMA dgn `payout.getAvailableBalance`). SEBELUM fix ini, revenue tiket nexEvent TIDAK ikut di P&L sama sekali (bug kritis — laba tampil terlalu kecil).
   - **Sponsor Deal**: hanya deal `Disetujui` dengan invoice `DP Terbayar`/`Lunas`.
   - **Pemasukan Lain** (`OtherIncome`): berkategori `merchandise` / `donasi` / `tiket_platform_lain` (+ field `platform`, mis. LOKET/Tix.id) / `lainnya`. Record lama tanpa kategori diperlakukan `lainnya`.
   - **ANTI DOUBLE-COUNT**: "Tiket & Merchandise (nexEvent)" (dari `TicketOrder`, otomatis) vs "Tiket Platform Lain" (entri `OtherIncome`, input manual platform eksternal) adalah DUA sumber BERBEDA — jangan pernah dijumlahkan jadi satu / dianggap sama.

### Arsitektur Tabel yang Direncanakan

```
petty_cash_accounts
  id, eventId, userId (crew), role (nama divisi: "Produksi", "Operasional", dll)
  balance (saldo saat ini — derived, bisa dihitung dari transactions)
  createdAt

petty_cash_transactions
  id, accountId (FK ke petty_cash_accounts)
  type: "topup" | "expense" | "return"  ← FIELD PALING KRITIS
  amount, description, category?
  createdAt, createdBy (userId — promotor atau crew)
```

### Field Crew Role System

- Field Crew adalah user nexEvent dengan role berbeda dari Promotor
- Promotor invite crew ke event dengan menyebut divisi mereka
- Contoh divisi: "Produksi", "Operasional", "Talent", "Logistik", "Security"
- Satu event bisa punya banyak crew dari divisi berbeda
- Crew hanya bisa lihat event yang mereka di-assign
- UI crew: mobile-only, super simpel — hanya 2 fungsi:
  1. Catat pengeluaran (type: `"expense"`)
  2. Catat pengembalian sisa (type: `"return"`)
- Top-up (type: `"topup"`) HANYA bisa dilakukan oleh Promotor dari dashboard

### Yang BELUM dibangun (jangan implementasi dulu tanpa instruksi)
- Tabel `petty_cash_accounts` dan `petty_cash_transactions`
- UI mobile untuk Field Crew
- Sistem invite crew ke event
- Integrasi petty cash ke P&L Report

## Pricing & Subscription Model

### Tier Structure
- **Starter** (Gratis): RAB Builder + Export RAB PDF only. 1 event aktif.
- **Pro Per-Event** (Rp 499.000): Semua fitur, 1 event, aktif 90 hari sejak bayar.
- **Perpanjangan** (Rp 99.000): Tambah +30 hari per perpanjangan.
- Growth Plan: DITUNDA — belum diluncurkan untuk MVP.

### Aturan Pro Per-Event
- 1 lisensi Pro = 1 event spesifik yang dipilih saat checkout
- Setelah 90 hari: fitur dikunci otomatis (CRON job harian)
- Data tetap tersimpan setelah expired — tidak pernah dihapus
- Perpanjangan bisa dilakukan berkali-kali selama dibutuhkan
- Notifikasi H-7 sebelum expired dikirim via email ke promotor

### Event Lifecycle
1. Promotor beli Pro → pilih event → akses 90 hari aktif
2. H-7 expired → email notifikasi otomatis
3. Expired → fitur dikunci, data tetap ada, bisa perpanjang
4. Promotor klik "Tandai Event Selesai" (manual) →
   sistem generate Event Summary Report → kirim via email

### Event Summary Report (dikirim saat event selesai)
Isi laporan:
- Ringkasan keuangan: pemasukan, pengeluaran, laba bersih
- Daftar sponsor + status bayar (Lunas/DP Terbayar)
- Ringkasan pengeluaran (promotor + crew lapangan)
- Status deliverables sponsor
- Data penjualan tiket per kategori + platform

### Ticket Sales Manual Input
Field: nama kategori, harga, jumlah terjual, platform
Platform dropdown (untuk riset internal nexEvent):
LOKET, Tix.id, BookMyShow, Dewatiket, Artatix, Goers,
Eratix, Snaptix, TipTip, Eventbrite,
Tiket Offline, WhatsApp/DM, Transfer Manual,
nexEvent Ticketing, Platform Lain (input manual)
Data platform disimpan di DB untuk analytics internal.

### Midtrans Integration
- Digunakan UNTUK: pembayaran upgrade Pro (Rp 499.000) + perpanjangan (Rp 99.000)
- TIDAK digunakan untuk: pembayaran sponsor (transfer manual langsung ke promotor)
- Mode: Sandbox dulu → Production setelah verified
- Sandbox credentials tersimpan di server/.env (JANGAN di-commit ke GitHub)
- Merchant ID: M908488969 (Sandbox)
- Setelah bayar → webhook update user.plan = "pro" + set proExpiresAt

### Fields yang perlu ditambah ke schema users
- proEventId: String? — event yang dilindungi lisensi Pro
- proExpiresAt: DateTime? — tanggal expired lisensi Pro
- proStartedAt: DateTime? — tanggal aktivasi Pro

## Storefront Ticketing — Keputusan & Pending Features

### Yang Sudah Live
- Public storefront: nexeventapp.tech/event/[slug] (tanpa login pembeli)
- Anti-calo: max 4 tiket per NIK per event (dihitung kumulatif, bukan per transaksi)
- Timeout booking: 15 menit, CRON job release expired orders setiap menit
- E-ticket: QR code dikirim via email (Resend) + tombol bagikan ke WhatsApp
- Approval flow: Draft → Pending Approval → Admin Approve/Reject → Live

### Pending — Harus Dikerjakan Sebelum Customer Pertama

#### 1. Fee Platform — KEPUTUSAN FINAL (Belum Diimplementasi)

**Struktur Fee:**
- Default/Standar: 3.5% per transaksi tiket
- Negosiasi promotor besar: 2%
- Minimum absolut (case khusus early adopter/volume sangat besar): 1.5%
- Diatur oleh Admin nexEvent per promotor di Admin Panel
- Promotor TIDAK bisa ubah besaran fee — hanya bisa pilih siapa yang menanggung

**Siapa yang Menanggung Fee:**
- Promotor WAJIB memilih sebelum storefront bisa diajukan ke admin untuk approval
- Tidak ada default — pilihan harus eksplisit
- Pilihan A: Fee ditanggung PENONTON → harga tiket + fee ditampilkan transparan di storefront
  Contoh: tiket Rp 50.000 + fee Rp 1.750 = total Rp 51.750
- Pilihan B: Fee ditanggung PROMOTOR → pembeli bayar harga bersih, promotor terima hasil dikurangi fee
  Contoh: tiket Rp 50.000, promotor terima Rp 48.250

**Alur Wajib Sebelum Storefront Live:**
1. Promotor buat event + jenis tiket
2. Promotor WAJIB pilih: siapa yang bayar fee (tidak bisa skip)
3. Baru bisa klik "Ajukan Persetujuan ke Admin"
4. Admin review + set fee % untuk promotor ini + approve
5. Storefront live

**Aturan Bisnis:**
- Agent nexEvent saat pitching: mulai dari 3.5%, turun ke 2% untuk volume besar, 1.5% hanya untuk case sangat khusus
- Fee 1.5% adalah kartu truf — jangan jadikan harga normal
- Setiap transaksi tiket WAJIB catat: harga tiket, fee amount, fee bearer (penonton/promotor) terpisah di database
- Fee nexEvent TIDAK boleh dicampur dengan revenue promotor di laporan keuangan
- P&L Report promotor: pendapatan tiket ditampilkan SETELAH dipotong fee platform (jika fee ditanggung promotor)

**Fields yang perlu ditambah ke database (belum diimplementasi):**
- Event model: feeBearer String? — "audience" atau "promotor" (wajib diisi sebelum approval)
- Event model: platformFeePercent Float? — fee % khusus untuk event ini (diset admin saat approve)
- TicketOrder model: feeAmount Int — nominal fee yang dikumpulkan nexEvent per transaksi
- TicketOrder model: feeBearer String — siapa yang menanggung fee di transaksi ini

**Catatan Implementasi:**
- Fee platform BELUM aktif — semua transaksi saat ini tidak kena fee
- Jangan implementasi fee sampai seluruh flow di atas siap (pilihan promotor + admin set fee % + kalkulasi di checkout)
- Storefront yang sudah approved perlu direview ulang setelah fee diaktifkan

#### 2. Pajak 10% (Opsional per Event)
- Promotor bisa aktifkan opsi pajak 10% per event
- Jika diaktifkan: pajak ditanggung pembeli (ditambahkan ke total)
- Tampil transparan di halaman storefront: "Harga sudah termasuk pajak 10%"
- Butuh field baru di Event: taxEnabled Boolean @default(false)
- Kalkulasi: totalAmount = subtotal + (subtotal * 0.1) if taxEnabled

#### 3. Toggle Aktif/Nonaktif Jenis Tiket
- Tombol teks "Aktifkan/Nonaktifkan" diganti dengan Toggle switch
- Status aktif = hijau, nonaktif = abu-abu
- Lebih intuitif untuk promotor yang kelola banyak jenis tiket

#### 4. UI Storefront Publik (WAJIB DIPERBAIKI)
- Halaman /event/[slug] terlalu polos — ini wajah utama nexEvent ke audience
- Promotor WAJIB bisa upload: banner event (hero image) + logo event
- Banner tampil sebagai hero section di atas halaman storefront
- Logo tampil di header/card event
- Butuh field baru di Event: bannerUrl String?, logoUrl String?
- Upload via Supabase Storage (sudah ada di stack)
- Desain ulang: tambah warna, tipografi lebih bold, card tiket lebih menarik

#### 5. Merchandise + Bundling (SPRINT TERPISAH — Jangan gabung sekarang)
- Storefront akan support penjualan merchandise + tiket dalam satu checkout
- Bisa buat bundling: "Tiket Regular + T-Shirt = Rp 150.000"
- Ini fitur besar — butuh schema baru (MerchItem, Bundle) dan UI terpisah
- JANGAN dikerjakan sampai storefront dasar sudah stabil

### Aturan Baru untuk Storefront
- Setiap transaksi tiket WAJIB mencatat: harga tiket, fee platform, pajak (jika ada)
  terpisah di database — untuk keperluan laporan keuangan yang akurat
- Fee platform yang masuk ke nexEvent TIDAK boleh dicampur dengan revenue promotor
- P&L Report promotor: tampilkan pendapatan tiket SETELAH dipotong fee platform
- Agent nexEvent WAJIB jelaskan fee kepada promotor saat pitching dengan contoh angka nyata sebelum event dibuat
- Promotor yang tidak memahami struktur fee tidak boleh disetujui storefrontnya

### Fields yang Perlu Ditambah ke Event Model (Belum Diimplementasi)
- taxEnabled: Boolean @default(false) — opsi pajak 10%
- bannerUrl: String? — banner/hero image storefront
- logoUrl: String? — logo event di storefront
- platformFeePercent: Float? — fee platform khusus untuk event ini (override default)

## Storefront Feature Roadmap (Urutan Pengerjaan)

Fitur-fitur berikut wajib diselesaikan untuk kesiapan penuh nexEvent.
Dikerjakan SATU PER SATU sesuai urutan (ada ketergantungan teknis antar fitur).
Prinsip: selesai tuntas per fitur, bukan banyak yang setengah jadi.

### 1. Bundling Paket Kurasi (✅ SELESAI — code-complete, pending deploy + E2E)
Promotor buat paket khusus, contoh: "Tiket VIP + Kaos = Rp 200.000".

Keputusan final:
- Harga: promotor input harga TOTAL paket langsung (bukan sistem hitung diskon)
- Isi paket: fleksibel — kombinasi bebas (1 tiket + 1 baju, 2 baju + 1 tiket, dll)
- Stok paket: MENGAMBIL dari stok tiket & merch yang sudah ada (bukan kuota terpisah)
  → saat paket terjual, stok tiket DAN stok merch yang jadi isinya ikut berkurang
  → sistem harus cek ketersediaan SEMUA item dalam paket sebelum izinkan beli
- NIK limit: paket yang mengandung tiket TETAP kena aturan max 4 tiket per NIK
- Fee: pakai bundlingFeePercent (sudah diimplementasi)

PENTING — Ubah perilaku checkout saat ini:
- SEKARANG: beli tiket + merch bersamaan otomatis dianggap "bundling"
- HARUS DIUBAH: beli tiket + merch biasa TETAP TERPISAH (fee tiket untuk tiket, 
  fee merch untuk merch) — BUKAN otomatis bundling
- "Bundling" HANYA berlaku untuk paket kurasi yang sengaja dibuat promotor

### 2. Edit Stok + Pindah Stok Antar Jenis Tiket
Fitur operasional untuk promotor mengelola stok setelah storefront live.

Keputusan final:
- Syarat bisa edit stok: storefront sudah approved DAN fee sudah diset admin
- Edit stok merch: sudah ada (updateVariantStock) — verifikasi UI-nya
- Edit stok tiket: cek apakah UI sudah ada, kalau belum → bangun
- Pindah stok antar jenis tiket: contoh geser sisa Early Bird → Presale 1
  → TIDAK ada pembatasan jumlah pindah — hak & tanggung jawab promotor
- Format number di SEMUA input harga: auto pemisah ribuan (ketik 200000 → 200.000)
  → berlaku untuk harga tiket, merch, bundling, top-up petty cash, dll
- SATU-SATUNYA batas teknis: stok tidak boleh diset di bawah jumlah yang SUDAH TERJUAL
  (bukan aturan kebijakan, tapi perlindungan agar tiket terjual tidak hilang)

### 3. Box Office Offline (Ticket Box) (✅ SELESAI v1 — code-complete, pending deploy + E2E)
UI khusus penjualan tiket offline di lokasi fisik.

Konteks pasar: Bali & komunitas belum siap online-only. Cash masih dominan.
Pendekatan: cash TETAP masuk sistem (bukan cashless-only).

Keputusan final:
- Promotor generate QR/barcode unik per event untuk box office
- Panitia di lokasi scan QR → pembeli isi data via HP sendiri
- Penanda metode bayar: CASH atau TRANSFER (wajib dicatat)
- Metode bayar ini jadi DASAR perhitungan hutang fee promotor ke nexEvent
- Butuh UI baru khusus transaksi offline + ticket box

### 4. Sistem Hutang Fee (Rekonsiliasi)
Bergantung pada Box Office Offline (#3) — kerjakan setelah #3 selesai.

Konteks: transaksi cash tidak lewat Midtrans, jadi fee tidak terpotong otomatis.
Solusi: fee dari transaksi cash dicatat sebagai PIUTANG nexEvent ke promotor.

Keputusan final:
- Setiap tiket offline bertanda "cash" → fee tercatat sebagai hutang promotor
- Butuh dashboard rekonsiliasi: total fee terhutang per promotor
- Mekanisme penekan promotor nakal: BELUM DIPUTUSKAN
  (opsi: blokir buka event baru sampai lunas, ATAU deposit di muka)

### 5. Scanner Tiket (Validasi di Venue) — DETAIL BELUM DIBAHAS
Validasi QR tiket saat penukaran/masuk venue.

Status: dicatat sebagai roadmap, detail dibahas nanti saat gilirannya.
Fondasi SUDAH ADA:
- Setiap Ticket punya ticketCode unik
- Setiap Ticket punya field isUsed (Boolean) + usedAt
Yang BELUM diputuskan:
- Akses scanner: link bebas (siapapun panitia bisa scan) VS akun petugas khusus
- Idealnya web-based (buka kamera HP → scan → validasi real-time, tanpa install app)

## Payout & Laporan Keuangan Roadmap (Urutan Pengerjaan)

> ✅✅ **ROADMAP SELESAI SEPENUHNYA (item #1–#5) — IMPLEMENTED, VERIFIED, DEPLOYED KE PRODUCTION per 2026-07-10.**
> Deploy final (Data Audiens #5 + koreksi dashboard per-tiket) di commit `21a125a`, VPS HEAD terverifikasi,
> smoke test endpoint 401-not-404 lolos, PM2 online stabil, Vercel production READY. Lihat entry milestone
> di `docs/known-bugs.md` [2026-07-10] untuk ringkasan konsolidasi + referensi histori tiap item.

Rangkaian fitur keuangan lanjutan: pencairan dana promotor + laporan keuangan
untuk promotor dan admin. Dikerjakan SATU PER SATU sesuai urutan di bawah
(ada ketergantungan data & logic antar fitur). Prinsip sama: selesai tuntas per
fitur, bukan banyak yang setengah jadi.

### 1. Payout / Pencairan Dana (✅ SELESAI — deployed + tested by founder)
Promotor menarik hasil penjualan ke rekening bank sendiri, dicairkan manual oleh admin.

Keputusan final:
- Promotor bisa ajukan pencairan dana kapan saja — TIDAK perlu menunggu event selesai
- Saldo cair = total penjualan (tiket + merchandise + bundling) + pajak 10% (jika ada) − fee platform
- Pajak 10% tetap menjadi hak promotor sepenuhnya — hanya fee platform yang jadi hak nexEvent
- Wajib approval admin dulu sebelum pencairan dianggap sah
- Transfer dilakukan MANUAL oleh admin lewat aplikasi bank sendiri — BUKAN otomatis lewat
  Midtrans Iris/Disbursement API. Keputusan MVP demi kesederhanaan: Iris API butuh
  verifikasi bisnis terpisah dari Snap yang sudah dipakai
- Setelah transfer manual selesai, admin menandai status "Sudah Ditransfer" di sistem
- Data rekening bank promotor: REUSE field yang sudah ada di model PromoterSettings
  (bankName/bankAccount/accountHolder) — field yang sama dipakai untuk "Transfer Ke" di
  invoice PDF sponsor. Tidak ada duplikasi field.

Status: sudah di-deploy ke production dan sudah dites langsung oleh founder (approve +
tandai transfer berhasil). Perlu verifikasi ulang status endpoint di sesi berikutnya untuk
memastikan seluruh rute API aktif di production.

### 2. Potong Otomatis Hutang Fee saat Pencairan (✅ SELESAI — deployed, commit 101a175)
Integrasi payout dengan Sistem Hutang Fee (Rekonsiliasi) — lihat Storefront Roadmap #4.

Keputusan final:
- Saat promotor ajukan pencairan, sistem WAJIB cek dulu apakah promotor punya hutang fee
  cash yang belum lunas (dari Fee Debt Reconciliation)
- Jika saldo pencairan CUKUP menutup hutang: potong otomatis dari nominal pencairan, hutang
  langsung ditandai lunas (`feeSettled: true`) — promotor TIDAK perlu transfer manual
  terpisah ke nexEvent untuk melunasi hutangnya
- Jika saldo pencairan TIDAK CUKUP menutup hutang: pencairan DITOLAK SELURUHNYA (bukan
  dipotong sebagian) — sistem tampilkan notifikasi jelas alasan penolakan, dilampiri rincian
  data pendapatan promotor supaya mereka paham kenapa ditolak
- Ini mengubah alur `requestPayout` yang sudah ada di payout.controller.js — perlu
  terintegrasi dengan fee-debt.controller.js yang sudah ada

### 3. Laporan Pencairan (Payout Statement) — download promotor (✅ SELESAI — deployed, commit 101a175)
Bukti resmi pencairan yang bisa diunduh promotor setelah transfer selesai.

Keputusan final:
- Setelah pencairan disetujui admin dan ditandai "Sudah Ditransfer", promotor bisa download
  1 file laporan (PDF) berisi:
  - Rincian penjualan LENGKAP — mencakup tiket, merchandise, DAN bundling (bukan tiket saja)
  - Sisa saldo yang masih bisa ditarik (jika tidak ditarik semua sekaligus)
  - Sisa hutang fee (jika masih ada yang belum lunas setelah potongan otomatis di item #2)
- Gunakan library pdfkit yang sudah dipakai untuk Invoice PDF dan PO PDF (lihat section
  "PDF Generation")

### 4. Laporan Pendapatan Platform — untuk Admin (✅ SELESAI — deployed 2026-07-09, commit e81b4fb)
Laporan revenue nexEvent dari seluruh sumber fee + langganan Pro.

Keputusan final:
- Bisa pilih periode: per bulan (default) ATAU rentang tanggal bebas (custom date range)
- Rincian sumber fee dipecah per jenis: fee tiket online, fee tiket cash (Ticket Box
  Offline), fee merchandise, fee bundling, DAN pendapatan langganan Pro (Rp 499.000
  aktivasi + Rp 99.000 perpanjangan)
- Angka final yang ditampilkan = fee yang BENAR-BENAR sudah masuk ke rekening nexEvent
  (fee online otomatis lewat Midtrans + fee cash yang hutangnya SUDAH ditandai lunas +
  pendapatan Pro) — BUKAN fee yang masih tercatat tapi belum diterima
- Bisa dilihat per promotor (breakdown individual), tidak hanya total gabungan
- Tampilkan juga total hutang fee KESELURUHAN (semua promotor digabung) DAN rincian hutang
  PER promotor — reuse data dari Fee Debt Reconciliation yang sudah ada

### 5. Data Audiens / Pembeli Tiket — untuk Promotor (✅ SELESAI — deployed 2026-07-10, commit 21a125a) — ITEM TERAKHIR, ROADMAP INI SELESAI SEMUA
Data demografis pembeli untuk bantu promotor pitching ke sponsor.

Keputusan final:
- TIDAK perlu ubah form pembelian tiket yang sudah ada — umur & gender pembeli dihitung
  otomatis dari NIK 16-digit yang sudah wajib diisi saat beli tiket (struktur NIK Indonesia:
  digit ke-7–12 adalah tanggal lahir, dengan penambahan 40 pada digit tanggal untuk menandai
  gender perempuan)
- Promotor klik satu tombol "Download Data Audience" → hasilkan SATU file PDF gabungan berisi:
  1. Dashboard/grafik visual (sebaran umur, perbandingan gender, dll)
  2. Data mentah asli (tabel: nama, NIK, tanggal beli, jenis tiket, dll) sebagai bukti
     otentik yang bisa di-cross-check sponsor — WAJIB disertakan bersama dashboard, bukan
     dashboard saja, supaya data kredibel dan tidak terkesan dikarang
- Tujuan bisnis: bantu promotor pitching ke sponsor dengan data target audiens yang kredibel
  dan bisa diverifikasi

**Urutan eksekusi yang disepakati (kerjakan SATU PER SATU sesuai urutan ini):**
1. Verifikasi ulang status deploy Payout (item #1) — pastikan seluruh endpoint aktif di production
2. Bangun item #2 dan #3 sekaligus (saling terkait erat — logic potong hutang otomatis dan
   laporan pencairan pakai data yang sama)
3. Bangun item #4 (Laporan Pendapatan Platform)
4. Bangun item #5 (Data Audiens) — boleh dipercepat urutannya jika perlu, karena ternyata
   tidak memerlukan perubahan skema/form sama sekali

## Next Priority (Roadmap)

1. ✅ Expense Tracker
2. ✅ Field Crew + Petty Cash
3. ✅ P&L Report + PDF Export
4. ✅ Sponsor Auth Redesign
5. ✅ Midtrans Pro Payment (Rp 499.000/event, 90 hari)
6. ✅ Security Fix (Admin panel protection + Lock UI consistency)
7. ✅ Storefront Ticketing B2C (Live)
8. ✅ Fee Platform Implementation (fee per tipe order + kelola fee editable di admin)
9. ✅ Merchandise Storefront + Approval
10. ✅ Payout / Pencairan Dana (manual-transfer, commit 4df3f1c — deployed + verified production)
11. 🔴 URGENT: Midtrans Production (menunggu approval KYC — sistem masih Sandbox)
12. Storefront advanced features → lihat section "Storefront Feature Roadmap"
    (Bundling paket kurasi, edit/pindah stok, box office offline, hutang fee, scanner tiket)
13. ✅ Payout & Laporan Keuangan lanjutan → SELESAI SEMUA (#1–#5), DEPLOYED KE PRODUCTION 2026-07-10.
    Lihat section "Payout & Laporan Keuangan Roadmap" (potong hutang fee otomatis, laporan pencairan PDF,
    laporan pendapatan platform, data audiens). Item terakhir (#5 Data Audiens, commit 21a125a) sudah
    deployed & terverifikasi di production (smoke test 401-not-404 lolos, PM2 stabil, Vercel READY).
14. ✅ Ticket Sales Manual Input (untuk promotor yang pakai platform lain)
15. Event Summary Report (kirim via email saat event selesai)
16. CRON Job booking timeout (sudah ada — verifikasi)

_Update bagian ini setiap prioritas berubah, supaya Claude Code dan Claude.ai selalu tahu fokus development saat ini._

## Mobile App Migration (Long-Term, Lowest Priority)

Founder berencana suatu saat mengubah nexEvent dari web app menjadi aplikasi mobile yang bisa di-download (App Store / Play Store). **Ini adalah item PALING TERAKHIR** — baru dikerjakan setelah SEMUA fitur web selesai dan produk siap go-to-market.

**Aturan sampai saat itu tiba:** SEMUA fitur baru (termasuk Ticket Scanner) dibangun **web-based only** — tidak ada pertimbangan native mobile wrapping di tahap ini. Catatan ini hanya placeholder perencanaan, bukan tugas aktif.

## Aturan Tambahan

- Setiap selesai coding, selalu commit + push + deploy.sh
- Prisma singleton wajib — jangan `new PrismaClient()`
- Auth middleware: `server/src/middleware/auth.middleware.js` — return 401 bukan 404
- Setiap selesai fix bug nontrivial, WAJIB update `docs/known-bugs.md` (lihat section "Known Bugs & Fixes" di atas)
- Semua fitur Pro wajib cek `isPro` dari hook `useUser.ts` sebelum render konten — tampilkan lock UI untuk Starter, bukan redirect atau hide menu.
