# nexEvent SaaS — Known Bugs & Fixes

File ini adalah log permanen bug yang sudah pernah terjadi di project ini beserta solusinya.

**Untuk Claude Code:**
- WAJIB cek file ini dulu sebelum mulai debugging bug baru — kalau gejala mirip, coba solusi yang sudah tercatat dulu.
- WAJIB tambah entry baru ke bawah setelah berhasil fix bug nontrivial. Gunakan format yang sama persis dengan entry di bawah.

**Format entry:**
```
## [YYYY-MM-DD] Judul singkat bug
- Gejala: ...
- Root cause: ...
- File terkait: ...
- Fix: ...
- Tag: #tag1 #tag2
```

---

## [2026-06-24] PATCH /api/invoices/:id/status → 500

- Gejala: Request PATCH ke endpoint update status invoice gagal dengan response 500.
- Root cause: `verifyToken` tidak ada di export middleware (hanya `protect` yang di-export).
- File terkait: `server/src/middleware/auth.middleware.js`
- Fix: Tambahkan `verifyToken: protect` sebagai alias di export middleware.
- Tag: #auth #middleware #500-error #invoice

---

## [2026-06-24] Invoice tidak muncul di tab Invoice (Document Table)

- Gejala: Invoice yang sudah dibuat tidak tampil di tab "Invoice" pada Document Table, meskipun data ada di database.
- Root cause: Deal historis memiliki `eventId = null`, sementara tab Invoice sebelumnya melakukan filter berdasarkan event — invoice tanpa event jadi tidak pernah muncul.
- File terkait: `client/src/app/dashboard/document-table.tsx`
- Fix: Tab Invoice ditulis ulang agar menampilkan semua invoice langsung dari `GET /api/invoices` (state `allInvoices`) tanpa filter per event.
- Tag: #invoice #document-table #data-display

---

## [2026-06-30] Prisma client stale — `Unknown argument 'phone'` saat register

- Gejala: Endpoint `POST /api/auth/register` mengembalikan "Server error". Log PM2 di VPS menampilkan error: `Unknown argument 'phone'. Available options are marked with ?` pada `auth.controller.js:22`. User baru tidak bisa daftar sama sekali.
- Root cause: `schema.prisma` sudah punya field `phone String?` dan kolom sudah ada di database (Supabase), tapi Prisma client yang di-generate di `node_modules` VPS masih dari versi lama yang belum mengenal field `phone`. Client dan schema tidak sinkron. Terjadi ketika schema diupdate atau deploy dilakukan tanpa `npx prisma generate` yang sukses (kemungkinan race condition dengan `git push` — lihat entry race condition).
- File terkait: `server/prisma/schema.prisma`, `server/src/controllers/auth.controller.js`
- Fix immediate: SSH ke VPS → generate ulang Prisma client → restart PM2:
  ```bash
  ssh root@145.79.12.170
  cd /var/www/nexevent/server
  npx prisma generate
  pm2 restart nexevent-api
  ```
  `deploy.sh` sudah include `prisma generate` di step 3 — jika terjadi lagi, pastikan `git push` selesai dan commit terbaru terverifikasi di GitHub sebelum jalankan `deploy.sh` (lihat entry race condition 2026-06-30).
- Tag: #prisma #register #deployment #production #stale-client #phone #server-error

---

## [2026-06-30] Sponsor deal tidak muncul di dashboard

- Gejala: Setelah sponsor submit deal lewat sponsor-portal, deal tidak muncul di dashboard promotor.
- Root cause: Error saat proses create deal tidak ditangani dengan baik (gagal silent), sehingga deal sebenarnya tidak tersimpan tapi user/promotor tidak tahu ada error.
- File terkait: Controller deal di backend (sponsor deal creation flow)
- Fix: Tambahkan error handling yang proper — error di-log dan dikembalikan ke client, bukan gagal silent.
- Tag: #sponsor #deal #error-handling #dashboard

---

## [2026-06-30] Nginx gagal start

- Gejala: Nginx tidak bisa start di VPS production.
- Root cause: Docker sudah menggunakan port 80 dan 8080, sehingga konfigurasi Nginx yang mencoba pakai port tersebut bentrok.
- File terkait: Konfigurasi Nginx di VPS Hostinger
- Fix: Gunakan port 3001 untuk Nginx (proxy ke Express port 5000), hindari port 80 dan 8080 yang sudah dipakai Docker.
- Tag: #nginx #deployment #vps #port-conflict

---

## [2026-06-30] `prisma migrate dev` gagal — drift detection karena tidak ada migration files

- Gejala: Menjalankan `npm run migrate` menghasilkan error "Drift detected: Your database schema is not in sync with your migration history" karena field `phone` ada di DB tapi tidak di migration history.
- Root cause: Database di-setup menggunakan `prisma db push` (bukan `prisma migrate dev`), sehingga tidak ada migration files di `server/prisma/migrations/`. Ketika mencoba menambahkan field baru via `migrate dev`, Prisma mendeteksi drift antara schema file dan DB state.
- File terkait: `server/prisma/schema.prisma`
- Fix: Gunakan `npx prisma db push` untuk apply schema changes, lalu `npx prisma generate` untuk regenerate client. Jangan gunakan `prisma migrate dev` karena project ini tidak punya migration history.
- Tag: #prisma #migration #db-push #schema

---

## [2026-06-30] Race condition deploy — endpoint tidak muncul di production

- Gejala: Endpoint baru (`GET /api/auth/me`, `PATCH /api/users/plan`) tidak tersedia setelah deploy pertama — API mengembalikan 404 "Route tidak ditemukan" meskipun deploy.sh selesai tanpa error.
- Root cause: `deploy.sh` dijalankan di VPS sebelum `git push` dari local selesai, sehingga `git pull` di dalam deploy.sh masih menarik commit lama. PM2 restart berjalan sukses tapi menjalankan kode lama.
- File terkait: `deploy.sh`, VPS git state
- Fix: Pastikan `git push` selesai dan commit terbaru sudah terverifikasi di GitHub (cek commit SHA) sebelum SSH ke VPS dan jalankan `deploy.sh`. Urutan wajib: push → verify → deploy.
- Tag: #deployment #vps #git #race-condition

