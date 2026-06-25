# 📋 NEXEVENT SaaS — Project Status Summary
> Terakhir diperbarui: 21 Juni 2026 | Ditulis oleh Claude (AI Engineer Assistant)

---

## 🏗️ Tech Stack & Arsitektur

### Monorepo Structure
nexevent-saas/
├── client/     → Next.js 14 (App Router) — deploy ke Vercel
└── server/     → Express.js + Prisma v7 — MIGRASI ke Hostinger VPS

### Frontend (client/)
| Item | Detail |
|---|---|
| Framework | Next.js 14 App Router ("use client") |
| Styling | Tailwind CSS + shadcn/ui |
| HTTP Client | Axios + native fetch |
| Deploy | Vercel (nexevent-web.vercel.app) |
| Env Var | NEXT_PUBLIC_API_URL=https://<hostinger-domain-baru> |

### Backend (server/)
| Item | Detail |
|---|---|
| Runtime | Node.js + Express.js |
| ORM | Prisma v7 (wajib adapter, TIDAK bisa new PrismaClient() langsung) |
| DB Adapter | @prisma/adapter-pg + pg (Pool) |
| Database | PostgreSQL (Neon / Supabase) via DATABASE_URL |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Entry Point | server/src/index.js |
| Deploy | ⚠️ MIGRASI: Render → Hostinger VPS |
| Process Manager | PM2 (akan disetup di VPS) |
| Reverse Proxy | Nginx + SSL (akan disetup di VPS) |

---

## 🔑 Environment Variables Wajib

### Di Hostinger VPS (Backend)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=string_random_panjang_min_32_karakter
CLIENT_URL=https://nexevent-web.vercel.app
NODE_ENV=production
JWT_EXPIRES_IN=7d

### Di Vercel Dashboard (Frontend)
NEXT_PUBLIC_API_URL=https://<url-backend-hostinger>

---

## ✅ Fitur yang Sudah Berjalan

| Fitur | Status | Catatan |
|---|---|---|
| Register akun | ✅ Jalan | POST /api/auth/register |
| Login akun | ✅ Jalan | POST /api/auth/login |
| Buat Event baru | ✅ Jalan | POST /api/events |
| Lihat semua Event | ✅ Jalan | GET /api/events |
| Lihat detail Event by ID | ✅ Jalan | GET /api/events/:id |
| Hapus Event | ✅ Jalan | DELETE /api/events/:id |
| Inisialisasi RAB | ✅ Jalan | POST /api/budgets/initialize |
| Lihat RAB by Event | ✅ Jalan | GET /api/budgets/:eventId |
| Tambah Kategori RAB | ✅ Jalan | POST /api/budgets/:budgetId/categories |
| Edit Nama Kategori | ✅ Jalan | PUT /api/budgets/categories/:categoryId |
| Hapus Kategori RAB | ✅ Jalan | DELETE /api/budgets/categories/:categoryId |
| Tambah Item RAB | ✅ Jalan | POST /api/budgets/categories/:categoryId/items |
| Hapus Item RAB | ✅ Jalan | DELETE /api/budgets/items/:itemId |
| Dashboard KPI | ✅ Jalan | Fetch dari /api/events |
| Tabel Dokumen Event | ✅ Jalan | Fetch events + budgets |
| Halaman RAB (cetak PDF) | ✅ Jalan | window.print() |
| Simulasi Harga Tiket | ✅ Jalan | Kalkulasi client-side |
| Donut Chart Anggaran | ✅ Jalan | SVG berbasis data RAB real |

---

## 🗃️ Struktur Database (Prisma Schema)

users
  id, name, email, password, created_at, updated_at

events
  id, title, location, event_date, venue_capacity,
  target_profit, target_sponsorship, status, promotor_id,
  created_at, updated_at

budgets
  id, event_id (unique FK), totalEstimatedCost,
  contingencyFundPercentage (default 20), contingencyFundAmount, created_at

budget_categories
  id, budget_id (FK), name, allocatedBudget

budget_items
  id, category_id (FK), name, qty, hargaSatuan,
  estimatedCost, actualCost

---

## 🛣️ Semua API Endpoint

### Auth
POST   /api/auth/register
POST   /api/auth/login

### Events (wajib header: Authorization: Bearer <token>)
GET    /api/events
POST   /api/events
GET    /api/events/:id
DELETE /api/events/:id

### Budgets (wajib header: Authorization: Bearer <token>)
POST   /api/budgets/initialize
GET    /api/budgets/:eventId
POST   /api/budgets/:budgetId/categories
PUT    /api/budgets/categories/:categoryId
DELETE /api/budgets/categories/:categoryId
POST   /api/budgets/categories/:categoryId/items
DELETE /api/budgets/items/:itemId

