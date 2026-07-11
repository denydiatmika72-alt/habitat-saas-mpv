const prisma = require('../src/lib/prisma')

// Sumber TUNGGAL logika Laba/Rugi per-event. Diekstrak dari pl-report.controller.js supaya
// getPLReport (JSON), exportPLReportPDF (PDF), DAN event-summary.controller (Event Summary Report)
// memakai perhitungan yang IDENTIK — JANGAN duplikasi query/agregasi ini di tempat lain.
//
// Aturan akuntansi (lihat CLAUDE.md "Petty Cash" + "Storefront fee"):
//   - Pemasukan = penjualan nexEvent (net setelah fee platform) + sponsor (deal Disetujui + invoice
//     DP/Lunas) + Pemasukan Lain (OtherIncome).
//   - Pengeluaran = expense promotor (Expense) + petty cash crew type:"expense" SAJA (bukan topup/return).
//   - Penjualan nexEvent net = totalAmount - feeAmount (pola sama payout.computeBalance). Pajak TIDAK
//     dipotong (hak promotor).

// Label kategori Pemasukan Lain (nilai DB → label manusiawi). null/undefined = record lama = "Lainnya".
const OI_CATEGORY_LABELS = {
  merchandise: 'Merchandise',
  donasi: 'Donasi/Sumbangan',
  tiket_platform_lain: 'Tiket Platform Lain',
  lainnya: 'Lainnya',
}
const oiCategoryLabel = (cat) => OI_CATEGORY_LABELS[cat] || 'Lainnya'

// Ambil SEMUA baris mentah yang dibutuhkan P&L 1 event. `select` = superset dari kebutuhan JSON & PDF
// (field ekstra tak berpengaruh ke total). orderBy otherIncome date desc menjaga urutan JSON getPLReport.
async function fetchEventPLRows({ eventId, userId }) {
  const [sponsorDeals, otherIncomeRows, promotorExpenseRows, crewTxRows, ticketOrders] = await Promise.all([
    prisma.sponsorDeal.findMany({
      where: {
        eventId,
        status: 'Disetujui',
        invoices: { some: { status: { in: ['DP Terbayar', 'Lunas'] } } },
      },
      select: { sponsorName: true, tier: true, totalValue: true },
    }),
    prisma.otherIncome.findMany({
      where: { eventId, userId },
      orderBy: { date: 'desc' },
      select: { id: true, description: true, amount: true, date: true, category: true, platform: true },
    }),
    prisma.expense.findMany({
      where: { eventId, userId },
      select: { description: true, amount: true, category: true, date: true },
    }),
    // Crew petty cash — HANYA type:"expense" (JANGAN topup/return — mutasi internal, bukan biaya).
    prisma.pettyCashTransaction.findMany({
      where: { type: 'expense', account: { eventId } },
      include: { account: { select: { division: true } } },
    }),
    // Penjualan tiket/merch/bundling nexEvent (online + ticket_box) status "paid" di event ini.
    prisma.ticketOrder.findMany({
      where: { status: 'paid', eventId },
      select: { totalAmount: true, feeAmount: true },
    }),
  ])
  return { sponsorDeals, otherIncomeRows, promotorExpenseRows, crewTxRows, ticketOrders }
}

// Hitung SEMUA total + breakdown dari baris mentah. Pure (tak sentuh DB). `safe` membulatkan ke Int.
function computeEventPLTotals(rows) {
  const { sponsorDeals, otherIncomeRows, promotorExpenseRows, crewTxRows, ticketOrders } = rows
  const safe = (n) => Math.round(Number(n) || 0)

  const sponsorTotal = sponsorDeals.reduce((s, d) => s + safe(d.totalValue), 0)
  const sponsorItems = sponsorDeals.map((d) => ({ sponsorName: d.sponsorName, tier: d.tier, totalValue: safe(d.totalValue) }))

  const nexeventSalesTotal = ticketOrders.reduce((s, o) => s + (safe(o.totalAmount) - safe(o.feeAmount)), 0)

  const otherTotal = otherIncomeRows.reduce((s, r) => s + safe(r.amount), 0)
  const otherByCatMap = {}
  for (const r of otherIncomeRows) {
    const key = r.category || 'lainnya'
    otherByCatMap[key] = (otherByCatMap[key] || 0) + safe(r.amount)
  }
  const otherByCategory = Object.entries(otherByCatMap).map(([category, total]) => ({ category, label: oiCategoryLabel(category), total }))
  const otherItems = otherIncomeRows.map((r) => ({
    id: r.id, description: r.description, amount: safe(r.amount), date: r.date,
    category: r.category || 'lainnya', categoryLabel: oiCategoryLabel(r.category), platform: r.platform || null,
  }))

  const promotorTotal = promotorExpenseRows.reduce((s, e) => s + safe(e.amount), 0)
  const promotorByCategoryMap = {}
  for (const e of promotorExpenseRows) {
    const cat = e.category || 'Lain-lain'
    promotorByCategoryMap[cat] = (promotorByCategoryMap[cat] || 0) + safe(e.amount)
  }
  const promotorByCategory = Object.entries(promotorByCategoryMap).map(([category, total]) => ({ category, total }))

  const crewTotal = crewTxRows.reduce((s, t) => s + safe(t.amount), 0)
  const crewByDivisionMap = {}
  for (const t of crewTxRows) {
    const div = t.account?.division || 'Crew'
    crewByDivisionMap[div] = (crewByDivisionMap[div] || 0) + safe(t.amount)
  }
  const crewByDivision = Object.entries(crewByDivisionMap).map(([division, total]) => ({ division, total }))
  const crewItems = crewTxRows.map((t) => ({ description: t.description, amount: safe(t.amount), division: t.account?.division || 'Crew', createdAt: t.createdAt }))

  const totalIncome = nexeventSalesTotal + sponsorTotal + otherTotal
  const totalExpense = promotorTotal + crewTotal
  const netPL = totalIncome - totalExpense
  const marginPct = totalIncome > 0 ? ((netPL / totalIncome) * 100).toFixed(1) : '0'

  return {
    sponsorTotal, sponsorItems,
    nexeventSalesTotal, nexeventOrderCount: ticketOrders.length,
    otherTotal, otherByCategory, otherItems,
    promotorTotal, promotorByCategory, promotorByCategoryMap,
    crewTotal, crewByDivision, crewByDivisionMap, crewItems,
    totalIncome, totalExpense, netPL, marginPct, isProfit: netPL >= 0,
  }
}

// Convenience: fetch + compute dalam satu panggil (untuk pemakai yang butuh keduanya).
async function computeEventPL({ eventId, userId }) {
  const rows = await fetchEventPLRows({ eventId, userId })
  return { rows, totals: computeEventPLTotals(rows) }
}

module.exports = { fetchEventPLRows, computeEventPLTotals, computeEventPL, oiCategoryLabel, OI_CATEGORY_LABELS }