---

## [2026-06-30] Plan/Tier field ditambahkan ke tabel users

- Gejala: (Bukan bug — catatan implementasi fitur baru)
- Root cause: Platform membutuhkan sistem tier Starter/Pro sebagai fondasi feature gating.
- File terkait: `server/prisma/schema.prisma`, `server/controllers/users.controller.js`, `server/routes/users.routes.js`, `server/src/controllers/auth.controller.js`, `server/src/routes/auth.routes.js`, `client/src/hooks/useUser.ts`, `client/src/app/login/page.tsx`
- Fix/Implementasi:
  - Field `plan String @default("starter")` ditambahkan ke model `User` di schema.prisma
  - Schema di-apply ke Supabase via `prisma db push` (bukan migrate dev — project tidak punya migration history)
  - `GET /api/auth/me` (protected) — return profil user lengkap termasuk plan
  - `POST /api/auth/login` — response data sekarang include field `plan`
  - `PATCH /api/users/plan` (protected) — update plan user, validasi hanya `"starter"` atau `"pro"`, error P2025 → 404
  - Frontend: login page store `user_plan` ke localStorage; hook `useUser.ts` fetch `/api/auth/me` dan expose `{ user, loading, isPro }` untuk feature gating
  - Aturan gating: tampilkan lock UI untuk Starter (jangan redirect/hide menu)
- Tag: #prisma #schema #plan #tier #feature-gating

---

## [2026-06-30] Expense Tracker — Fitur Pro baru ditambahkan

- Gejala: (Bukan bug — catatan implementasi fitur baru)
- Root cause: Platform butuh fitur pencatatan pengeluaran event yang di-gate sebagai fitur Pro.
- File terkait:
  - `server/prisma/schema.prisma` — model `Expense` + relasi ke `Event` dan `User`
  - `server/controllers/expenses.controller.js` — GET, POST, DELETE
  - `server/routes/expenses.routes.js` — route `/api/expenses`
  - `server/src/index.js` — `app.use('/api/expenses', expensesRoutes)`
  - `client/src/app/dashboard/expenses/page.tsx` — halaman baru
  - `client/src/components/dashboard/sidebar.tsx` — nav item + Pro badge
- Fix/Implementasi:
  - `GET /api/expenses?eventId=xxx` — return semua expense milik user untuk event tertentu, order by date DESC
  - `POST /api/expenses` — create expense, validasi amount positif, ownership event dicek via `promotor_id`
  - `DELETE /api/expenses/:id` — hapus expense, cek ownership via `userId`, return 403 jika bukan pemilik
  - Frontend: `isPro` dari `useUser()` dipakai untuk gating — Starter lihat lock UI, Pro lihat form + feed
  - Lock UI tampil di halaman (bukan redirect/hidden menu), tombol upgrade ke `/dashboard/upgrade`
  - Sidebar: item "Expense Tracker" selalu tampil untuk semua user, badge amber "Pro" di sebelah label
- Tag: #expense-tracker #pro-feature #prisma #feature-gating

---

## [2026-06-30] Expense Tracker — color palette salah + kategori hardcoded

- Gejala: Halaman `/dashboard/expenses` menggunakan dark theme (bg-neutral-950, amber accent) yang tidak konsisten dengan dashboard yang menggunakan light theme (bg-white, emerald accent). Category dropdown menampilkan daftar hardcoded, bukan kategori RAB dari event yang dipilih.
- Root cause: Implementasi awal menggunakan palette yang berbeda dari design system nexEvent. Kategori harusnya diambil dari tabel `budget_categories` milik event yang dipilih, bukan dari konstanta hardcoded.
- File terkait:
  - `client/src/app/dashboard/expenses/page.tsx`
  - `server/controllers/expenses.controller.js`
  - `server/routes/expenses.routes.js`
- Fix:
  - Semua warna di-replace ke palette nexEvent: `bg-white`, `border-slate-200`, `text-slate-900`, `text-emerald-800` (accent), `focus:border-emerald-500`. Amber hanya untuk badge PRO (`bg-amber-100 text-amber-800`).
  - Tambah `getBudgetCategories` di controller — query `Budget → BudgetCategory` via `eventId`, return `{ success, categories: string[] }`.
  - Tambah `GET /api/expenses/budget-categories?eventId=xxx` di routes (WAJIB didaftarkan SEBELUM `/:id` agar tidak ketubruk wildcard).
  - Frontend fetch kategori setiap event berubah; fallback ke DEFAULT_CATEGORIES jika event tidak punya RAB atau fetch gagal.
  - Reset `category` ke `categories[0]` setiap `categories` list berubah.
- Tag: #expense-tracker #ui #color-palette #dynamic-categories #rab

---

## [2026-07-01] Field Crew System + Petty Cash — Implementasi baru

- Gejala: (Bukan bug — catatan implementasi fitur baru)
- Root cause: Platform butuh sistem manajemen kas lapangan (petty cash) untuk crew event, terpisah dari Expense Tracker promotor.
- File terkait:
  - `server/prisma/schema.prisma` — tambah field `role` ke User, model baru: `EventCrew`, `PettyCashAccount`, `PettyCashTransaction`
  - `server/src/controllers/auth.controller.js` — register terima `role` param, login include `role` di JWT
  - `server/controllers/crew.controller.js` — inviteCrew, getEventCrew, removeCrew, getMyCrew
  - `server/controllers/pettycash.controller.js` — topupCrew (promotor), getMyAccount (crew), createTransaction (crew), getPromoterOverview (promotor)
  - `server/routes/crew.routes.js` + `server/routes/pettycash.routes.js`
  - `server/src/index.js` — register `/api/crew` dan `/api/petty-cash`
  - `client/src/app/dashboard/crew/page.tsx` — Crew Management page (Pro-gated, promotor)
  - `client/src/app/field/page.tsx` — Mobile UI untuk crew (standalone, dark theme, no dashboard layout)
  - `client/src/components/dashboard/sidebar.tsx` — tambah "Field Crew" nav item dengan Pro badge