---

## 🐛 Bug yang Sudah Diperbaiki

| # | File | Bug | Fix |
|---|---|---|---|
| 1 | create-event/page.tsx | Template literal pakai single-quote | Diganti backtick |
| 2 | rab/[id]/page.tsx | Template literal pakai single-quote | Diganti backtick |
| 3 | stat-cards.tsx | Template literal pakai double-quote | Diganti backtick |
| 4 | document-table.tsx | Template literal pakai double-quote | Diganti backtick |
| 5 | dashboard/page.tsx | Template literal pakai double-quote | Diganti backtick |
| 6 | simulasi/page.tsx | Template literal pakai double-quote | Diganti backtick |
| 7 | event.controller.js | new PrismaClient() tanpa adapter | Diganti singleton prisma |
| 8 | Backend login | JWT_SECRET undefined → 500 | Tambah env var di Render |
| 9 | event.controller.js | Number(id) pada UUID → NaN | Diganti string id langsung |
| 10 | budget.routes.js | PUT /categories/:id belum ada | Ditambahkan + updateCategory |
| 11 | prisma.js | new URL() crash saat load time | Diganti connectionString di Pool |
| 12 | budget.controller.js | new PrismaClient() tanpa adapter | Diganti singleton prisma |
| 13 | auth.middleware.js | Return 404 saat token invalid | Difix ke 401 |

---

## ⚠️ Aturan Wajib (Jangan Dilanggar)

1. SELALU pakai prisma singleton:
   const prisma = require('../src/lib/prisma'); ✅
   new PrismaClient() ❌

2. SELALU pakai backtick untuk template literal:
   `${process.env.NEXT_PUBLIC_API_URL}/api/...` ✅
   "${process.env...}" atau '${process.env...}' ❌

3. HAPUS server/src/middleware/auth.js (zombie file — hardcoded SECRET_KEY)

4. Auth error HARUS return 401, bukan 404

5. Prisma P2025 error → return 404 (record not found)

---

## � Status Migrasi VPS Hostinger

### Checklist Pre-Migration (selesaikan dulu sebelum setup VPS)
- [ ] prisma.js — pakai connectionString ✓
- [ ] Hapus server/src/middleware/auth.js
- [ ] Audit semua controller — tidak ada new PrismaClient()
- [ ] Audit semua frontend — tidak ada template literal salah quote
- [ ] auth.middleware.js — return 401 bukan 404
- [ ] git push semua fix ke GitHub

### Checklist Setup VPS Hostinger
- [ ] Install Node.js v20 LTS di VPS
- [ ] Install PM2 globally: npm install -g pm2
- [ ] Clone repo: git clone <repo-url>
- [ ] Install dependencies: cd server && npm install
- [ ] Setup .env file di server/ dengan semua env vars
- [ ] Jalankan: npx prisma generate
- [ ] Start dengan PM2: pm2 start src/index.js --name nexevent-api
- [ ] Setup Nginx sebagai reverse proxy ke port Express
- [ ] Setup SSL dengan Certbot (Let's Encrypt)
- [ ] Update NEXT_PUBLIC_API_URL di Vercel ke URL Hostinger baru
- [ ] Test semua endpoint via Postman
- [ ] Redeploy Vercel frontend

---

## 📁 Peta File Backend Penting

server/
├── src/
│   ├── index.js                    ← Entry point Express
│   ├── controllers/
│   │   └── auth.controller.js
│   ├── routes/
│   │   └── auth.routes.js
│   ├── middleware/
│   │   └── auth.js                 ← ⚠️ HAPUS FILE INI
│   └── lib/
│       └── prisma.js               ← Singleton PrismaClient + PrismaPg adapter
├── controllers/
│   ├── event.controller.js
│   └── budget.controller.js
├── routes/
│   ├── event.routes.js
│   └── budget.routes.js
├── middleware/
│   └── auth.middleware.js          ← ✅ Middleware yang benar
└── prisma/
    └── schema.prisma

---

## 🗺️ Next Steps

### Segera (Sebelum Deploy VPS)
- [ ] Selesaikan pre-migration audit di VSCode
- [ ] git push semua perubahan ke GitHub

### Setup VPS Hostinger
- [ ] Ikuti checklist Setup VPS Hostinger di atas

### Fitur Berikutnya (Setelah VPS Stabil)
- [ ] Fitur Invoice — POST /api/invoices
- [ ] Global error handler middleware yang lebih detail
- [ ] Validasi schema request dengan zod/joi
- [ ] Pagination pada GET /api/events
- [ ] Export RAB ke Excel
- [ ] Upload dokumen via Cloudinary/S3
- [ ] Multi-user / Tim per event
- [ ] Notifikasi email
- [ ] Dashboard Analytics lanjutan
