const prisma = require('../src/lib/prisma');
const { snap } = require('../services/midtrans.service');

const MAX_TICKETS_PER_NIK = 4;
const BOOKING_MINUTES = 15;

// GET /api/storefront/:slug — PUBLIC
const getEventStorefront = async (req, res) => {
  try {
    const { slug } = req.params;

    const event = await prisma.event.findUnique({
      where: { slug },
      include: {
        ticketTypes: {
          where: { isActive: true },
          orderBy: { price: 'asc' },
        },
      },
    });

    if (!event || event.storefrontStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const now = new Date();
    if (event.saleStartAt && now < event.saleStartAt) {
      return res.json({ success: true, event, status: 'not_started', message: 'Penjualan tiket belum dimulai.' });
    }
    if (event.saleEndAt && now > event.saleEndAt) {
      return res.json({ success: true, event, status: 'ended', message: 'Penjualan tiket telah berakhir.' });
    }

    const ticketTypesWithAvailability = event.ticketTypes.map((tt) => ({
      ...tt,
      available: tt.quota - tt.sold,
      isSoldOut: tt.sold >= tt.quota,
    }));

    return res.json({
      success: true,
      event: { ...event, ticketTypes: ticketTypesWithAvailability },
      status: 'active',
    });
  } catch (err) {
    console.error('[GET STOREFRONT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/storefront/:slug/order — PUBLIC
const createOrder = async (req, res) => {
  try {
    const { slug } = req.params;
    const { buyerName, buyerEmail, buyerPhone, buyerNik, items } = req.body;

    if (!buyerName || !buyerEmail || !buyerPhone || !buyerNik || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Semua field pembeli dan minimal 1 tiket wajib diisi.' });
    }
    if (!/^\d{16}$/.test(buyerNik)) {
      return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
    }
    if (!/^(\+62|62|0)8[0-9]{7,12}$/.test(buyerPhone.replace(/[\s-]/g, ''))) {
      return res.status(400).json({ success: false, message: 'Nomor HP tidak valid.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return res.status(400).json({ success: false, message: 'Email tidak valid.' });
    }

    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event || event.storefrontStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const now = new Date();
    if (event.saleStartAt && now < event.saleStartAt) {
      return res.status(400).json({ success: false, message: 'Penjualan tiket belum dimulai.' });
    }
    if (event.saleEndAt && now > event.saleEndAt) {
      return res.status(400).json({ success: false, message: 'Penjualan tiket telah berakhir.' });
    }

    const existingOrders = await prisma.ticketOrder.findMany({
      where: { eventId: event.id, buyerNik, status: { in: ['pending', 'paid'] } },
      include: { items: true },
    });
    const existingCount = existingOrders.flatMap((o) => o.items).reduce((sum, item) => sum + item.quantity, 0);
    const newCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (newCount <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah tiket tidak valid.' });
    }
    if (existingCount + newCount > MAX_TICKETS_PER_NIK) {
      return res.status(400).json({
        success: false,
        message: `NIK ini sudah memiliki ${existingCount} tiket. Maksimal ${MAX_TICKETS_PER_NIK} tiket per NIK per event.`,
      });
    }

    const ticketTypes = await prisma.ticketType.findMany({
      where: { eventId: event.id, id: { in: items.map((i) => i.ticketTypeId) } },
    });

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        for (const item of items) {
          const ticketType = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } });
          if (!ticketType || ticketType.eventId !== event.id || !ticketType.isActive) {
            throw new Error('Jenis tiket tidak tersedia.');
          }
          if (ticketType.sold + Number(item.quantity) > ticketType.quota) {
            throw new Error(`Tiket ${ticketType.name} tidak tersedia dalam jumlah yang diminta.`);
          }
          await tx.ticketType.update({
            where: { id: item.ticketTypeId },
            data: { sold: { increment: Number(item.quantity) } },
          });
        }

        const orderId = `nexevent-ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const expiredAt = new Date(Date.now() + BOOKING_MINUTES * 60 * 1000);
        const totalAmount = items.reduce((sum, item) => {
          const tt = ticketTypes.find((t) => t.id === item.ticketTypeId);
          return sum + tt.price * Number(item.quantity);
        }, 0);

        const created = await tx.ticketOrder.create({
          data: {
            eventId: event.id,
            orderId,
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerNik,
            totalAmount,
            expiredAt,
            status: 'pending',
            items: {
              create: items.map((item) => ({
                ticketTypeId: item.ticketTypeId,
                quantity: Number(item.quantity),
                price: ticketTypes.find((t) => t.id === item.ticketTypeId).price,
              })),
            },
          },
          include: { items: true },
        });

        const parameter = {
          transaction_details: { order_id: orderId, gross_amount: totalAmount },
          item_details: items.map((item) => {
            const tt = ticketTypes.find((t) => t.id === item.ticketTypeId);
            return {
              id: item.ticketTypeId,
              price: tt.price,
              quantity: Number(item.quantity),
              name: `Tiket ${tt.name} — ${event.title}`.slice(0, 50),
            };
          }),
          customer_details: { first_name: buyerName, email: buyerEmail, phone: buyerPhone },
        };
        const transaction = await snap.createTransaction(parameter);

        await tx.ticketOrder.update({ where: { id: created.id }, data: { midtransToken: transaction.token } });

        return { ...created, midtransToken: transaction.token };
      });
    } catch (txErr) {
      return res.status(400).json({ success: false, message: txErr.message || 'Gagal membuat pesanan.' });
    }

    return res.status(201).json({
      success: true,
      orderId: order.orderId,
      token: order.midtransToken,
      expiredAt: order.expiredAt,
    });
  } catch (err) {
    console.error('[CREATE ORDER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/storefront/order/:orderId — PUBLIC
const getOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await prisma.ticketOrder.findUnique({
      where: { orderId },
      omit: { buyerNik: true },
      include: {
        event: { select: { title: true, location: true, event_date: true, slug: true } },
        items: {
          include: {
            ticketType: { select: { name: true, price: true } },
            tickets: { select: { id: true, ticketCode: true, attendeeName: true, isUsed: true } },
          },
        },
      },
    });

    if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });

    return res.json({ success: true, order });
  } catch (err) {
    console.error('[GET ORDER STATUS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getEventStorefront, createOrder, getOrderStatus };
