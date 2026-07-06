const path = require('path');
const multer = require('multer');
const prisma = require('../src/lib/prisma');
const { supabase } = require('../services/supabase.service');

const BUCKET = 'event-assets';
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Format file harus JPG, PNG, atau WEBP.'));
    }
    cb(null, true);
  },
});

function withMulter(field) {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message || 'Gagal upload file.' });
      next();
    });
  };
}

// Resolve nama + info tiap item paket (BundleItem tidak punya relasi FK ke TicketType/MerchVariant,
// jadi kita lookup manual dari eventId).
async function resolveBundleItems(items, eventId) {
  const resolved = [];
  for (const it of items) {
    if (it.itemType === 'ticket') {
      const tt = await prisma.ticketType.findFirst({ where: { id: it.ticketTypeId, eventId } });
      resolved.push({
        ...it,
        label: tt ? tt.name : 'Tiket tidak ditemukan',
        unitPrice: tt ? tt.price : 0,
      });
    } else {
      const variant = await prisma.merchVariant.findFirst({
        where: { id: it.merchVariantId, item: { eventId } },
        include: { item: { select: { name: true, price: true } } },
      });
      resolved.push({
        ...it,
        label: variant ? `${variant.item.name} (${variant.size})` : 'Merch tidak ditemukan',
        unitPrice: variant ? variant.item.price : 0,
      });
    }
  }
  return resolved;
}

