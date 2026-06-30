const prisma = require('../src/lib/prisma')
const PDFDocument = require('pdfkit')

const formatIDR = (num) => 'Rp ' + Math.round(num).toLocaleString('id-ID')

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

    const [sponsorDeals, otherIncomeRows, promotorExpenseRows, crewTxRows] = await Promise.all([
      // 1. Sponsor income — status Disetujui
      prisma.sponsorDeal.findMany({
        where: { eventId, status: 'Disetujui' },
        select: { sponsorName: true, tier: true, totalValue: true },
      }),

      // 2. Other income
      prisma.otherIncome.findMany({
        where: { eventId, userId },
        orderBy: { date: 'desc' },
        select: { id: true, description: true, amount: true, date: true },
      }),

      // 3. Promotor expenses
      prisma.expense.findMany({
        where: { eventId, userId },
        select: { description: true, amount: true, category: true, date: true },
      }),

      // 4. Crew petty cash — ONLY type:"expense" (NEVER topup or return)
      prisma.pettyCashTransaction.findMany({
        where: {
          type: 'expense',
          account: { eventId },
        },
        include: { account: { select: { division: true } } },
      }),
    ])

    // Sponsor income
    const sponsorTotal = sponsorDeals.reduce((s, d) => s + Number(d.totalValue), 0)
    const sponsorItems = sponsorDeals.map((d) => ({
      sponsorName: d.sponsorName,
      tier: d.tier,
      totalValue: Number(d.totalValue),
    }))

    // Other income
    const otherTotal = otherIncomeRows.reduce((s, r) => s + r.amount, 0)

    // Promotor expenses — group by category
    const promotorTotal = promotorExpenseRows.reduce((s, e) => s + e.amount, 0)
    const byCategoryMap = {}
    for (const e of promotorExpenseRows) {
      byCategoryMap[e.category] = (byCategoryMap[e.category] || 0) + e.amount
    }
    const promotorByCategory = Object.entries(byCategoryMap).map(([category, total]) => ({ category, total }))

    // Crew expenses — group by division
    const crewTotal = crewTxRows.reduce((s, t) => s + t.amount, 0)
    const byDivisionMap = {}
    for (const t of crewTxRows) {
      const div = t.account.division
      byDivisionMap[div] = (byDivisionMap[div] || 0) + t.amount
    }
    const crewByDivision = Object.entries(byDivisionMap).map(([division, total]) => ({ division, total }))
    const crewItems = crewTxRows.map((t) => ({
      description: t.description,
      amount: t.amount,
      division: t.account.division,
      createdAt: t.createdAt,
    }))

    // Summary
    const totalIncome = sponsorTotal + otherTotal
    const totalExpense = promotorTotal + crewTotal
    const netPL = totalIncome - totalExpense
    const marginPct = totalIncome > 0 ? ((netPL / totalIncome) * 100).toFixed(1) : '0'

    return res.json({
      success: true,
      event: { id: event.id, title: event.title, eventDate: event.event_date, location: event.location },
      summary: { totalIncome, totalExpense, netPL, marginPct, isProfit: netPL >= 0 },
      income: {
        sponsor: { total: sponsorTotal, items: sponsorItems },
        other: { total: otherTotal, items: otherIncomeRows },
      },
      expense: {
        promotor: { total: promotorTotal, byCategory: promotorByCategory, items: promotorExpenseRows },
        crew: { total: crewTotal, byDivision: crewByDivision, items: crewItems },
      },
    })
  } catch (err) {
    console.error('[pl-report] getPLReport error:', err)
    res.status(500).json({ success: false, message: 'Gagal mengambil data P&L.' })
  }
}

