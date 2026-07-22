# nexEvent SaaS — CLAUDE.md

## Ringkasan Project

Platform SaaS untuk manajemen event musik. Stack: **Next.js 16** (client, port 3000) + **Express 5** (server, port 5000) + **PostgreSQL via Supabase** + **Prisma ORM**.

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
│   │   ├── middleware/auth.middleware.js  # Export: protect, verifyToken (alias), requireAdmin
│   │   ├── controllers/        # auth.controller.js, admin.controller.js (dipakai src/routes)
│   │   ├── routes/             # auth.routes.js, admin.routes.js (di-mount di index.js)
│   │   └── cron/               # pro-subscription.cron.js, ticket-booking.cron.js
│   ├── controllers/            # mayoritas controller fitur (event, sponsor, ticket, dll)
│   ├── routes/                 # mayoritas route file fitur
│   ├── services/               # email, midtrans, supabase, ticket, nik-parser, pl-report, fee-debt
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
Export: `{ protect, verifyToken: protect, requireAdmin }` — `protect` & `verifyToken` adalah alias yang sama; `requireAdmin` cek `isAdmin` fresh dari DB (bukan dari JWT) → 403 kalau bukan admin.
Route promotor pakai `verifyToken`; route admin (`admin.routes.js`, `fee-debt.routes.js`, `payout.routes.js`, `platform-revenue.routes.js`) pakai `protect + requireAdmin`.

## Registrasi, Approval Akun & Login

- **Register** `POST /api/auth/register`: wajib name/email/password (min 6 karakter); `role` whitelist `["promotor","crew","scanner"]` (default "promotor"); email duplikat → 409; password di-hash bcrypt (10 rounds); user dibuat `status:"pending"` + kirim notifikasi email ke admin (fire-and-forget). TIDAK langsung dapat token — harus di-approve admin dulu.
- **Approval admin** (`protect + requireAdmin`): `GET /api/admin/users` (list `status:"pending"`) + `PATCH /api/admin/users/:id/approve` (set `status:"active"`). Lifecycle: `pending → active`; status `suspended` juga memblokir login.
- **Login** `POST /api/auth/login`: 401 kalau kredensial salah; 403 kalau status `pending`/`suspended`; sukses → JWT (payload `{ id, email, name, role }`, expiry 7d default) + response body `{ id, name, email, plan, role, isAdmin }`. Catatan: `plan`/`isAdmin` ADA di response body, TIDAK di dalam JWT payload.

## Prisma

- Gunakan `PrismaPg` adapter (bukan engine bawaan Prisma)
- Semua controller gunakan: `const prisma = require('../src/lib/prisma')`
- **Jangan buat `new PrismaClient()` langsung di controller**
- Migration: **selalu gunakan `npx prisma db push`** (bukan `prisma migrate dev` — project tidak punya migration history, akan error drift detection)
- Setelah `db push`, wajib jalankan `npx prisma generate` di VPS

## Fitur Utama

- **Events & RAB**: Buat event, kelola anggaran (RAB)
- **RAB Builder** (fitur inti tier Starter/gratis): Rencana Anggaran Biaya per event — kategori → item (qty × harga satuan), auto-hitung `totalEstimatedCost` + Dana Cadangan (default 20%). Backend `/api/budgets/*` + `budget.controller.js` (model `Budget`/`BudgetCategory`/`BudgetItem`). Halaman `/dashboard/rab/[id]`. **Export PDF = client-side browser print** (`window.print()` pada view `@media print`), BUKAN endpoint backend — lihat section "PDF Generation" + entry known-bugs 2026-07-12.
- **Purchase Order (PO)**: Buat PO per event (item, qty, harga; total dihitung ulang server-side), status `draft/sent/paid`, export PDF via **pdfkit server-side**. Bisa **import item dari RAB** (`PurchaseOrderItem.sourceRabItemId` menautkan ke `BudgetItem`; ambil via `GET /api/events/:eventId/rab-items`). Backend `/api/po/*` + `purchaseOrder.controller.js` (model `PurchaseOrder`/`PurchaseOrderItem`).
- **Sponsor Management**: Generate invite code → sponsor daftar di portal → buat deal. Config sponsor (benefits/packages/thresholds catalog) via `/api/sponsor/{benefits,packages,thresholds}`; harga paket diambil dari threshold tier bernama sama. **Semua data sponsor (deal/benefit/package/threshold) dimiliki per-promotor via `promotorId` — lihat section "Keamanan: Isolasi Data Per-Promotor" di bawah.** Selain itu **semua endpoint LIST-nya wajib `?eventId=`**, termasuk `GET /api/sponsor/deals` (**WAJIB sejak 2026-07-21** — dulu lintas-event; ada DUA call site frontend: halaman Invoice & `DealTracker` di halaman Sponsor).
- **Promoter Settings** (`/api/settings/promoter`): satu settings per EO (upsert by `userId`) — `companyName`/`logoUrl` + rekening bank (`bankName`/`bankAccount`/`accountHolder`). Rekening ini di-REUSE untuk "Transfer Ke" di Invoice PDF sponsor DAN rekening tujuan Payout (tidak ada field bank duplikat di `User`).
- **Invoice**: Generate invoice PDF dari deal sponsor, update status (Belum Dibayar / DP Terbayar / Lunas)
- **Document Table** (kini di `/dashboard/perencanaan`): indeks RAB per event. **KOREKSI 2026-07-20:** dulu tertulis di sini bahwa tab "Invoice" sengaja menampilkan semua invoice lintas-event "karena deal historis punya `eventId = null`" — **itu SALAH, dan alasannya sudah tidak berlaku** (`SponsorDeal.eventId` NOT NULL sejak 2026-07-18). Invoice sekarang **strictly per-event**; Document Table tidak lagi memanggil `/api/invoices` sama sekali. Lihat known-bugs [2026-07-20] Daftar Invoice lintas-event.
- **Plan/Tier System**: Field `plan` di tabel `users`. Values: `"starter"` (default) atau `"pro"`. Hook `useUser.ts` expose `{ user, loading, isPro }` untuk feature gating di frontend. `user_plan` disimpan di localStorage setelah login.

## Keamanan: Isolasi Data Per-Promotor (WAJIB — prinsip anti-kebocoran lintas akun)

**Insiden 2026-07-17 (lihat known-bugs entry security):** sistem Sponsor pernah membocorkan data lintas akun —
`SponsorDeal`/`SponsorBenefit`/`SponsorPackage`/`SponsorThreshold` TIDAK punya kolom pemilik, endpoint GET-nya
`findMany` tanpa filter, dan endpoint mutasi tanpa cek kepemilikan (IDOR); 3 di antaranya bahkan publik tanpa auth.
Akibatnya deal/benefit/paket/threshold satu promotor tampil & bisa diubah oleh promotor (atau siapa pun) lain.

**Sudah diperbaiki:** keempat model kini punya `promotorId` (NOT NULL), `SponsorDeal.eventId` punya FK ke `Event`
(`onDelete: Cascade`), dan `SponsorThreshold` unik per-promotor (`@@unique([promotorId, tierName])`, bukan global).

**Lanjutan 2026-07-18 — `eventId` kini WAJIB (NOT NULL + FK cascade) di `InviteCode` DAN `SponsorDeal`:** tidak ada lagi
kode undangan / deal yang mengambang tanpa event. `generateCode` menolak 400 kalau `eventId` kosong dan memverifikasi
event milik promotor login (403 kalau bukan); `createDeal` mengambil `eventId` langsung dari `InviteCode.eventId`
(bukan dari client, tidak pernah null); frontend menonaktifkan tombol generate & memandu buat event dulu kalau belum ada.
`InviteCode` sebelumnya tak punya FK ke Event sama sekali — sekarang ada (`onDelete: Cascade`). Lihat known-bugs [2026-07-18].

**Prinsip yang WAJIB ditegakkan (dan ditiru untuk SEMUA fitur/model baru yang menyimpan data milik user):**
1. **Setiap model yang memegang data spesifik-user WAJIB punya kolom pemilik** (`promotorId`/`userId`) sejak awal —
   jangan pernah mengandalkan kolom lain (mis. `eventId` nullable) sebagai satu-satunya jalur kepemilikan.
2. **Semua GET difilter `where: { promotorId: req.user.id }`** (atau setara). Tidak ada `findMany` polos untuk data milik user.
3. **Semua CREATE mengeset pemilik dari sesi** (`req.user.id`) — JANGAN terima `promotorId` dari body client. Untuk
   endpoint publik yang sah (mis. `createDeal` via portal), turunkan pemilik SERVER-SIDE dari resource tepercaya
   (kode undangan → `InviteCode.createdBy`); tolak kalau tak bisa diatribusikan (jangan buat row tanpa pemilik).
4. **Semua UPDATE/DELETE cek kepemilikan dulu**: ambil record, `not found → 404`, `bukan pemilik → 403` (konsisten
   dgn konvensi ownership 403 di Expense Tracker). Tidak ada mutasi by-id tanpa guard.
5. **Endpoint publik/sponsor-facing dipisah & di-scope oleh resource yang dipegang pemanggil**, BUKAN token promotor:
   `GET /api/sponsor/portal/catalog?code=` (katalog milik promotor pengundang) & `GET /api/sponsor/public/tier-price?dealId=`.
   Jangan pernah menjadikan endpoint yang mengembalikan data milik-user sebagai publik-tanpa-scope.

Referensi implementasi: `server/controllers/sponsor.controller.js` + `server/routes/sponsor.routes.js`.
**✅ AUDIT SELESAI 2026-07-20** (catatan di bawah sudah dieksekusi — dipertahankan sebagai konteks). Temuan
terakhirnya adalah `getInvoices` yang masih menerima `eventId` opsional → sudah diperbaiki jadi WAJIB;
lihat known-bugs [2026-07-20]. Catatan asli: audit kolom pemilik + filter query serupa layak dilakukan
untuk tabel lain (mis. pastikan `Expense`/`OtherIncome`/`PurchaseOrder`/`Budget`/dst benar-benar ter-scope) —
belum dikerjakan, hanya catatan pencegahan agar kelas bug ini tidak berulang di tempat lain.

## Fixed / Completed

### Gating Fitur Pro PER-EVENT — tutup monetization gap (2026-07-19)
**Gap:** `proEventId`/`proExpiresAt` ditulis saat bayar (`payment.controller.js`) tapi **TIDAK PERNAH dicek** endpoint
fitur mana pun → semua fitur Pro bisa dipakai GRATIS oleh user terautentikasi mana pun (panggil API langsung). Gate
frontend `isPro` juga global (bukan per-event) & mudah dilewati.
**Fix:** middleware baru `server/middleware/pro.middleware.js` → **`requireActivePro(resolveEventId?)`**.
- Sebuah event "Pro aktif" bila PEMILIK event punya `plan==='pro' && proEventId===eventId && proExpiresAt>now`.
  Cek berbasis **pemilik event** (bukan pemanggil) → aksi crew/scanner ikut terkunci kalau Pro promotor lapse.
- eventId di-resolve dari request: default `body/query/params.eventId`; untuk route by-`:id` ada resolver turunan-resource
  (`fromPOParam`, `fromBenefitParam`, `fromDealParam`, `fromInvoiceParam`, `fromExpenseParam`, `fromCrewParam`,
  `fromPettyAccountBody`, `fromDeliverableParam`, `fromDealBody`, `fromInvoiceGenerate`, dll — semua di-export dari middleware).
- Fitur **lintas-event tanpa satu eventId** (daftar agregat invoice/deal, audiens all-events) → fallback cek
  **user-level** (pemanggil punya Pro aktif untuk event mana pun).
