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
