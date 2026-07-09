const prisma = require('../src/lib/prisma');
const { getAllPromotorsFeeDebt } = require('../services/fee-debt.service');

// Laporan Pendapatan Platform (Payout & Laporan Keuangan Roadmap #4) — ADMIN ONLY.
//
// Menampilkan pendapatan nexEvent yang BENAR-BENAR sudah masuk rekening (confirmed revenue),
// dipecah per sumber + per promotor, plus ringkasan hutang fee yang masih outstanding.
//
// ── Definisi "confirmed revenue" (uang sungguhan di rekening nexEvent) ──
//   1. Fee order ONLINE (channel "online", status "paid"): fee otomatis dipotong Midtrans → confirmed.
//   2. Fee order Ticket Box TRANSFER (channel "ticket_box", paymentMethod "transfer", status "paid"):
//      transfer WAJIB lewat Midtrans → fee auto-settle sama seperti online → confirmed (TIDAK butuh
//      cek feeSettled).
//   3. Fee order Ticket Box CASH (channel "ticket_box", paymentMethod "cash", status "paid"): bypass
//      Midtrans → jadi hutang. Confirmed HANYA jika feeSettled === true (promotor sudah setor manual &
//      admin sudah tandai lunas — pola sama persis dgn DEBT_ORDER_WHERE di fee-debt.service.js, tapi
//      kondisi feeSettled DI-INVERT ke true).
//   4. Langganan Pro (ProTransaction status "paid", type "activation"/"extension"): confirmed.
//
// Order CASH yang feeSettled === false = hutang outstanding → BUKAN revenue (dikeluarkan dari total),
// tapi tetap ditampilkan terpisah sebagai ringkasan hutang (reuse getAllPromotorsFeeDebt).
//
// ── Timing pengakuan pendapatan ──
//   Pakai `paidAt` (bukan createdAt): revenue diakui saat uang benar-benar settle. `paidAt` di-set untuk
//   SEMUA record paid (cash box saat dibuat, transfer/online + Pro via webhook Midtrans — lihat
//   payment.controller & ticket-box.controller). Rentang tanggal berbasis UTC.