- Gagal → **402 Payment Required** (`"Fitur ini memerlukan Pro aktif untuk event ini. Upgrade di halaman pembayaran."`).
- **GATED:** sponsor (codes/benefits/packages/thresholds/deals GET+mutasi/accounts/deliverables mutasi/dashboard-summary),
  invoice (list/generate/by-id/status/delete), PO (semua), expenses (semua, TERMASUK budget-categories dropdown-nya),
  crew (getEventCrew/invite/remove), petty cash (semua), P&L (report+export),
  audiens (event + all-events), Laporan Akhir Event (finish + summary-pdf), scanner (invite/list/remove/
  validate), Simulasi Harga Tiket (frontend).
- **SENGAJA TIDAK di-gate (Starter/gratis atau bukan customer):** RAB/Budget (`budget.routes` + `events/:id/rab-items`),
  SELURUH Ticketing/Storefront/Merch/Bundling/Ticket Box (`ticket.routes` — monetisasi via komisi 1.5–3.5%, sudah bersih
  dari cek Pro — DIVERIFIKASI), **Payout/Pencairan Dana promotor** (`payout.routes` — balance/my-requests/request/
  statement-pdf; mencairkan hasil penjualan tiket yang monetisasinya lewat komisi transaksi, konsisten dengan Ticketing —
  BUKAN fitur Pro; lihat koreksi 2026-07-19 di bawah), createEvent/getEvents/publish/delete, endpoint PUBLIK
  sponsor-portal (`/codes/validate`, `/portal/catalog`, `/public/tier-price`, `POST /deals`, `/accounts/verify`,
  `GET /deliverables`, `GET /invoices/deal/:dealId`), navigasi akun crew/scanner (`/crew/my-events`, `/scanner/my-events`),
  dan admin payout routes.
- **Frontend:** `useUser` dapat `isProForEvent(eventId)` + `hasActivePro` (mirror aturan backend). Simulasi Harga Tiket
  kini gating PER-EVENT: selector event tetap tampil, tool terkunci bila event terpilih belum Pro → komponen reusable
  `client/src/components/dashboard/pro-lock.tsx` (`ProLockPanel`/`ProLockModal`: gembok + modal "Upgrade untuk event ini").
- **KOREKSI BISNIS (2026-07-19, RESOLVED):** Payout/Pencairan Dana **STARTER-accessible (TIDAK di-gate Pro)**. Sempat
  ke-gate Pro di `0fdbb61` atas asumsi keliru, tapi Payout mencairkan hasil penjualan tiket yang monetisasinya lewat
  **komisi transaksi (model Ticketing)**, bukan langganan Pro → promotor Starter yang menjual tiket **berhak menarik
  saldonya tanpa beli Pro**. Dikoreksi sebelum deploy (0fdbb61 belum sampai VPS) → nol dampak produksi. Lihat known-bugs [2026-07-19].
- **Status: ✅ DEPLOYED & VERIFIED di production** (dikonfirmasi audit 2026-07-19/20 — wording "PENDING deploy"
  yang lama sudah STALE dan dikoreksi 2026-07-20). Tidak butuh `db push` (tak ada perubahan schema).

### Pembuatan Event TIDAK Dibatasi Jumlahnya — monetisasi = fitur Pro per-event (2026-07-19, koreksi)
**Model bisnis yang BENAR:** akun mana pun boleh membuat event **tanpa batas jumlah**. Monetisasi BUKAN pada jumlah
event, melainkan pada **fitur Pro PER-EVENT** (RAB Builder full, Sponsor Magic Link, Ticketing B2C, P&L otomatis, dll.)
yang digate lewat `proEventId`/`proExpiresAt` — **Pro Per-Event Rp 499.000, 1 event, aktif 90 hari** (lihat section
"Pricing & Subscription Model").
- Commit `9a8c2fc` sempat menambahkan batas "1 event per akun non-admin" (403 pada event ke-2) di `createEvent`
  berdasarkan **requirement yang salah paham** — **sudah di-REVERT**. Batas itu **tidak pernah dideploy ke produksi**
  (VPS masih di `8666cf6` saat revert), jadi **nol dampak ke user**.
- `createEvent` (`server/controllers/event.controller.js`) kini kembali seperti sebelum `9a8c2fc`: buat event tanpa cek
  jumlah. **JANGAN tambahkan lagi batas jumlah event di sini.**
- Field `role`/`isAdmin` TIDAK diubah (masih dipakai di tempat lain, mis. `requireAdmin` + exemption testing).
- **Status: FINALIZED & pushed** (commit `75b1c4c`, origin/main). Monetization gap `proEventId`/`proExpiresAt` yang
  ditemukan di audit Part 2 sudah **DIFIX** — lihat entry "Gating Fitur Pro PER-EVENT" di atas.

### Isolasi Data Invoice & Purchase Order (Juli 2026)
- **SponsorInvoice** kini WAJIB punya `eventId` + `promotorId` (`dealId` sekarang opsional/nullable — invoice manual
  tidak lagi menempel paksa ke `deals[0]`).
- `getInvoices`, `generateInvoice`, `getBudgetByEvent`, dan `getPOsByEvent` semuanya kini menegakkan ownership check
  (403 kalau event/deal bukan milik `req.user.id`).
- Invoice manual tidak lagi dipaksa ke `deals[0]` — frontend kini punya dropdown pilih event eksplisit di tab Manual
  (`client/src/app/dashboard/invoice/page.tsx`).
- Lookup `SponsorThreshold` di `generateInvoice` kini difilter `promotorId` (cegah kalkulasi tier pakai config
  promotor lain).
- **Status: Fixed, deployed ke production, & verified** (commit `729ce39`; tabel production `sponsor_invoices`
  terkonfirmasi 0 null pada `eventId`/`promotorId` pasca-deploy).

### Sponsor Catalog Per-Event (fix cross-event bleed, 2026-07-19)
Katalog sponsor dulu di-scope HANYA ke `promotorId` (BUKAN `eventId`) → promotor multi-event melihat katalog & harga tier
yang sama di semua event, dan stok benefit ter-share lintas event. Diperbaiki (ketiga tabel dikonfirmasi 0 rows sebelum
schema change, jadi tidak perlu backfill):
- **`SponsorBenefit`**: tambah `eventId` WAJIB (FK Event, cascade). Stok (`maxQty`/`usedQty`/`heldQty`) kini otomatis
  per-event karena tiap benefit milik satu event; logika increment `heldQty`/`usedQty` tetap by-`benefitId` (sudah benar).
- **`SponsorThreshold`**: tambah `eventId` WAJIB (FK Event, cascade). `@@unique` jadi `[promotorId, eventId, tierName]`
  sehingga tier bernama sama boleh beda harga per event.
- **`SponsorPackage`**: `eventId` diaktifkan (dulu nullable & dead column → kini WAJIB).
- **Semua endpoint di-scope `eventId`**: `getBenefits`/`getPackages`/`getThresholds` wajib query param `?eventId=` (400
  kalau kosong); `createBenefit`/`createPackage`/`saveThresholds` set `eventId` dari body + verifikasi event milik
  `req.user.id` (helper `verifyEventOwnership`, 403 kalau bukan); `getPortalCatalog` turunkan `eventId` dari `InviteCode`
  (server-side); `getPublicTierPrice` dari `deal.eventId`; `createDeal` validasi benefit/paket by `eventId`;
  `generateInvoice` (invoice controller) filter threshold by `eventId`.
- **Frontend** (`client/src/app/dashboard/sponsor/page.tsx`): `selectedEventId` di-lift ke level halaman (pemilih event
  tunggal governs seluruh katalog), diturunkan sebagai prop ke `InvitationCodeGenerator`/`BenefitBuilder`/`PackageBuilder`/
  `ThresholdSettings`; semua fetch pakai `?eventId=` & re-fetch saat event berubah; form create ikut kirim `eventId`.
- **Status: ✅ DEPLOYED & VERIFIED di production** (dikonfirmasi audit 2026-07-19/20 — wording "PENDING deploy"
  yang lama sudah STALE dan dikoreksi 2026-07-20). Tidak perlu backfill (tabel kosong saat schema change).

### Backfill script env loading bug — FIXED (2026-07-19)
`prisma/backfill-invoice-owner.js` dulu tidak memuat `.env` saat dijalankan standalone → `DATABASE_URL` undefined →
`pg.Pool` fallback ke `localhost:5432` → **ECONNREFUSED**. **Fixed:** ditambahkan `require('dotenv').config({ path: ... })`
eksplisit di atas `require('../src/lib/prisma')` (harus sebelum require prisma, karena `src/lib/prisma.js` membaca
`DATABASE_URL` saat require). Terverifikasi `DATABASE_URL` resolve setelah dotenv. Panduan umum: script standalone apa pun
yang pakai `src/lib/prisma` WAJIB memuat dotenv sendiri (atau jalankan `node -r dotenv/config <script>`).

## Arsitektur 2-Lapis Publish (Homepage Discovery vs Storefront) — SENGAJA, bukan duplikasi

Event punya DUA mekanisme "publish" terpisah yang melayani dua lapis berbeda (dikonfirmasi founder — JANGAN gabungkan/hapus salah satu mengira redundan):

1. **Lapis 1 — Homepage Discovery**: `Event.is_published` + `PATCH /api/events/:id/publish` + `GET /api/events/public` (+`/search`). Menggerakkan halaman publik `nexeventapp.tech` (`client/src/app/page.tsx`) — permukaan penemuan/landing tempat promotor/sponsor menemukan jalan ke login, dan pengunjung kasual browsing event mendatang TANPA akun. Data minimal (judul/lokasi/tanggal/kapasitas).
2. **Lapis 2 — Ticket Storefront**: `Event.storefrontStatus` + halaman `/event/[slug]`. Storefront jual-tiket sesungguhnya per event (banner, tiket, merch, bundling, checkout), diatur flow approval admin.

Alur: **homepage discovery → storefront event → checkout.** `is_published` dan `storefrontStatus` adalah dua field berbeda untuk dua tujuan berbeda. (Lihat entry known-bugs 2026-07-12 "Public Events Discovery API".)

## Alur: Invite Code → Deal → Invoice → Document Table

1. Promotor generate kode di `/dashboard/sponsor` (pilih event dulu)
2. Kode disimpan dengan `eventId` di tabel `invite_codes`
3. Sponsor validasi kode di `/sponsor-portal` → response mengandung `eventId`
4. Sponsor submit form → deal dibuat dengan `eventId`
5. Promotor generate invoice dari deal
6. Invoice dilihat/dikelola di `/dashboard/invoice` (dicapai dari Dashboard Kerjasama): `GET /api/invoices?eventId=` — **`eventId` WAJIB sejak 2026-07-20**, daftar selalu per-event. Kolom: sponsor, tanggal, nomor invoice, nilai, status dropdown, aksi PDF+WA.

## Document Table (`document-table.tsx`)

Sejak 2026-07-20 komponen ini di-render di **`/dashboard/perencanaan`** (bukan `/dashboard`), dan sejak
2026-07-21 isinya **RAB SATU event saja** — yaitu event aktif di `EventProvider`:
- Memuat `GET /api/events/:id` (sudah ter-scope `promotor_id` di backend) + `GET /api/budgets/:eventId`.
- **⚠️ KOREKSI 2026-07-22: kolom "Aksi" SUDAH TIDAK ADA** — tombol "Kelola RAB" per-baris dihapus
  (kolomnya ikut, karena tombol itu satu-satunya isinya; `colSpan` placeholder 5→4). Akses Kelola RAB
  kini lewat **baris aksi cepat di header halaman Perencanaan** (lihat bawah). Badge "Ada RAB"/
  "Belum Ada RAB" + nilai RAB tetap tampil. JANGAN kembalikan tombol per-baris — satu pintu per aksi.
- **⚠️ KOREKSI 2026-07-21 (malam): tombol "Ajukan Hapus" SUDAH TIDAK ADA di sini** — pindah ke
  `/dashboard/setup-event` (lihat section "Setup Event"). Yang tersisa hanya tautan teks "Setup Event"
  di header kartu. JANGAN kembalikan aksi hapus/ajuan-hapus ke komponen ini.
