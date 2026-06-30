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

---

## Bugs Pending

### 1. Register endpoint returns "Server error"
- **Root cause**: `prisma generate` belum dijalankan setelah migrasi field `phone`
- **Fix**: jalankan `deploy.sh` di VPS (sudah include `npx prisma generate` + `npm install`)

### 2. Sponsor deal tidak muncul di dashboard setelah checkout
- **Root cause**: `handleSubmit` di sponsor-portal sebelumnya swallow semua error (`.catch(() => {})`), deal gagal tersimpan ke DB tapi user tetap melihat halaman sukses
- **Fix**: sudah di-commit (cek `res.ok`, throw on failure, reset `submitting` on error) — perlu deploy ke VPS

---

## Next Priority

1. **Fix register bug** — jalankan `deploy.sh` di VPS
2. **Fix sponsor deal dashboard sync** — deploy commit terakhir ke VPS
3. **Payment Gateway Midtrans** — dimajukan dari Sprint 2

---

## Stack

- **Frontend**: Next.js 15 (Vercel, port 3000)
- **Backend**: Express 5 (Hostinger VPS, port 5000, pm2)
- **Database**: PostgreSQL via Supabase (Prisma ORM + PrismaPg adapter)
- **Email**: Resend v6
- **PDF**: pdfkit v0.19.1
- **Auth**: JWT (bcryptjs)
