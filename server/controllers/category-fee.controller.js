const prisma = require('../src/lib/prisma');
const { isValidFeePercent, FEE_MIN_PERCENT, FEE_MAX_PERCENT } = require('../services/ticket.service');

// Fee per-kategori — endpoint ADMIN (arsitektur 2026-07-15).
//
// KONTEKS KEAMANAN (baca sebelum mengubah apa pun di file ini):
// Sebelumnya fee ada di level Event dan admin bisa mengubahnya KAPAN SAJA lewat
// PATCH /api/admin/events/:eventId/fees — termasuk saat event sudah live & sedang jualan.
// Artinya nexEvent bisa (sengaja atau tidak) menaikkan fee di bawah kaki promotor setelah
// promotor menetapkan harga. Audit menemukan tidak ada guard apa pun untuk itu.
//
// Model BARU: fee melekat di KATEGORI (TicketType / MerchItem / BundlePackage), di-set admin
// SEKALI, lalu DIKUNCI PERMANEN (`feeLockedAt`). Sekali terkunci tidak ada jalan mengubahnya
// lewat API — tidak ada endpoint edit, tidak ada force flag. Kategori yang fee-nya terlanjur
// salah TIDAK diedit & TIDAK dihapus: dinonaktifkan (isActive:false), lalu promotor membuat
// kategori BARU dengan fee yang benar (lihat deactivateCategory di bawah).
//
// Penguncian ditegakkan di SINI (backend), bukan cuma di UI — UI hanya menyembunyikan tombol,
// backend yang menolak request langsung ke API.

// Registry tipe kategori → model Prisma + label manusiawi. Satu endpoint melayani ketiganya
// supaya aturan kunci mustahil beda-beda antar tipe (kalau dipisah 3 controller, satu bisa
// ketinggalan guard-nya saat diubah).
const CATEGORY_TYPES = {
  'ticket-types': { model: 'ticketType', label: 'Jenis tiket' },
  'merch-items': { model: 'merchItem', label: 'Merchandise' },
  'bundling-packages': { model: 'bundlePackage', label: 'Paket bundling' },
};

const resolveType = (categoryType) => CATEGORY_TYPES[categoryType] || null;

// Hitung order berbayar yang menyentuh sebuah kategori. Dipakai guard hapus (Task 4).
// CATATAN: hanya `paid` yang dihitung sebagai "sudah ada uang". Order `pending` sengaja TIDAK
// memblokir hapus — booking yang tak dibayar akan di-release cron 15 menit.
async function countPaidOrders(model, id) {
  if (model === 'ticketType') {
    return prisma.ticketOrderItem.count({ where: { ticketTypeId: id, order: { status: 'paid' } } });
  }
  if (model === 'merchItem') {
    return prisma.merchOrderItem.count({ where: { merchItemId: id, order: { status: 'paid' } } });
  }
  return prisma.bundleOrderItem.count({ where: { bundleId: id, order: { status: 'paid' } } });
}

