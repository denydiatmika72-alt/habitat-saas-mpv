const prisma = require('../src/lib/prisma'); // Singleton dengan PrismaPg adapter (wajib Prisma v7)

// GET /api/events — Ambil semua event milik promotor yang login
const getEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { promotor_id: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: events });
  } catch (err) {
    console.error('[GET EVENTS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/events — Buat event baru
const createEvent = async (req, res) => {
  try {
    const { title, location, event_date, venue_capacity, target_profit, target_sponsorship } = req.body;

    if (!title || !location || !event_date || !venue_capacity || !target_profit || !target_sponsorship) {
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi.' });
    }

    const event = await prisma.event.create({
      data: {
        title,
        location,
        event_date: new Date(event_date),
        venue_capacity: Number(venue_capacity),
        target_profit: Number(target_profit),
        target_sponsorship: Number(target_sponsorship),
        promotor_id: req.user.id,
      },
    });

    return res.status(201).json({ success: true, message: 'Event berhasil dibuat.', data: event });
  } catch (err) {
    console.error('[CREATE EVENT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/events/:id — Ambil satu event berdasarkan ID (UUID string, bukan Number)
const getEventById = async (req, res) => {
  try {
    const { id } = req.params; // UUID string — jangan Number()
    const event = await prisma.event.findFirst({
      where: { id, promotor_id: req.user.id },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    return res.status(200).json({ success: true, data: event });
  } catch (err) {
    console.error('[GET EVENT BY ID ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/events/:id — Hapus event (UUID string, bukan Number)
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params; // UUID string — jangan Number()
    const event = await prisma.event.findFirst({
      where: { id, promotor_id: req.user.id },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    await prisma.event.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Event berhasil dihapus.' });
  } catch (err) {
    console.error('[DELETE EVENT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/events/:id/publish — Toggle is_published
const togglePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;

    const event = await prisma.event.findFirst({
      where: { id, promotor_id: req.user.id },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { is_published: Boolean(is_published) },
    });

    return res.json({ success: true, message: `Event ${updated.is_published ? 'dipublish' : 'disembunyikan'}.`, data: updated });
  } catch (err) {
    console.error('[TOGGLE PUBLISH ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getEvents, createEvent, getEventById, deleteEvent, togglePublish };
