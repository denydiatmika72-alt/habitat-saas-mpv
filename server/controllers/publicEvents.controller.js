const prisma = require('../src/lib/prisma');

// GET /api/events/public — Semua event yang dipublish
const getPublishedEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { is_published: true },
      select: {
        id: true,
        title: true,
        location: true,
        event_date: true,
        venue_capacity: true,
      },
      orderBy: { event_date: 'asc' },
    });

    const data = events.map(ev => ({ ...ev, ticket_types: [] }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[PUBLIC EVENTS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/events/public/search — Cari event dengan filter q, city, date
const searchPublishedEvents = async (req, res) => {
  try {
    const { q, city, date } = req.query;

    const where = { is_published: true };

    if (q) {
      where.title = { contains: q, mode: 'insensitive' };
    }
    if (city) {
      where.location = { contains: city, mode: 'insensitive' };
    }
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.event_date = { gte: start, lt: end };
    }

    const events = await prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        location: true,
        event_date: true,
        venue_capacity: true,
      },
      orderBy: { event_date: 'asc' },
    });

    const data = events.map(ev => ({ ...ev, ticket_types: [] }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[SEARCH PUBLIC EVENTS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPublishedEvents, searchPublishedEvents };
