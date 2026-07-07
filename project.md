# nexEvent SaaS — Project Status

_Last updated: 2026-07-08_

---

## Done

- SSL Supabase fixed — PrismaPg adapter dengan ssl: { rejectUnauthorized: false }
- Admin panel removed completely (lalu dibangun ulang lebih simpel)
- Invoice PDF + PO PDF activated — pdfkit v0.19.1
- Phone field added to users table — prisma schema + register form
- Email notification on register — Resend v6
- deploy.sh created — script deployment konsisten untuk VPS
- CLAUDE.md created — instruksi permanen untuk AI assistant
- Bug #1 RESOLVED (2026-06-30) — Register "Server error" — fix: prisma generate via deploy.sh
- Bug #2 RESOLVED (2026-06-30) — Sponsor deal tidak muncul di dashboard — fix: error handling
- Bug #3 RESOLVED (2026-06-30) — Nginx gagal start — fix: port 3001, Docker okupasi port 80+8080
- Admin Approve User panel LIVE (2026-06-30) — /dashboard/admin, endpoint GET+PATCH /api/admin/users
- Production LIVE (2026-06-30) — nexeventapp.tech fully operational
- Expense Tracker LIVE (Pro) — pencatatan pengeluaran per event, kategori dari RAB
- Field Crew + Petty Cash LIVE (Pro) — kas lapangan crew (topup/expense/return), UI mobile /field
- P&L Report + PDF Export LIVE (Pro) — laba/rugi per event (recharts + pdfkit)
- Sponsor Auth Redesign LIVE — login sponsor via email/kode + auto-email kredensial
- Security Fix LIVE — proteksi admin panel + konsistensi Lock UI (feature gating Pro)
- Midtrans Pro Payment LIVE (Sandbox) — upgrade Pro Rp 499.000/event (90 hari) + perpanjangan Rp 99.000, webhook set plan
- Storefront Ticketing B2C LIVE — halaman event publik /event/[slug], checkout, e-ticket QR via email, anti-calo 4 tiket/NIK
- Platform Fee + Pajak LIVE — fee per tipe order (tiket/merch/bundling), editable admin; pajak 10% opsional per event
- Merchandise Storefront + Approval LIVE — jual merch + varian size, approval flow admin
- Bundling Paket Kurasi LIVE — paket tiket+merch harga total, stok ambil dari item existing
- Ticket Box Offline LIVE (2026-07) — penjualan tiket offline di lokasi (rename dari "Box Office"); cash instant-paid + transfer via Midtrans
- Fee Debt Reconciliation LIVE (2026-07) — tracking hutang fee transaksi cash Ticket Box per promotor di admin, tandai lunas

---

## Bugs Pending

— Tidak ada bug aktif —

Keputusan bisnis yang masih terbuka (bukan bug):
- Mekanisme penekan promotor nakal di Fee Debt Reconciliation (blokir buka event baru sampai lunas, ATAU deposit di muka) — BELUM DIPUTUSKAN

---

## Next Priority

1. 🔴 URGENT: Midtrans Production — aktifkan kredensial live (menunggu approval KYC; sistem masih Sandbox)
2. Scanner Tiket / validasi QR di venue (Roadmap #5 — fondasi ticketCode + isUsed sudah ada, detail belum dibahas)
3. Ticket Sales Manual Input — input penjualan dari platform lain (LOKET, Tix.id, dll)
4. Event Summary Report — kirim laporan via email saat event ditandai selesai
5. CRON Job booking timeout — sudah ada, tinggal verifikasi

---

## Stack

- Frontend: Next.js 15 (Vercel)
- Backend: Express 5 (Hostinger VPS port 5000, PM2)
- Nginx: port 3001 → proxy ke port 5000
- API URL: http://145.79.12.170:3001
- Database: PostgreSQL via Supabase (Prisma ORM + PrismaPg adapter)
- Storage: Supabase Storage (banner/logo event, gambar merch)
- Payment: Midtrans Snap (Sandbox) — Pro upgrade + Ticket Box transfer
- Email: Resend v6 (sender: noreply@nexeventapp.tech, domain terverifikasi)
- PDF: pdfkit v0.19.1
- Auth: JWT (bcryptjs)