- **⚠️ KOREKSI 2026-07-21 (sore) — hapus event SUDAH TIDAK tersedia untuk promotor.** Catatan lama di
  baris ini menyatakan "hapus event TERSEDIA untuk promotor biasa" lewat `DELETE /api/events/:id`
  (`verifyToken` + cek `promotor_id`); itu benar sampai siang hari yang sama, lalu **sengaja dibalik**
  oleh founder. Sekarang endpoint itu **selalu 403** dan tombol di komponen ini hanya **MENGAJUKAN**
  permintaan hapus ke admin. Alasannya persis "catatan risiko" yang dulu ditulis di sini: `deleteEvent`
  tidak mengecek hutang fee cash / payout pending / order tiket berbayar, dan cascade menghapus data
  turunannya → jalur penghindaran hutang. Risiko itu kini **DITUTUP** lewat gerbang admin (angka hutang
  disodorkan ke admin sebelum ia memutuskan), bukan lewat cek hutang di `deleteEvent`. Lihat section
  **"Permintaan Perubahan Event"** di bawah + known-bugs [2026-07-21].
- Tanpa event terpilih → ajakan "Pilih event di Dashboard". Ganti event lewat pemilih tunggal di Dashboard
  KPI (ada tautan "Ganti event" di header kartu).
- **⛔ JANGAN kembalikan daftar lintas-event di sini.** Dulu (sebelum 2026-07-21) komponen ini melisting
  SELURUH event promotor sebagai alat navigasi; **founder membalik keputusan itu** — data RAB privat
  per-event dan tidak boleh dicampur lintas event, **termasuk untuk navigasi**. Berlaku untuk bentuk apa pun:
  tabel, dropdown, maupun "recent events". Lihat known-bugs [2026-07-21] RAB tidak lagi dilisting lintas-event.
- **Tab "Invoice" & "Purchase Order" DICABUT.** Invoice pindah ke `/dashboard/invoice` (per-event, di bawah
  Dashboard Kerjasama); PO pindah ke seksi tersendiri di `/dashboard/perencanaan`. Komponen ini **tidak lagi
  memanggil `/api/invoices`** — dulu memanggilnya TANPA `eventId` hanya untuk badge "Ada Invoice".
- PDF download (di halaman Invoice): GET `/api/pdf?path=${pdfUrl}`

**Baris 3 aksi cepat di header halaman Perencanaan** (sejak 2026-07-22, konsolidasi — commit `5f64d59` +
lanjutannya `942ad9c`; lihat known-bugs [2026-07-22] Konsolidasi aksi Perencanaan). Satu gaya seragam
(outline, `QUICK_ACTION_CLASS`), menggantikan tombol tunggal "Simulasi Harga Tiket" yang lama:
- **"Kelola RAB"** → `/dashboard/rab/[eventId]` (event aktif; halaman RAB sendiri yang menangani kasus
  belum-ada-RAB). Disabled tanpa event terpilih.
- **"Simulasi Harga Tiket"** → `/dashboard/simulasi`.
- **"Buat PO"** → membuka modal "Buat PO" milik `PurchaseOrderTab` via prop **`createSignal`** (counter dari
  page; efek internal tab menjalankan `resetForm(); setShowForm(true)` — handler yang sama, BUKAN flow
  duplikat). Disabled tanpa event terpilih.
**Ini SATU-SATUNYA pintu ketiga aksi tsb.** Tombol lama yang DIHAPUS dan JANGAN dikembalikan: "Kelola RAB"
per-baris di `document-table.tsx`, "Buat PO Baru" internal di `PurchaseOrderTab`, dan "Buka Simulasi" di
header `SimulationSummaryCard` (tombol empty-state "Buat Simulasi Harga Tiket" di dalam kartu TETAP ada).
`PurchaseOrderTab` hanya dipakai di halaman Perencanaan (diverifikasi), jadi penghapusan tombol internalnya
tidak menelantarkan halaman lain. **Item sidebar "Simulasi Harga Tiket" juga DIHAPUS (2026-07-22,
lanjutan konsolidasi yang sama)** — redundan dgn tombol aksi cepat di header ini; halaman
`/dashboard/simulasi` tetap ada & berfungsi, dicapai lewat tombol tsb (+ kartu ringkasan simulasi).
Grup sidebar "Perencanaan" kini berisi 1 item (hub saja). JANGAN kembalikan item sidebar-nya.

**Ringkasan Simulasi Harga Tiket** (`components/dashboard/simulation-summary-card.tsx` → `SimulationSummaryCard`,
sejak 2026-07-22) juga dirender di `/dashboard/perencanaan`, ter-scope event aktif — **posisinya DI BAWAH donut
"Distribusi Biaya Event"** (permintaan founder 2026-07-22, jangan ditukar). Menampilkan HASIL terakhir
simulasi (BEP tiket + % kapasitas, total proyeksi, harga 3 tier) tanpa membuka halaman Simulasi. Sumber:
`GET /api/ticket-simulation?eventId=` (baris `TicketPriceSimulation` latest-wins). **Penanganan respons
(KOREKSI 2026-07-22 — dulu 402 ikut jadi empty state, itu SUDAH TIDAK berlaku):**
- **402** (event belum Pro, `requireActivePro` menolak) → **`ProLockPanel`** menggantikan body kartu (header
  kartu tetap; pola sama `PurchaseOrderTab`) — ajakan upgrade, BUKAN empty state.
- **200 dgn `data:null`** (Pro aktif, belum pernah simulasi) → empty state "Belum ada simulasi" + tombol ke
  `/dashboard/simulasi`.
- **404/error jaringan** → empty state generik (tak ada hubungan dgn status Pro).
Lihat section "Simulasi Harga Tiket — Persistence" di bawah + known-bugs [2026-07-22].

**Donut "Distribusi Biaya Event"** (`components/dashboard/budget-donut-chart.tsx` → `BudgetAllocationCard`)
juga dirender di `/dashboard/perencanaan`, ter-scope event aktif, **di ATAS kartu ringkasan simulasi**.
Chart ini sempat HILANG (regresi commit `0842e0d`, dipulihkan 2026-07-21 — lihat known-bugs). **Beda dari
donut di `/dashboard/pl-report`**: yang itu "Komposisi Pengeluaran" (realisasi, recharts); yang ini alokasi
RAB (rencana, SVG manual). Bukan duplikat.

## Pelunasan Hutang Fee — mekanismenya SUDAH ADA (diinvestigasi 2026-07-22)

Dicatat karena sempat tidak jelas apakah hutang fee bisa ditandai lunas sama sekali. **Bisa — ada DUA jalur,
keduanya sudah live.** Jangan bangun mekanisme settle baru; pakai yang ada.

**Apa itu hutang fee**: fee dari order Ticket Box **CASH** (`channel:"ticket_box"`, `paymentMethod:"cash"`,
`status:"paid"`, `feeSettled:false` — lihat `DEBT_ORDER_WHERE` di `services/fee-debt.service.js`). Cash-only
karena transfer Ticket Box wajib lewat Midtrans → fee-nya sudah terpotong otomatis. Penanda lunasnya adalah
kolom **`TicketOrder.feeSettled`** (boolean), bukan tabel hutang tersendiri.

**Jalur 1 — manual oleh admin** (uang diterima via transfer bank DI LUAR app, lalu dikonfirmasi di app):
`PATCH /api/admin/fee-debt/:promotorId/settle` (`controllers/fee-debt.controller.js` → `settleFeeDebt`).
Body opsional `{ orderIds }`; tanpa itu = settle SELURUH hutang cash promotor tsb saat itu. UI-nya: seksi
**"Rekonsiliasi Fee (Hutang Ticket Box)"** di `/dashboard/admin` (tombol "Tandai Lunas" + konfirmasi).
Scope-nya **per-PROMOTOR**, bukan per-event.

