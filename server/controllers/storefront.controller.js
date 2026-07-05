const prisma = require('../src/lib/prisma');
const { snap } = require('../services/midtrans.service');

const MAX_TICKETS_PER_NIK = 4;
const BOOKING_MINUTES = 15;
const DEFAULT_FEE_PERCENT = 3.5;

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
        merchItems: {
          where: { isActive: true, approvalStatus: 'approved' },
          include: { variants: { orderBy: { size: 'asc' } } },
          orderBy: { createdAt: 'asc' },
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

    const merchWithAvailability = event.merchItems.map((item) => ({
      ...item,
      variants: item.variants.map((v) => ({
        ...v,
        available: v.stock - v.sold,
        isSoldOut: v.sold >= v.stock,
      })),
    }));

    return res.json({
      success: true,
      event: {
        ...event,
        ticketTypes: ticketTypesWithAvailability,
        merchItems: merchWithAvailability,
        // feePercent legacy (fallback umum); fee per tipe order di-resolve frontend/backend
        // via chain: fee spesifik → platformFeePercent → 3.5. Field ticketFeePercent /
        // merchFeePercent / bundlingFeePercent sudah ikut ter-spread dari ...event.
        feePercent: event.platformFeePercent || DEFAULT_FEE_PERCENT,
        feeBearer: event.feeBearer,
        taxEnabled: event.taxEnabled,
      },
      status: 'active',
    });
  } catch (err) {
    console.error('[GET STOREFRONT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/storefront/:slug/order — PUBLIC (tiket, merch, atau bundling)
const createOrder = async (req, res) => {
  try {
    const { slug } = req.params;
    const { buyerName, buyerEmail, buyerPhone, buyerNik, items } = req.body;

    // ticketItems (nama baru) fallback ke items (nama lama) supaya backward-compatible.
    const ticketItems = Array.isArray(req.body.ticketItems)
      ? req.body.ticketItems
      : Array.isArray(items)
        ? items
        : [];
    const merchItems = Array.isArray(req.body.merchItems) ? req.body.merchItems : [];

    if (!buyerName || !buyerEmail || !buyerPhone) {
      return res.status(400).json({ success: false, message: 'Data pembeli (nama, email, HP) wajib diisi.' });
    }
    if (ticketItems.length === 0 && merchItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal 1 tiket atau merchandise.' });
    }
    if (!/^(\+62|62|0)8[0-9]{7,12}$/.test(buyerPhone.replace(/[\s-]/g, ''))) {
      return res.status(400).json({ success: false, message: 'Nomor HP tidak valid.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return res.status(400).json({ success: false, message: 'Email tidak valid.' });
    }

    const hasTickets = ticketItems.length > 0;
    // NIK wajib & harus valid kalau ada pembelian tiket (anti-calo). Untuk merch-only, NIK opsional.
    if (hasTickets) {
      if (!/^\d{16}$/.test(buyerNik || '')) {
        return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
      }
    } else if (buyerNik && !/^\d{16}$/.test(buyerNik)) {
      return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
    }
    const safeNik = buyerNik || '';

    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event || event.storefrontStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const now = new Date();
    if (event.saleStartAt && now < event.saleStartAt) {
      return res.status(400).json({ success: false, message: 'Penjualan belum dimulai.' });
    }
    if (event.saleEndAt && now > event.saleEndAt) {
      return res.status(400).json({ success: false, message: 'Penjualan telah berakhir.' });
    }

    // Anti-calo: limit NIK hanya berlaku untuk pembelian tiket.
    if (hasTickets) {
      const existingOrders = await prisma.ticketOrder.findMany({
        where: { eventId: event.id, buyerNik: safeNik, status: { in: ['pending', 'paid'] } },
        include: { items: true },
      });
      const existingCount = existingOrders.flatMap((o) => o.items).reduce((sum, item) => sum + item.quantity, 0);
      const newCount = ticketItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (newCount <= 0) {
        return res.status(400).json({ success: false, message: 'Jumlah tiket tidak valid.' });
      }
      if (existingCount + newCount > MAX_TICKETS_PER_NIK) {
        return res.status(400).json({
          success: false,
          message: `NIK ini sudah memiliki ${existingCount} tiket. Maksimal ${MAX_TICKETS_PER_NIK} tiket per NIK per event.`,
        });
      }
    }

    const ticketTypes = hasTickets
      ? await prisma.ticketType.findMany({ where: { eventId: event.id, id: { in: ticketItems.map((i) => i.ticketTypeId) } } })
      : [];

    const orderType = hasTickets && merchItems.length > 0 ? 'bundling' : hasTickets ? 'ticket' : 'merch';

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        const itemDetails = [];
        // Subtotal dipisah: pajak 10% HANYA kena subtotal tiket, merch TIDAK pernah kena pajak.
        let ticketSubtotal = 0;
        let merchSubtotal = 0;

        // ===== Tiket =====
        for (const item of ticketItems) {
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
          ticketSubtotal += ticketType.price * Number(item.quantity);
          itemDetails.push({
            id: item.ticketTypeId,
            price: ticketType.price,
            quantity: Number(item.quantity),
            name: `Tiket ${ticketType.name} — ${event.title}`.slice(0, 50),
          });
        }

        // ===== Merchandise =====
        const merchCreate = [];
        for (const m of merchItems) {
          const variant = await tx.merchVariant.findUnique({ where: { id: m.variantId }, include: { item: true } });
          if (!variant || variant.item.eventId !== event.id || !variant.item.isActive || variant.item.approvalStatus !== 'approved') {
            throw new Error('Varian merchandise tidak tersedia.');
          }
          if (variant.sold + Number(m.quantity) > variant.stock) {
            throw new Error(`Stok ${variant.item.name} (${variant.size}) tidak cukup.`);
          }
          await tx.merchVariant.update({
            where: { id: variant.id },
            data: { sold: { increment: Number(m.quantity) } },
          });
          merchSubtotal += variant.item.price * Number(m.quantity);
          merchCreate.push({
            merchItemId: variant.item.id,
            variantId: variant.id,
            quantity: Number(m.quantity),
            price: variant.item.price,
          });
          itemDetails.push({
            id: variant.id,
            price: variant.item.price,
            quantity: Number(m.quantity),
            name: `${variant.item.name} (${variant.size})`.slice(0, 50),
          });
        }

        const subtotal = ticketSubtotal + merchSubtotal;

        // Fee per tipe order — fallback chain: fee spesifik → platformFeePercent (legacy) → 3.5.
        let feePercent;
        if (orderType === 'bundling') {
          feePercent = event.bundlingFeePercent ?? event.platformFeePercent ?? DEFAULT_FEE_PERCENT;
        } else if (orderType === 'merch') {
          feePercent = event.merchFeePercent ?? event.platformFeePercent ?? DEFAULT_FEE_PERCENT;
        } else {
          feePercent = event.ticketFeePercent ?? event.platformFeePercent ?? DEFAULT_FEE_PERCENT;
        }

        const feeBearer = event.feeBearer === 'audience' ? 'audience' : 'promotor';
        // Pajak 10% HANYA dari subtotal tiket — merch tidak pernah kena pajak.
        const taxAmount = event.taxEnabled ? Math.round(ticketSubtotal * 0.1) : 0;
        const feeAmount = Math.round(subtotal * (feePercent / 100));

        // Kalau fee ditanggung penonton, fee ditambahkan ke total tagihan. Kalau ditanggung promotor,
        // penonton hanya bayar subtotal + pajak — fee dipotong dari hasil penjualan promotor (tidak ditagih ke penonton).
        const totalAmount = feeBearer === 'audience' ? subtotal + taxAmount + feeAmount : subtotal + taxAmount;

        const orderId = `nexevent-${orderType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const expiredAt = new Date(Date.now() + BOOKING_MINUTES * 60 * 1000);

        const created = await tx.ticketOrder.create({
          data: {
            eventId: event.id,
            orderId,
            orderType,
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerNik: safeNik,
            totalAmount,
            feeAmount,
            feeBearer,
            taxAmount,
            expiredAt,
            status: 'pending',
            items: hasTickets
              ? {
                  create: ticketItems.map((item) => ({
                    ticketTypeId: item.ticketTypeId,
                    quantity: Number(item.quantity),
                    price: ticketTypes.find((t) => t.id === item.ticketTypeId).price,
                  })),
                }
              : undefined,
            merchItems: merchCreate.length > 0 ? { create: merchCreate } : undefined,
          },
          include: { items: true, merchItems: true },
        });

        if (feeBearer === 'audience' && feeAmount > 0) {
          itemDetails.push({ id: 'platform-fee', price: feeAmount, quantity: 1, name: `Biaya Layanan nexEvent (${feePercent}%)` });
        }
        if (taxAmount > 0) {
          itemDetails.push({ id: 'tax', price: taxAmount, quantity: 1, name: 'Pajak Tiket (10%)' });
        }

        const parameter = {
          transaction_details: { order_id: orderId, gross_amount: totalAmount },
          item_details: itemDetails,
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
        merchItems: {
          include: {
            item: { select: { name: true, imageUrl: true } },
            variant: { select: { size: true } },
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
