const prisma = require('../src/lib/prisma');
const slugify = require('slugify');

// POST /api/tickets/types — promotor buat jenis tiket
const createTicketType = async (req, res) => {
  try {
    const { eventId, name, description, price, quota } = req.body;
    if (!eventId || !name || price === undefined || quota === undefined) {
      return res.status(400).json({ success: false, message: 'eventId, name, price, dan quota wajib diisi.' });
    }
    if (Number(price) < 0 || Number(quota) < 0) {
      return res.status(400).json({ success: false, message: 'Harga dan kuota tidak boleh negatif.' });
    }

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const ticketType = await prisma.ticketType.create({
      data: {
        eventId,
        name,
        description: description || null,
        price: Number(price),
        quota: Number(quota),
      },
    });

    return res.status(201).json({ success: true, data: ticketType });
  } catch (err) {
    console.error('[CREATE TICKET TYPE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/tickets/types/:id
const updateTicketType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, quota, isActive } = req.body;

    const ticketType = await prisma.ticketType.findUnique({ where: { id }, include: { event: true } });
    if (!ticketType || ticketType.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Jenis tiket tidak ditemukan.' });
    }
    if (quota !== undefined && Number(quota) < ticketType.sold) {
      return res.status(400).json({ success: false, message: `Kuota tidak boleh kurang dari jumlah terjual (${ticketType.sold}).` });
    }

    const updated = await prisma.ticketType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: Number(price) }),
        ...(quota !== undefined && { quota: Number(quota) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[UPDATE TICKET TYPE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// DELETE /api/tickets/types/:id
const deleteTicketType = async (req, res) => {
  try {
    const { id } = req.params;
    const ticketType = await prisma.ticketType.findUnique({ where: { id }, include: { event: true } });
    if (!ticketType || ticketType.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Jenis tiket tidak ditemukan.' });
    }
    if (ticketType.sold > 0) {
      return res.status(400).json({ success: false, message: 'Jenis tiket yang sudah terjual tidak bisa dihapus. Nonaktifkan saja.' });
    }

    await prisma.ticketType.delete({ where: { id } });
    return res.json({ success: true, message: 'Jenis tiket berhasil dihapus.' });
  } catch (err) {
    console.error('[DELETE TICKET TYPE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/tickets/types?eventId=xxx
const getTicketTypes = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const ticketTypes = await prisma.ticketType.findMany({
      where: { eventId },
      orderBy: { price: 'asc' },
    });

    return res.json({ success: true, data: ticketTypes });
  } catch (err) {
    console.error('[GET TICKET TYPES ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/tickets/request-approval
const requestStorefrontApproval = async (req, res) => {
  try {
    const { eventId, saleStartAt, saleEndAt } = req.body;
    if (!eventId || !saleStartAt || !saleEndAt) {
      return res.status(400).json({ success: false, message: 'eventId, saleStartAt, dan saleEndAt wajib diisi.' });
    }
    if (new Date(saleEndAt) <= new Date(saleStartAt)) {
      return res.status(400).json({ success: false, message: 'Tanggal selesai jual harus setelah tanggal mulai jual.' });
    }

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    if (!['audience', 'promotor'].includes(event.feeBearer)) {
      return res.status(400).json({
        success: false,
        message: 'Anda harus memilih siapa yang menanggung fee platform sebelum mengajukan persetujuan',
      });
    }

    const ticketTypeCount = await prisma.ticketType.count({ where: { eventId } });
    if (ticketTypeCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Anda harus membuat minimal 1 jenis tiket sebelum mengajukan persetujuan',
      });
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        saleStartAt: new Date(saleStartAt),
        saleEndAt: new Date(saleEndAt),
        storefrontStatus: 'pending_approval',
        storefrontNote: null,
      },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[REQUEST STOREFRONT APPROVAL ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/tickets/storefront-settings — promotor set fee bearer, pajak, banner/logo
const updateStorefrontSettings = async (req, res) => {
  try {
    const { eventId, feeBearer, taxEnabled, bannerUrl, logoUrl } = req.body;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    if (feeBearer !== undefined && feeBearer !== null && !['audience', 'promotor'].includes(feeBearer)) {
      return res.status(400).json({ success: false, message: 'feeBearer harus "audience" atau "promotor".' });
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(feeBearer !== undefined && { feeBearer }),
        ...(taxEnabled !== undefined && { taxEnabled: Boolean(taxEnabled) }),
        ...(bannerUrl !== undefined && { bannerUrl }),
        ...(logoUrl !== undefined && { logoUrl }),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[UPDATE STOREFRONT SETTINGS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/tickets/event-info — promotor update deskripsi, fasilitas, T&C storefront
const updateEventStorefrontInfo = async (req, res) => {
  try {
    const { eventId, description, facilities, termsConditions } = req.body;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    if (facilities !== undefined && facilities !== null && !Array.isArray(facilities)) {
      return res.status(400).json({ success: false, message: 'facilities harus berupa array.' });
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(description !== undefined && { description }),
        ...(facilities !== undefined && { facilities }),
        ...(termsConditions !== undefined && { termsConditions }),
      },
    });

    return res.json({ success: true, event: updated });
  } catch (err) {
    console.error('[UPDATE EVENT STOREFRONT INFO ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/tickets/orders?eventId=xxx — promotor lihat semua order
const getOrdersByEvent = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const orders = await prisma.ticketOrder.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { ticketType: { select: { name: true } } } },
        merchItems: { include: { item: { select: { name: true } }, variant: { select: { size: true } } } },
      },
    });

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('[GET ORDERS BY EVENT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/tickets/by-order/:orderId
const getTicketsByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await prisma.ticketOrder.findUnique({
      where: { orderId },
      include: { event: true, items: { include: { tickets: true, ticketType: { select: { name: true } } } } },
    });
    if (!order || order.event.promotor_id !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('[GET TICKETS BY ORDER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ===== ADMIN ONLY =====

// GET /api/admin/storefront-requests
const getStorefrontRequests = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { storefrontStatus: 'pending_approval' },
      include: { promotor: { select: { name: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error('[GET STOREFRONT REQUESTS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/storefront-requests/:eventId/approve
const approveStorefront = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { platformFeePercent } = req.body;

    const feePercent = Number(platformFeePercent);
    if (!Number.isFinite(feePercent) || feePercent < 1.5 || feePercent > 5.0) {
      return res.status(400).json({ success: false, message: 'platformFeePercent wajib diisi, antara 1.5 dan 5.0.' });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    let slug = event.slug;
    if (!slug) {
      const base = slugify(event.title, { lower: true, strict: true, locale: 'id' });
      const existingSlug = await prisma.event.findFirst({ where: { slug: base, id: { not: eventId } } });
      slug = existingSlug ? `${base}-${Date.now()}` : base;
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { storefrontStatus: 'approved', storefrontNote: null, slug, platformFeePercent: feePercent },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[APPROVE STOREFRONT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/storefront-requests/:eventId/reject
const rejectStorefront = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { note } = req.body;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { storefrontStatus: 'rejected', storefrontNote: note || 'Ditolak oleh admin.' },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[REJECT STOREFRONT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  createTicketType,
  updateTicketType,
  deleteTicketType,
  getTicketTypes,
  requestStorefrontApproval,
  updateStorefrontSettings,
  updateEventStorefrontInfo,
  getOrdersByEvent,
  getTicketsByOrder,
  getStorefrontRequests,
  approveStorefront,
  rejectStorefront,
};