const exportPLReportPDF = async (req, res) => {
  try {
    const { eventId } = req.query
    const userId = req.user.id

    if (!eventId) return res.status(400).json({ success: false, message: 'eventId diperlukan.' })

    // Fetch the full report data (reuse logic)
    const event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: userId },
      select: { id: true, title: true, event_date: true, location: true },
    })
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })

    const [sponsorDeals, otherIncomeRows, promotorExpenseRows, crewTxRows] = await Promise.all([
      prisma.sponsorDeal.findMany({
        where: { eventId, status: 'Disetujui' },
        select: { sponsorName: true, tier: true, totalValue: true },
      }),
      prisma.otherIncome.findMany({
        where: { eventId, userId },
        select: { description: true, amount: true, date: true },
      }),
      prisma.expense.findMany({
        where: { eventId, userId },
        select: { description: true, amount: true, category: true },
      }),
      prisma.pettyCashTransaction.findMany({
        where: { type: 'expense', account: { eventId } },
        include: { account: { select: { division: true } } },
      }),
    ])

    const sponsorTotal = sponsorDeals.reduce((s, d) => s + Number(d.totalValue), 0)
    const otherTotal = otherIncomeRows.reduce((s, r) => s + r.amount, 0)
    const promotorTotal = promotorExpenseRows.reduce((s, e) => s + e.amount, 0)
    const crewTotal = crewTxRows.reduce((s, t) => s + t.amount, 0)

    // Group promotor expenses by category
    const byCategoryMap = {}
    for (const e of promotorExpenseRows) {
      byCategoryMap[e.category] = (byCategoryMap[e.category] || 0) + e.amount
    }
    // Group crew expenses by division
    const byDivisionMap = {}
    for (const t of crewTxRows) {
      byDivisionMap[t.account.division] = (byDivisionMap[t.account.division] || 0) + t.amount
    }

    const totalIncome = sponsorTotal + otherTotal
    const totalExpense = promotorTotal + crewTotal
    const netPL = totalIncome - totalExpense
    const marginPct = totalIncome > 0 ? ((netPL / totalIncome) * 100).toFixed(1) : '0'
    const isProfit = netPL >= 0

    const eventDate = event.event_date
      ? new Date(event.event_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-'
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    const safeTitle = event.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')

    // ── PDF Generation ──
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
    const GREEN = '#065f46'
    const DARK = '#0f172a'
    const GRAY = '#64748b'
    const LIGHT_GRAY = '#f1f5f9'
    const RED = '#dc2626'

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="PL-Report-${safeTitle}.pdf"`)
    doc.pipe(res)

    const pageWidth = doc.page.width - 100 // margins

    // ── HEADER ──
    doc.fontSize(10).fillColor(GRAY).text('nexEvent — Music Event Operating System', 50, 50)
    doc.text(today, 50, 50, { align: 'right' })

    doc.moveDown(0.5)
    doc.fontSize(18).fillColor(GREEN).font('Helvetica-Bold').text('LAPORAN LABA/RUGI EVENT', 50, 80)
    doc.moveTo(50, 102).lineTo(545, 102).lineWidth(2).strokeColor(GREEN).stroke()

    // Event info
    doc.moveDown(0.8)
    const infoY = doc.y
    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
    doc.text('Nama Event', 50, infoY).text(':', 140, infoY).text(event.title, 155, infoY)
    doc.text('Tanggal Event', 50, infoY + 14).text(':', 140, infoY + 14).text(eventDate, 155, infoY + 14)
    doc.text('Lokasi', 50, infoY + 28).text(':', 140, infoY + 28).text(event.location || '-', 155, infoY + 28)
    doc.text('Promotor', 50, infoY + 42).text(':', 140, infoY + 42).text(user?.name || '-', 155, infoY + 42)
    doc.text('Dibuat', 50, infoY + 56).text(':', 140, infoY + 56).text(today, 155, infoY + 56)

    // ── RINGKASAN EKSEKUTIF ──
    doc.y = infoY + 80
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINGKASAN EKSEKUTIF', 50)
    doc.moveDown(0.4)

    const summaryY = doc.y
    const colW = pageWidth / 2 - 5
    const rows = [
      ['Total Pemasukan', formatIDR(totalIncome)],
      ['Total Pengeluaran', formatIDR(totalExpense)],
      ['Laba/Rugi Bersih', formatIDR(netPL)],
      ['Margin', `${marginPct}%`],
    ]
    rows.forEach(([label, val], i) => {
      const y = summaryY + i * 22
      const isBold = i === 2
      doc
        .rect(50, y, pageWidth, 21)
        .fill(i % 2 === 0 ? LIGHT_GRAY : '#ffffff')
      doc.fontSize(9).fillColor(isBold ? (isProfit ? GREEN : RED) : DARK)
        .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, 58, y + 6)
        .text(val, 50, y + 6, { width: pageWidth - 8, align: 'right' })
    })
    doc.y = summaryY + rows.length * 22 + 10

    // ── RINCIAN PEMASUKAN ──
    doc.moveDown(0.8)
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINCIAN PEMASUKAN')
    doc.moveDown(0.3)

    // A. Sponsor Deal
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('A. Sponsor Deal')
    doc.font('Helvetica').fillColor(DARK)
    if (sponsorDeals.length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada data sponsor deal Disetujui.', { indent: 10 })
    } else {
      sponsorDeals.forEach((d) => {
        const y = doc.y
        doc.fontSize(9).text(`  • ${d.sponsorName} (${d.tier})`, 50, y)
        doc.text(formatIDR(Number(d.totalValue)), 50, y, { width: pageWidth, align: 'right' })
        doc.moveDown(0.2)
      })
    }
    const sponsorTotalY = doc.y
    doc.text('  Subtotal Sponsor', 50, sponsorTotalY, { continued: true }).font('Helvetica-Bold')
      .text(formatIDR(sponsorTotal), { width: pageWidth - 10, align: 'right' })
    doc.font('Helvetica').moveDown(0.5)

    // B. Pemasukan Lain
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('B. Pemasukan Lain')
    doc.font('Helvetica').fillColor(DARK)
    if (otherIncomeRows.length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada pemasukan lain.', { indent: 10 })
    } else {
      otherIncomeRows.forEach((o) => {
        const y = doc.y
        doc.fontSize(9).fillColor(DARK).text(`  • ${o.description}`, 50, y)
        doc.text(formatIDR(o.amount), 50, y, { width: pageWidth, align: 'right' })
        doc.moveDown(0.2)
      })
    }
    const otherTotalY = doc.y
    doc.text('  Subtotal Lainnya', 50, otherTotalY, { continued: true }).font('Helvetica-Bold')
      .text(formatIDR(otherTotal), { width: pageWidth - 10, align: 'right' })
    doc.font('Helvetica-Bold').moveDown(0.3)

    // Total Pemasukan
    const incomeLineY = doc.y
    doc.moveTo(50, incomeLineY).lineTo(545, incomeLineY).lineWidth(0.5).strokeColor(GREEN).stroke()
    doc.moveDown(0.2)
    doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold')
      .text('TOTAL PEMASUKAN', 50, doc.y, { continued: true })
      .text(formatIDR(totalIncome), { width: pageWidth - 10, align: 'right' })
    doc.moveDown(0.8)

    // ── RINCIAN PENGELUARAN ──
    doc.fontSize(11).fillColor(RED).font('Helvetica-Bold').text('RINCIAN PENGELUARAN')
    doc.moveDown(0.3)

    // A. Pengeluaran Promotor (by category)
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('A. Pengeluaran Langsung (Promotor)')
    doc.font('Helvetica').fillColor(DARK)
    if (Object.keys(byCategoryMap).length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada pengeluaran promotor.', { indent: 10 })
    } else {
      Object.entries(byCategoryMap).forEach(([cat, amt]) => {
        const y = doc.y
        doc.fontSize(9).fillColor(DARK).text(`  • ${cat}`, 50, y)
        doc.text(formatIDR(amt), 50, y, { width: pageWidth, align: 'right' })
        doc.moveDown(0.2)
      })
    }
    const promotorTotalY = doc.y
    doc.text('  Subtotal Promotor', 50, promotorTotalY, { continued: true }).font('Helvetica-Bold')
      .text(formatIDR(promotorTotal), { width: pageWidth - 10, align: 'right' })
    doc.font('Helvetica').moveDown(0.5)

    // B. Crew expenses (by division)
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('B. Pengeluaran Lapangan (Crew)')
    doc.font('Helvetica').fillColor(DARK)
    if (Object.keys(byDivisionMap).length === 0) {
      doc.fontSize(9).fillColor(GRAY).text('  Tidak ada pengeluaran lapangan crew.', { indent: 10 })
    } else {
      Object.entries(byDivisionMap).forEach(([div, amt]) => {
        const y = doc.y
        doc.fontSize(9).fillColor(DARK).text(`  • ${div}`, 50, y)
        doc.text(formatIDR(amt), 50, y, { width: pageWidth, align: 'right' })
        doc.moveDown(0.2)
      })
    }
    const crewTotalY = doc.y
    doc.text('  Subtotal Crew', 50, crewTotalY, { continued: true }).font('Helvetica-Bold')
      .text(formatIDR(crewTotal), { width: pageWidth - 10, align: 'right' })
    doc.font('Helvetica-Bold').moveDown(0.3)

    // Total Pengeluaran
    const expLineY = doc.y
    doc.moveTo(50, expLineY).lineTo(545, expLineY).lineWidth(0.5).strokeColor(RED).stroke()
    doc.moveDown(0.2)
    doc.fontSize(10).fillColor(RED).font('Helvetica-Bold')
      .text('TOTAL PENGELUARAN', 50, doc.y, { continued: true })
      .text(formatIDR(totalExpense), { width: pageWidth - 10, align: 'right' })
    doc.moveDown(0.8)

    // ── LABA/RUGI BERSIH ──
    const netLineY = doc.y
    doc.moveTo(50, netLineY).lineTo(545, netLineY).lineWidth(2).strokeColor(isProfit ? GREEN : RED).stroke()
    doc.moveDown(0.3)
    doc.fontSize(13).fillColor(isProfit ? GREEN : RED).font('Helvetica-Bold')
      .text(`${isProfit ? 'LABA' : 'RUGI'} BERSIH`, 50, doc.y, { continued: true })
      .text(formatIDR(netPL), { width: pageWidth - 10, align: 'right' })
    doc.moveDown(0.3)
    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
      .text(`Margin: ${marginPct}%`, 50, doc.y, { align: 'right' })

    // ── FOOTER ──
    const footerY = doc.page.height - 80
    doc.moveTo(50, footerY).lineTo(545, footerY).lineWidth(0.5).strokeColor('#e2e8f0').stroke()
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text('Dokumen ini dibuat otomatis oleh nexEvent — Music Event Operating System', 50, footerY + 10, { align: 'center' })
      .text('nexeventapp.tech', 50, footerY + 22, { align: 'center' })

    doc.end()
  } catch (err) {
    console.error('[pl-report] exportPDF error:', err)
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Gagal generate PDF.' })
  }
}

module.exports = { getPLReport, exportPLReportPDF }