// PATCH /api/admin/categories/:categoryType/:id/fee — admin (protect + requireAdmin)
// Body: { feePercent: number }
// Sekali sukses → feePercent terisi + feeLockedAt = now, PERMANEN.
const setCategoryFee = async (req, res) => {
  try {
    const { categoryType, id } = req.params;
    const type = resolveType(categoryType);
    if (!type) {
      return res.status(400).json({
        success: false,
        message: `Tipe kategori tidak dikenal: "${categoryType}". Pilihan: ${Object.keys(CATEGORY_TYPES).join(', ')}.`,
      });
    }

    // Fee WAJIB diisi — tidak ada "kosongkan untuk pakai default" seperti dulu. Default diam-diam
    // adalah bagian dari masalah lama: promotor tidak pernah tahu fee-nya berapa.
    const feePercent = Number(req.body?.feePercent);
    if (!isValidFeePercent(feePercent)) {
      return res.status(400).json({
        success: false,
        message: `Fee wajib diisi angka antara ${FEE_MIN_PERCENT} dan ${FEE_MAX_PERCENT}.`,
      });
    }

    const existing = await prisma[type.model].findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: `${type.label} tidak ditemukan.` });
    }

    // ── GUARD INTI: sekali terkunci, selamanya terkunci ──
    if (existing.feeLockedAt) {
      return res.status(400).json({
        success: false,
        message: 'Fee sudah dikunci dan tidak dapat diubah.',
        lockedAt: existing.feeLockedAt,
        feePercent: existing.feePercent,
      });
    }

    // updateMany + kondisi `feeLockedAt: null` = penguncian ATOMIK. Dua request bersamaan
    // (double-click / race) → yang kedua meng-update 0 baris, bukan menimpa. Cek if di atas
    // hanya untuk pesan error yang enak dibaca; INI yang benar-benar menjamin sekali-kunci.
    const result = await prisma[type.model].updateMany({
      where: { id, feeLockedAt: null },
      data: { feePercent, feeLockedAt: new Date() },
    });
    if (result.count === 0) {
      const now = await prisma[type.model].findUnique({ where: { id } });
      return res.status(400).json({
        success: false,
        message: 'Fee sudah dikunci dan tidak dapat diubah.',
        lockedAt: now?.feeLockedAt ?? null,
        feePercent: now?.feePercent ?? null,
      });
    }

    const updated = await prisma[type.model].findUnique({ where: { id } });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[SET CATEGORY FEE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/admin/events/:eventId/categories — admin
// Semua kategori 1 event + status fee-nya, untuk panel "Kelola Fee per Kategori".
const getEventCategories = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, slug: true, storefrontStatus: true, feeBearer: true, promotor: { select: { name: true, email: true } } },
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const [ticketTypes, merchItems, bundlePackages] = await Promise.all([
      prisma.ticketType.findMany({
        where: { eventId },
        select: { id: true, name: true, price: true, quota: true, sold: true, isActive: true, feePercent: true, feeLockedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.merchItem.findMany({
        where: { eventId },
        select: { id: true, name: true, price: true, isActive: true, approvalStatus: true, feePercent: true, feeLockedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.bundlePackage.findMany({
        where: { eventId },
        select: { id: true, name: true, price: true, isActive: true, approvalStatus: true, feePercent: true, feeLockedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // categoryType disertakan supaya frontend tidak perlu menebak URL endpoint-nya.
    return res.json({
      success: true,
      event,
      categories: {
        ticketTypes: ticketTypes.map((c) => ({ ...c, categoryType: 'ticket-types' })),
        merchItems: merchItems.map((c) => ({ ...c, categoryType: 'merch-items' })),
        bundlePackages: bundlePackages.map((c) => ({ ...c, categoryType: 'bundling-packages' })),
      },
    });
  } catch (err) {
    console.error('[GET EVENT CATEGORIES ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/categories/:categoryType/:id/deactivate — admin
// Body: { isActive?: boolean } — default false (nonaktifkan). Kirim true untuk mengaktifkan lagi.
//
// Ini jalan keluar resmi untuk kategori yang fee-nya terlanjur salah PADAHAL sudah ada order:
// fee tidak bisa diedit (terkunci) dan kategori tidak boleh dihapus (order & tiket pembeli ikut
// hilang). Jadi: nonaktifkan → hilang dari storefront tapi order/tiket lama tetap utuh & valid →
// promotor bikin kategori baru dgn fee benar.
//
// Sengaja pakai isActive (BUKAN quota/stok = 0): flag isActive sudah ada & sudah dipakai storefront
// untuk menyaring; sedangkan menurunkan quota ke 0 akan bentrok dgn guard "kuota tidak boleh kurang
// dari jumlah terjual" dan malah merusak data stok.
const deactivateCategory = async (req, res) => {
  try {
    const { categoryType, id } = req.params;
    const type = resolveType(categoryType);
    if (!type) {
      return res.status(400).json({ success: false, message: `Tipe kategori tidak dikenal: "${categoryType}".` });
    }

    const existing = await prisma[type.model].findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: `${type.label} tidak ditemukan.` });

    const isActive = req.body?.isActive === true; // default: nonaktifkan
    const updated = await prisma[type.model].update({ where: { id }, data: { isActive } });

    return res.json({
      success: true,
      data: updated,
      message: isActive
        ? `${type.label} "${existing.name}" diaktifkan kembali.`
        : `${type.label} "${existing.name}" dinonaktifkan. Order & tiket yang sudah ada TIDAK terpengaruh.`,
    });
  } catch (err) {
    console.error('[DEACTIVATE CATEGORY ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// DELETE /api/admin/categories/:categoryType/:id — admin
// HANYA untuk kategori yang BELUM pernah terjual. Kalau sudah ada order berbayar → tolak & arahkan
// ke nonaktifkan. Tanpa guard ini, hapus akan gagal dgn FK error mentah (P2003) — 500 yang tidak
// menjelaskan apa-apa — atau lebih buruk, ikut menghapus order/tiket lewat cascade.
const deleteCategory = async (req, res) => {
  try {
    const { categoryType, id } = req.params;
    const type = resolveType(categoryType);
    if (!type) {
      return res.status(400).json({ success: false, message: `Tipe kategori tidak dikenal: "${categoryType}".` });
    }

    const existing = await prisma[type.model].findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: `${type.label} tidak ditemukan.` });

    const paidCount = await countPaidOrders(type.model, id);
    if (paidCount > 0) {
      return res.status(400).json({
        success: false,
        message: `${type.label} "${existing.name}" sudah punya ${paidCount} order berbayar sehingga tidak bisa dihapus. Nonaktifkan saja — order & tiket pembeli harus tetap utuh.`,
        paidOrderCount: paidCount,
      });
    }

    await prisma[type.model].delete({ where: { id } });
    return res.json({ success: true, message: `${type.label} "${existing.name}" dihapus.` });
  } catch (err) {
    console.error('[DELETE CATEGORY ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { setCategoryFee, getEventCategories, deactivateCategory, deleteCategory, CATEGORY_TYPES };