- Fix/Implementasi:
  - Schema: `User.role` default `"promotor"`, valid values `"promotor" | "crew"`
  - Register: body accept `role` param, validasi whitelist `["promotor","crew"]`, default ke `"promotor"` jika tidak valid
  - Login: `role` dimasukkan ke JWT payload → tersedia di `req.user.role` di semua controllers
  - `POST /api/crew/invite` (promotor only): cek email exist → cek role crew → cek duplikat → buat EventCrew + PettyCashAccount dalam satu transaksi
  - `GET /api/crew?eventId=xxx` (promotor): return list crew dengan balance (= topup - expense - return)
  - `DELETE /api/crew/:crewId?eventId=xxx` (promotor): hapus EventCrew + PettyCashAccount (cascade hapus transactions)
  - `GET /api/crew/my-events` (crew): return semua event assignments crew beserta balance
  - `POST /api/petty-cash/topup` (promotor only): create transaction type="topup"
  - `POST /api/petty-cash/transaction` (crew only): hanya type="expense" atau "return", type="topup" → 400
  - `GET /api/petty-cash/my-account?eventId=xxx` (crew): return account + balance + transactions
  - `GET /api/petty-cash/overview?eventId=xxx` (promotor): return all accounts + summary (totalTopup, totalExpense for P&L, totalReturn, netCashOut)
  - KRITIS: P&L hanya boleh pakai `type:"expense"` — bukan `direction:"out"` (topup dan return bukan biaya nyata)
  - Route ordering: `GET /crew/my-events` harus didaftarkan SEBELUM `DELETE /crew/:crewId` agar tidak ketubruk wildcard
  - `/field` halaman standalone (bukan di bawah `/dashboard`) — tidak pakai layout dashboard, dark theme OK
- Tag: #field-crew #petty-cash #prisma #schema #role #mobile-ui #pro-feature

---

## [2026-07-01] POST /api/crew/invite → 403 "Hanya promotor" padahal user adalah promotor

- Gejala: User yang sudah login sebagai promotor mendapat HTTP 403 "Hanya promotor yang bisa invite crew" saat POST `/api/crew/invite`. `req.user.role` adalah `undefined` meskipun DB user punya `role = "promotor"`.
- Root cause: JWT token user digenerate **sebelum** field `role` ditambahkan ke `jwt.sign()` payload (sebelum deploy Field Crew feature). Token lama tidak mengandung field `role`, sehingga `jwt.verify()` menghasilkan decoded tanpa `role`, dan `req.user.role === "promotor"` selalu `false` (undefined !== "promotor"). User tidak perlu re-login karena token masih valid (belum expired 7 hari).
- File terkait: `server/src/middleware/auth.middleware.js`
- Fix: Middleware diubah menjadi `async`. Setelah `jwt.verify()`, jika `decoded.role === undefined`, lakukan DB lookup ke tabel `users` untuk ambil `role` yang sebenarnya dan inject ke `decoded.role` sebelum `req.user = decoded`. Ini handles semua token lama tanpa memaksa re-login.
  ```js
  if (decoded.role === undefined) {
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { role: true } });
    decoded.role = user?.role ?? 'promotor';
  }
  ```
- Tag: #auth #middleware #jwt #role #403 #field-crew

---

## [2026-07-01] Register page tidak punya role selector — crew tidak bisa mendaftar

- Gejala: Promotor mendapat error 400 "User ini bukan crew" saat mencoba invite. Akar masalahnya: tidak ada cara bagi calon crew untuk mendaftar dengan role "crew" karena form register hanya membuat akun "promotor" dan tidak ada pilihan role.
- Root cause: Form register di `client/src/app/register/page.tsx` tidak mengirim field `role` ke API, sehingga semua akun dibuat dengan `role: "promotor"` (default). Backend `POST /api/auth/register` sudah support `role` param sejak Field Crew feature ditambahkan, tapi UI belum mengeksposnya.
- File terkait: `client/src/app/register/page.tsx`
- Fix:
  - Tambah state `role: "promotor" | "crew"` (default "promotor")
  - Tambah toggle button "Promotor Event" / "Crew Lapangan" di form — match existing card style
  - Saat "Crew Lapangan" dipilih: sembunyikan field "Nama Promotor/EO" (tidak relevan untuk crew), tampilkan note kecil "Akun crew hanya bisa diakses via nexeventapp.tech/field"
  - Field `role` dikirim ke `POST /api/auth/register` bersama formData
  - Success screen untuk crew menampilkan hint URL `/field`
  - Verifikasi end-to-end: register crew → activate → invite via /dashboard/crew → `GET /api/crew/my-events` return assignment dengan `balance: 0` → `POST /api/petty-cash/transaction` dengan `type:"topup"` return 400 (bukan 403 — sudah lolos auth check, ditolak karena business rule crew tidak bisa topup)
- Tag: #register #role #field-crew #ui #ux

---

## [2026-07-01] Login redirect semua user ke /dashboard — crew tidak diarahkan ke /field

- Gejala: User dengan role "crew" setelah login berhasil diarahkan ke `/dashboard` (halaman promotor) dan bisa mengakses seluruh dashboard. User dengan role "promotor" yang buka `/field` bisa masuk ke halaman crew.
- Root cause: Login page (`login/page.tsx`) selalu memanggil `router.push('/dashboard')` tanpa memeriksa role dari response API. Dashboard layout tidak memiliki auth guard. Field page sudah ada wrong-role view tapi belum ada perlindungan di dashboard.
- File terkait:
  - `client/src/app/login/page.tsx`
  - `client/src/components/dashboard/dashboard-guard.tsx` (file baru)
  - `client/src/app/dashboard/layout.tsx`
