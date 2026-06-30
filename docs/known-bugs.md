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

## [2026-06-30] Register gagal — "Server error"

- Gejala: Saat user baru mendaftar (register), muncul pesan "Server error".
- Root cause: Prisma client belum di-generate ulang setelah perubahan schema (field phone baru ditambahkan), sehingga client lama tidak cocok dengan schema database.
- File terkait: `server/prisma/schema.prisma`, `deploy.sh`
- Fix: Pastikan `prisma generate` selalu dijalankan sebagai bagian dari `deploy.sh` setiap deploy, supaya Prisma client selalu sinkron dengan schema terbaru.
- Tag: #prisma #register #deployment #server-error

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

