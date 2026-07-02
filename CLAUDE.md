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
- Sender: `onboarding@resend.dev` (domain nexeventapp.tech belum diverifikasi di Resend)
- Jangan ganti sender sampai domain diverifikasi

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

## Next Priority (Roadmap)

1. Selesaikan Expense Tracker (warna + kategori RAB dinamis) ← sedang berjalan
2. Petty Cash System (Promotor dashboard + Field Crew mobile UI)
3. P&L Report otomatis (gabungkan expenses + petty cash type:`"expense"`)
4. Integrasi Midtrans payment gateway
5. Ticketing storefront B2C dengan Row-Level Locking
6. CRON Job booking timeout 15 menit

_Update bagian ini setiap prioritas berubah, supaya Claude Code dan Claude.ai selalu tahu fokus development saat ini._

## Aturan Tambahan

- Setiap selesai coding, selalu commit + push + deploy.sh
- Prisma singleton wajib — jangan `new PrismaClient()`
- Auth middleware: `server/src/middleware/auth.middleware.js` — return 401 bukan 404
- Setiap selesai fix bug nontrivial, WAJIB update `docs/known-bugs.md` (lihat section "Known Bugs & Fixes" di atas)
- Semua fitur Pro wajib cek `isPro` dari hook `useUser.ts` sebelum render konten — tampilkan lock UI untuk Starter, bukan redirect atau hide menu.
