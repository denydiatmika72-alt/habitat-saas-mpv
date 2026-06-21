const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Ambil semua event (Halaman Dashboard)
const getEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { promotor_id: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    console.error('[GET EVENTS ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil event.' });
  }
};

// Buat event baru (Halaman Create Event)
const createEvent = async (req, res) => {
  try {
    const newEvent = await prisma.event.create({
      data: {
        ...req.body,
        promotor_id: req.user.id // Pastikan promotor yang login yang memiliki event ini
      }
    });
    return res.status(201).json({ success: true, data: newEvent, message: 'Event berhasil dibuat.' });
  } catch (error) {
    console.error('[CREATE EVENT ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal membuat event.' });
  }
};

// Ambil detail event berdasarkan ID (SOLUSI ERROR 404)
const getEventById = async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      // req.params.id dibiarkan utuh karena ID kamu berbentuk string UUID
      where: { id: req.params.id, promotor_id: req.user.id },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan atau bukan milik Anda.' });
    }
    return res.status(200).json({ success: true, data: event });
  } catch (error) {
    console.error('[GET EVENT BY ID ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil detail event.' });
  }
};

// Hapus event (Fitur Tambahan dari Claude)
const deleteEvent = async (req, res) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, promotor_id: req.user.id },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    await prisma.event.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Event berhasil dihapus.' });
  } catch (error) {
    console.error('[DELETE EVENT ERROR]', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus event.' });
  }
};

module.exports = {
  getEvents,
  createEvent,
  getEventById,
  deleteEvent
};