- Fix:
  - **Login page**: setelah login berhasil, simpan `user_role` ke localStorage (`data.data.role`), lalu redirect berdasarkan role: `"crew"` → `/field`, selainnya → `/dashboard`. Ganti `alert()` dengan inline error message.
  - **DashboardGuard** (komponen client baru): fast-path cek `localStorage.getItem("user_role")`, jika `"crew"` langsung redirect ke `/field`. Fallback: fetch `GET /api/auth/me` untuk token lama yang tidak punya `user_role` di localStorage; jika role `"crew"` → redirect ke `/field`, jika tidak ada token → redirect ke `/login`.
  - **dashboard/layout.tsx**: wrap semua halaman dashboard dengan `<DashboardGuard>`. Layout tetap server component, Guard adalah client component.
  - **field/page.tsx**: sudah ter-handle sejak Field Crew feature — jika `role !== "crew"` tampilkan "wrong-role" view dengan link ke `/dashboard` (tidak redirect otomatis, sesuai spec).
- Tag: #auth #redirect #role #field-crew #login #dashboard-guard

---

## [2026-07-01] /field page — dark theme tidak konsisten dengan dashboard palette

- Gejala: Halaman `/field` (mobile Field Crew) menggunakan dark theme (`bg-neutral-950`, amber accent `bg-amber-500`, `text-neutral-400`) yang terasa seperti aplikasi berbeda dibanding dashboard promotor yang menggunakan light theme (slate/emerald). Mobile UX juga belum optimal: font input kurang dari 16px (menyebabkan iOS auto-zoom), tidak ada highlight hover pada event cards.
- Root cause: Implementasi awal `/field` sengaja menggunakan dark theme sebagai "identitas visual crew" tapi keputusan ini direvisi — crew tetap harus merasakan aplikasi yang sama.
- File terkait: `client/src/app/field/page.tsx`
- Fix:
  - Ganti semua `bg-neutral-950` → `bg-slate-50` (page background)
  - Ganti `bg-neutral-800` (cards) → `bg-white border border-slate-200 rounded-xl`
  - Ganti `bg-amber-500` (primary buttons) → `bg-emerald-800 hover:bg-emerald-900 text-white`
  - Ganti `text-white` body → `text-slate-900`; `text-neutral-400/500` → `text-slate-500/400`
  - Ganti `text-amber-400` (balance, amounts) → `text-emerald-800`
  - Ganti `focus:ring-amber-500` → `focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30` (konsisten dengan dashboard inputs)
  - Error state: `bg-red-900/40 text-red-400` → `bg-red-50 border border-red-200 text-red-600`
  - Spinner: `border-amber-500` → `border-emerald-800`
  - Success icon: `CheckCircle text-amber-400` → dalam `div bg-emerald-100`, `CheckCircle text-emerald-700`
  - UX fixes: input `text-base` (16px, cegah iOS zoom), back button `min-h-[48px]` (touch target), amount input `text-3xl`, event cards hover state `hover:border-emerald-300 hover:bg-emerald-50`
  - Tambah note info di `/dashboard/expenses`: "Pengeluaran ini dicatat langsung oleh promotor. Pengeluaran crew lapangan dapat dilihat di menu Field Crew."
  - Tambah note info di `/dashboard/crew`: "Pengeluaran crew lapangan akan digabungkan dengan expense tracker di Laporan P&L otomatis."
- Tag: #field-crew #ui #color-palette #mobile-ux #consistency

---

## [2026-07-01] /field page — icon button tidak center + label transaksi plain text

- Gejala: Icon pada button "CATAT PENGELUARAN" dan "KEMBALIKAN SISA" terlihat terlalu ke kiri dan tidak sejajar dengan teks, terutama saat teks button wrap di layar sempit. Label type transaksi di riwayat hari ini tampil sebagai plain text abu-abu tanpa warna yang membedakan topup/expense/return.
- Root cause: Icon menggunakan `size-4` (Tailwind shorthand) tanpa `shrink-0`, sehingga bisa mengecil saat flex container kekurangan ruang. Teks button tidak dibungkus `<span>`, sehingga flex `items-center` tidak bisa bekerja optimal ketika teks multi-baris. Label type memakai `capitalize text-slate-400` saja tanpa conditional color.
- File terkait: `client/src/app/field/page.tsx`
- Fix:
  - Ganti icon class dari `size-4` ke `h-5 w-5 shrink-0` pada kedua action button
  - Bungkus teks button dalam `<span>` agar flex centering konsisten
  - Ganti label type dari `<p className="capitalize text-slate-400">` ke conditional: topup → `text-blue-600`, expense → `text-red-500`, return → `text-emerald-600` dengan label kapitalisasi manual ("Topup"/"Expense"/"Return")
- Tag: #field-crew #ui #button #icon-alignment #mobile-ux

---

## [2026-07-01] /field page — icon pada action button tidak bisa di-center dengan benar

- Gejala: Setelah penambahan `shrink-0` dan `<span>`, icon pada button "CATAT PENGELUARAN" masih terlihat tidak center secara visual di berbagai ukuran layar mobile.
- Root cause: Kombinasi flex + icon + teks pendek dalam grid 2-kolom rentan terhadap distribusi ruang yang tidak simetris di browser mobile. Tidak ada solusi CSS tunggal yang bisa diandalkan.
- File terkait: `client/src/app/field/page.tsx`
- Fix: Hapus icon sepenuhnya dari kedua action button ("CATAT PENGELUARAN" dan "KEMBALIKAN SISA") — teks saja sudah cukup dan tampilan lebih rapi di mobile. Hapus juga import `Send` dan `RotateCcw` dari lucide-react karena sudah tidak terpakai.
- Tag: #field-crew #ui #button #icon #mobile-ux

---

## [2026-07-01] P&L Report — Implementasi fitur baru

