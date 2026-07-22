const prisma = require('../src/lib/prisma');
const { computeBalance } = require('./payout.controller');
const { computeEventPL } = require('../services/pl-report.service');
const { fetchPaidOrders, computeCategoryTotals } = require('./ticket-dashboard.controller');
const { dealValue } = require('./kerjasama-dashboard.controller');
const { isActivePro } = require('../middleware/pro.middleware');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/dashboard/summary?eventId= — ringkasan 4 kartu "Akses Cepat" Dashboard KPI.
// SATU endpoint agregat (bukan 5 call terpisah dari frontend) supaya halaman KPI tidak
// menembakkan banyak request kecil tiap ganti event, dan supaya penanganan Pro per-seksi
// terjadi SERVER-SIDE (bukan frontend menebak-nebak dari campuran 200/402).
//
// SEMUA angka DI-REUSE dari sumber tunggal yang sudah ada — JANGAN dikarang ulang di sini:
//   - RAB       : Budget.totalEstimatedCost + contingencyFundAmount (angka SAMA dgn kolom
//                 "Nilai RAB" document-table & basis donut alokasi — dari kolom tersimpan
//                 yang selalu di-recalc `recalcBudgetTotals` budget.controller.js).
//   - Sponsor   : SponsorDeal status "Disetujui" + dealValue() dari kerjasama-dashboard
//                 (== approvedDealValue / targetProgress.realized di hub Kerjasama).
//   - Ticketing : fetchPaidOrders + computeCategoryTotals dari ticket-dashboard
//                 (== kartu "Total Tiket Terjual" di hub Ticketing, paid-only).
//   - Payout    : computeBalance dari payout.controller (== halaman Pencairan Dana).
//                 ⚠ SALDO AKUN lintas-event BY DESIGN (payout memang tidak per-event) —
//                 frontend WAJIB melabelinya "Saldo Akun", bukan seolah per-event.
//   - Keuangan  : computeEventPL dari services/pl-report.service (== Laporan P&L).
//
// PRO GATING PER-SEKSI (bukan per-endpoint): RAB/tiket/payout = Starter-accessible, jadi
// endpoint ini TIDAK dipasangi requireActivePro. Seksi sponsor & keuangan (fitur Pro)
// mengembalikan { proLocked: true } tanpa angka kalau event belum Pro — frontend merender
// gembok, bukan error. Cek Pro pakai isActivePro yang SAMA dgn middleware (satu sumber).
// ═══════════════════════════════════════════════════════════════════════════════

const getDashboardSummary = async (req, res) => {
  try {
    const promotorId = req.user.id;
    const eventId = String(req.query.eventId || '');
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, promotor_id: true },
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    if (event.promotor_id !== promotorId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak — event bukan milik Anda.' });
    }

    // Status Pro event ini. Pemilik event = pemanggil (ownership sudah lolos di atas),
    // jadi cek user pemanggil == cek pemilik event — pola sama requireActivePro.
    const me = await prisma.user.findUnique({
      where: { id: promotorId },
      select: { plan: true, proEventId: true, proExpiresAt: true },
    });
    const pro = isActivePro(me, eventId);

    // ── Seksi Starter-accessible (selalu diisi) ───────────────────────────────
    const [budget, paidOrders, balance] = await Promise.all([
      prisma.budget.findFirst({
        where: { eventId },
        select: { totalEstimatedCost: true, contingencyFundAmount: true },
      }),
      fetchPaidOrders(eventId),
      computeBalance(promotorId),
    ]);

    const rab = budget
      ? {
          exists: true,
          total:
            Math.round(Number(budget.totalEstimatedCost) || 0) +
            Math.round(Number(budget.contingencyFundAmount) || 0),
        }
      : { exists: false, total: 0 };

    const catTotals = computeCategoryTotals(paidOrders);
    const ticketing = {
      ticketsSold: catTotals.tickets.count,
      // Lintas-event by design — label frontend: "Saldo Akun".
      payoutAvailable: balance.available,
    };

    // ── Seksi Pro (sponsor + keuangan) ────────────────────────────────────────
    let sponsor = { proLocked: true };
    let finance = { proLocked: true };
    if (pro) {
      const [approvedDeals, pl] = await Promise.all([
        prisma.sponsorDeal.findMany({
          where: { promotorId, eventId, status: 'Disetujui' },
          select: { totalValue: true, dealBenefits: { select: { totalPrice: true } } },
        }),
        computeEventPL({ eventId, userId: promotorId }),
      ]);
      sponsor = {
        proLocked: false,
        activeDeals: approvedDeals.length,
        approvedValue: approvedDeals.reduce((s, d) => s + dealValue(d), 0),
      };
      finance = {
        proLocked: false,
        totalIncome: pl.totals.totalIncome,
        totalExpense: pl.totals.totalExpense,
      };
    }

    return res.json({
      success: true,
      data: {
        event: { id: event.id, title: event.title },
        rab,
        sponsor,
        ticketing,
        finance,
      },
    });
  } catch (err) {
    console.error('[DASHBOARD SUMMARY ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getDashboardSummary };