// Resolusi periode dari query. Prioritas: startDate+endDate (custom) → month+year → default bulan ini.
// Return { start, endExclusive, mode, label } atau { error } untuk input invalid.
function resolveRange(q) {
  const { startDate, endDate, month, year } = q;

  if (startDate || endDate) {
    if (!startDate || !endDate) return { error: 'startDate dan endDate harus diisi keduanya untuk rentang custom.' };
    const s = new Date(`${startDate}T00:00:00.000Z`);
    const e = new Date(`${endDate}T00:00:00.000Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return { error: 'Format tanggal tidak valid (pakai YYYY-MM-DD).' };
    if (s > e) return { error: 'startDate tidak boleh setelah endDate.' };
    // endExclusive = awal hari SETELAH endDate → seluruh endDate ikut terhitung.
    const endExclusive = new Date(e.getTime() + 24 * 60 * 60 * 1000);
    return { start: s, endExclusive, mode: 'custom', label: `${startDate} s/d ${endDate}` };
  }

  const now = new Date();
  let y = year !== undefined ? parseInt(year, 10) : now.getUTCFullYear();
  let m = month !== undefined ? parseInt(month, 10) : now.getUTCMonth() + 1; // 1-based
  if (!Number.isInteger(y) || y < 2000 || y > 3000) return { error: 'Tahun tidak valid.' };
  if (!Number.isInteger(m) || m < 1 || m > 12) return { error: 'Bulan tidak valid (1-12).' };
  const start = new Date(Date.UTC(y, m - 1, 1));
  const endExclusive = new Date(Date.UTC(y, m, 1)); // awal bulan berikutnya
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return { start, endExclusive, mode: 'month', label: `${MONTHS[m - 1]} ${y}`, month: m, year: y };
}

// GET /api/admin/platform-revenue/revenue — admin only
const getPlatformRevenue = async (req, res) => {
  try {
    const range = resolveRange(req.query);
    if (range.error) return res.status(400).json({ success: false, message: range.error });
    const { start, endExclusive } = range;

    const [orders, proTx, debt] = await Promise.all([
      prisma.ticketOrder.findMany({
        where: { status: 'paid', paidAt: { gte: start, lt: endExclusive } },
        select: {
          orderType: true, channel: true, paymentMethod: true, feeSettled: true, feeAmount: true,
          event: { select: { promotor_id: true, promotor: { select: { name: true, email: true } } } },
        },
      }),
      prisma.proTransaction.findMany({
        where: { status: 'paid', type: { in: ['activation', 'extension'] }, paidAt: { gte: start, lt: endExclusive } },
        select: { amount: true, type: true, userId: true, user: { select: { name: true, email: true } } },
      }),
      getAllPromotorsFeeDebt(),
    ]);

    const sources = { ticketOnline: 0, ticketCashSettled: 0, merch: 0, bundling: 0, proActivation: 0, proExtension: 0 };
    const promotorMap = new Map();
    const getP = (id, name, email) => {
      if (!id) id = '(unknown)';
      if (!promotorMap.has(id)) {
        promotorMap.set(id, {
          promotorId: id,
          promotorName: name || '(tanpa nama)',
          promotorEmail: email || '',
          ticketOnline: 0, ticketCashSettled: 0, merch: 0, bundling: 0, proSubscription: 0, total: 0,
        });
      }
      return promotorMap.get(id);
    };

    for (const o of orders) {
      const isCashBox = o.channel === 'ticket_box' && o.paymentMethod === 'cash';
      const confirmed = !isCashBox || o.feeSettled === true;
      if (!confirmed) continue; // hutang outstanding — bukan revenue
      const fee = o.feeAmount || 0;
      if (fee === 0) continue;
      const p = getP(o.event?.promotor_id, o.event?.promotor?.name, o.event?.promotor?.email);
      if (o.orderType === 'merch') {
        sources.merch += fee; p.merch += fee;
      } else if (o.orderType === 'bundling') {
        sources.bundling += fee; p.bundling += fee;
      } else { // 'ticket' (default)
        if (isCashBox) { sources.ticketCashSettled += fee; p.ticketCashSettled += fee; }
        else { sources.ticketOnline += fee; p.ticketOnline += fee; } // online + ticket_box transfer (auto-settle)
      }
      p.total += fee;
    }

    for (const t of proTx) {
      const amt = t.amount || 0;
      const p = getP(t.userId, t.user?.name, t.user?.email);
      p.proSubscription += amt; p.total += amt;
      if (t.type === 'activation') sources.proActivation += amt;
      else sources.proExtension += amt;
    }

    const proSubscription = sources.proActivation + sources.proExtension;
    const totalRevenue = sources.ticketOnline + sources.ticketCashSettled + sources.merch + sources.bundling + proSubscription;
    const perPromotor = Array.from(promotorMap.values()).sort((a, b) => b.total - a.total);

    return res.json({
      success: true,
      period: {
        mode: range.mode,
        label: range.label,
        month: range.month ?? null,
        year: range.year ?? null,
        start: start.toISOString(),
        endExclusive: endExclusive.toISOString(),
      },
      totalRevenue,
      breakdown: {
        ticketOnline: sources.ticketOnline,
        ticketCashSettled: sources.ticketCashSettled,
        merch: sources.merch,
        bundling: sources.bundling,
        proSubscription,
        proActivation: sources.proActivation,
        proExtension: sources.proExtension,
      },
      perPromotor,
      debt: { totalOutstanding: debt.totalDebt, perPromotor: debt.perPromotor },
    });
  } catch (err) {
    console.error('[PLATFORM REVENUE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getPlatformRevenue };
