const prisma = require('../src/lib/prisma')
const PDFDocument = require('pdfkit')
const { fetchEventPLRows, computeEventPLTotals, oiCategoryLabel } = require('../services/pl-report.service')

// Logika agregasi P&L (query + total) kini hidup di services/pl-report.service.js supaya IDENTIK dengan
// Event Summary Report. Controller ini hanya bertugas: ownership check + shaping JSON / render PDF.

const getPLReport = async (req, res) => {
  try {
    const { eventId } = req.query
    const userId = req.user.id

    if (!eventId) return res.status(400).json({ success: false, message: 'eventId diperlukan.' })

    const event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: userId },
      select: { id: true, title: true, event_date: true, location: true },
    })
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' })

    const rows = await fetchEventPLRows({ eventId, userId })
    const t = computeEventPLTotals(rows)

    return res.json({
      success: true,
      event: { id: event.id, title: event.title, eventDate: event.event_date, location: event.location },
      summary: { totalIncome: t.totalIncome, totalExpense: t.totalExpense, netPL: t.netPL, marginPct: t.marginPct, isProfit: t.isProfit },
      income: {
        // Penjualan tiket & merchandise via nexEvent (net setelah fee platform). SUMBER TERPISAH dari
        // "tiket_platform_lain" di Pemasukan Lain — jangan pernah digabung (hindari double-count).
        nexeventSales: { total: t.nexeventSalesTotal, orderCount: t.nexeventOrderCount, note: 'Penjualan tiket/merch/bundling via nexEvent (online + Ticket Box), sudah dikurangi fee platform' },
        sponsor: { total: t.sponsorTotal, note: 'Hanya deal dengan invoice DP Terbayar atau Lunas', items: t.sponsorItems },
        other: { total: t.otherTotal, byCategory: t.otherByCategory, items: t.otherItems },
      },
      expense: {
        promotor: { total: t.promotorTotal, byCategory: t.promotorByCategory, items: rows.promotorExpenseRows },
        crew: { total: t.crewTotal, byDivision: t.crewByDivision, items: t.crewItems },
      },
    })
  } catch (err) {
    console.error('[pl-report] getPLReport error:', err)
    res.status(500).json({ success: false, message: 'Gagal mengambil data P&L.' })
  }
}