// POST /api/bundles — promotor buat paket bundling kurasi
const createBundle = async (req, res) => {
  try {
    const { eventId, name, description, price, items } = req.body;

    if (!eventId || !name || price === undefined || price === null) {
      return res.status(400).json({ success: false, message: 'eventId, name, dan price wajib diisi.' });
    }
    if (Number(price) <= 0) {
      return res.status(400).json({ success: false, message: 'Harga paket harus lebih dari 0.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Paket harus berisi minimal 1 item.' });
    }

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    // Validasi tiap item: tipe valid, id sesuai event, quantity positif.
    for (const it of items) {
      if (!['ticket', 'merch'].includes(it.itemType)) {
        return res.status(400).json({ success: false, message: `itemType "${it.itemType}" tidak valid.` });
      }
      if (Number(it.quantity) <= 0) {
        return res.status(400).json({ success: false, message: 'Jumlah item paket harus lebih dari 0.' });
      }
      if (it.itemType === 'ticket') {
        const tt = await prisma.ticketType.findFirst({ where: { id: it.ticketTypeId, eventId } });
        if (!tt) return res.status(400).json({ success: false, message: 'Jenis tiket dalam paket tidak valid.' });
      } else {
        const variant = await prisma.merchVariant.findFirst({ where: { id: it.merchVariantId, item: { eventId } } });
        if (!variant) return res.status(400).json({ success: false, message: 'Varian merch dalam paket tidak valid.' });
      }
    }

    const bundle = await prisma.$transaction(async (tx) => {
      const created = await tx.bundlePackage.create({
        data: { eventId, name, description: description || null, price: Number(price) },
      });
      await tx.bundleItem.createMany({
        data: items.map((it) => ({
          bundleId: created.id,
          itemType: it.itemType,
          ticketTypeId: it.itemType === 'ticket' ? it.ticketTypeId : null,
          merchVariantId: it.itemType === 'merch' ? it.merchVariantId : null,
          quantity: Number(it.quantity),
        })),
      });
      return created;
    });

    const full = await prisma.bundlePackage.findUnique({ where: { id: bundle.id }, include: { items: true } });
    const resolvedItems = await resolveBundleItems(full.items, eventId);
    return res.status(201).json({ success: true, data: { ...full, items: resolvedItems } });
  } catch (err) {
    console.error('[CREATE BUNDLE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/bundles/:id — update field paket (nama/deskripsi/harga/isActive)
const updateBundle = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, isActive } = req.body;

    const bundle = await prisma.bundlePackage.findUnique({ where: { id }, include: { event: true } });
    if (!bundle || bundle.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });
    }
    if (price !== undefined && Number(price) <= 0) {
      return res.status(400).json({ success: false, message: 'Harga paket harus lebih dari 0.' });
    }

    const updated = await prisma.bundlePackage.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: Number(price) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: { items: true },
    });
    const resolvedItems = await resolveBundleItems(updated.items, bundle.eventId);
    return res.json({ success: true, data: { ...updated, items: resolvedItems } });
  } catch (err) {
    console.error('[UPDATE BUNDLE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// DELETE /api/bundles/:id — blokir kalau sudah pernah ada order
const deleteBundle = async (req, res) => {
  try {
    const { id } = req.params;
    const bundle = await prisma.bundlePackage.findUnique({ where: { id }, include: { event: true } });
    if (!bundle || bundle.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });
    }
    const orderCount = await prisma.bundleOrderItem.count({ where: { bundleId: id } });
    if (orderCount > 0) {
      return res.status(400).json({ success: false, message: 'Paket sudah memiliki pesanan, tidak bisa dihapus.' });
    }
    await prisma.bundlePackage.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE BUNDLE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/bundles?eventId=xxx — daftar paket milik promotor untuk event tsb
const getBundles = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const bundles = await prisma.bundlePackage.findMany({
      where: { eventId },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    const data = [];
    for (const b of bundles) {
      data.push({ ...b, items: await resolveBundleItems(b.items, eventId) });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[GET BUNDLES ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/bundles/:id/image — upload foto paket ke Supabase Storage
const uploadBundleImage = [
  withMulter('file'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) return res.status(400).json({ success: false, message: 'File gambar wajib diupload.' });

      const bundle = await prisma.bundlePackage.findUnique({ where: { id }, include: { event: true } });
      if (!bundle || bundle.event.promotor_id !== req.user.id) {
        return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });
      }
      if (!supabase) {
        return res.status(503).json({ success: false, message: 'Supabase Storage belum dikonfigurasi di server.' });
      }

      const ext = path.extname(req.file.originalname) || `.${req.file.mimetype.split('/')[1]}`;
      const objectPath = `bundles/${bundle.eventId}/${id}/${Date.now()}${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (error) {
        return res.status(502).json({ success: false, message: error.message || 'Gagal upload ke Supabase Storage.' });
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      await prisma.bundlePackage.update({ where: { id }, data: { imageUrl: urlData.publicUrl } });
      return res.json({ success: true, url: urlData.publicUrl });
    } catch (err) {
      console.error('[UPLOAD BUNDLE IMAGE ERROR]', err);
      return res.status(500).json({ success: false, message: 'Gagal upload gambar.' });
    }
  },
];

// ===== ADMIN ONLY =====

// GET /api/admin/bundle-requests — semua paket yang menunggu persetujuan
const getBundleApprovalRequests = async (req, res) => {
  try {
    const bundles = await prisma.bundlePackage.findMany({
      where: { approvalStatus: 'pending' },
      include: {
        items: true,
        event: { select: { id: true, title: true, promotor: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const data = [];
    for (const b of bundles) {
      data.push({ ...b, items: await resolveBundleItems(b.items, b.eventId) });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[GET BUNDLE REQUESTS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/bundle-requests/:id/approve
const approveBundle = async (req, res) => {
  try {
    const { id } = req.params;
    const bundle = await prisma.bundlePackage.findUnique({ where: { id } });
    if (!bundle) return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });

    const updated = await prisma.bundlePackage.update({
      where: { id },
      data: { approvalStatus: 'approved', approvalNote: null },
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[APPROVE BUNDLE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/bundle-requests/:id/reject — body: { note }
const rejectBundle = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const bundle = await prisma.bundlePackage.findUnique({ where: { id } });
    if (!bundle) return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });

    const updated = await prisma.bundlePackage.update({
      where: { id },
      data: { approvalStatus: 'rejected', approvalNote: note || 'Ditolak oleh admin.' },
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[REJECT BUNDLE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createBundle,
  updateBundle,
  deleteBundle,
  getBundles,
  uploadBundleImage,
  getBundleApprovalRequests,
  approveBundle,
  rejectBundle,
};
