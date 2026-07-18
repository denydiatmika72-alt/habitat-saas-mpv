// ─────────────────────────────────────────────────────────────────────────────
// Backfill kepemilikan SponsorInvoice (fix keamanan cross-account 2026-07-18).
//
// Menambah kolom `promotor_id` & `event_id` (nullable dulu) ke tabel sponsor_invoices,
// lalu mengisinya dari sponsor_deals (via deal_id yang sebelumnya WAJIB ada di tiap invoice).
//
// ⚠️  WAJIB dijalankan SEBELUM `npx prisma db push` (deploy.sh step 4).
//     Tanpa ini, db push GAGAL menambah kolom NOT NULL ke tabel yang sudah berisi data.
//     Urutan deploy: git pull → `node prisma/backfill-invoice-owner.js` → bash deploy.sh
//
// Idempotent & aman diulang (ADD COLUMN IF NOT EXISTS + UPDATE hanya baris yang masih NULL).
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../src/lib/prisma');

(async () => {
  try {
    console.log('[backfill] Menambah kolom nullable jika belum ada...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "sponsor_invoices" ADD COLUMN IF NOT EXISTS "promotor_id" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "sponsor_invoices" ADD COLUMN IF NOT EXISTS "event_id" TEXT`);

    console.log('[backfill] Mengisi promotor_id & event_id dari sponsor_deals...');
    const updated = await prisma.$executeRawUnsafe(`
      UPDATE "sponsor_invoices" si
      SET "promotor_id" = d."promotor_id",
          "event_id"    = d."event_id"
      FROM "sponsor_deals" d
      WHERE si."deal_id" = d."id"
        AND (si."promotor_id" IS NULL OR si."event_id" IS NULL)
    `);
    console.log(`[backfill] Baris terisi: ${updated}`);

    const orphans = await prisma.$queryRawUnsafe(`
      SELECT "id", "invoice_number", "deal_id"
      FROM "sponsor_invoices"
      WHERE "promotor_id" IS NULL OR "event_id" IS NULL
    `);
    if (orphans.length > 0) {
      console.error(`[backfill] ⚠️  ${orphans.length} invoice TIDAK bisa di-backfill (deal hilang/NULL):`);
      console.error(JSON.stringify(orphans, null, 2));
      console.error('[backfill] JANGAN jalankan `prisma db push` sampai baris ini diselesaikan (isi manual / hapus).');
      process.exitCode = 1;
      return;
    }

    console.log('[backfill] ✅ Semua invoice punya promotor_id & event_id. Aman lanjut `npx prisma db push`.');
  } catch (e) {
    console.error('[backfill] ERROR:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
