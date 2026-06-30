# nexEvent SaaS — Project Status

_Last updated: 2026-06-30_

---

## Done

- SSL Supabase fixed — PrismaPg adapter dengan `ssl: { rejectUnauthorized: false }` di pg Pool
- Admin panel removed completely — controller, middleware, routes, client page, Navbar button
- Invoice PDF + PO PDF activated — pdfkit v0.19.1 restored di invoice.controller.js
- Phone field added to users table — `phone String?` di Prisma schema + register form
- Email notification on register — Resend v6, fire-and-forget di auth.controller.js
- `deploy.sh` created — script deployment konsisten untuk VPS
- `CLAUDE.md` created — instruksi permanen untuk AI assistant
- ✅ Bug #1 RESOLVED (2026-06-30) — Register "Server error" — fix: prisma generate via deploy.sh
- ✅ Bug #2 RESOLVED (2026-06-30) — Sponsor deal tidak muncul di dashboard — fix: error handling di sponsor-portal handleSubmit + error message ditampilkan ke user

---

## Bugs Pending

— Tidak ada bug aktif —

---

## Next Priority

1. Integrasi Midtrans payment gateway (Sprint 2 dimajukan)
2. Ticketing storefront B2C dengan Row-Level Locking
3. CRON Job booking timeout 15 menit

---

## Stack

- **Frontend**: Next.js 15 (Vercel, port 3000)
- **Backend**: Express 5 (Hostinger VPS, port 5000, pm2)
- **Database**: PostgreSQL via Supabase (Prisma ORM + PrismaPg adapter)
- **Email**: Resend v6
- **PDF**: pdfkit v0.19.1
- **Auth**: JWT (bcryptjs)
