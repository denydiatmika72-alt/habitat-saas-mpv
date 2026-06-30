# nexEvent SaaS — Project Status

_Last updated: 2026-06-30_

---

## Done

- SSL Supabase fixed — PrismaPg adapter dengan ssl: { rejectUnauthorized: false }
- Admin panel removed completely (lalu dibangun ulang lebih simpel)
- Invoice PDF + PO PDF activated — pdfkit v0.19.1
- Phone field added to users table — prisma schema + register form
- Email notification on register — Resend v6 (sender: onboarding@resend.dev)
- deploy.sh created — script deployment konsisten untuk VPS
- CLAUDE.md created — instruksi permanen untuk AI assistant
- Bug #1 RESOLVED (2026-06-30) — Register "Server error" — fix: prisma generate via deploy.sh
- Bug #2 RESOLVED (2026-06-30) — Sponsor deal tidak muncul di dashboard — fix: error handling
- Bug #3 RESOLVED (2026-06-30) — Nginx gagal start — fix: port 3001, Docker okupasi port 80+8080
- Admin Approve User panel LIVE (2026-06-30) — /dashboard/admin, endpoint GET+PATCH /api/admin/users
- Production LIVE (2026-06-30) — nexeventapp.tech fully operational

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

- Frontend: Next.js 15 (Vercel)
- Backend: Express 5 (Hostinger VPS port 5000, PM2)
- Nginx: port 3001 → proxy ke port 5000
- API URL: http://145.79.12.170:3001
- Database: PostgreSQL via Supabase (Prisma ORM + PrismaPg adapter)
- Email: Resend v6 (onboarding@resend.dev)
- PDF: pdfkit v0.19.1
- Auth: JWT (bcryptjs)
