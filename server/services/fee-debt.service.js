const prisma = require('../src/lib/prisma');

// Definisi tunggal "hutang fee" — dibagikan ke fee-debt.controller.js (rekonsiliasi admin) dan
// payout.controller.js (potong otomatis saat pencairan). JANGAN duplikasi filter ini di dua file.
//
// Cakupan hutang: order Ticket Box (channel "ticket_box") berbayar CASH, status "paid", belum
// di-settle (feeSettled: false). Kenapa cash-only: transfer Ticket Box lewat Midtrans → fee sudah
// terpotong otomatis; hanya CASH yang bypass Midtrans sehingga fee-nya jadi piutang nexEvent.
const DEBT_ORDER_WHERE = { channel: 'ticket_box', paymentMethod: 'cash', status: 'paid', feeSettled: false };

// Ambil hutang fee (belum settle) milik satu promotor: id order + total hutang.
// Return { orderIds: string[], totalDebt: number, orderCount: number }.
// orderIds dipakai untuk di-settle di dalam $transaction yang sama saat pencairan (item #2).
async function getPromotorFeeDebt(promotorId) {
  const orders = await prisma.ticketOrder.findMany({
    where: { ...DEBT_ORDER_WHERE, event: { promotor_id: promotorId } },
    select: { id: true, feeAmount: true },
  });
  const totalDebt = orders.reduce((sum, o) => sum + o.feeAmount, 0);
  return { orderIds: orders.map((o) => o.id), totalDebt, orderCount: orders.length };
}

// Hutang fee (belum settle) SELURUH promotor, digroup per promotor + total gabungan.
// Dipakai oleh fee-debt.controller (rekonsiliasi admin) DAN platform-revenue.controller (item #4)
// supaya definisi hutang identik di semua tempat — JANGAN re-implement filter/grouping di luar sini.
// Return { perPromotor: [{ promotorId, promotorName, promotorEmail, totalDebt, orderCount }], totalDebt }.
async function getAllPromotorsFeeDebt() {
  const orders = await prisma.ticketOrder.findMany({
    where: DEBT_ORDER_WHERE,
    select: {
      feeAmount: true,
      event: { select: { promotor_id: true, promotor: { select: { name: true, email: true } } } },
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
  const perPromotor = Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt);
  const totalDebt = perPromotor.reduce((s, p) => s + p.totalDebt, 0);
  return { perPromotor, totalDebt };
}

module.exports = { DEBT_ORDER_WHERE, getPromotorFeeDebt, getAllPromotorsFeeDebt };
