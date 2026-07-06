const crypto = require('crypto');
const prisma = require('../src/lib/prisma');
const { snap } = require('../services/midtrans.service');
const { sendOrderEmail } = require('../services/email.service');

const PRICE = { activation: 499000, extension: 99000 };
const ACTIVATION_DAYS = 90;
const EXTENSION_DAYS = 30;

const createProPayment = async (req, res) => {
  const { eventId, type } = req.body;

  if (!eventId || !['activation', 'extension'].includes(type))
    return res.status(400).json({ success: false, message: 'eventId dan type ("activation"/"extension") wajib diisi.' });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

    const isActivePro = user.plan === 'pro' && user.proExpiresAt && new Date(user.proExpiresAt) > new Date();

    if (type === 'activation' && isActivePro)
      return res.status(400).json({ success: false, message: 'Anda sudah memiliki lisensi Pro aktif. Gunakan perpanjangan jika ingin menambah durasi.' });

    if (type === 'extension' && (!isActivePro || user.proEventId !== eventId))
      return res.status(400).json({ success: false, message: 'Event ini bukan event Pro aktif Anda saat ini.' });

    const amount = PRICE[type];
    const orderId = `nexevent-pro-${Date.now()}-${req.user.id.slice(0, 8)}`;

    const transaction = await prisma.proTransaction.create({
      data: { userId: user.id, eventId, type, amount, orderId, status: 'pending' },
    });

    const parameter = {
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{
        id: type === 'activation' ? 'pro-activation' : 'pro-extension',
        price: amount,
        quantity: 1,
        name: type === 'activation'
          ? 'nexEvent Pro — Aktivasi (90 hari)'
          : 'nexEvent Pro — Perpanjangan (+30 hari)',
      }],
      customer_details: {
        first_name: user.name,
        email: user.email,
        phone: user.phone || '',
      },
      callbacks: {
        finish: `${process.env.CLIENT_URL}/dashboard/upgrade?status=success`,
        error: `${process.env.CLIENT_URL}/dashboard/upgrade?status=error`,
        pending: `${process.env.CLIENT_URL}/dashboard/upgrade?status=pending`,
      },
    };

    const midtransRes = await snap.createTransaction(parameter);

    await prisma.proTransaction.update({
      where: { id: transaction.id },
      data: { midtransToken: midtransRes.token },
    });

    return res.status(200).json({ success: true, token: midtransRes.token, orderId });
  } catch (err) {
    console.error('[CREATE PRO PAYMENT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const notification = req.body;
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = notification;

    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${process.env.MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    if (signature_key !== expectedSignature) {
      console.warn('[WEBHOOK] Signature tidak valid untuk order_id:', order_id);
      return res.status(200).json({ success: false, message: 'Invalid signature.' });
    }

    // Semua order storefront (tiket, merch, bundling) di-route ke handler yang sama.
    if (/^nexevent-(ticket|merch|bundling)-/.test(order_id)) {
      return handleTicketOrderWebhook(order_id, transaction_status, res);
    }

    const transaction = await prisma.proTransaction.findUnique({ where: { orderId: order_id } });
    if (!transaction) {
      console.warn('[WEBHOOK] ProTransaction tidak ditemukan untuk order_id:', order_id);
      return res.status(200).json({ success: false, message: 'Transaction not found.' });
    }

    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      if (transaction.status !== 'paid') {
        await prisma.proTransaction.update({
          where: { id: transaction.id },
          data: { status: 'paid', paidAt: new Date() },
        });

        if (transaction.type === 'activation') {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + ACTIVATION_DAYS * 24 * 60 * 60 * 1000);
          await prisma.user.update({
            where: { id: transaction.userId },
            data: { plan: 'pro', proEventId: transaction.eventId, proStartedAt: now, proExpiresAt: expiresAt },
          });
        } else if (transaction.type === 'extension') {
          const currentUser = await prisma.user.findUnique({ where: { id: transaction.userId } });
          const base = currentUser?.proExpiresAt && new Date(currentUser.proExpiresAt) > new Date()
            ? new Date(currentUser.proExpiresAt)
            : new Date();
          const newExpiry = new Date(base.getTime() + EXTENSION_DAYS * 24 * 60 * 60 * 1000);
          await prisma.user.update({
            where: { id: transaction.userId },
            data: { proExpiresAt: newExpiry },
          });
        }
      }
    } else if (['expire', 'cancel', 'deny'].includes(transaction_status)) {
      await prisma.proTransaction.update({
        where: { id: transaction.id },
        data: { status: transaction_status === 'expire' ? 'expired' : 'failed' },
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    return res.status(200).json({ success: false, message: 'Server error.' });
  }
};

const handleTicketOrderWebhook = async (orderId, transactionStatus, res) => {
  try {
    const order = await prisma.ticketOrder.findUnique({
      where: { orderId },
      include: {
        items: true,
        merchItems: true,
        event: true,
        bundleItems: { include: { bundle: { include: { items: true } } } },
      },
    });

    if (!order) {
      console.warn('[WEBHOOK] TicketOrder tidak ditemukan untuk order_id:', orderId);
      return res.status(200).json({ success: false, message: 'Order not found.' });
    }

    if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
      if (order.status === 'pending') {
        // Generate 1 e-ticket per item tiket (merch tidak menghasilkan tiket, cukup barcode pickup di email).
        for (const item of order.items) {
          for (let i = 0; i < item.quantity; i++) {
            const ticketCode = `NE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            await prisma.ticket.create({ data: { orderItemId: item.id, ticketTypeId: item.ticketTypeId, ticketCode } });
          }
        }

        // Generate e-ticket untuk tiket yang ada DI DALAM paket bundling (× jumlah paket).
        // Tiket paket di-link ke bundleOrderItem (bukan orderItem) + simpan ticketTypeId agar tahu jenisnya.
        for (const boi of order.bundleItems) {
          for (const bi of boi.bundle.items) {
            if (bi.itemType === 'ticket' && bi.ticketTypeId) {
              const count = bi.quantity * boi.quantity;
              for (let i = 0; i < count; i++) {
                const ticketCode = `NE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                await prisma.ticket.create({
                  data: { bundleOrderItemId: boi.id, ticketTypeId: bi.ticketTypeId, ticketCode },
                });
              }
            }
          }
        }

        await prisma.ticketOrder.update({
          where: { orderId },
          data: { status: 'paid', paidAt: new Date() },
        });

        // Re-fetch dengan relasi lengkap supaya email bisa render tiket + merch.
        const fullOrder = await prisma.ticketOrder.findUnique({
          where: { orderId },
          include: {
            event: true,
            items: { include: { ticketType: true } },
            merchItems: { include: { item: true, variant: true } },
          },
        });
        await sendOrderEmail(fullOrder);
      }
    } else if (['expire', 'cancel', 'deny'].includes(transactionStatus)) {
      if (order.status === 'pending') {
        const ops = [
          ...order.items.map((item) =>
            prisma.ticketType.update({ where: { id: item.ticketTypeId }, data: { sold: { decrement: item.quantity } } })
          ),
          ...order.merchItems.map((m) =>
            prisma.merchVariant.update({ where: { id: m.variantId }, data: { sold: { decrement: m.quantity } } })
          ),
        ];
        // Bundle: kembalikan stok tiap item paket × jumlah paket.
        for (const boi of order.bundleItems) {
          // Tiket — dari definisi paket (ticketTypeId tetap ada di BundleItem).
          for (const it of boi.bundle.items) {
            if (it.itemType === 'ticket' && it.ticketTypeId) {
              const dec = it.quantity * boi.quantity;
              ops.push(prisma.ticketType.update({ where: { id: it.ticketTypeId }, data: { sold: { decrement: dec } } }));
            }
          }
          // Merch — restore ke varian yang BENAR dipilih pembeli (disimpan di merchSelections saat order dibuat).
          const selections = Array.isArray(boi.merchSelections) ? boi.merchSelections : [];
          for (const sel of selections) {
            if (sel.variantId && sel.quantity) {
              ops.push(prisma.merchVariant.update({ where: { id: sel.variantId }, data: { sold: { decrement: sel.quantity } } }));
            }
          }
        }
        ops.push(prisma.ticketOrder.update({ where: { orderId }, data: { status: transactionStatus === 'expire' ? 'expired' : 'cancelled' } }));
        await prisma.$transaction(ops);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[TICKET WEBHOOK ERROR]', err);
    return res.status(200).json({ success: false, message: 'Server error.' });
  }
};

const getPaymentStatus = async (req, res) => {
  try {
    const transaction = await prisma.proTransaction.findUnique({ where: { orderId: req.params.orderId } });
    if (!transaction || transaction.userId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });

    return res.status(200).json({ success: true, data: transaction });
  } catch (err) {
    console.error('[GET PAYMENT STATUS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { createProPayment, handleWebhook, getPaymentStatus };