- Gejala: (Bukan bug — catatan implementasi fitur baru)
- Root cause: Platform butuh laporan laba/rugi otomatis yang menggabungkan semua sumber pemasukan (sponsor deal, pemasukan lain) dan pengeluaran (promotor expense, crew petty cash) per event.
- File terkait:
  - `server/prisma/schema.prisma` — model baru `OtherIncome` + relasi ke Event dan User
  - `server/controllers/pl-report.controller.js` — `getPLReport` (fetch paralel 4 sumber), `exportPLReportPDF` (pdfkit A4)
  - `server/controllers/other-income.controller.js` — CRUD pemasukan manual
  - `server/routes/pl-report.routes.js` — `/export-pdf` didaftarkan SEBELUM `/` agar tidak ketubruk wildcard
  - `server/routes/other-income.routes.js`
  - `server/src/index.js` — register `/api/pl-report` dan `/api/other-income`
  - `client/src/app/dashboard/pl-report/page.tsx` — halaman P&L baru (Pro-gated)
  - `client/src/components/dashboard/sidebar.tsx` — "Laporan P&L" diubah dari onClick placeholder ke href + Pro badge
  - `client/package.json` — recharts 3.9.1 ditambahkan
- Fix/Implementasi:
  - `GET /api/pl-report?eventId=xxx`: fetch parallel sponsor deals (status="Disetujui"), otherIncome, expenses, pettyCashTransactions (ONLY type:"expense"). Return summary + detail per sumber.
  - `GET /api/pl-report/export-pdf?eventId=xxx`: pdfkit A4, font Helvetica, warna emerald #065f46 untuk header, IDR format pakai `Math.round(n).toLocaleString('id-ID')`.
  - KRITIS: `SponsorDeal.totalValue` (bukan `totalAmount`) dan `SponsorDeal.sponsorName` (bukan `companyName`) — lihat schema saat coding.
  - KRITIS: Crew expense filter wajib `type: "expense"` dan join ke `pettyCashAccount.eventId` — jangan pakai `direction` sebagai filter.
  - Frontend: recharts PieChart (donut) untuk komposisi pengeluaran, BarChart untuk pemasukan vs pengeluaran. Collapsible detail tables untuk 3 tabel rincian.
  - Lock UI untuk Starter (bukan redirect/hide menu) — sama dengan pola di expenses/crew pages.
  - `npx prisma db push` (bukan `migrate dev`) untuk apply schema di VPS.
- Tag: #pl-report #feature #prisma #schema #pdfkit #recharts #petty-cash #pro-feature

---

## [2026-07-01] Vercel build error setelah install recharts v3.9.1

- Gejala: Vercel deployment gagal dalam 27 detik (sangat cepat → compile error, bukan runtime). Dua deploy berturut-turut gagal setelah P&L Report feature di-push.
- Root cause: Dua masalah terpisah ditemukan dari `npm run build` lokal:
  1. **Missing `react-is` package** — recharts v3.9.1 melakukan `import { isFragment } from 'react-is'` tapi package ini bukan transitive dependency yang otomatis terinstall di Next.js 16 / React 19. Error: `Module not found: Can't resolve 'react-is'`
  2. **TypeScript type mismatch di Tooltip formatter** — recharts `Tooltip` `formatter` prop menerima `Formatter<ValueType, NameType>` di mana `ValueType` bisa `undefined`. Tipe eksplisit `(v: number) => string` tidak assignable karena `number` tidak menerima `undefined`. Error muncul karena TypeScript strict mode di Vercel.
- File terkait: `client/src/app/dashboard/pl-report/page.tsx`, `client/package.json`
- Fix:
  1. `npm install react-is --legacy-peer-deps` di folder `client`
  2. Ganti `formatter={(v: number) => IDR.format(v)}` → `formatter={(v) => IDR.format(Number(v))}` pada semua instance Tooltip di file (ada 2 — PieChart dan BarChart)
  3. Verifikasi `npm run build` lokal sukses sebelum push
- Tag: #vercel #build-error #recharts #typescript #react-is #peer-dependency

---

## [2026-07-01] Sponsor tidak bisa login — password terlupa / akun baru tidak tahu password

- Gejala: Sponsor melaporkan tidak bisa login ke /sponsor-dashboard. Password yang diterima sebelumnya tidak bekerja, atau sponsor belum pernah menerima kredensial.
- Root cause: Flow lama tidak mengirim email otomatis saat akun dibuat. Password hanya ditampilkan sekali di UI promotor dan tidak tersimpan di mana pun secara plain text.
- File terkait: server/controllers/sponsor.controller.js, server/services/email.service.js, server/routes/sponsor.routes.js
- Fix:
  1. Reset password darurat: buat script server/scripts/reset-sponsor-password.js, jalankan di VPS, cari SponsorDeal by email, update ClientAccount.password via bcrypt hash.
  2. Auto-email: createAccount sekarang auto-kirim email kredensial via sendSponsorCredential setelah akun dibuat.
  3. Resend credential: tambah endpoint POST /api/sponsor/deals/:id/resend-credential (verifyToken) — generate password baru, update hash, kirim email.
  4. Email login: verifyAccount kini support identifier (email atau username). Jika @ ada di input, cari via SponsorDeal.email lalu ClientAccount.
  5. Login page: /login?role=sponsor menampilkan 2-tab UI — "Kode Undangan" (redirect ke sponsor-portal) dan "Sudah Punya Akun" (login langsung).
- Catatan: ClientAccount tidak punya field email langsung — email ada di SponsorDeal. Lookup: SponsorDeal.findFirst({ where: { email } }) → ClientAccount.findUnique({ where: { dealId } }).
- Tag: #sponsor #auth #email #credential #password-reset

---

## [2026-07-01] Email kredensial sponsor tidak masuk ke inbox penerima

