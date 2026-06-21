const prisma = require('../src/lib/prisma');

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
        promotor_id: req.user.id, // dari verifyToken middleware
      },
    });

    return res.status(201).json({ success: true, message: 'Event berhasil dibuat.', data: event });
  } catch (err) {
    console.error('[CREATE EVENT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

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

module.exports = { createEvent, getEvents };
