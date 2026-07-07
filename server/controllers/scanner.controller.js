const prisma = require('../src/lib/prisma');

// Ticket Scanner (Roadmap #5) — validasi QR tiket di venue.
// Akses WAJIB login (role "scanner"), mirror pola Field Crew. QR tiket meng-encode raw `ticketCode`
// (string, bukan URL) — scanner cukup ekstrak string itu lalu validasi ke DB.

// POST /api/scanner/invite — promotor only (pemilik event)
// Undang user ber-role "scanner" ke sebuah event. Mirror crew.inviteCrew.
const inviteScanner = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa invite scanner.' });

  const { email, eventId } = req.body;
  if (!email || !eventId)
    return res.status(400).json({ success: false, message: 'email dan eventId wajib diisi.' });

  try {
    // Pastikan event milik promotor ini
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const scannerUser = await prisma.user.findUnique({ where: { email } });
    if (!scannerUser)
      return res.status(400).json({ success: false, message: 'User tidak ditemukan. Minta scanner daftar dulu di nexeventapp.tech' });

    if (scannerUser.role !== 'scanner')
      return res.status(400).json({ success: false, message: 'User ini bukan scanner. Pastikan mendaftar dengan pilihan role "scanner".' });

    // Cek duplikat
    const existing = await prisma.eventScanner.findUnique({
      where: { eventId_userId: { eventId, userId: scannerUser.id } },
    });
    if (existing)
      return res.status(400).json({ success: false, message: 'Scanner ini sudah ditambahkan ke event.' });

    const scanner = await prisma.eventScanner.create({
      data: { eventId, userId: scannerUser.id },
    });

    return res.status(201).json({
      success: true,
      scanner: { id: scanner.id, name: scannerUser.name, email: scannerUser.email },
    });
  } catch (err) {
    console.error('[INVITE SCANNER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/scanner/my-events — scanner only
// Semua event yang di-assign ke akun scanner ini.
const getMyScannerEvents = async (req, res) => {
  if (req.user.role !== 'scanner')
    return res.status(403).json({ success: false, message: 'Hanya scanner yang bisa mengakses ini.' });

  try {
    const assignments = await prisma.eventScanner.findMany({
      where: { userId: req.user.id },
      include: { event: { select: { id: true, title: true, event_date: true, location: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const events = assignments.map((a) => ({
      eventId: a.eventId,
      eventTitle: a.event.title,
      eventDate: a.event.event_date,
      location: a.event.location,
    }));

    return res.status(200).json({ success: true, events });
  } catch (err) {
    console.error('[GET MY SCANNER EVENTS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/scanner/event/:eventId — promotor only (pemilik event)
// Daftar scanner yang sudah di-assign ke event ini. Mirror crew.getEventCrew.
const getEventScanners = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa melihat daftar scanner.' });

  const { eventId } = req.params;
  try {
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const assignments = await prisma.eventScanner.findMany({
      where: { eventId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const scanners = assignments.map((a) => ({
      scannerId: a.userId,
      name: a.user.name,
      email: a.user.email,
      assignedAt: a.createdAt,
    }));

    return res.status(200).json({ success: true, scanners });
  } catch (err) {
    console.error('[GET EVENT SCANNERS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// DELETE /api/scanner/event/:eventId/:scannerId — promotor only (pemilik event)
// scannerId = userId scanner. Mirror crew.removeCrew.
const removeScanner = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa menghapus scanner.' });

  const { eventId, scannerId } = req.params;
  try {
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    await prisma.eventScanner.deleteMany({ where: { eventId, userId: scannerId } });
    return res.status(200).json({ success: true, message: 'Scanner dihapus dari event.' });
  } catch (err) {
    console.error('[REMOVE SCANNER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/scanner/validate — scanner only
// Body { eventId, ticketCode }. Validasi tiket: milik event ini? sudah dipakai?
// Kalau valid & belum dipakai → tandai isUsed + usedAt, balikin nama pembeli + jenis tiket.
const validateTicket = async (req, res) => {
  if (req.user.role !== 'scanner')
    return res.status(403).json({ success: false, message: 'Hanya scanner yang bisa validasi tiket.' });

  const { eventId, ticketCode } = req.body;
  if (!eventId || !ticketCode || !String(ticketCode).trim())
    return res.status(400).json({ success: false, message: 'eventId dan ticketCode wajib diisi.' });

  try {
    // Scanner hanya boleh validasi event yang di-assign kepadanya.
    const assigned = await prisma.eventScanner.findUnique({
      where: { eventId_userId: { eventId, userId: req.user.id } },
    });
    if (!assigned)
      return res.status(403).json({ success: false, message: 'Kamu tidak ditugaskan untuk event ini.' });

    // Ambil tiket + relasi untuk resolve eventId, nama pembeli, jenis tiket.
    // Tiket bisa dari pembelian langsung (orderItem.order) atau dari paket bundling (bundleOrderItem.order).
    const ticket = await prisma.ticket.findUnique({
      where: { ticketCode: String(ticketCode).trim() },
      include: {
        ticketType: { select: { name: true, eventId: true } },
        orderItem: { include: { order: { select: { eventId: true, buyerName: true } } } },
        bundleOrderItem: { include: { order: { select: { eventId: true, buyerName: true } }, bundle: { select: { name: true } } } },
      },
    });

    if (!ticket)
      return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan. QR tidak valid.' });

    // eventId tiket: prioritas dari order (sumber transaksi), fallback ke ticketType.
    const ticketEventId =
      ticket.orderItem?.order?.eventId ??
      ticket.bundleOrderItem?.order?.eventId ??
      ticket.ticketType?.eventId ??
      null;

    if (ticketEventId !== eventId)
      return res.status(400).json({ success: false, message: 'Tiket ini bukan untuk event yang sedang kamu scan.' });

    // Sudah dipakai → tolak, JANGAN re-mark. Sertakan waktu pemakaian.
    if (ticket.isUsed) {
      return res.status(400).json({
        success: false,
        status: 'used',
        message: 'Tiket sudah pernah dipakai.',
        usedAt: ticket.usedAt,
        buyerName: ticket.orderItem?.order?.buyerName ?? ticket.bundleOrderItem?.order?.buyerName ?? null,
        typeName: ticket.ticketType?.name ?? ticket.bundleOrderItem?.bundle?.name ?? 'Tiket',
      });
    }

    // Tandai dipakai secara atomik (cegah double-accept kalau 2 scanner scan barengan).
    const now = new Date();
    const upd = await prisma.ticket.updateMany({
      where: { id: ticket.id, isUsed: false },
      data: { isUsed: true, usedAt: now },
    });
    if (upd.count === 0) {
      // Ada yang men-scan lebih dulu sepersekian detik lalu → ambil usedAt terbaru.
      const fresh = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { usedAt: true } });
      return res.status(400).json({
        success: false,
        status: 'used',
        message: 'Tiket sudah pernah dipakai.',
        usedAt: fresh?.usedAt ?? null,
        buyerName: ticket.orderItem?.order?.buyerName ?? ticket.bundleOrderItem?.order?.buyerName ?? null,
        typeName: ticket.ticketType?.name ?? ticket.bundleOrderItem?.bundle?.name ?? 'Tiket',
      });
    }

    return res.status(200).json({
      success: true,
      status: 'valid',
      message: 'Tiket valid. Silakan masuk.',
      ticketCode: ticket.ticketCode,
      buyerName: ticket.orderItem?.order?.buyerName ?? ticket.bundleOrderItem?.order?.buyerName ?? '-',
      typeName: ticket.ticketType?.name ?? ticket.bundleOrderItem?.bundle?.name ?? 'Tiket',
      usedAt: now,
    });
  } catch (err) {
    console.error('[VALIDATE TICKET ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { inviteScanner, getMyScannerEvents, getEventScanners, removeScanner, validateTicket };