- Gejala: Resend SDK mengembalikan `{ id: "xxx" }` (sukses) dan PM2 log menampilkan `[EMAIL] Kredensial sponsor terkirim ke <email>`, tapi email tidak sampai ke inbox sponsor.
- Root cause: `onboarding@resend.dev` adalah shared sender Resend untuk testing. Limitation-nya: **hanya bisa deliver ke email yang terdaftar di akun Resend** (biasanya hanya email owner akun). Email ke alamat eksternal (gmail, yahoo, domain lain) diterima oleh Resend API (return ID sukses) tapi **tidak dikirimkan** ke inbox penerima. Ini BUKAN bug, melainkan batasan Resend testing mode.
- Root cause tambahan: Domain `nexeventapp.tech` belum diverifikasi di Resend, sehingga tidak bisa dipakai sebagai custom sender.
- File terkait: `server/services/email.service.js`, `server/controllers/sponsor.controller.js`
- Fix (workaround hingga domain diverifikasi):
  1. Ubah penerima email dari `deal.email` (sponsor) → `req.user.email` (promotor yang login)
  2. Update template email — kirim ke promotor dengan info lengkap: nama sponsor, email sponsor, username, password, link login
  3. Email berisi tombol WhatsApp dan mailto ke email sponsor, sehingga promotor bisa forward langsung
  4. Credential modal di UI (`creds` state di `dashboard/sponsor/page.tsx`) sudah ada sebagai fallback — WhatsApp share button sudah tersedia di sana
- Cara deteksi: Cek PM2 logs — `[EMAIL] Kredensial terkirim ke X` TIDAK berarti email sampai ke inbox. Verifikasi dengan test curl langsung ke Resend API.
- Catatan: Saat domain `nexeventapp.tech` sudah diverifikasi di Resend, ganti `promotorEmail` kembali ke `sponsorEmail` dan ganti sender ke `noreply@nexeventapp.tech`.
- Tag: #email #resend #sponsor #domain-verification #workaround

---

## [2026-07-01] Invoice status dropdown salah opsi + P&L hitung semua sponsor deal

- Gejala 1: Dropdown status invoice di card sponsor menampilkan opsi "Sudah Dibayar" dan "Jatuh Tempo" yang tidak valid — backend menolak update atau status tidak konsisten dengan sistem lain.
- Gejala 2: Laporan P&L memasukkan semua deal berstatus "Disetujui" ke pemasukan, termasuk deal yang belum ada pembayaran sama sekali (invoice "Belum Dibayar"). Ini menyebabkan P&L terlalu optimis.
- Gejala 3: Dropdown invoice overflow/terpotong di dalam card karena berada satu baris dengan banyak action button lain.
- Root cause 1: Opsi dropdown di `dashboard/sponsor/page.tsx` tidak sinkron dengan valid status di CLAUDE.md dan backend (`"Belum Dibayar"`, `"DP Terbayar"`, `"Lunas"`).
- Root cause 2: Query sponsor income di `pl-report.controller.js` hanya filter `status: 'Disetujui'` tanpa cek payment status invoice — uang belum tentu diterima meskipun deal disetujui.
- Root cause 3: Invoice section berada di dalam flex container yang sama dengan action buttons (Disetujui badge, Lihat Dashboard, Kirim Ulang Credential) sehingga overflow pada viewport kecil.
- File terkait: `client/src/app/dashboard/sponsor/page.tsx`, `server/controllers/pl-report.controller.js`, `server/services/email.service.js`
- Fix:
  1. Dropdown options diubah ke `"Belum Dibayar"`, `"DP Terbayar"`, `"Lunas"` (sesuai CLAUDE.md).
  2. Invoice section dipindah ke baris terpisah di bawah action bar (dibatasi `border-t pt-3`) — tidak lagi dalam satu flex row dengan action buttons.
  3. P&L sponsor query ditambah filter: `invoices: { some: { status: { in: ['DP Terbayar', 'Lunas'] } } }` — hanya deal yang sudah ada pembayaran yang dihitung sebagai pemasukan.
  4. Aturan: "DP Terbayar" dan "Lunas" sama-sama pakai `totalValue` deal (bukan partial DP, karena nilai DP tidak tersimpan terpisah).
  5. Email kredensial diupdate ke `Promise.allSettled` — kirim ke promotor (guaranteed) DAN sponsor (best-effort).
- Tag: #invoice #sponsor #pl-report #dropdown #layout #email

---

## [2026-07-01] PDF P&L "Failed to load PDF document" di browser

- Gejala: Klik tombol "Export PDF" di halaman P&L Report → browser menampilkan "Failed to load PDF document" atau file PDF kosong/rusak saat dibuka.
- Root cause: Frontend `handleExportPDF` langsung memanggil `res.blob()` tanpa mengecek `res.ok` atau `Content-Type`. Jika backend mengembalikan error JSON, frontend membuat blob dari JSON tersebut → PDF reader tidak bisa membaca JSON sebagai PDF.
- File terkait: `client/src/app/dashboard/pl-report/page.tsx`, `server/controllers/pl-report.controller.js`
- Fix:
  1. Tambah pengecekan `res.ok` dan `content-type.includes('pdf')` sebelum `res.blob()`. Jika bukan PDF, parse JSON error dan tampilkan `alert('Gagal generate PDF: ' + message)`.
  2. Tambah guard `blob.size < 100` untuk PDF kosong.
  3. Perbaiki `a.click()` — gunakan `document.body.appendChild(a)` sebelum click dan `removeChild` sesudah, supaya download reliable di semua browser (detached anchor tidak reliable di Firefox/Safari).
  4. Backend `exportPLReportPDF` sudah benar: data di-fetch dulu sebelum PDF dimulai, `res.setHeader` → `doc.pipe(res)` → `doc.end()` → catch hanya kirim JSON jika `!res.headersSent`.
- Tag: #pdf #pl-report #frontend #blob #download

---

## [2026-07-01] Kredensial sponsor hilang setelah modal + Kirim Ulang tidak tampilkan password baru

