const multer = require('multer');
const path = require('path');
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

// Bungkus multer supaya error (file terlalu besar, mimetype salah) balik JSON rapi, bukan lolos ke error handler generik Express.
function withMulter(field) {
  const middleware = upload.single(field);
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message || 'Gagal upload file.' });
      next();
    });
  };
}

async function uploadImageForEvent({ eventId, userId, folder, file }) {
  if (!supabase) {
    const err = new Error('Supabase Storage belum dikonfigurasi di server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set).');
    err.statusCode = 503;
    throw err;
  }

  const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: userId } });
  if (!event) {
    const err = new Error('Event tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }

  const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
  const objectPath = `${folder}/${eventId}/${Date.now()}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: true });

  if (error) {
    const err = new Error(error.message || 'Gagal upload ke Supabase Storage.');
    err.statusCode = 502;
    throw err;
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return urlData.publicUrl;
}

// POST /api/upload/event-banner (protected, multipart/form-data)
const uploadEventBanner = [
  withMulter('file'),
  async (req, res) => {
    try {
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
      if (!req.file) return res.status(400).json({ success: false, message: 'File gambar wajib diupload.' });

      const url = await uploadImageForEvent({ eventId, userId: req.user.id, folder: 'banners', file: req.file });
      await prisma.event.update({ where: { id: eventId }, data: { bannerUrl: url } });

      return res.json({ success: true, url });
    } catch (err) {
      console.error('[UPLOAD BANNER ERROR]', err);
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Gagal upload banner.' });
    }
  },
];

// POST /api/upload/event-logo (protected, multipart/form-data)
const uploadEventLogo = [
  withMulter('file'),
  async (req, res) => {
    try {
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
      if (!req.file) return res.status(400).json({ success: false, message: 'File gambar wajib diupload.' });

      const url = await uploadImageForEvent({ eventId, userId: req.user.id, folder: 'logos', file: req.file });
      await prisma.event.update({ where: { id: eventId }, data: { logoUrl: url } });

      return res.json({ success: true, url });
    } catch (err) {
      console.error('[UPLOAD LOGO ERROR]', err);
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Gagal upload logo.' });
    }
  },
];

module.exports = { uploadEventBanner, uploadEventLogo };
