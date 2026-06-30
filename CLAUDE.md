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
└── server/          # Express backend
    ├── src/
    │   ├── index.js            # Entry point (port 5000)
    │   ├── lib/prisma.js       # Prisma client (pakai adapter-pg)
    │   └── middleware/auth.middleware.js  # Export: protect & verifyToken (alias)
    ├── controllers/
    ├── routes/
    └── prisma/schema.prisma
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
- Migration: `npm run migrate` (di folder server)

## Fitur Utama

- **Events & RAB**: Buat event, kelola anggaran (RAB)
- **Sponsor Management**: Generate invite code → sponsor daftar di portal → buat deal
- **Invoice**: Generate invoice PDF dari deal sponsor, update status (Belum Dibayar / DP Terbayar / Lunas)
- **Document Table** (`/dashboard`): Tab "Invoice" menampilkan **semua invoice langsung** (bukan filter per event), karena deal historis punya `eventId = null`

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

## Bug yang Sudah Diperbaiki (2026-06-24)

1. **PATCH /api/invoices/:id/status → 500**: Karena `verifyToken` tidak ada di export middleware (hanya `protect`). Fix: tambah `verifyToken: protect` sebagai alias.
2. **Invoice tidak muncul di tab Invoice** (deals lama punya `eventId = null`): Fix: tab Invoice sekarang menampilkan semua invoice langsung tanpa filter per event. `document-table.tsx` ditulis ulang.

## Deployment

- Backend deploy via: `cd /var/www/nexevent/server && bash deploy.sh`
- Frontend deploy: otomatis via Vercel setiap git push
- Jangan pakai Render — sudah tidak aktif, backend di Hostinger VPS

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

## Aturan Tambahan

- Setiap selesai coding, selalu commit + push + deploy.sh
- Prisma singleton wajib — jangan `new PrismaClient()`
- Auth middleware: `server/src/middleware/auth.middleware.js` — return 401 bukan 404
