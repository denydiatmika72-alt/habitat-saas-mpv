# nexEvent SaaS — Project Status

_Last updated: 2026-06-30_

---

## Done

- ✅ SSL Supabase fixed
- ✅ Admin panel removed
- ✅ Invoice PDF + PO PDF activated
- ✅ Phone field added to users table
- ✅ Email notification on register
- ✅ deploy.sh created
- ✅ CLAUDE.md created
- ✅ Bug #1 RESOLVED (2026-06-30) — Register "Server error" — fix: prisma generate via deploy.sh
- ✅ Bug #2 RESOLVED (2026-06-30) — Sponsor deal tidak muncul di dashboard — fix: error handling
- ✅ Bug #3 RESOLVED (2026-06-30) — Nginx gagal start — fix: ganti port ke 3001, Docker okupasi port 80 dan 8080
- ✅ Vercel env vars updated — NEXT_PUBLIC_API_URL dan BACKEND_URL → https://api.nexeventapp.tech:3001

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
- **Nginx**: port 3001 → proxy ke port 5000
- **Database**: PostgreSQL via Supabase (Prisma ORM + PrismaPg adapter)
- **Email**: Resend v6
- **PDF**: pdfkit v0.19.1
- **Auth**: JWT (bcryptjs)