**Jalur 2 — otomatis saat pencairan**: `requestPayout` (`controllers/payout.controller.js`) men-settle hutang
(`feeSettled: true`) secara **atomik** di `$transaction` yang sama dengan pembuatan `PayoutRequest`; nominalnya
dicatat di `PayoutRequest.debtDeducted` untuk audit. Syarat terima pencairan: `nominal + hutang ≤ saldo available`
(hutang = TAMBAHAN di atas nominal, bukan potongan dari dalamnya — lihat Payout item #2).

**Tidak ada** pelunasan lewat Midtrans untuk hutang ini, dan **tidak ada** aksi settle di sisi promotor.

## Permintaan Perubahan Event (approval admin) — berlaku sejak 2026-07-21

**5 field event + penghapusan event TIDAK bisa lagi dieksekusi langsung promotor.** Semuanya lewat ajuan
yang harus disetujui admin, terlacak penuh di tabel `EventChangeRequest`.

**Yang terkunci** (`requestType` → kolom Event):
`rename`→`title`, `venue_location`→`location`, `venue_capacity`→`venue_capacity`,
`target_profit`→`target_profit`, `target_sponsor`→`target_sponsorship`, plus `delete` (hapus event).

**Kenapa** (jangan longgarkan tanpa memahami ini): `deleteEvent` lama + relasi `onDelete: Cascade` menghapus
`TicketOrder` Ticket Box CASH, yaitu satu-satunya dasar perhitungan **hutang fee** promotor ke nexEvent.
Promotor berhutang cukup menghapus event → hutangnya lenyap, dan pelunasan-otomatis-saat-pencairan
(Payout item #2) tak punya apa-apa untuk ditagih. Gerbang admin menutup itu **tanpa** menaruh logika cek
hutang di jalur promotor — admin melihat ringkasan hutang/payout/order lalu memutuskan.

**Alur:** promotor ajukan (event TETAP berjalan normal — jualan tiket dll tidak terpengaruh, hanya kelima
field itu yang read-only) → email otomatis ke `ADMIN_EMAIL` → admin approve/reject di `/dashboard/admin` →
approve MENERAPKAN perubahan (atau mengeksekusi penghapusan). **Promotor TIDAK dikirimi email** — pantau
status in-app di "Riwayat Permintaan" (keputusan founder, jangan tambahkan email ke promotor).

**Endpoint:**
- Promotor: `POST /api/events/:id/change-requests` (`{ requestType, newValue }`; `newValue` tidak perlu untuk
  `delete`) & `GET /api/events/:id/change-requests`. Keduanya `verifyToken` + cek kepemilikan, **TIDAK di-gate Pro**
  (administrasi dasar event, pola sama `createEvent`).
- Admin (`protect + requireAdmin`): `GET /api/admin/change-requests?status=pending|all`,
  `PATCH /api/admin/change-requests/:id/approve`, `PATCH /api/admin/change-requests/:id/reject` (`{ adminNote }`).

**Aturan implementasi yang WAJIB dipatuhi:**
1. **`oldValue` SELALU dibaca server** dari record event saat ajuan dibuat — jangan pernah terima dari client.
2. **Satu permintaan pending per (event, jenis)** → 409. Cegah dua usulan bertabrakan saat di-approve.
3. **`prisma.event.delete` HANYA boleh ada di jalur approve admin.** `DELETE /api/events/:id` selalu 403;
   route-nya sengaja dipertahankan agar klien lama dapat pesan jelas, bukan 404 misterius.
3b. **HARD BLOCK hutang fee (2026-07-22)**: approve tipe `delete` membaca ulang `getEventFeeDebt(eventId)`
   saat eksekusi; `totalDebt > 0` → **400 + `code: "FEE_DEBT_OUTSTANDING"`** (payload `feeDebt` dipakai
   frontend untuk modal "Penghapusan Event Diblokir"). Dibaca ULANG di jalur approve, JANGAN mengandalkan
   `deleteImpact` dari GET — daftar bisa dimuat jauh sebelum admin mengklik. Blokir terbuka sendiri begitu
   hutang lunas lewat salah satu jalur di section "Pelunasan Hutang Fee" di atas.
   **Cek payout-pending & order berbayar SENGAJA tetap informasional** — jangan ikut dijadikan hard block
   tanpa keputusan founder.
4. **`EventChangeRequest.eventId` NULLABLE + `onDelete: SetNull`** (+ snapshot `eventTitle`) — DISENGAJA.
   Kalau dijadikan `Cascade` seperti relasi Event lain, approve permintaan hapus akan menghapus baris
   auditnya sendiri. **Jangan "rapikan" jadi NOT NULL/Cascade.**
5. **Menambah field terkunci baru cukup di SATU tempat**: `LOCKED_FIELDS` di
   `server/services/event-change-request.service.js` (label, tipe, validasi, peta kolom semua turun dari sana).
   Cerminan front-end-nya ada di `event-change-request-panel.tsx` — ikut ditambah.
6. **Belum ada `PATCH /api/events/:id` umum** (diverifikasi 2026-07-21 — tidak pernah ada). Endpoint lain yang
   menyentuh Event (`updateStorefrontSettings`, `updateEventStorefrontInfo`, `togglePublish`, `approveStorefront`,
   upload banner/logo) pakai allowlist kolom eksplisit & tidak menyentuh field terkunci. **Kalau nanti membuat
   PATCH umum, WAJIB tolak kolom di `LOCKED_EVENT_COLUMNS`.**

**File:** `services/event-change-request.service.js` (sumber tunggal), `controllers/event-change-request.controller.js`,
`services/email.service.js` (`sendEventChangeRequestNotification`),
`client/src/components/dashboard/event-change-request-panel.tsx` (promotor — dirender **HANYA di
`/dashboard/setup-event`** sejak 2026-07-21 malam; sebelumnya di `/dashboard/perencanaan`),
`client/src/components/dashboard/admin-change-requests.tsx` (admin, dirender di `/dashboard/admin`).

## Setup Event (`/dashboard/setup-event`) — pusat administrasi event, sejak 2026-07-21 (malam)

**Satu halaman untuk semua urusan event SEBAGAI OBJEK.** Menggantikan penempatan lama yang tercecer
(panel ajuan di `/dashboard/perencanaan` + tombol "Ajukan Hapus" di `document-table.tsx`).

Isi (urut dari atas): **Buat Event Baru** (tautan ke flow lama `/dashboard/create-event`, tidak diubah) →
kartu konteks event aktif ("Ganti event" → `/dashboard`) → **`EventChangeRequestPanel`** yang memuat
**Ajukan Perubahan** (5 field terkunci), **Ajukan Hapus**, dan **Riwayat Permintaan**.

- **Anti-duplikasi:** ajuan hapus TIDAK punya implementasi sendiri. Ia jadi cabang `requestType: "delete"`
  di fungsi `submitRequest(type, newValue?)` milik panel — sumber tunggal untuk SELURUH jenis ajuan.
  **JANGAN bangun handler ajuan hapus kedua di komponen lain.**
- **Event dari `EventProvider`** (`useSelectedEvent`), bukan state lokal / dropdown sendiri.
- **`useEventGuard` SENGAJA TIDAK dipakai** — halaman ini tetap berguna tanpa event terpilih ("Buat Event
  Baru" justru jalan keluarnya), dan ia tidak memuat daftar event yang dibutuhkan hook itu. Tanpa event
  terpilih → empty state, **bukan redirect**. Deteksi event mati lewat jalur 404 `GET /api/events/:id` →
  `invalidateEvent` (pola sama `document-table.tsx`).
- **Akses:** item sidebar "Setup Event" (ungrouped, tier atas tepat di bawah "Dashboard"; `activePrefix:
  "/dashboard/create-event"`) + ikon gerigi di top-bar. Tombol "Buat Event Baru" di top-bar tetap ada
  (aksi tersering; keduanya bermuara ke `/dashboard/create-event`).
- **Konsekuensi untuk `/dashboard/perencanaan`:** halaman itu kembali **murni RAB/anggaran** (DocumentTable +
  donut alokasi + Purchase Order + pintu Simulasi). JANGAN taruh panel ajuan di sana lagi.

## Simulasi Harga Tiket — Persistence (sejak 2026-07-22)

Halaman `/dashboard/simulasi` **live-calculating client-side** (rumus BEP/tiering ada di komponen, itu tetap
sumber kebenaran). Sejak 2026-07-22 **hasilnya di-snapshot ke DB** supaya bisa ditampilkan di Dashboard
Perencanaan tanpa buka halaman Simulasi.
- **Model `TicketPriceSimulation`** (`ticket_price_simulations`): **satu baris per event** (`eventId @unique`,
  **latest-wins, TANPA history**), `promotorId` untuk ownership. Simpan input slider + output headline
  (`bepTickets`, `bepRevenue`, `priceEarlybird/Presale/Normal`, `projectedRevenue`, `capacity`, `totalBudget`).
- **Endpoint** `/api/ticket-simulation` (`ticket-simulation.controller.js`), `verifyToken + requireActivePro()`:
  `GET ?eventId=` (baris terakhir / `data:null`), `POST` (**upsert** by eventId; ownership dari event server-side,
  BUKAN body).
- **Auto-save**: halaman Simulasi menyimpan lewat **debounce 800ms** saat slider berhenti (tidak ada tombol
  Simpan). Digate `eventId + unlocked + !loadingEvents && !loadingBudget`; gagal simpan diam-diam.
- **JANGAN** membangun mekanisme "history" atau baris kedua per event — ini SENGAJA latest-wins.

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

- Library: `pdfkit` v0.19.1 (SERVER-SIDE)
- Dipakai `pdfkit` untuk: Invoice PDF, PO (Purchase Order) PDF, P&L Report PDF, Payout Statement PDF, Audience Report PDF, Event Summary PDF
- **PENGECUALIAN — RAB PDF bukan pdfkit**: "Export/Cetak Proposal PDF" di halaman RAB (`/dashboard/rab/[id]`) dibuat **client-side** via `window.print()` pada view `@media print` (bukan endpoint backend). Tidak ada `/api/budgets/export-pdf` — jangan cari/bangun. User "Save as PDF" lewat dialog print browser.

## Database Connection (SSL)

- Koneksi ke Supabase via PrismaPg adapter wajib pakai opsi `ssl: { rejectUnauthorized: false }`
- Tanpa opsi ini, koneksi akan gagal (lihat known-bugs.md untuk histori)

## Expense Tracker (Pengeluaran Promotor Langsung) — Fitur Pro

Pencatatan pengeluaran event yang diinput promotor sendiri, TERPISAH dari petty cash crew.
- Endpoint `/api/expenses` (`expenses.controller.js`): `GET ?eventId=` (list milik user utk event, order date desc), `POST` (buat — `amount` wajib angka > 0; field description/category/amount/receiptUrl?), `DELETE /:id` (ownership via `userId` → 403 kalau bukan pemilik). Semua route cek ownership event via `promotor_id`.
- Kategori diambil dari kategori RAB event (`GET /api/expenses/budget-categories?eventId=`), fallback ke default kalau event belum punya RAB.
- Model `Expense` (eventId, userId, description, amount, category, receiptUrl?, date).
- Gate: fitur Pro (lock UI Starter via `useUser`). Di Laporan P&L masuk sebagai "Pengeluaran Langsung (Promotor)" — digabung dengan petty cash crew type:"expense".
- Navigasi (sejak 2026-07-15): halaman `/dashboard/expenses` mewarisi event dari Dashboard Keuangan via `?eventId=` — tidak ada dropdown pilih event lagi, dan dibuka tanpa `eventId` → redirect ke `/dashboard/pl-report`. Lihat section "Roadmap Navigasi 3-Lapis".

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
   - **MEMO "kas crew belum dipertanggungjawabkan" (sejak 2026-07-16)**: P&L Report (JSON `crewCashMemo`, PDF, UI kartu Total Pengeluaran) menampilkan `crewOutstanding = topup − expense − return` (Σ lintas akun crew di event) sebagai catatan INFORMASIONAL saja — muncul hanya kalau > 0. Ini kas yang sudah diberikan ke crew tapi belum jadi biaya & belum dikembalikan (masih di tangan crew). **BUKAN pengeluaran — TIDAK ikut `totalExpense`/`netPL`.** Dihitung di `computeEventPLTotals` (sumber tunggal) via query `groupBy` type terpisah; `expense` pakai `crewTotal` yang sudah dibulatkan agar konsisten dgn baris "Subtotal Crew". Lihat known-bugs entry [2026-07-16] memo kas crew.

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
   - **Tiket & Merchandise (nexEvent)**: `SUM(TicketOrder.totalAmount - feeAmount)` untuk order `status:"paid"` di event tsb (net setelah fee platform — pola SAMA dgn `payout.computeBalance`, fungsi shared; `getAvailableBalance` hanya route wrapper-nya). SEBELUM fix ini, revenue tiket nexEvent TIDAK ikut di P&L sama sekali (bug kritis — laba tampil terlalu kecil).
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

### Status: ✅ SUDAH DIBANGUN & DEPLOYED (Field Crew + Petty Cash, per 2026-07-01)
Seluruh sistem ini SUDAH live — jangan bangun ulang. Yang sudah ada:
- **Tabel**: `EventCrew`, `PettyCashAccount`, `PettyCashTransaction` (+ field `role` di `User`: `"promotor" | "crew" | "scanner"`).
- **Invite crew**: `POST /api/crew/invite` (promotor, Pro-gated) → buat EventCrew + PettyCashAccount. Kelola di `/dashboard/crew`.
- **UI mobile Field Crew**: `/field` (halaman standalone, di luar layout `/dashboard`, light theme) — crew catat `expense`/`return`; `topup` hanya promotor via dashboard.
- **Integrasi P&L Report**: SUDAH terintegrasi. Aturan KRITIS (tetap berlaku): P&L hanya menghitung `type:"expense"` — `topup` & `return` BUKAN biaya (mutasi internal). Saldo crew = topup − expense − return.
- Endpoint utama: `/api/crew/*` (invite/list/remove/my-events) & `/api/petty-cash/*` (topup/transaction/my-account/overview).
- **UI dashboard promotor — DIPISAH jadi 2 halaman (sejak 2026-07-16, lihat known-bugs entry [2026-07-16] pisahkan Petty Cash):**
  - **`/dashboard/crew`** (label sidebar **"Settingan Kelola Crew"** sejak 2026-07-16 — sebelumnya "Field Crew"; item MANDIRI ungrouped, TIDAK lagi di group "Operasional", lihat bawah, Pro): administrasi AKSES saja — form tambah crew (email + divisi) + daftar crew (nama/divisi/email, TANPA saldo/top-up) + undang scanner tiket + daftar scanner. TIDAK ada UI saldo/top-up lagi di sini.
  - **`/dashboard/petty-cash`** (Pro, ikon Wallet) — **PER-EVENT sejak 2026-07-16 (MEMBALIK keputusan lama "kas lintas-konteks, dropdown event sendiri, TIDAK mewarisi eventId" — jangan bingung dengan catatan lama itu, sudah TIDAK berlaku)**: kini mewarisi `?eventId=` dari Dashboard Keuangan persis pola Expense Tracker / Laporan Akhir Event (bungkus `<Suspense>`+`*Inner`, baca via `useSearchParams`; dibuka TANPA eventId → `router.replace("/dashboard/pl-report")`; tombol "Kembali ke Dashboard Keuangan" di atas). Dropdown pilih event DIHAPUS (event tampil read-only). Daftar saldo kas crew + form top-up per crew (`POST /api/petty-cash/topup`). Kartu **expanded by default** saat data dimuat; toggle chevron collapse/expand manual tetap berfungsi. Event 0 crew → pesan + link ke `/dashboard/crew`. **BUKAN item sidebar lagi** — dicapai HANYA lewat tombol "Kelola Petty Cash" di header Dashboard Keuangan.
  - **Akses dari Dashboard Keuangan**: tombol "Kelola Petty Cash" di baris tombol header `/dashboard/pl-report`, kini **mengoper `?eventId=`** (di dalam blok `{selectedEventId && …}`, bersama tombol Expense Tracker & Laporan Akhir Event) — sebelumnya tanpa eventId.
  - Endpoint & logic saldo/fee TIDAK berubah — murni relokasi UI + perubahan sumber eventId. Data crew (termasuk `balance`/`totalTopup`/dst) tetap dari `GET /api/crew?eventId=`.

## Pricing & Subscription Model

### Tier Structure
- **Starter** (Gratis): RAB Builder + Export RAB PDF (via cetak browser `window.print()`, bukan endpoint backend) only. 1 event aktif.
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
- NIK checkout divalidasi ketat (2026-07-11) — bukan hanya format 16 digit, tapi tanggal lahir (digit 7-12) harus valid secara kalender (via `parseNik()`, reused dari Data Audiens). Berlaku di SEMUA jalur beli tiket (storefront online + Ticket Box).
- Timeout booking: 15 menit, CRON job release expired orders setiap menit
- E-ticket: QR code dikirim via email (Resend) + tombol bagikan ke WhatsApp
- Approval flow: Draft → Pending Approval → Admin Approve/Reject → Live

### Status Fitur Storefront — ✅ SEMUA 5 ITEM DI BAWAH SUDAH DIIMPLEMENTASI & DEPLOYED
> Bagian ini dulu berjudul "Pending". Kelima item SUDAH live per 2026-07-02 s/d 2026-07-06 — JANGAN bangun ulang.
> Deskripsi di bawah adalah PERILAKU FINAL (beberapa berubah dari rencana awal saat implementasi).

#### 1. Fee Platform — ✅ IMPLEMENTED (2026-07-02, direvisi 2026-07-05) — ⚠️ **DIGANTIKAN 2026-07-15, lihat "Fee Per-Kategori"**
> **BAGIAN INI SUDAH TIDAK BERLAKU** untuk cara fee dihitung. Fee level-Event + fallback chain **sudah dimatikan**
> (lihat section "Fee Per-Kategori (Dikunci Permanen)" di bawah). Disimpan sebagai catatan sejarah saja.
- ~~**PERUBAHAN PENTING dari rencana awal**: fee BUKAN lagi satu angka. Sekarang **3 persentase terpisah** di Event:
  `ticketFeePercent`, `merchFeePercent`, `bundlingFeePercent` (Float?). `platformFeePercent` DIPERTAHANKAN sebagai
  fallback legacy untuk event lama. Fallback chain di `createOrder`: fee spesifik per orderType → `platformFeePercent` → `DEFAULT_FEE_PERCENT` (3.5).~~
- ~~Diset Admin per event saat approval storefront (validasi 1.0–5.0 per fee) + bisa diedit terpisah setelah live via
  Admin Panel "Kelola Fee Event" (`PATCH /api/admin/events/:eventId/fees`).~~ **DIBALIK 2026-07-15**: kemampuan admin
  mengedit fee setelah live adalah **celah keamanan** (audit menemukan tidak ada guard sama sekali — fee bisa diubah
  sepihak di bawah kaki promotor yang sudah menetapkan harga). Fee sekarang **per-kategori & dikunci permanen**.
- **Siapa menanggung** (`Event.feeBearer`, wajib diisi promotor sebelum bisa ajukan approval): `"audience"` (fee ditambah ke harga, tampil transparan) atau `"promotor"` (pembeli bayar bersih, promotor terima dikurangi fee). **`feeBearer` TETAP di level Event** — yang pindah ke kategori hanya BESARAN fee (%).
- Setiap `TicketOrder` mencatat `feeAmount` + `feeBearer` terpisah. Fee nexEvent TIDAK dicampur revenue promotor. P&L & payout promotor tampilkan pendapatan NET setelah fee.
- **Business rule pitching (masih berlaku)**: mulai 3.5% → turun ke 2% untuk volume besar → 1.5% kartu truf khusus. Promotor TIDAK bisa ubah fee, hanya pilih penanggung.

### Fee Per-Kategori (Dikunci Permanen) — ✅ IMPLEMENTED 2026-07-15 — **ATURAN FEE YANG BERLAKU SEKARANG**

Perbaikan keamanan yang **membalik** keputusan lama "fee boleh diedit admin kapan saja setelah live".

- **Fee melekat di KATEGORI, bukan Event**: `TicketType.feePercent`, `MerchItem.feePercent`, `BundlePackage.feePercent`
  (+ `feeLockedAt` di ketiganya). Jadi VIP bisa 2% sementara Reguler 3% di event yang sama — mustahil di model lama.
- **Sekali kunci, permanen**: admin set fee sekali → `feeLockedAt` terisi → **tidak bisa diubah lagi oleh siapa pun**.
  Tidak ada endpoint edit, tidak ada force flag. Ditegakkan di BACKEND (atomik via `updateMany where feeLockedAt: null`),
  bukan cuma disembunyikan di UI.
- **Fail-closed, TIDAK ada fallback**: `feePercent = null` → kategori **tidak muncul di storefront/Ticket Box & checkout
  menolaknya**. `DEFAULT_FEE_PERCENT` 3.5 & fallback chain **sudah TIDAK dipakai** (fallback diam-diam = bagian dari
  masalah lama). Konsekuensi: **kategori baru tidak bisa dijual sampai admin mengunci fee-nya**.
- **Fee salah pada kategori yang sudah jalan**: **JANGAN hapus** — **nonaktifkan** (`isActive:false`, ada tombol di admin
  panel) supaya order & tiket pembeli tetap utuh, lalu promotor bikin **kategori BARU** dgn fee benar. Hapus hanya boleh
  untuk kategori **0 order berbayar** (dijaga backend → 400).
- **Fee paket = dari HARGA PAKET saja**; fee tiket/merch yang jadi isi paket tidak ikut dikenakan (kalau ikut = dobel).
- **Math**: `computeOrderFeeAndTax(event, { ticketLines, merchLines, bundleLines, bundleTicketValue })` di
  `services/ticket.service.js` = **sumber tunggal** (dipakai storefront online + Ticket Box). Tiap line
  `{ subtotal, feePercent }`; **bulatkan PER BARIS lalu jumlahkan**. `resolveFeePercents`/`computeFeeAndTax` lama
  **sudah dihapus**. Aturan pajak 10% (hanya porsi tiket) TIDAK berubah.
- **Endpoint admin** (`protect + requireAdmin`, `controllers/category-fee.controller.js`):
  `GET /api/admin/events/:eventId/categories`, `PATCH /api/admin/categories/:categoryType/:id/fee`,
  `PATCH /api/admin/categories/:categoryType/:id/deactivate`, `DELETE /api/admin/categories/:categoryType/:id`.
  `categoryType` = `ticket-types` | `merch-items` | `bundling-packages`.
- **UI**: admin panel section **"Kelola Fee per Kategori"** (menggantikan "Kelola Fee Event" yang sudah DICABUT);
  promotor lihat badge **"Menunggu Setup Fee — belum bisa dijual"** di `/dashboard/tickets`.
- **Field fee level-Event DEPRECATED tapi BELUM dihapus dari schema** (`platformFeePercent`, `ticketFeePercent`,
  `merchFeePercent`, `bundlingFeePercent`) — sengaja dibiarkan supaya `approveStorefront`/`updateEventFees` yang masih
  menulisnya tidak pecah selama transisi. **Nilainya sudah TIDAK berpengaruh ke harga sama sekali.** Endpoint
  `PATCH /api/admin/events/:eventId/fees` masih ada tapi inert & tak punya UI — kandidat hapus di pembersihan berikutnya.
  **JANGAN pakai field ini untuk perhitungan uang baru.**
- **Efek lanjutan (2026-07-16)**: karena fee kini terkunci per-kategori & line item menyimpan `price` historis, fee tiap
  baris bisa **dihitung ulang persis** seperti saat checkout (`feeTotal` hasil recompute terbukti === Σ `feeAmount`
  tersimpan). Ini yang membuat **Dashboard Tiket & Pencairan bisa pindah dari angka kotor ke NET** dan konsisten dengan
  P&L — batasan "kotor saja" yang lama sudah TIDAK berlaku. Lihat known-bugs entry [2026-07-16].
- Lihat known-bugs entry [2026-07-15] untuk detail audit, keputusan, & hasil verifikasi (64 tes E2E).

#### 2. Pajak 10% (Opsional per Event) — ✅ IMPLEMENTED (2026-07-02)
- `Event.taxEnabled Boolean @default(false)`. Kalau aktif → ditanggung pembeli.
- **KOREKSI penting (2026-07-05)**: pajak dihitung HANYA dari **subtotal tiket** (`taxAmount = round(ticketSubtotal * 0.1)`), merchandise TIDAK pernah kena pajak. Label di checkout: "Pajak Tiket (10%)". Baris pajak hanya muncul kalau ada tiket di keranjang.

#### 3. Toggle Aktif/Nonaktif — ✅ IMPLEMENTED
- Toggle switch aktif/nonaktif (hijau/abu-abu) untuk item storefront (jenis tiket via `TicketType.isActive`, produk merch, paket bundling) di `/dashboard/tickets`.

#### 4. UI Storefront Publik + Banner/Logo — ✅ IMPLEMENTED (2026-07-02/03)
- `Event.bannerUrl` + `Event.logoUrl` (upload via Supabase Storage bucket `event-assets`, endpoint `/api/upload/event-banner` & `/api/upload/event-logo`).
- `/event/[slug]` sudah redesign penuh: banner hero full-width (fallback gradient), logo overlap banner, layout 2 kolom (desktop)/1 kolom (mobile), section "Tentang Event"/"Fasilitas"/"S&K", ticket card dengan progress bar & quantity selector.

#### 5. Merchandise + Bundling — ✅ IMPLEMENTED (2026-07-05/06)
- Merch: model `MerchItem`/`MerchVariant` (size+stok)/`MerchOrderItem`; produk baru wajib approve admin (`approvalStatus`) sebelum tampil di storefront.
- Bundling Paket Kurasi (Storefront Roadmap #1): `BundlePackage` harga total, isi fleksibel tiket+merch, stok mengambil dari stok tiket & merch existing.
- **PENTING**: `TicketOrder.orderType` punya 4 nilai — `"ticket"`, `"merch"`, `"bundling"` (paket kurasi), `"mixed"` (tiket+merch biasa, fee dihitung TERPISAH per tipe — BUKAN otomatis bundling).

### Aturan Baru untuk Storefront
- Setiap transaksi tiket WAJIB mencatat: harga tiket, fee platform, pajak (jika ada)
  terpisah di database — untuk keperluan laporan keuangan yang akurat
- Fee platform yang masuk ke nexEvent TIDAK boleh dicampur dengan revenue promotor
- P&L Report promotor: tampilkan pendapatan tiket SETELAH dipotong fee platform
- Agent nexEvent WAJIB jelaskan fee kepada promotor saat pitching dengan contoh angka nyata sebelum event dibuat
- Promotor yang tidak memahami struktur fee tidak boleh disetujui storefrontnya

### Fields Event Model untuk Storefront — ✅ SUDAH ADA DI SCHEMA (bukan lagi rencana)
- `taxEnabled: Boolean @default(false)` — opsi pajak 10% (hanya subtotal tiket)
- `bannerUrl: String?` / `logoUrl: String?` — banner & logo storefront (Supabase Storage)
- `feeBearer: String?` — "audience" | "promotor" (wajib diisi sebelum approval)
- `platformFeePercent: Float?` (legacy fallback) + `ticketFeePercent` / `merchFeePercent` / `bundlingFeePercent: Float?` — fee per tipe order (diset admin)

## Storefront Feature Roadmap (Urutan Pengerjaan)

Fitur-fitur berikut wajib diselesaikan untuk kesiapan penuh nexEvent.
Dikerjakan SATU PER SATU sesuai urutan (ada ketergantungan teknis antar fitur).
Prinsip: selesai tuntas per fitur, bukan banyak yang setengah jadi.

### 1. Bundling Paket Kurasi (✅ SELESAI — DEPLOYED & VERIFIED; wording "pending deploy" dikoreksi 2026-07-20)
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

### 2. Edit Stok + Pindah Stok Antar Jenis Tiket (✅ SELESAI — deployed ke production 2026-07-12, commit `0577daf`)
Fitur operasional untuk promotor mengelola stok setelah storefront live.

Implementasi final:
- **Gate edit/pindah stok**: helper bersama `isStockEditAllowed(event)` di `services/ticket.service.js` — hanya
  boleh kalau `event.storefrontStatus === 'approved'`. Approval SEKALIGUS menetapkan fee (feeBearer wajib diisi
  sebelum ajukan approval, fee % diset admin saat approve → selalu ter-resolve via `resolveFeePercents`), jadi
  syarat "storefront approved DAN fee sudah diset admin" praktis dipenuhi oleh satu kondisi `approved` — TIDAK
  keliru memblokir event live yang pakai fee default. Pesan tolak: `STOCK_EDIT_GATE_MESSAGE` (400).
- **Edit stok tiket (kuota)**: gate dipasang di `updateTicketType` HANYA saat `quota` ikut dikirim — ubah
  nama/harga/isActive tetap bebas (setup + toggle). UI: kolom kuota di inline-edit terkunci (disabled) sampai
  approved; frontend `saveEdit` hanya kirim `quota` kalau `canEditStock`.
- **Edit stok merch**: gate dipasang di `updateVariantStock`. UI baru: seksi "Edit Stok" per varian (size) di
  `/dashboard/tickets` (inline edit + Simpan/Batal), muncul hanya saat `canEditStock`.
- **Pindah stok antar jenis tiket**: endpoint baru `POST /api/tickets/types/:id/transfer-stock`
  (body `{ destinationId, quantity }`) di `ticket.controller.js` (`transferTicketStock`). Validasi: dua tiket
  satu event + satu promotor, gate approved, `quota - sold ≥ quantity`. Mutasi ATOMIK dalam satu `$transaction`
  (decrement sumber + increment tujuan) → total kuota terjaga. **TIDAK ada batasan jumlah pindah** (hak promotor).
  UI: tombol "Pindah Stok" (ikon ArrowLeftRight) per tiket → form pilih tujuan + jumlah + preview kuota
  before/after + `confirm()`.
- Format number input harga: pakai `formatIDRInput`/`parseIDRInput` (sudah ada). Kolom kuota/stok = angka polos.
- **SATU-SATUNYA batas teknis**: stok/kuota tidak boleh diset/dipindah di bawah jumlah yang SUDAH TERJUAL
  (perlindungan agar tiket/merch terjual tidak hilang).

### 3. Box Office Offline (Ticket Box) (✅ SELESAI v1 — DEPLOYED & VERIFIED; wording "pending deploy" dikoreksi 2026-07-20)
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
- Mekanisme penekan promotor nakal: **✅ DONE (dikonfirmasi founder 2026-07-20)** — sudah tercakup oleh
  pelunasan hutang otomatis saat pencairan (Payout item #2): hutang fee cash wajib muat di saldo
  (`nominal + hutang ≤ available`) sebelum pencairan disetujui, jadi promotor tidak bisa menarik dana
  sambil membiarkan hutang. Opsi lama (blokir buat event baru / deposit di muka) TIDAK jadi dipakai —
  blokir event bertentangan dgn "event tidak dibatasi jumlahnya".

### 5. Scanner Tiket (Validasi di Venue) — ✅ SELESAI & DEPLOYED (2026-07-08, commit `16fcbb2`)
Validasi QR tiket saat penukaran/masuk venue. Keputusan yang dulu "belum diputuskan" SUDAH final:
- **Akses: akun petugas khusus (login WAJIB)** — bukan link bebas. Role baru `"scanner"` di `User`; promotor undang scanner ke event via UI di halaman Field Crew (Pro-gated). Scanner hanya bisa validasi event yang di-assign.
- **Web-based** (sesuai aturan "semua fitur web-based only" — lihat Mobile App Migration): halaman `/scanner` standalone (light theme), kamera + decode via `html5-qrcode`, overlay hijau (valid) / merah (ditolak: alasan + waktu pakai).
- Model `EventScanner` (mirror EventCrew, `@@unique([eventId,userId])`). `validateTicket` mark used atomik (`updateMany where isUsed:false`) → cegah double-accept. Endpoint `/api/scanner/*` (invite/my-events/validate/event-scanners/remove).
- Fondasi tetap: `Ticket.ticketCode` unik + `isUsed`/`usedAt`.

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
- **Model FINAL (koreksi founder 2026-07-09 — lihat known-bugs.md "KOREKSI interpretasi Payout
  item #2"): hutang fee = TAMBAHAN di atas nominal, BUKAN dipotong dari DALAM nominal.** Syarat
  diterima: `nominal + hutang ≤ saldo available`. Jika muat → promotor menerima nominal PENUH
  yang diminta; hutang fee cash dilunasi TERPISAH dari saldo pada transaksi yang sama
  (`feeSettled:true`, field `debtDeducted` dicatat untuk audit saja) — TIDAK mengurangi jumlah
  yang ditransfer ke promotor.
- Jika `nominal + hutang > saldo available`: pencairan DITOLAK SELURUHNYA (bukan dipotong
  sebagian, bukan auto-turunkan) — sistem kirim `maxAllowedAmount = available − hutang` supaya
  promotor bisa ajukan ulang dengan nominal lebih kecil sendiri, dilampiri rincian data
  pendapatan promotor supaya paham alasan penolakan.
- Ini mengubah alur `requestPayout` yang sudah ada di payout.controller.js — terintegrasi
  dengan `getPromotorFeeDebt` di fee-debt.service.js (settle hutang atomik di dalam satu
  `$transaction` bersama pembuatan PayoutRequest)

### 3. Laporan Pencairan (Payout Statement) — download promotor (✅ SELESAI — deployed, commit 101a175)
Bukti resmi pencairan yang bisa diunduh promotor setelah transfer selesai.

Keputusan final:
- Setelah pencairan disetujui admin dan ditandai "Sudah Ditransfer", promotor bisa download
  1 file laporan (PDF) berisi:
  - Rincian penjualan LENGKAP — mencakup tiket, merchandise, DAN bundling (bukan tiket saja)
  - Sisa saldo yang masih bisa ditarik (jika tidak ditarik semua sekaligus)
  - Sisa hutang fee (jika masih ada yang belum lunas setelah pelunasan otomatis di item #2)
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
2. Bangun item #2 dan #3 sekaligus (saling terkait erat — logic pelunasan hutang otomatis dan
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
11. 🔴 URGENT: Midtrans Production (menunggu approval KYC — sistem masih Sandbox). **Dikonfirmasi founder
    2026-07-20: TETAP TERBUKA & masih prioritas merah** — satu-satunya blocker monetisasi yang tersisa.
12. ✅ Storefront advanced features → SELESAI SEMUA. Lihat section "Storefront Feature Roadmap"
    (bundling paket kurasi ✅, Ticket Box offline ✅, hutang fee/rekonsiliasi ✅, scanner tiket ✅,
    Edit Stok + Pindah Stok Antar Jenis Tiket ✅ — deployed ke production 2026-07-12, commit `0577daf`).
13. ✅ Payout & Laporan Keuangan lanjutan → SELESAI SEMUA (#1–#5), DEPLOYED KE PRODUCTION 2026-07-10.
    Lihat section "Payout & Laporan Keuangan Roadmap" (pelunasan hutang fee otomatis, laporan pencairan PDF,
    laporan pendapatan platform, data audiens). Item terakhir (#5 Data Audiens, commit 21a125a) sudah
    deployed & terverifikasi di production (smoke test 401-not-404 lolos, PM2 stabil, Vercel READY).
14. ✅ Ticket Sales Manual Input (untuk promotor yang pakai platform lain)
15. 🟡 Event Summary Report (kirim via email saat event selesai) — CODE-COMPLETE & terverifikasi lokal,
    PENDING DEPLOY ke production (commit `16c9d75`). Laporan akhir 1 event (9 seksi: keuangan, sponsor+status
    bayar, pengeluaran promotor+crew, deliverables, penjualan tiket per-kategori + per-channel, data audiens,
    hutang fee, ringkasan petty cash, status pencairan) → PDF lampiran email saat "Tandai Event Selesai".
    Pro-only. Endpoint `POST /api/events/:eventId/finish` + `GET /api/events/:eventId/summary-pdf`; UI di
    `/dashboard/event-summary`. Schema `Event.finishedAt` SUDAH di-push ke Supabase (additive nullable).
    Sejak 2026-07-15 halaman ini BUKAN item sidebar lagi — dicapai lewat tombol "Laporan Akhir Event" di header
    Dashboard Keuangan (`/dashboard/pl-report`), yang mengoper `?eventId=` sehingga event tidak perlu dipilih ulang;
    dibuka tanpa `eventId` → redirect ke Dashboard Keuangan. Lihat section "Roadmap Navigasi 3-Lapis".
    **Redesign visual (Task C part 2, 2026-07-14)**: halaman P&L Report memakai design-system nexEvent (palet warm
    cream/emerald/coral, font Sora/Space Grotesk/JetBrains Mono via `next/font/google`, ikon Phosphor Duotone via
    `@phosphor-icons/react`, kartu shadow warm-ink tanpa border, tear-line divider, kartu hero Laba/Rugi gelap;
    panel "Pemasukan vs Pengeluaran" = progress bar horizontal, donut "Komposisi Pengeluaran" tetap recharts).
    Struktur data & fungsi TIDAK berubah. Font/ikon baru baru dipakai di halaman INI (halaman lain masih font lama;
    rollout app-wide = pekerjaan terpisah). Lihat known-bugs.md entry [2026-07-14] redesign P&L.
16. ✅ CRON Job booking timeout — **verifikasi SELESAI (founder, 2026-07-20)**. Job release expired orders
    berjalan normal; tidak ada tindakan tersisa.
17. ✅ Audit ownership-scoping tabel lain (`Expense`/`OtherIncome`/`PurchaseOrder`/`Budget`/dst) —
    **DONE (2026-07-20)**. Catatan pencegahan lama di section "Keamanan: Isolasi Data Per-Promotor" sudah
    dieksekusi; Invoice adalah temuan terakhirnya (lihat known-bugs [2026-07-20] scoping invoice).
18. ✅ Restrukturisasi navigasi — Dashboard KPI + Dashboard Perencanaan + EventProvider (2026-07-20).
    Lihat section "Navigasi: Pemilih Event TUNGGAL di Dashboard KPI".

**Ditunda resmi (keputusan founder, BUKAN lagi "perlu diputuskan"):**
- **Tenant/Lapak Booth Booking (B2B)** — di PRD asli (Sprint 2: "peta booth interaktif + kurasi promotor +
  self-registration + auto-invoice tenant"). Saat ini HANYA ada tab "Tenant" placeholder ber-label
  "Coming Soon" di halaman Invoice (`/dashboard/invoice`); TIDAK ada model, controller, atau logic apa pun di
  backend. **KEPUTUSAN 2026-07-20: DITUNDA sampai ada 5 promotor aktif.** Jangan mulai membangunnya sebelum
  ambang itu tercapai, dan jangan tanyakan ulang statusnya — biarkan tab placeholder apa adanya.

_Update bagian ini setiap prioritas berubah, supaya Claude Code dan Claude.ai selalu tahu fokus development saat ini._

## Mobile App Migration (Long-Term, Lowest Priority)

Founder berencana suatu saat mengubah nexEvent dari web app menjadi aplikasi mobile yang bisa di-download (App Store / Play Store). **Ini adalah item PALING TERAKHIR** — baru dikerjakan setelah SEMUA fitur web selesai dan produk siap go-to-market.

**Aturan sampai saat itu tiba:** SEMUA fitur baru (termasuk Ticket Scanner) dibangun **web-based only** — tidak ada pertimbangan native mobile wrapping di tahap ini. Catatan ini hanya placeholder perencanaan, bukan tugas aktif.

## Navigasi: Pemilih Event TUNGGAL di Dashboard KPI (berlaku sejak 2026-07-20)

> **PENTING — ini MENGGANTIKAN pola per-kategori yang dijelaskan di section "Roadmap Navigasi 3-Lapis" di
> bawah.** Section itu DIPERTAHANKAN sebagai catatan sejarah (isi tiap hub, endpoint, keputusan UI-nya masih
> akurat & berguna), tapi **bagian "tiap dashboard kategori punya pemilih event sendiri + mewariskan
> `?eventId=` ke turunannya" SUDAH TIDAK BERLAKU.** Kalau dua section berbeda, YANG INI yang menang.

**Pola sekarang: satu pemilih event untuk SELURUH `/dashboard`.**
- **`client/src/contexts/event-context.tsx`** — `EventProvider` + hook `useSelectedEvent()` (`selectedEventId`
  + setter), dipasang di `app/dashboard/layout.tsx` membungkus `{children}`. **Ini SATU-SATUNYA sumber
  kebenaran pemilihan event.** JANGAN buat `useState` event baru di halaman mana pun.
- **Sinkronisasi URL**: `?eventId=` tetap dipakai supaya deep-link & Back/Forward jalan. Aturannya:
  **URL menang** kalau param ada; **state menang** kalau URL kosong (provider menulis balik via
  `router.replace`, BUKAN `push` — hindari riwayat membengkak). State bertahan lintas navigasi client-side
  karena layout tidak re-mount.
- **`/dashboard` = Dashboard KPI**: tempat event dipilih (satu-satunya dropdown yang "berwenang"), ringkasan
  StatCards mengikuti event terpilih (fallback akumulasi semua event kalau belum ada pilihan), tombol Buat
  Event Baru, 4 kartu akses cepat (Perencanaan / Kerjasama / Ticketing / Keuangan). Sejak 2026-07-22 kartu
  akses cepat menampilkan **ringkasan angka event terpilih** via endpoint agregat
  `GET /api/dashboard/summary?eventId=` (`dashboard.controller.js` — semua angka reuse sumber tunggal
  existing; seksi sponsor & keuangan ber-`proLocked` per-seksi utk Starter; saldo payout = "Saldo Akun"
  lintas-event by design). Lihat known-bugs [2026-07-22] kartu Akses Cepat.
- **`/dashboard/perencanaan` = Dashboard Perencanaan**: indeks RAB + Purchase Order per-event + pintu ke
  Simulasi Harga Tiket. **PO pindah ke sini dari halaman Invoice** (keputusan founder: PO = alat perencanaan
  belanja, bukan dokumen kerjasama). Sejak 2026-07-22 header halaman punya **baris 3 aksi cepat**
  (Kelola RAB / Simulasi Harga Tiket / Buat PO) sebagai satu-satunya pintu ketiga aksi itu — detail di
  section "Document Table" di atas.
- Halaman lain boleh tetap punya dropdown event demi kenyamanan, **tapi WAJIB menulis ke context yang SAMA**
  (`setSelectedEventId`), bukan state lokal.
- **`/dashboard/payout` PENGECUALIAN — bebas event.** Provider bahkan sengaja tidak menulis `?eventId=` ke
  URL-nya (`EVENT_FREE_PATHS`). JANGAN tambahkan pemilih event/redirect ke sana.

**Tiga jebakan yang WAJIB diingat saat menyentuh area ini** (ketiganya sudah menggigit sekali — lihat
known-bugs [2026-07-20] Restrukturisasi navigasi):
1. **Guard redirect baca context, BUKAN `searchParams`.** URL menyusul satu tick setelah navigasi; guard
   berbasis URL akan memantulkan user yang sudah memilih event.
2. **`<Suspense fallback>` provider TIDAK boleh merender `{children}`** — kalau dirender di fallback, children
   ada di LUAR provider → `useSelectedEvent()` melempar. Fallback = `null`.
3. **JANGAN auto-pilih `events[0]`** di halaman mana pun. Dengan pilihan global, fallback itu diam-diam
   mengubah event aktif untuk SELURUH dashboard. (Sudah dicabut dari Sponsor & Simulasi.)

## Roadmap Navigasi 3-Lapis

> ⚠️ **SEBAGIAN SUPERSEDED (2026-07-20)** — lihat section di atas. Mekanisme pemilihan event per-kategori
> (dropdown sendiri + wariskan `?eventId=` dari hub ke turunan) sudah diganti pemilih tunggal di Dashboard
> KPI. Deskripsi ISI tiap hub, endpoint, dan keputusan UI di bawah masih berlaku.

- **Layer-2 — Dashboard Kerjasama (`/dashboard/kerjasama`, label sidebar "Dashboard Kerjasama", badge Pro, item PERTAMA
  di grup "Kerjasama")** — dibangun dari 0 (2026-07-18, pola sama Dashboard Ticketing). Hub ringkasan per-event kategori
  Kerjasama: 4 kartu (Ringkasan Sponsor status deal, Ringkasan Invoice status bayar, Progress Target Sponsor dari
  `Event.target_sponsorship`, Deliverables per Brand sebagai daftar per-brand — bukan angka agregat) + 2 tombol nav ke
  Sponsor & Partner dan Invoice & PO (deep-link `?tab=sponsorship`). Endpoint BARU (read-only, di-scope `promotorId`+`eventId`):
  `GET /api/sponsor/dashboard-summary?eventId=` di `kerjasama-dashboard.controller.js`.
  **POLA HUB PENUH sejak 2026-07-18 (instruksi lanjutan founder — MEMBALIK caveat sebelumnya):** "Sponsor & Partner"
  (`/dashboard/sponsor`) & "Invoice & Purchase Order" (`/dashboard/invoice`) **SUDAH DIHAPUS dari sidebar**; Dashboard
  Kerjasama kini **SATU-SATUNYA pintu masuk sidebar** kategori ini — sama seperti Dashboard Keuangan & Ticketing.
  Halaman turunannya tetap ada, dicapai lewat 2 tombol nav di hub + tombol "Kembali ke Dashboard Kerjasama" di masing-masing
  halaman (Sponsor & Partner dan Invoice & PO). **BEDA dari Keuangan/Ticketing:** turunan Kerjasama LINTAS-EVENT (Sponsor
  daftar semua deal + pemilih event sendiri untuk kode undangan; Invoice daftar semua invoice) → hub TIDAK mengoper
  `?eventId=` dan tombol back TIDAK pakai eventId/redirect (bukan pola per-event Expense Tracker/Manajemen Tiket).
  Lihat known-bugs entry [2026-07-18].
- **Layer 1 — Halaman detail** (RAB, Sponsor, Expense, P&L, Tiket, dll): SUDAH ada semua. Tidak dibangun ulang.
- **Layer 2 — 5 dashboard kategori** (Perencanaan, Kerjasama, Operasional, Keuangan, Tiket & Pencairan): tiap dashboard jadi
  **SATU-SATUNYA pintu masuk** ke halaman detail bertema sama. Pola: event/konteks dipilih SEKALI di level dashboard →
  diturunkan ke halaman detail via query param (`?eventId=`); halaman detail yang dibuka TANPA konteks itu `router.replace`
  balik ke dashboard-nya. Halaman detail turunan TIDAK lagi jadi item sidebar sendiri (dicapai lewat tombol di dashboard).
  **Status: Dashboard Keuangan (`/dashboard/pl-report`, label sidebar "Dashboard Keuangan") = pilot** — dikerjakan duluan
  untuk memvalidasi pola sebelum direplikasi ke 4 kategori lain. Turunannya: Expense Tracker (`/dashboard/expenses`) +
  Laporan Akhir Event (`/dashboard/event-summary`) — keduanya **bukan item sidebar**, hanya dicapai lewat tombol di hub.
  **✅ Pola SUDAH divalidasi manual oleh founder di production (2026-07-15) — jalan sesuai harapan, siap direplikasi ke 4
  kategori sisanya.** Lihat known-bugs entry [2026-07-15].
  **Layer-2 KEDUA — Dashboard Tiket & Pencairan (`/dashboard/ticketing`)**, dibangun dari 0 (2026-07-15, ✅ deployed & verified — wording "pending deploy" dikoreksi 2026-07-20):
  hub kategori "Tiket & Pencairan" — 3 kartu (tiket/merch/bundling), grafik tren penjualan, kartu Saldo Payout lintas-event.
  **Tombol "Data Audience" per-event ada di header hub ini (sejak 2026-07-17, dipindah dari Manajemen Tiket)** — unduh PDF
  audiens event yang dipilih di selector hub (`GET /api/tickets/audience-report/event/:id`), dinonaktifkan sampai event
  dipilih. Manajemen Tiket (`/dashboard/tickets`) TIDAK lagi punya tombol ini. (Catatan terkait: tombol "Data Audiens Semua
  Event" di halaman Sponsor & Partner DIHAPUS 2026-07-17 — diganti link "Kelola Invoice Sponsor" → `/dashboard/invoice?tab=sponsorship`;
  invoice kini dukung deep-link sub-tab via `?tab=`. Lihat known-bugs [2026-07-17].)
  Endpoint BARU (read-only, `ticket-dashboard.controller.js`): `GET /api/tickets/dashboard-summary?eventId=` (count+Rp per
  kategori) & `GET /api/tickets/sales-trend?eventId=[&weekOf=]` (span ≤45 hari → harian; >45 → mingguan bucket Senin +
  drill-down `weekOf`; hari dipotong WIB).
  **✅ Pola hub PENUH sejak 2026-07-16 — MEMBALIK keputusan lama "turunannya tetap item sidebar"**: "Manajemen Tiket" &
  "Pencairan Dana" **SUDAH DIHAPUS dari sidebar**; `/dashboard/ticketing` kini **SATU-SATUNYA pintu masuk** kategori ini,
  sama seperti Dashboard Keuangan. Grup sidebar "Tiket & Pencairan" tetap ada dgn "Dashboard Tiket & Pencairan" sebagai
  satu-satunya item.
  - **Manajemen Tiket (`/dashboard/tickets`) = per-event**: mewarisi `?eventId=` dari hub, dropdown pilih event DIHAPUS,
    dibuka tanpa `eventId` → `router.replace("/dashboard/ticketing")`. Pola & kode persis `expenses`/`event-summary`.
    Konsekuensi: tombol "Manajemen Tiket" di hub **wajib** mengirim `?eventId=` (kalau tidak, langsung memantul balik) —
    karena itu tombolnya **dinonaktifkan selama event belum dipilih**, bukan dibiarkan memantul.
  - **Pencairan Dana (`/dashboard/payout`) = LINTAS EVENT — PENGECUALIAN DISENGAJA, BUKAN KELALAIAN**: halaman ini **tidak
    punya konteks event sama sekali** (saldo & pengajuan pencairan tidak terikat satu event, dan memang tidak ada pemilih
    event di sana). Jadi ia **TIDAK** mewarisi `eventId`, **TIDAK** punya redirect, dan tombol kembalinya link polos tanpa
    query param. **JANGAN "perbaiki" dengan menambah pemilih event / eventId / redirect ke halaman ini** — itu bukan celah
    yang terlewat, itu memang sifat fiturnya. Lihat komentar penjelas di `payout/page.tsx`.
  **Seksi "Breakdown Penjualan per Kategori" (2026-07-16)**: tiket per JENIS & merch per SIZE dgn progress bar
  (sold/kuota, sold/stok); bundling **hanya TOTAL tanpa bar** — `BundlePackage` memang TIDAK punya kuota sendiri,
  stoknya menumpang tiket & merch komponennya. Sumber: endpoint baru `GET /api/tickets/category-breakdown?eventId=`
  (`ticket-dashboard.controller.js`). **"Terjual" = paid-only** dan **sudah termasuk tiket/merch yang terjual lewat
  paket** (tiket dihitung dari tabel `Ticket` lintas 2 jalur `orderItem`/`bundleOrderItem`; merch dari
  `MerchOrderItem` + `BundleOrderItem.merchSelections`) — tanpa itu, catatan "bundling sudah tercermin di angka di
  atas" jadi bohong. **Sengaja BUKAN kolom `TicketType.sold`/`MerchVariant.sold`** (kolom itu naik saat order masih
  `pending` untuk menahan stok) → **angka di Manajemen Tiket bisa sedikit lebih tinggi; itu DISENGAJA**, bukan bug:
  Manajemen Tiket = stok tertahan (operasional), Dashboard ini = penjualan nyata (uang). Angka bundling dipakai
  bersama kartu ringkasan lewat `computeCategoryTotals` → mustahil beda.
  **Bundling TIDAK punya kartu sendiri di seksi breakdown (dihapus 2026-07-16)** — angkanya identik dgn kartu
  "Total Bundling Terjual" di ringkasan atas (dua-duanya turun dari `computeCategoryTotals`, jadi duplikasinya
  struktural). Bundling tampil **hanya di kartu ringkasan atas**; seksi breakdown menyisakan Tiket & Merch saja.
  Endpoint tetap mengembalikan `bundlingTotal` dan frontend masih memakainya untuk **caption** di bawah grid
  ("termasuk N paket bundling…") — caption itu menjelaskan angka TIKET & MERCH (unit yang laku lewat paket sudah
  ikut terhitung di bar progres), jadi JANGAN ikut dihapus mengira sisa kartu Bundling. **JANGAN hidupkan lagi
  kartu Bundling di seksi breakdown.** Lihat known-bugs entry [2026-07-16] card Bundling duplikat.
  **NAVIGASI = 1 PINTU PER HALAMAN DETAIL (konsolidasi 2026-07-16)**: `/dashboard/tickets` HANYA lewat tombol
  **"Manajemen Tiket" di header**; `/dashboard/payout` HANYA lewat tombol **"Pencairan Dana" di header**. Header dipilih
  karena SELALU ter-render — kartu/link lain hanya muncul setelah event dipilih & data termuat. Yang dihapus: tombol
  "Lihat Detail" di kartu Saldo Payout (kartu jadi informasional; datanya utuh), kalimat berlink "Saldo yang bisa
  dicairkan ada di…", dan seluruh seksi "Kelola" (2 kartu, murni navigasi tanpa data). Link "Laporan Laba/Rugi" →
  `/dashboard/pl-report` BUKAN duplikat (tujuan beda, 1 jalan) — biarkan. **JANGAN tambah jalan kedua ke dua tujuan di
  atas.** Lihat known-bugs entry [2026-07-16] konsolidasi navigasi.
  **Angka Rp di hub ini = NET, konsisten dengan P&L** (sejak 2026-07-16 — menggantikan batasan "kotor saja" yang lama).
  Dimungkinkan setelah migrasi fee per-kategori: fee terkunci permanen + line item simpan `price` historis → fee per
  baris bisa direproduksi persis seperti checkout, jadi net per kategori eksak (termasuk order `"mixed"`).
  **Rumus WAJIB ikut P&L** (`Σ(totalAmount − feeAmount)`), yaitu `subtotal + pajak − (feeBearer==='promotor' ? fee : 0)`:
  **pajak TIDAK dipotong** (hak promotor) dan **`feeBearer` wajib diperhitungkan** (kalau `audience`, fee dibayar pembeli
  → jangan dikurangi dari promotor). Pajak dilaporkan terpisah (`taxTotal`) karena bukan pendapatan kategori mana pun dan
  pemecahannya ke tiket-vs-bundling butuh aproksimasi. Identitas yang dijaga tes:
  `kartu(tiket+merch+bundling) + taxTotal === totalNet === P&L`. Lihat known-bugs entry [2026-07-16].
- **Layer 3 — Master dashboard**: ringkasan highlight dari kelima dashboard kategori. Dikerjakan PALING AKHIR, setelah
  kelima Layer-2 selesai & polanya tervalidasi. **Belum dimulai.**

Catatan implementasi: `useSearchParams` (Next 16) WAJIB dibungkus `<Suspense>` — kalau tidak, build gagal / halaman jatuh ke
dynamic rendering. Pola wrapper + `*Inner` sudah dipakai di `invoice`, `upgrade`, `pl-report`, `expenses`, `event-summary`.

## Layout Halaman Manajemen Tiket

`client/src/app/dashboard/tickets/page.tsx` pakai **2 kolom seimbang di desktop** (`lg:grid-cols-2 lg:items-start`; di bawah
`lg` menumpuk 1 kolom seperti biasa): **kiri = katalog jualan** (Jenis Tiket, Merchandise, Paket Bundling), **kanan =
storefront & operasional** (Tampilan Storefront, Informasi Storefront, Pengaturan Storefront, Ticket Box Offline, Pesanan).
**Pesanan sengaja paling akhir** di kolom kanan — daftarnya tak terbatas, kalau di atas ia mendorong seksi konfigurasi ke
bawah. Sebelumnya `lg:grid-cols-5` (kiri `col-span-3` isi 7 seksi, kanan `col-span-2` isi Pesanan saja) → timpang & kolom
kiri kepanjangan. Lihat known-bugs entry [2026-07-15].

**Manajemen Sponsor pakai pola split yang sama** (`client/src/app/dashboard/sponsor/page.tsx`, sejak 2026-07-18):
`lg:grid-cols-2 lg:items-start` (di bawah `lg` menumpuk 1 kolom) — **kiri = alur sponsor aktif** (InvitationCodeGenerator +
DealTracker), **kanan = katalog/pengaturan** (BenefitBuilder + PackageBuilder + ThresholdSettings); container dilebarkan ke
`max-w-7xl`; `[&>*:first-child]:mt-0` menetralkan `mt-12` bawaan section pertama tiap kolom agar puncak sejajar. Tombol
"Kembali ke Dashboard Kerjasama" tetap full-width di atas grid. Link page-level "Kelola Invoice Sponsor" DIHAPUS (redundan
dengan Dashboard Kerjasama); aksi "Generate Invoice" per-deal di DealCard tetap ada. Lihat known-bugs entry [2026-07-18].

## Aturan Tambahan

- Setiap selesai coding, selalu commit + push + deploy.sh
- Prisma singleton wajib — jangan `new PrismaClient()`
- Auth middleware: `server/src/middleware/auth.middleware.js` — return 401 bukan 404
- Setiap selesai fix bug nontrivial, WAJIB update `docs/known-bugs.md` (lihat section "Known Bugs & Fixes" di atas)
- Semua fitur Pro wajib cek `isPro` dari hook `useUser.ts` sebelum render konten — tampilkan lock UI untuk Starter, bukan redirect atau hide menu.
- **JANGAN definisikan komponen React DI DALAM komponen lain** (mis. `const Shell = ({children}) => (...)` atau `const PageHeader = () => (...)` di dalam body fungsi halaman). Tiap re-render (mis. tiap keystroke pada input yang meng-update state) membuat referensi fungsi BARU → React meng-unmount & remount seluruh subtree komponen tersebut, sehingga input yang sedang difokus KEHILANGAN FOKUS tiap ketik (dan state DOM lain ikut hilang). Selalu definisikan komponen di TOP-LEVEL modul. Sama juga hindari `key` yang berubah tiap render (`key={Math.random()}`/`key={Date.now()}`). Lihat known-bugs [2026-07-17] (P&L Report input Deskripsi). Instansi serupa yang masih perlu dibersihkan: `client/src/app/dashboard/ticketing/page.tsx` (`const Shell` di dalam komponen).
- **Sidebar nav grouping** (`client/src/components/dashboard/sidebar.tsx`): tiap item `nav` boleh punya field opsional `group` (`"Perencanaan" | "Kerjasama" | "Operasional" | "Keuangan" | "Tiket & Pencairan"`) → dirender sebagai section collapsible (state `useState`, default terbuka, tidak dipersist) sesuai urutan `GROUP_ORDER`. Item TANPA `group` render ungrouped seperti biasa: "Dashboard" + **"Setup Event"** di atas (tier atas, sebelum grup pertama), item ungrouped SESUDAH grup pertama (mis. **"Settingan Kelola Crew"** + item `adminOnly`) render di tier bawah SESUDAH semua grup, item `hidden` (mis. "Vendor & Talent") tetap terfilter. **"Settingan Kelola Crew"** (href `/dashboard/crew`, Pro) sengaja ungrouped — halaman setting akses crew yang berdiri sendiri, BUKAN bagian salah satu dari 5 dashboard kategori; ditempatkan sebagai bottom-item pertama sehingga muncul tepat di bawah "Dashboard Tiket & Pencairan" (grup "Tiket & Pencairan" = grup terakhir di GROUP_ORDER). **"Petty Cash" sudah TIDAK ada di sidebar** (kini per-event, dicapai lewat tombol di Dashboard Keuangan) → group "Operasional" jadi kosong & otomatis tidak dirender. Grouping murni rendering — filter `!item.hidden && (!item.adminOnly || isAdmin)` jalan DULU sebelum grouping; href/badge/Pro-gating tidak disentuh. **Grouping murni tematik, BUKAN proxy tier harga**: dalam satu group, item boleh beda status Pro-gating — mis. di "Kerjasama", "Dashboard Kerjasama" ber-`badge: "Pro"` bisa saja berdampingan dgn item gratis. (Contoh lama "Dashboard Perencanaan gratis berdampingan Simulasi Pro" sudah tidak relevan — item "Simulasi Harga Tiket" DIHAPUS dari sidebar 2026-07-22, grup "Perencanaan" kini 1 item.)
- **`activePrefix` — semantik ADITIF (sejak 2026-07-21)**: item aktif bila `pathname === href` **ATAU** pathname berada di subtree `activePrefix`. Dipakai supaya halaman hub tetap menyala saat user di sub-route yang path-nya beda (satu-satunya pemakai sekarang: "Dashboard Perencanaan" + `activePrefix: "/dashboard/rab"` → tetap menyala di editor `/dashboard/rab/[id]`). **Dulu semantiknya MENGGANTI exact-match** — itu diperlukan saat dua item berbagi href yang sama ("Dashboard" vs "RAB Builder", dua-duanya `/dashboard`). Kasus itu sudah tidak ada: **item "RAB Builder" DIHAPUS 2026-07-21** karena href-nya identik dgn "Dashboard Perencanaan" dan hub itu sudah mencakup isinya. Kalau menambah `activePrefix` baru, pastikan subtree-nya tidak tumpang tindih dgn href item lain (nanti dua item menyala bersamaan). Catatan 2026-07-22: item "Simulasi Harga Tiket" sudah TIDAK ada di sidebar; `/dashboard/simulasi` saat ini SENGAJA tidak menyalakan item mana pun — `activePrefix` masih satu string, JANGAN tambahkan dukungan multi-prefix hanya untuk ini tanpa permintaan founder.