- Gejala 1: Setelah approve deal, kredensial tampil inline di card — rentan hilang saat re-render atau scroll.
- Gejala 2: Tombol "Kirim Ulang Credential" hanya tampilkan teks sukses/gagal, password baru tidak ditampilkan.
- Gejala 3: Tidak ada tombol "Copy All" untuk salin kredensial ke clipboard.
- Root cause 1: Credential display inline di card rentan hilang saat re-render; tidak ada copy button.
- Root cause 2: Endpoint `POST /api/sponsor/deals/:id/resend-credential` return `{ success: true, message }` saja tanpa `data: { username, password }`.
- File terkait: `client/src/app/dashboard/sponsor/page.tsx`, `server/controllers/sponsor.controller.js`
- Fix:
  1. Backend `resendCredential` sekarang return `{ success: true, message, data: { username, password } }`.
  2. Hapus inline credential box dari `DealCard`, pindahkan ke modal overlay penuh (z-50) di level `DealTracker`.
  3. Modal ditampilkan untuk KEDUANYA: approve deal baru DAN kirim ulang credential.
  4. `DealCard` menerima prop `onCredsGenerated(c: GeneratedCreds)` — dipanggil saat resend sukses.
  5. Modal berisi: tabel email/username/password/link, tombol Salin/WA/Email, peringatan amber, tombol tutup.
- Tag: #sponsor #credential #modal #copy #resend

---

## [2026-07-01] PDF P&L alert menampilkan isi PDF ("%PDF-1.3 %…") alih-alih error message

- Gejala: Klik "Export PDF" → alert muncul dengan teks "Gagal generate PDF: %PDF-1.3 %…" (isi raw PDF) padahal backend berhasil generate PDF.
- Root cause: Logic `if (!res.ok || !contentType.includes("pdf"))` — kondisi kedua `!contentType.includes("pdf")` bisa `true` jika proxy (Nginx atau Vercel) tidak forward `Content-Type: application/pdf` dengan tepat. Saat masuk error branch, kode memanggil `res.json()` pada response yang sebenarnya adalah bytes PDF — `res.json()` kadang bisa "berhasil" dan mengembalikan objek dengan property `message` berisi bytes awal PDF, sehingga alert menampilkan `%PDF-1.3`.
- File terkait: `client/src/app/dashboard/pl-report/page.tsx`
- Fix: Ubah logic dari negatif ke positif — cek `contentType.includes('application/pdf')` PERTAMA. Jika PDF → blob dan download. Jika BUKAN PDF → baru parse JSON error. Jangan pernah call `res.json()` pada response yang mungkin PDF.
- Tag: #pdf #pl-report #content-type #proxy #frontend

---

## [2026-07-01] Auto-email credential saat approve deal — email tidak bisa dikontrol promotor

- Gejala: Saat promotor approve deal sponsor dan akun dibuat, email langsung dikirim otomatis tanpa konfirmasi. Promotor tidak punya kesempatan memilih apakah mau kirim via email, WA, atau cukup salin manual.
- Root cause: `createAccount` controller langsung memanggil `sendSponsorCredential()` setelah akun dibuat, tidak ada flow persetujuan dari promotor.
- File terkait: `server/controllers/sponsor.controller.js`, `client/src/app/dashboard/sponsor/page.tsx`
- Fix:
  1. Backend: Hapus panggilan `sendSponsorCredential()` dari `createAccount` — akun dibuat tanpa kirim email otomatis.
  2. Frontend: Modal credential sekarang punya 3 tombol stacked vertikal: "Salin Semua" / "Kirim via WhatsApp" / "Kirim Email ke Sponsor".
  3. Tombol "Kirim Email ke Sponsor" memanggil `POST /api/sponsor/deals/:id/resend-credential` secara eksplisit — promotor yang menentukan kapan kirim email.
  4. Tombol email punya 3 state: default / loading (spin) / sent (check + "Email Terkirim").
  5. `emailSent` di-reset saat modal buka baru (`setEmailSent(false)` sebelum `setCreds`).
- Tag: #sponsor #credential #email #ux #modal

---

## [2026-07-01] PDF Export alert menampilkan PDF bytes melalui content-type check yang tidak reliable

- Gejala: Klik Export PDF → alert "Gagal generate PDF: %PDF-1.3 %…" padahal backend HTTP 200 dan size 2.7KB. Fix pertama (cek `contentType.includes('application/pdf')`) tetap gagal.
- Root cause: Vercel proxy (atau Next.js proxy di `/api/[...proxy]`) tidak selalu meneruskan `Content-Type: application/pdf` ke response frontend. Akibatnya `contentType.includes('application/pdf')` = `false` meski response sebenarnya PDF binary — frontend masuk error branch dan mencoba `res.json()` pada PDF bytes.
- File terkait: `client/src/app/dashboard/pl-report/page.tsx`
- Fix: Gunakan `response.ok` (HTTP status) sebagai satu-satunya sinyal, bukan content-type:
  - `!res.ok` → try JSON parse error message → alert
  - `res.ok` → langsung `res.blob()` → download (tidak pernah cek content-type)
- Tag: #pdf #pl-report #content-type #proxy #vercel #frontend

---

## [2026-07-01] Sponsor login 401 — email typo di data + password stale setelah kirim email

- Gejala 1: Login sponsor dengan email `pewaraganstudiodesain@gmail.com` → 401 padahal akun ada.
- Gejala 2: Setelah promotor klik "Kirim Email ke Sponsor" di modal, modal masih tampilkan password LAMA, padahal email sponsor sudah berisi password BARU.
- Root cause 1: Email di database adalah `pewareganstudiodesain@gmail.com` (typo: "pewaregan" bukan "pewaragan"). Sponsor memasukkan email dengan ejaan berbeda → lookup email gagal → 401.
- Root cause 2: `resend-credential` endpoint generate password baru dan update hash di DB, tapi frontend tidak update `creds.password` setelah response berhasil — modal jadi stale.
- File terkait: `client/src/app/dashboard/sponsor/page.tsx`, `server/scripts/reset-pewaragan-password.js` (one-time script)
- Fix:
  1. Password direset via one-time script ke `Sponsor2026!` untuk `pewareganstudiodesain@gmail.com` — sponsor bisa login dengan username `pewareganstudiodesain` atau email tersebut.
  2. Modal "Kirim Email ke Sponsor": setelah response sukses, `setCreds(c => ({ ...c, password: data.data.password }))` — modal langsung menampilkan password terbaru yang dikirim ke email.
