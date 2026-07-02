const crypto = require('crypto');
const prisma = require('../src/lib/prisma');
const { snap } = require('../services/midtrans.service');

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
