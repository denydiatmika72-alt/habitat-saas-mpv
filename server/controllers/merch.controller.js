const path = require('path');
const multer = require('multer');
const prisma = require('../src/lib/prisma');
const { supabase } = require('../services/supabase.service');

const VALID_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'FREE SIZE', 'ONE SIZE'];
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

// Bungkus multer supaya error balik JSON rapi (bukan lolos ke error handler generik Express).
function withMulter(field) {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message || 'Gagal upload file.' });
      next();
    });
  };
}

// POST /api/merch/items — promotor buat produk merchandise
const createMerchItem = async (req, res) => {
  try {
    const { eventId, name, description, price, variants } = req.body;

    if (!eventId || !name || price === undefined || price === null) {
      return res.status(400).json({ success: false, message: 'eventId, name, dan price wajib diisi.' });
    }
    if (Number(price) <= 0) {
      return res.status(400).json({ success: false, message: 'Harga harus lebih dari 0.' });
    }
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ success: false, message: 'Minimal 1 varian (size) wajib diisi.' });
    }
    for (const v of variants) {
      if (!VALID_SIZES.includes(v.size)) {
        return res.status(400).json({ success: false, message: `Size "${v.size}" tidak valid.` });
      }
    }

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.merchItem.create({
        data: { eventId, name, description: description || null, price: Number(price) },
      });
      await tx.merchVariant.createMany({
        data: variants.map((v) => ({
          merchItemId: created.id,
          size: v.size,
          stock: Number(v.stock) || 0,
        })),
      });
      return created;
    });

    const full = await prisma.merchItem.findUnique({
      where: { id: item.id },
      include: { variants: { orderBy: { size: 'asc' } } },
    });

    return res.status(201).json({ success: true, data: full });
  } catch (err) {
    console.error('[CREATE MERCH ITEM ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/merch/items/:id — update field item (bukan varian)
const updateMerchItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, isActive } = req.body;

    const item = await prisma.merchItem.findUnique({ where: { id }, include: { event: true } });
    if (!item || item.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }
    if (price !== undefined && Number(price) <= 0) {
      return res.status(400).json({ success: false, message: 'Harga harus lebih dari 0.' });
    }

    const updated = await prisma.merchItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: Number(price) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      include: { variants: { orderBy: { size: 'asc' } } },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[UPDATE MERCH ITEM ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/merch/variants/:id — update stok varian
const updateVariantStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined || Number(stock) < 0) {
      return res.status(400).json({ success: false, message: 'stock wajib diisi dan tidak boleh negatif.' });
    }

    const variant = await prisma.merchVariant.findUnique({ where: { id }, include: { item: { include: { event: true } } } });
    if (!variant || variant.item.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Varian tidak ditemukan.' });
    }
    if (Number(stock) < variant.sold) {
      return res.status(400).json({ success: false, message: `Stok tidak boleh kurang dari jumlah terjual (${variant.sold}).` });
    }

    const updated = await prisma.merchVariant.update({ where: { id }, data: { stock: Number(stock) } });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[UPDATE VARIANT STOCK ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// DELETE /api/merch/items/:id — hanya kalau belum ada order
const deleteMerchItem = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await prisma.merchItem.findUnique({ where: { id }, include: { event: true } });
    if (!item || item.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
    }

    const orderCount = await prisma.merchOrderItem.count({ where: { merchItemId: id } });
    if (orderCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Produk yang sudah pernah dipesan tidak bisa dihapus. Nonaktifkan saja.',
      });
    }

    await prisma.merchItem.delete({ where: { id } });
    return res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (err) {
    console.error('[DELETE MERCH ITEM ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/merch/items?eventId=xxx
const getMerchItems = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const items = await prisma.merchItem.findMany({
      where: { eventId },
      include: { variants: { orderBy: { size: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('[GET MERCH ITEMS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/merch/items/:id/image — upload foto produk ke Supabase Storage
const uploadMerchImage = [
  withMulter('file'),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) return res.status(400).json({ success: false, message: 'File gambar wajib diupload.' });

      const item = await prisma.merchItem.findUnique({ where: { id }, include: { event: true } });
      if (!item || item.event.promotor_id !== req.user.id) {
        return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
      }

      if (!supabase) {
        return res.status(503).json({
          success: false,
          message: 'Supabase Storage belum dikonfigurasi di server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set).',
        });
      }

      const ext = path.extname(req.file.originalname) || `.${req.file.mimetype.split('/')[1]}`;
      const objectPath = `merch/${item.eventId}/${id}/${Date.now()}${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (error) {
        return res.status(502).json({ success: false, message: error.message || 'Gagal upload ke Supabase Storage.' });
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      await prisma.merchItem.update({ where: { id }, data: { imageUrl: urlData.publicUrl } });

      return res.json({ success: true, url: urlData.publicUrl });
    } catch (err) {
      console.error('[UPLOAD MERCH IMAGE ERROR]', err);
      return res.status(500).json({ success: false, message: 'Gagal upload gambar.' });
    }
  },
];

module.exports = {
  createMerchItem,
  updateMerchItem,
  updateVariantStock,
  deleteMerchItem,
  getMerchItems,
  uploadMerchImage,
};
