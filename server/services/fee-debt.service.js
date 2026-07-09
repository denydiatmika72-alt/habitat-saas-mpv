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

module.exports = { DEBT_ORDER_WHERE, getPromotorFeeDebt };