const exportPLReportPDF = async (req, res) => {
  const { eventId } = req.query
  const userId = req.user.id

  if (!eventId) return res.status(400).json({ success: false, message: 'eventId diperlukan.' })

  // ── STEP 1: Fetch ALL data BEFORE touching PDF stream ──
  let event, user, rows, t
  try {
    event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: userId },
      select: { id: true, title: true, event_date: true, location: true },
    })
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' })

    user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    rows = await fetchEventPLRows({ eventId, userId })
    t = computeEventPLTotals(rows)
  } catch (err) {
    console.error('[pl-report] exportPDF data fetch error:', err)
    return res.status(500).json({ success: false, message: 'Gagal mengambil data laporan.' })
  }

  // ── STEP 2: Calculate all values safely BEFORE piping ──
  const safe = (n) => Math.round(Number(n) || 0)
  const fmtIDR = (n) => 'Rp ' + safe(n).toLocaleString('id-ID')

  const { sponsorDeals, otherIncomeRows } = rows
  const {
    sponsorTotal, nexeventSalesTotal, nexeventOrderCount, otherTotal, promotorTotal, crewTotal,
    promotorByCategoryMap: byCategoryMap, crewByDivisionMap: byDivisionMap,
    totalIncome, totalExpense, netPL, marginPct, isProfit,
  } = t

  const eventDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '-'
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const safeTitle = (event.title || 'Event').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')

  // ── STEP 3: Start PDF only AFTER all data is ready ──
  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  const GREEN = '#065f46'
  const DARK = '#0f172a'
  const GRAY = '#64748b'
  const RED = '#dc2626'

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="PL-Report-${safeTitle}.pdf"`)
  doc.pipe(res)

  try {
    // Header
    doc.fontSize(18).fillColor(GREEN).font('Helvetica-Bold').text('LAPORAN LABA/RUGI EVENT', { align: 'center' })
    doc.moveDown(0.2)
    doc.fontSize(11).fillColor(DARK).font('Helvetica').text(event.title || '-', { align: 'center' })
    doc.moveDown(0.5)
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(2).strokeColor(GREEN).stroke()
    doc.moveDown(0.8)

    // Event info
    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
    const infoLines = [
      ['Tanggal Event', eventDate],
      ['Lokasi', event.location || '-'],
      ['Promotor', user?.name || '-'],
      ['Dibuat', today],
    ]
    infoLines.forEach(([label, val]) => {
      doc.text(`${label}: `, { continued: true }).fillColor(DARK).text(val).fillColor(GRAY)
    })
    doc.moveDown(0.8)

    // Ringkasan
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINGKASAN EKSEKUTIF')
    doc.moveDown(0.3)
    const summaryRows = [
      ['Total Pemasukan', fmtIDR(totalIncome), false],
      ['Total Pengeluaran', fmtIDR(totalExpense), false],
      ['Laba/Rugi Bersih', fmtIDR(netPL), true],
      ['Margin', `${marginPct}%`, false],
    ]
    summaryRows.forEach(([label, val, bold]) => {
      doc.fontSize(9).fillColor(bold ? (isProfit ? GREEN : RED) : DARK)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, { continued: true })
        .text(val, { align: 'right' })
    })
    doc.moveDown(0.8)

    // Rincian Pemasukan
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINCIAN PEMASUKAN')
    doc.moveDown(0.3)

    // A. Penjualan tiket & merchandise nexEvent (Part 1 — sumber TERPISAH dari tiket platform lain)
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('A. Pendapatan Tiket & Merchandise (nexEvent)')
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('  * Penjualan via nexEvent (online + Ticket Box), sudah dikurangi fee platform')
    doc.fontSize(9).fillColor(nexeventSalesTotal === 0 ? GRAY : DARK)
      .text(`  • ${nexeventOrderCount} transaksi tiket/merch/bundling terbayar`, { continued: true })
      .text(fmtIDR(nexeventSalesTotal), { align: 'right' })
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('  Subtotal Tiket nexEvent', { continued: true }).text(fmtIDR(nexeventSalesTotal), { align: 'right' })
    doc.font('Helvetica').moveDown(0.5)

    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('B. Sponsor Deal')
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('  * Hanya deal dengan invoice DP Terbayar atau Lunas')
    doc.fillColor(DARK)
    if (sponsorDeals.length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada sponsor deal dengan pembayaran.')
    } else {
      sponsorDeals.forEach((d) => {
        doc.fontSize(9).fillColor(DARK).text(`  • ${d.sponsorName || '-'} (${d.tier || '-'})`, { continued: true })
          .text(fmtIDR(d.totalValue), { align: 'right' })
      })
    }
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('  Subtotal Sponsor', { continued: true }).text(fmtIDR(sponsorTotal), { align: 'right' })
    doc.font('Helvetica').moveDown(0.5)

    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('C. Pemasukan Lain')
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').text('  * Termasuk tiket platform lain (LOKET/Tix.id/dll) yang diinput manual — BUKAN penjualan nexEvent')
    doc.font('Helvetica').fillColor(DARK)
    if (otherIncomeRows.length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada pemasukan lain.')
    } else {
      otherIncomeRows.forEach((o) => {
        // Tandai kategori; untuk tiket platform lain sertakan nama platform agar tak rancu dgn tiket nexEvent.
        const catLabel = oiCategoryLabel(o.category)
        const tag = o.category === 'tiket_platform_lain'
          ? ` [Tiket Platform Lain${o.platform ? ` — ${o.platform}` : ''}]`
          : ` [${catLabel}]`
        doc.fontSize(9).fillColor(DARK).text(`  • ${o.description || '-'}${tag}`, { continued: true })
          .text(fmtIDR(o.amount), { align: 'right' })
      })
    }
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('  Subtotal Lainnya', { continued: true }).text(fmtIDR(otherTotal), { align: 'right' })
    doc.font('Helvetica').moveDown(0.3)

    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor(GREEN).stroke()
    doc.moveDown(0.2)
    doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold')
      .text('TOTAL PEMASUKAN', { continued: true }).text(fmtIDR(totalIncome), { align: 'right' })
    doc.moveDown(0.8)

    // Rincian Pengeluaran
    doc.fontSize(11).fillColor(RED).font('Helvetica-Bold').text('RINCIAN PENGELUARAN')
    doc.moveDown(0.3)

    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('A. Pengeluaran Langsung (Promotor)')
    doc.font('Helvetica').fillColor(DARK)
    if (Object.keys(byCategoryMap).length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada pengeluaran promotor.')
    } else {
      Object.entries(byCategoryMap).forEach(([cat, amt]) => {
        doc.fontSize(9).fillColor(DARK).text(`  • ${cat}`, { continued: true })
          .text(fmtIDR(amt), { align: 'right' })
      })
    }
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('  Subtotal Promotor', { continued: true }).text(fmtIDR(promotorTotal), { align: 'right' })
    doc.font('Helvetica').moveDown(0.5)

    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('B. Pengeluaran Lapangan (Crew)')
    doc.font('Helvetica').fillColor(DARK)
    if (Object.keys(byDivisionMap).length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada pengeluaran lapangan crew.')
    } else {
      Object.entries(byDivisionMap).forEach(([div, amt]) => {
        doc.fontSize(9).fillColor(DARK).text(`  • ${div}`, { continued: true })
          .text(fmtIDR(amt), { align: 'right' })
      })
    }
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
      .text('  Subtotal Crew', { continued: true }).text(fmtIDR(crewTotal), { align: 'right' })
    doc.font('Helvetica').moveDown(0.3)

    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor(RED).stroke()
    doc.moveDown(0.2)
    doc.fontSize(10).fillColor(RED).font('Helvetica-Bold')
      .text('TOTAL PENGELUARAN', { continued: true }).text(fmtIDR(totalExpense), { align: 'right' })
    doc.moveDown(0.8)

    // Laba/Rugi Bersih
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(2).strokeColor(isProfit ? GREEN : RED).stroke()
    doc.moveDown(0.3)
    doc.fontSize(13).fillColor(isProfit ? GREEN : RED).font('Helvetica-Bold')
      .text(`${isProfit ? 'LABA' : 'RUGI'} BERSIH`, { continued: true })
      .text(fmtIDR(netPL), { align: 'right' })
    doc.moveDown(0.2)
    doc.fontSize(9).fillColor(GRAY).font('Helvetica').text(`Margin: ${marginPct}%`, { align: 'right' })
    doc.moveDown(1)

    // Footer
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#e2e8f0').stroke()
    doc.moveDown(0.3)
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text('Dokumen ini dibuat otomatis oleh nexEvent — Music Event Operating System', { align: 'center' })
      .text('nexeventapp.tech', { align: 'center' })

    doc.end()
  } catch (err) {
    console.error('[pl-report] exportPDF generation error:', err)
    // Headers already sent (pipe started) — can't send JSON error.
    try { doc.end() } catch {}
  }
}

module.exports = { getPLReport, exportPLReportPDF }
