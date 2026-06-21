# 📋 HABITAT SaaS — Project Status Summary
> Terakhir diperbarui: 21 Juni 2026 | Ditulis oleh Claude (AI Engineer Assistant)

---

## 🏗️ Tech Stack & Arsitektur

### Monorepo Structure
```
habitat-saas/
├── client/     → Next.js 14 (App Router) — deploy ke Vercel
└── server/     → Express.js + Prisma v7 — deploy ke Render
```

### Frontend (`client/`)
| Item | Detail |
|---|---|
| Framework | Next.js 14 App Router (`"use client"`) |
| Styling | Tailwind CSS + shadcn/ui |
| HTTP Client | Axios + native `fetch` |
| Deploy | Vercel (`habitat-web-baru.vercel.app`) |
| Env Var | `NEXT_PUBLIC_API_URL=https://habitat-backend-api.onrender.com` |

### Backend (`server/`)
| Item | Detail |
|---|---|
| Runtime | Node.js + Express.js |
| ORM | Prisma v7 (wajib adapter, TIDAK bisa `new PrismaClient()` langsung) |
| DB Adapter | `@prisma/adapter-pg` + `pg` (Pool) |
| Database | PostgreSQL (Neon / Supabase) via `DATABASE_URL` |
| Auth | JWT (`jsonwebtoken` + `bcryptjs`) |
| Entry Point | `server/src/index.js` |
| Deploy | Render (`habitat-backend-api.onrender.com`) |

---

## 🔑 Environment Variables Wajib

### Di Render Dashboard (Backend)
```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=string_random_panjang_min_32_karakter
CLIENT_URL=https://habitat-web-baru.vercel.app
NODE_ENV=production
JWT_EXPIRES_IN=7d
```

### Di Vercel Dashboard (Frontend)
```env
NEXT_PUBLIC_API_URL=https://habitat-backend-api.onrender.com
```

---

## ✅ Fitur yang Sudah Berjalan

| Fitur | Status | Catatan |
|---|---|---|
| Register akun | ✅ Jalan | POST /api/auth/register |
| Login akun | ✅ Jalan | POST /api/auth/login (JWT_SECRET wajib di Render) |
| Buat Event baru | ✅ Jalan | POST /api/events |
| Lihat semua Event | ✅ Jalan | GET /api/events |
| Lihat detail Event by ID | ✅ Jalan | GET /api/events/:id (UUID string) |
| Hapus Event | ✅ Jalan | DELETE /api/events/:id (UUID string) |
| Inisialisasi RAB | ✅ Jalan | POST /api/budgets/initialize |
| Lihat RAB by Event | ✅ Jalan | GET /api/budgets/:eventId |
| Tambah Kategori RAB | ✅ Jalan | POST /api/budgets/:budgetId/categories |
| **Edit Nama Kategori** | ✅ Jalan | PUT /api/budgets/categories/:categoryId |
| Hapus Kategori RAB | ✅ Jalan | DELETE /api/budgets/categories/:categoryId |
| Tambah Item RAB | ✅ Jalan | POST /api/budgets/categories/:categoryId/items |
| Hapus Item RAB | ✅ Jalan | DELETE /api/budgets/items/:itemId |
| Dashboard KPI (stat cards) | ✅ Jalan | Fetch dari /api/events |
| Tabel Dokumen Event | ✅ Jalan | Fetch events + budgets |
| Halaman RAB (cetak PDF) | ✅ Jalan | `window.print()` |
| Simulasi Harga Tiket | ✅ Jalan | Kalkulasi client-side dari data RAB |
| Donut Chart Anggaran | ✅ Jalan | SVG berbasis data RAB real |

---

## 🗃️ Struktur Database (Prisma Schema)

```
users
  id            String (UUID PK)
  name          String
  email         String (unique)
  password      String (bcrypt hash)
  created_at    DateTime
  updated_at    DateTime

events
  id                 String (UUID PK)
  title              String
  location           String
  event_date         DateTime
  venue_capacity     Int
  target_profit      Decimal(15,2)
  target_sponsorship Decimal(15,2)
  status             String (default: "DRAFT")
  promotor_id        String (FK → users.id)
  created_at / updated_at

budgets
  id                        String (UUID PK)
  event_id                  String (unique FK → events.id, CASCADE)
  totalEstimatedCost        Decimal(15,2) default 0
  contingencyFundPercentage Decimal(5,2)  default 20.00
  contingencyFundAmount     Decimal(15,2) default 0
  created_at

budget_categories
  id              String (UUID PK)
  budget_id       String (FK → budgets.id, CASCADE)
  name            String
  allocatedBudget Decimal(15,2) default 0

budget_items
  id            String (UUID PK)
  category_id   String (FK → budget_categories.id, CASCADE)
  name          String
  qty           Int     default 1
  hargaSatuan   Decimal(15,2) default 0
  estimatedCost Decimal(15,2) default 0
  actualCost    Decimal(15,2) default 0
```

---

## 🛣️ Semua API Endpoint (Validated)

### Auth
```
POST   /api/auth/register   → Registrasi user baru
POST   /api/auth/login      → Login, return JWT token
```

### Events (semua wajib header: Authorization: Bearer <token>)
```
GET    /api/events          → Semua event milik promotor yg login
POST   /api/events          → Buat event baru
GET    /api/events/:id      → Detail event by UUID
DELETE /api/events/:id      → Hapus event by UUID
```