- Pelajaran: SELALU verifikasi email di DB sebelum diagnosa login issue. Email di SponsorDeal diinput manual oleh sponsor — typo sangat mungkin.
- Tag: #sponsor #login #401 #email-typo #password-stale #modal

## [2026-07-01] PDF P&L corrupt — tidak bisa dibuka browser
- Gejala: File PDF berhasil ter-download (HTTP 200, progress bar selesai) tapi browser menampilkan "Failed to load PDF document". PM2 log tidak menunjukkan error apapun.
- Root cause: PDFKit explicit Y-positioning (`.text('...', x, y)`) yang dipakai untuk menaruh beberapa teks di Y yang sama bisa membuat internal state PDFKit tidak konsisten. Saat browser membaca file, PDF structure dianggap corrupt meskipun `doc.end()` terpanggil. Selain itu, tidak ada safety net: kalau ada exception setelah `doc.pipe(res)`, `doc.end()` tidak pernah dipanggil (catch block skip karena headersSent=true) → PDF truncated.
- File terkait: `server/controllers/pl-report.controller.js`
- Fix: Rewrite `exportPLReportPDF` dengan pola aman:
  1. Semua Prisma query selesai **sebelum** `doc.pipe(res)` dipanggil (STEP 1 & 2 data fetch, STEP 3 PDF stream)
  2. Hapus semua explicit Y-positioning — gunakan `.moveDown()` dan `{ continued: true }` + `{ align: 'right' }` untuk layout
  3. Catch block di dalam section setelah `doc.pipe(res)` memanggil `try { doc.end() } catch {}` untuk memastikan stream selalu properly terminated
  4. Helper `fmtIDR(n)` dengan `Number(n) || 0` sebagai null-safe guard
- Pelajaran: Jangan pernah pakai explicit x,y positioning (`doc.text('', x, y)`) di PDFKit untuk multiple teks pada Y yang sama. Gunakan flow-based layout dengan `continued: true` + `align: 'right'`.
- Tag: #pdf #pdfkit #corrupt #pl-report
- Status: PARTIALLY FIXED — backend PDF stream diperbaiki, tapi root cause sebenarnya ada di proxy (lihat entry berikutnya)

## [2026-07-01] PDF P&L corrupt (root cause sebenarnya) — Next.js proxy JSON-encode binary stream
- Gejala: File PDF ter-download, size > 100 bytes, tapi browser tidak bisa membuka ("Failed to load PDF document"). PM2 log backend bersih. File yang ter-download adalah JSON `{"message":"%PDF-1.4..."}`, bukan binary PDF.
- Root cause: GET handler di `client/src/app/api/[...proxy]/route.ts` selalu memproses semua response sebagai teks dan me-return `NextResponse.json(data)`. Untuk binary PDF: (1) `await res.text()` membaca bytes PDF sebagai UTF-8 string → corrupt, (2) `JSON.parse()` gagal karena bukan JSON, (3) catch block: `data = { message: resText }`, (4) `NextResponse.json({ message: "%PDF-..." })` → frontend download JSON string, bukan PDF.
- File terkait: `client/src/app/api/[...proxy]/route.ts`
- Fix: Tambah deteksi binary path sebelum `res.text()` di GET handler. Jika `path.includes('export-pdf')` atau `content-type` adalah `application/pdf`, stream langsung via `new Response(blob, { headers: { 'Content-Type': 'application/pdf', ... } })` tanpa JSON-encoding.
- Pelajaran: Next.js API route proxy WAJIB handle binary responses secara khusus. Jangan pernah melewatkan respons binary melalui `res.text()` + `NextResponse.json()`. Gunakan `res.blob()` + `new Response(blob)` untuk PDF dan binary data lainnya. Tambahkan path patterns ke array `BINARY_PATHS` untuk setiap endpoint yang mengembalikan non-JSON.
- Tag: #proxy #pdf #binary #nextjs #corrupt

## [2026-07-01] Deliverables tidak auto-generate saat deal disetujui
- Gejala: Sponsor memilih benefits (misal "10× Umbul-Umbul, 1× Booth 3×3") saat submit deal. Setelah promotor approve, sponsor dashboard menampilkan "Belum ada deliverable untuk akun ini".
- Root cause: `updateDealStatus` membuat deliverables dengan cara lookup ke `SponsorPackage` berdasarkan `deal.tier` (nama tier). Jika nama tier tidak cocok persis dengan package yang ada di DB, atau benefit dipilih à la carte, `pkg` bernilai `null` → deliverables tidak dibuat. Seharusnya deliverables dibuat dari `SponsorDealBenefit[]` (benefit yang benar-benar dipilih sponsor).
- File terkait: `server/controllers/sponsor.controller.js`
- Fix:
  1. Update query di `updateDealStatus` — tambah `benefit: { select: { name, category, description } }` ke dalam `dealBenefits` select.
  2. Ganti logic auto-create: pakai `dealBenefits.map(({ benefit, qty }) => ({ title: \`${qty}× ${benefit.name}\`, ... }))` — bukan lookup package.
  3. Tambah **lazy backfill** di `getDeliverables`: jika deal berstatus `Disetujui` dan `items.length === 0`, auto-create deliverables dari `dealBenefits` dan re-fetch → handle historical deals yang sudah approved sebelum fix ini.
- Pelajaran: Data "apa yang sponsor pilih" ada di `SponsorDealBenefit`, bukan di `SponsorPackage`. Jangan derive deliverables dari package karena tier bisa berubah atau tidak cocok.
- Tag: #sponsor #deliverables #auto-generate #deal-benefits
