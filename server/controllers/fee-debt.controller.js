const prisma = require('../src/lib/prisma');

// Rekonsiliasi Hutang Fee (Roadmap #4).
//
// Konteks: transaksi Ticket Box (channel: "ticket_box") dibayar di lokasi.
// Solusi: fee dari transaksi Ticket Box dicatat sebagai HUTANG (piutang nexEvent) yang harus
// dilunasi promotor manual (transfer bank di luar app) lalu ditandai lunas oleh admin.
//
// Cakupan hutang: HANYA order ticket_box dengan paymentMethod "cash", status "paid", belum
// di-settle (feeSettled: false).
// KENAPA cash-only: sejak transfer Ticket Box WAJIB lewat Midtrans (fee otomatis terpotong saat
// settlement, sama seperti order online), transfer TIDAK lagi jadi hutang. Hanya CASH yang benar-benar
// bypass Midtrans (uang tunai langsung ke promotor) → fee-nya harus disetor manual = hutang.
//
// `feeAmount` adalah nominal fee yang terhutang, sudah dihitung & dipersist saat order dibuat
// (computeFeeAndTax di services/ticket.service.js) TERLEPAS dari feeBearer. Jadi hutang =
// jumlah feeAmount, apapun feeBearer-nya (audience → fee ada di kas cash yang dipegang promotor;
// promotor → promotor menanggung; dua-duanya tetap wajib disetor ke nexEvent).

// Filter dasar order yang MASUK hitungan hutang (dipakai konsisten di semua handler).
const DEBT_ORDER_WHERE = { channel: 'ticket_box', paymentMethod: 'cash', status: 'paid', feeSettled: false };

// GET /api/admin/fee-debt/by-promoter — admin only
// Agregasi total hutang fee per promotor (ticket_box + cash, paid, belum settle).
const getFeeDebtByPromoter = async (req, res) => {
  try {
    const orders = await prisma.ticketOrder.findMany({
      where: DEBT_ORDER_WHERE,
      select: {
        feeAmount: true,
        event: {
          select: {
            promotor_id: true,
            promotor: { select: { name: true, email: true } },
          },
        },
      },
    });

    // Group by promotor_id di aplikasi — Prisma groupBy tidak bisa lintas relasi.
    const map = new Map();
    for (const o of orders) {
      const pid = o.event.promotor_id;
      if (!map.has(pid)) {
        map.set(pid, {
          promotorId: pid,
          promotorName: o.event.promotor?.name || '(tanpa nama)',
          promotorEmail: o.event.promotor?.email || '',
          totalDebt: 0,
          orderCount: 0,
        });
      }
      const entry = map.get(pid);
      entry.totalDebt += o.feeAmount;
      entry.orderCount += 1;
    }

    const data = Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[FEE DEBT BY PROMOTER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/admin/fee-debt/:promotorId/detail — admin only
// Rincian order ticket_box CASH yang belum settle untuk satu promotor (untuk review sebelum tandai lunas).
const getFeeDebtDetail = async (req, res) => {
  try {
    const { promotorId } = req.params;
    const orders = await prisma.ticketOrder.findMany({
      where: { ...DEBT_ORDER_WHERE, event: { promotor_id: promotorId } },
      select: {
        id: true,
        orderId: true,
        createdAt: true,
        paidAt: true,
        totalAmount: true,
        feeAmount: true,
        taxAmount: true,
        feeBearer: true,
        paymentMethod: true,
        event: { select: { title: true } },
        items: { select: { quantity: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = orders.map((o) => ({
      id: o.id,
      orderId: o.orderId,
      eventTitle: o.event?.title || '(event terhapus)',
      createdAt: o.createdAt,
      paidAt: o.paidAt,
      paymentMethod: o.paymentMethod,
      feeBearer: o.feeBearer,
      // Subtotal tiket (harga face) = jumlah price*qty per item — dihitung agar admin bisa cross-check fee.
      ticketSubtotal: o.items.reduce((sum, it) => sum + it.price * it.quantity, 0),
      feeAmount: o.feeAmount,
      taxAmount: o.taxAmount,
      totalAmount: o.totalAmount,
    }));

    const totalDebt = data.reduce((sum, o) => sum + o.feeAmount, 0);
    return res.json({ success: true, data, totalDebt, orderCount: data.length });
  } catch (err) {
    console.error('[FEE DEBT DETAIL ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/fee-debt/:promotorId/settle — admin only
// Tandai hutang fee promotor sebagai LUNAS (feeSettled: true).
// Body opsional { orderIds: string[] } → settle hanya order tsb. Tanpa orderIds → settle SEMUA
// order ticket_box CASH paid yang belum settle milik promotor ini SAAT INI (as of now).
// Guard: hanya order channel ticket_box + cash + status paid + belum settle + milik promotorId yang
// benar-benar di-settle (order pending/online/promotor lain TIDAK akan tersentuh, walau ID-nya
// diselipkan di orderIds). Resolusi ID via findMany dulu karena updateMany tidak dukung filter relasi.
const settleFeeDebt = async (req, res) => {
  try {
    const { promotorId } = req.params;
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : null;

    const eligible = await prisma.ticketOrder.findMany({
      where: {
        ...DEBT_ORDER_WHERE,
        event: { promotor_id: promotorId },
        ...(orderIds ? { id: { in: orderIds } } : {}),
      },
      select: { id: true },
    });
    const ids = eligible.map((o) => o.id);

    if (ids.length === 0) {
      return res.json({ success: true, settledCount: 0, message: 'Tidak ada hutang fee yang perlu dilunasi.' });
    }

    const result = await prisma.ticketOrder.updateMany({
      where: { id: { in: ids } },
      data: { feeSettled: true },
    });

    return res.json({ success: true, settledCount: result.count });
  } catch (err) {
    console.error('[FEE DEBT SETTLE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getFeeDebtByPromoter, getFeeDebtDetail, settleFeeDebt };