### Budgets (semua wajib header: Authorization: Bearer <token>)
```
POST   /api/budgets/initialize                        → Inisialisasi RAB untuk event
GET    /api/budgets/:eventId                          → Ambil RAB + kategori + item
POST   /api/budgets/:budgetId/categories              → Tambah kategori baru
PUT    /api/budgets/categories/:categoryId            → Edit nama kategori ← BARU
DELETE /api/budgets/categories/:categoryId            → Hapus kategori + semua item
POST   /api/budgets/categories/:categoryId/items      → Tambah item RAB
DELETE /api/budgets/items/:itemId                     → Hapus item RAB
```

---

## 🐛 Bug yang Sudah Diperbaiki (Dalam Sesi Ini)

| # | File | Bug | Fix |
|---|---|---|---|
| 1 | `create-event/page.tsx` | `fetch('${...}')` single-quote | Diganti backtick |
| 2 | `rab/[id]/page.tsx` | `const API = '${...}'` single-quote | Diganti backtick |
| 3 | `stat-cards.tsx` | `axios.get("${...}")` double-quote | Diganti backtick |
| 4 | `document-table.tsx` | `axios.get("${...}")` double-quote | Diganti backtick |
| 5 | `dashboard/page.tsx` | `const API_BASE = "${...}"` | Diganti backtick |
| 6 | `simulasi/page.tsx` | `const API = "${...}"` | Diganti backtick |
| 7 | `event.controller.js` | `new PrismaClient()` tanpa adapter | Diganti `require('../src/lib/prisma')` |
| 8 | Backend login | JWT_SECRET undefined → 500 | Tambah env var di Render |
| 9 | `event.controller.js` | `Number(id)` pada UUID → NaN | Diganti string `id` langsung |
| 10 | `budget.routes.js` | PUT `/categories/:id` belum ada | Ditambahkan + updateCategory controller |

---

## 🚨 Isu yang Masih Perlu Diperhatikan

### 1. `server/src/middleware/auth.js` — File Zombie (BERBAHAYA)
File ini berisi hardcoded `'SECRET_KEY'` dan TIDAK menggunakan `process.env.JWT_SECRET`.
**File ini tidak dipakai oleh route manapun saat ini**, tapi harus dihapus agar tidak salah diimport di masa depan.
```js
// JANGAN PAKAI INI:
const decoded = jwt.verify(token, 'SECRET_KEY'); // ← HARDCODED, SALAH
```
**Solusi:** Hapus `server/src/middleware/auth.js` dan selalu gunakan `server/middleware/auth.middleware.js`.

### 2. Prisma v7 — Selalu Pakai Singleton
Di semua controller, pastikan import prisma selalu:
```js
const prisma = require('../src/lib/prisma'); // ✅ BENAR
// BUKAN:
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // ❌ SALAH di Prisma v7 tanpa adapter
```

### 3. CORS — Pastikan CLIENT_URL Tepat
Di Render, `CLIENT_URL` harus persis URL Vercel **tanpa trailing slash**:
```
CLIENT_URL=https://habitat-web-baru.vercel.app
```

---

## 🗺️ Next Steps (Mulai Dari Sini Besok)

### Prioritas Tinggi
- [ ] **Push semua perubahan ke GitHub** → Render & Vercel akan auto-redeploy
- [ ] **Test flow lengkap** di production: Login → Buat Event → RAB → Edit Kategori → Hapus
- [ ] **Hapus `server/src/middleware/auth.js`** (file zombie dengan hardcoded SECRET_KEY)

### Prioritas Menengah
- [ ] **Fitur Invoice** — endpoint `POST /api/invoices` + halaman frontend
- [ ] **Middleware error handler global** yang lebih detail (saat ini hanya log `err.stack`)
- [ ] **Validasi schema request** menggunakan `zod` atau `joi` di semua endpoint
- [ ] **Pagination** pada `GET /api/events` untuk skala besar

### Prioritas Rendah / V3
- [ ] **Upload dokumen** (logo event, lampiran sponsor) via Cloudinary/S3
- [ ] **Multi-user / Tim** — satu event bisa dikelola banyak user
- [ ] **Export RAB ke Excel** (selain PDF)
- [ ] **Notifikasi email** saat event mendekati tanggal pelaksanaan
- [ ] **Dashboard Analytics** yang lebih dalam (revenue tracking, actual vs estimated)

---

## 📁 Peta File Backend Penting

```
server/
├── src/
│   ├── index.js                    ← Entry point Express, mounting semua routes
│   ├── controllers/
│   │   └── auth.controller.js      ← register, login
│   ├── routes/
│   │   └── auth.routes.js          ← POST /register, POST /login
│   ├── middleware/
│   │   └── auth.js                 ← ⚠️ ZOMBIE FILE, hapus ini
│   └── lib/
│       └── prisma.js               ← Singleton PrismaClient + PrismaPg adapter
├── controllers/
│   ├── event.controller.js         ← getEvents, createEvent, getEventById, deleteEvent
│   └── budget.controller.js        ← initializeBudget, getBudget, addCategory,
│                                      updateCategory, deleteCategory,
│                                      addBudgetItem, deleteBudgetItem
├── routes/
│   ├── event.routes.js             ← GET|POST /events, GET|DELETE /events/:id
│   └── budget.routes.js            ← semua /budgets/* routes
├── middleware/
│   └── auth.middleware.js          ← ✅ verifyToken yang benar (pakai JWT_SECRET)
└── prisma/
    └── schema.prisma               ← Model: User, Event, Budget, BudgetCategory, BudgetItem
```
