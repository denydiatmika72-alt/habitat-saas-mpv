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
