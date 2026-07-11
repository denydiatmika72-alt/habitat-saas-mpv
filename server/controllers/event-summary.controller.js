const prisma = require('../src/lib/prisma')
const PDFDocument = require('pdfkit')
const { fetchEventPLRows, computeEventPLTotals, oiCategoryLabel } = require('../services/pl-report.service')
const { getEventFeeDebt } = require('../services/fee-debt.service')
const { computeBalance } = require('./payout.controller')
const {
  fetchAudienceOrders, fetchAudienceTickets, buildAudienceData, buildTicketRows, computeDashboardStats,
} = require('./audience-report.controller')
const { AGE_BUCKETS } = require('../services/nik-parser.service')
const { sendEventSummaryEmail } = require('../services/email.service')

// Event Summary Report — laporan akhir 1 event, digenerate saat promotor "Tandai Event Selesai".
// Menggabungkan 9 seksi dari banyak sumber yang SUDAH ADA (P&L, sponsor, expense, petty cash, tiket
// per-channel, audiens, hutang fee, payout). Prinsip: REUSE logic terverifikasi — tidak reimplementasi.
//
// Pola aman PDF (lihat known-bugs.md): SEMUA query Prisma selesai SEBELUM render PDF. Di sini PDF dibangun
// ke BUFFER penuh (bukan pipe langsung ke res) lalu dikirim via res.send / dilampirkan ke email — ini
// menghilangkan seluruh kelas korupsi "query interleave dengan stream". Layout flow (moveDown + continued
// + align:right), guard pagination (br() sebelum tiap seksi/baris), doc.end() dibungkus try/catch.

// ── AGREGASI (semua query di sini; pure calc setelahnya) ─────────────────────────────────────────
async function gatherEventSummaryData(event, userId) {
  const eventId = event.id

  const promotor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })

  // Section 1 + 3: financial (P&L) — reuse shared service (identik dgn Laporan Laba/Rugi).
  const plRows = await fetchEventPLRows({ eventId, userId })
  const pl = computeEventPLTotals(plRows)

  // Section 2 + 4: sponsor deals (+ invoice status utk bayar, + deliverables utk status).
  const sponsorDeals = await prisma.sponsorDeal.findMany({
    where: { eventId },
    select: {
      sponsorName: true, tier: true, totalValue: true, status: true,
      invoices: { select: { status: true } },
      deliverables: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Section 5: penjualan tiket per channel + per kategori (order/item "paid" event ini).
  const channelOrders = await prisma.ticketOrder.findMany({
    where: { status: 'paid', eventId },
    select: { channel: true, paymentMethod: true, totalAmount: true, feeAmount: true },
  })
  const ticketItems = await prisma.ticketOrderItem.findMany({
    where: { order: { status: 'paid', eventId } },
    select: { quantity: true, price: true, ticketType: { select: { name: true } } },
  })

  // Section 6: audiens — reuse pipeline audience-report.controller (event-scoped), 1 baris = 1 tiket.
  const audOrders = await fetchAudienceOrders({ eventId })
  const audTickets = await fetchAudienceTickets({ eventId })
  const { excluded, validOrderMap } = buildAudienceData(audOrders)
  const audRows = buildTicketRows(audTickets, validOrderMap)
  const audDash = computeDashboardStats(audRows)

  // Section 7: hutang fee event ini (cash Ticket Box belum settle) — reuse filter kanonik.
  const feeDebt = await getEventFeeDebt(eventId)

  // Section 8: petty cash per crew account (ringkasan total saja, bukan per-transaksi).
  const pcAccounts = await prisma.pettyCashAccount.findMany({
    where: { eventId },
    select: { division: true, user: { select: { name: true } }, transactions: { select: { type: true, amount: true } } },
  })

  // Section 9: payout — TIDAK bisa per-event (PayoutRequest per-promotor, lintas event). Tampilkan
  // net revenue EVENT ini + konteks saldo account-wide (jelas dilabeli), + total sudah ditransfer.
  const accountBalance = await computeBalance(userId)
  const transferredAgg = await prisma.payoutRequest.aggregate({
    where: { promotorId: userId, status: 'transferred' },
    _sum: { amount: true },
  })

  // ── PURE CALC (tak sentuh DB) ──
  const safe = (n) => Math.round(Number(n) || 0)

  // Sponsor status bayar + deliverables
  const invoiceStatus = (invoices) => {
    if (invoices.some((i) => i.status === 'Lunas')) return 'Lunas'
    if (invoices.some((i) => i.status === 'DP Terbayar')) return 'DP Terbayar'
    return 'Belum Dibayar'
  }
  const sponsors = sponsorDeals.map((d) => {
    const delivByStatus = {}
    for (const dl of d.deliverables) delivByStatus[dl.status] = (delivByStatus[dl.status] || 0) + 1
    return {
      sponsorName: d.sponsorName, tier: d.tier, totalValue: safe(d.totalValue),
      dealStatus: d.status, paymentStatus: invoiceStatus(d.invoices),
      deliverableTotal: d.deliverables.length, deliverableByStatus: delivByStatus,
    }
  })
  // Deliverables agregat event-wide (section 4)
  const deliverableAgg = {}
  for (const s of sponsors) for (const [st, n] of Object.entries(s.deliverableByStatus)) deliverableAgg[st] = (deliverableAgg[st] || 0) + n
  const deliverableTotal = Object.values(deliverableAgg).reduce((a, b) => a + b, 0)

  // Section 5: channel buckets
  const channels = {
    online: { label: 'Online', count: 0, gross: 0, fee: 0, net: 0 },
    cash: { label: 'Ticket Box (Cash)', count: 0, gross: 0, fee: 0, net: 0 },
    transfer: { label: 'Ticket Box (Transfer)', count: 0, gross: 0, fee: 0, net: 0 },
  }
  for (const o of channelOrders) {
    const key = o.channel === 'ticket_box' ? (o.paymentMethod === 'cash' ? 'cash' : 'transfer') : 'online'
    const g = safe(o.totalAmount), f = safe(o.feeAmount)
    channels[key].count += 1; channels[key].gross += g; channels[key].fee += f; channels[key].net += (g - f)
  }
  const channelTotal = ['online', 'cash', 'transfer'].reduce(
    (acc, k) => ({ count: acc.count + channels[k].count, gross: acc.gross + channels[k].gross, fee: acc.fee + channels[k].fee, net: acc.net + channels[k].net }),
    { count: 0, gross: 0, fee: 0, net: 0 },
  )
  // Per kategori (dari TicketOrderItem — tiket langsung; revenue bundling tercermin di channel gross)
  const catMap = {}
  for (const it of ticketItems) {
    const name = it.ticketType?.name || '(tanpa nama)'
    if (!catMap[name]) catMap[name] = { qty: 0, gross: 0 }
    catMap[name].qty += it.quantity
    catMap[name].gross += it.quantity * safe(it.price)
  }
  const categories = Object.entries(catMap).map(([name, v]) => ({ name, qty: v.qty, gross: v.gross })).sort((a, b) => b.gross - a.gross)

  // Section 8: petty cash per account
  const pettyCash = pcAccounts.map((a) => {
    let topup = 0, expense = 0, ret = 0
    for (const t of a.transactions) {
      const amt = safe(t.amount)
      if (t.type === 'topup') topup += amt
      else if (t.type === 'expense') expense += amt
      else if (t.type === 'return') ret += amt
    }
    return { division: a.division, crewName: a.user?.name || '-', topup, expense, ret, saldo: topup - expense - ret }
  })
  const pettyTotal = pettyCash.reduce(
    (acc, x) => ({ topup: acc.topup + x.topup, expense: acc.expense + x.expense, ret: acc.ret + x.ret, saldo: acc.saldo + x.saldo }),
    { topup: 0, expense: 0, ret: 0, saldo: 0 },
  )

  const eventNetRevenue = channelTotal.net // = pl.nexeventSalesTotal (paid orders event ini, net fee)
  const payout = {
    eventNetRevenue,
    accountGross: accountBalance.gross,
    accountReserved: accountBalance.reserved,
    accountAvailable: accountBalance.available,
    accountTransferred: safe(transferredAgg._sum.amount),
  }

  return {
    promotor, pl,
    sponsors, deliverableAgg, deliverableTotal,
    channels, channelTotal, categories,
    audience: { total: audDash.total, male: audDash.male, female: audDash.female, buckets: audDash.buckets, excluded },
    feeDebt, pettyCash, pettyTotal, payout,
  }
}

// ── RENDER PDF ke BUFFER (pure terhadap DB — data sudah siap) ─────────────────────────────────────
function buildEventSummaryPDFBuffer(event, data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      renderEventSummary(doc, event, data)
      doc.end()
    } catch (err) {
      console.error('[EVENT SUMMARY PDF GENERATION ERROR]', err)
      try { doc.end() } catch { /* stream sudah tertutup */ }
      reject(err)
    }
  })
}

function renderEventSummary(doc, event, data) {
  const GREEN = '#065f46', DARK = '#0f172a', GRAY = '#64748b', RED = '#dc2626', BLUE = '#1d4ed8', PINK = '#be185d', TRACK = '#e2e8f0'
  const LEFT = 50, RIGHT = 545, WIDTH = RIGHT - LEFT
  const { pl } = data

  const fmtIDR = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID')
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-')
  const pct = (n, t) => (t > 0 ? Math.round((n / t) * 100) : 0)

  // Guard pagination: pastikan ada ruang `min` px sebelum kursor; kalau tidak → halaman baru.
  const br = (min = 40) => { if (doc.y + min > 792) doc.addPage() }
  const sectionTitle = (t, color = GREEN) => {
    br(70); doc.moveDown(0.6)
    doc.fontSize(12).fillColor(color).font('Helvetica-Bold').text(t)
    doc.moveDown(0.3)
  }
  const row = (label, val, { bold = false, color, valColor } = {}) => {
    br()
    doc.fontSize(9).fillColor(color || (bold ? GREEN : DARK)).font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(label, { continued: true }).fillColor(valColor || color || (bold ? GREEN : DARK)).text(val, { align: 'right' })
  }
  const note = (t) => { br(); doc.fontSize(8).fillColor(GRAY).font('Helvetica').text(t) }
  const hr = (color = TRACK, w = 0.5) => { doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(w).strokeColor(color).stroke() }

  // ── Header ──
  doc.fontSize(18).fillColor(GREEN).font('Helvetica-Bold').text('LAPORAN AKHIR EVENT', { align: 'center' })
  doc.moveDown(0.2)
  doc.fontSize(12).fillColor(DARK).font('Helvetica').text(event.title || '-', { align: 'center' })
  doc.moveDown(0.5)
  doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(2).strokeColor(GREEN).stroke()
  doc.moveDown(0.6)
  doc.fontSize(9).font('Helvetica')
  ;[
    ['Promotor', data.promotor?.name || '-'],
    ['Lokasi', event.location || '-'],
    ['Tanggal Event', fmtDate(event.event_date)],
    ['Diselesaikan', fmtDate(event.finishedAt)],
    ['Laporan Dibuat', fmtDate(new Date())],
  ].forEach(([l, v]) => doc.fillColor(GRAY).text(`${l}: `, { continued: true }).fillColor(DARK).text(v))

  // ── 1. Ringkasan Keuangan ──
  sectionTitle('1. RINGKASAN KEUANGAN')
  row('Total Pemasukan', fmtIDR(pl.totalIncome))
  row('  • Tiket & Merch nexEvent (net fee)', fmtIDR(pl.nexeventSalesTotal), { color: GRAY })
  row('  • Sponsor (deal + invoice DP/Lunas)', fmtIDR(pl.sponsorTotal), { color: GRAY })
  row('  • Pemasukan Lain', fmtIDR(pl.otherTotal), { color: GRAY })
  row('Total Pengeluaran', fmtIDR(pl.totalExpense))
  doc.moveDown(0.15); hr(pl.isProfit ? GREEN : RED, 1); doc.moveDown(0.2)
  row(`${pl.isProfit ? 'LABA' : 'RUGI'} BERSIH  (margin ${pl.marginPct}%)`, fmtIDR(pl.netPL), { bold: true, color: pl.isProfit ? GREEN : RED })

  // ── 2. Sponsor + Status Bayar ──
  sectionTitle('2. SPONSOR & STATUS PEMBAYARAN')
  if (data.sponsors.length === 0) {
    note('Tidak ada sponsor deal di event ini.')
  } else {
    data.sponsors.forEach((s) => {
      const badge = s.paymentStatus === 'Lunas' ? GREEN : s.paymentStatus === 'DP Terbayar' ? BLUE : RED
      br()
      doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text(`${s.sponsorName || '-'} (${s.tier || '-'})`, { continued: true })
        .font('Helvetica').fillColor(DARK).text(fmtIDR(s.totalValue), { align: 'right' })
      doc.fontSize(8).fillColor(badge).font('Helvetica-Bold').text(`   ${s.paymentStatus}`, { continued: true })
        .fillColor(GRAY).font('Helvetica').text(`   • Deal: ${s.dealStatus} • Deliverable: ${s.deliverableTotal}`)
    })
  }

  // ── 3. Ringkasan Pengeluaran ──
  sectionTitle('3. RINGKASAN PENGELUARAN', RED)
  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('A. Pengeluaran Promotor'); doc.font('Helvetica')
  if (pl.promotorByCategory.length === 0) note('  Tidak ada pengeluaran promotor.')
  else pl.promotorByCategory.forEach((c) => row(`  • ${c.category}`, fmtIDR(c.total)))
  row('  Subtotal Promotor', fmtIDR(pl.promotorTotal), { bold: true })
  doc.moveDown(0.2)
  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('B. Pengeluaran Lapangan (Crew Petty Cash)'); doc.font('Helvetica')
  note('  Hanya transaksi type "expense" — topup & return TIDAK dihitung sebagai biaya.')
  if (pl.crewByDivision.length === 0) note('  Tidak ada pengeluaran crew.')
  else pl.crewByDivision.forEach((c) => row(`  • ${c.division}`, fmtIDR(c.total)))
  row('  Subtotal Crew', fmtIDR(pl.crewTotal), { bold: true })
  doc.moveDown(0.15); hr(RED); doc.moveDown(0.2)
  row('TOTAL PENGELUARAN', fmtIDR(pl.totalExpense), { bold: true, color: RED })

  // ── 4. Status Deliverables Sponsor ──
  sectionTitle('4. STATUS DELIVERABLES SPONSOR')
  if (data.deliverableTotal === 0) {
    note('Belum ada deliverable sponsor yang tercatat.')
  } else {
    row('Total Deliverable', `${data.deliverableTotal}`)
    Object.entries(data.deliverableAgg).forEach(([st, n]) => row(`  • ${st}`, `${n} (${pct(n, data.deliverableTotal)}%)`, { color: GRAY }))
  }

  // ── 5. Penjualan Tiket: per Kategori + per Channel ──
  sectionTitle('5. PENJUALAN TIKET')
  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('A. Per Kategori Tiket'); doc.font('Helvetica')
  note('  Tiket langsung (per jenis). Revenue paket bundling tercermin di total channel di bawah.')
  if (data.categories.length === 0) note('  Belum ada penjualan tiket langsung.')
  else data.categories.forEach((c) => row(`  • ${c.name} — ${c.qty} tiket`, fmtIDR(c.gross)))
  doc.moveDown(0.2)
  doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('B. Per Channel (kotor / fee / bersih)'); doc.font('Helvetica')
  ;['online', 'cash', 'transfer'].forEach((k) => {
    const c = data.channels[k]
    br()
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text(`  ${c.label} (${c.count} transaksi)`)
    doc.font('Helvetica').fontSize(9)
    row('    Kotor', fmtIDR(c.gross), { color: GRAY })
    row('    Fee platform', '- ' + fmtIDR(c.fee), { color: GRAY })
    row('    Bersih', fmtIDR(c.net), { bold: true })
  })
  doc.moveDown(0.15); hr(GREEN); doc.moveDown(0.2)
  row(`TOTAL BERSIH TIKET/MERCH (${data.channelTotal.count} transaksi)`, fmtIDR(data.channelTotal.net), { bold: true })

  // ── 6. Data Audiens ──
  sectionTitle('6. DATA AUDIENS (DEMOGRAFI PEMBELI)')
  const a = data.audience
  note('Diturunkan otomatis dari NIK (per-tiket). Data mentah lengkap ada di laporan "Data Audiens".')
  row('Total tiket terjual (NIK valid)', `${a.total} tiket`)
  row('Laki-laki', `${a.male} tiket (${pct(a.male, a.total)}%)`, { color: BLUE })
  row('Perempuan', `${a.female} tiket (${pct(a.female, a.total)}%)`, { color: PINK })
  if (a.excluded > 0) note(`* ${a.excluded} order dilewati (NIK tidak terbaca).`)
  if (a.total > 0) {
    doc.moveDown(0.2); br(90)
    doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text('Sebaran Umur'); doc.moveDown(0.3)
    const maxB = Math.max(1, ...AGE_BUCKETS.map((b) => a.buckets[b]))
    AGE_BUCKETS.forEach((b) => {
      const count = a.buckets[b]
      br(24)
      doc.fontSize(9).fillColor(DARK).font('Helvetica').text(`Umur ${b}`, { continued: true }).text(`${count} tiket (${pct(count, a.total)}%)`, { align: 'right' })
      const barY = doc.y + 1
      doc.rect(LEFT, barY, WIDTH, 7).fill(TRACK)
      if (count > 0) doc.rect(LEFT, barY, Math.max(4, Math.round((WIDTH * count) / maxB)), 7).fill(GREEN)
      doc.y = barY + 7; doc.moveDown(0.5)
    })
  }

  // ── 7. Status Hutang Fee ──
  sectionTitle('7. STATUS HUTANG FEE', data.feeDebt.totalDebt > 0 ? RED : GREEN)
  if (data.feeDebt.totalDebt > 0) {
    row('Hutang fee cash (Ticket Box) belum lunas', fmtIDR(data.feeDebt.totalDebt), { bold: true, color: RED })
    note(`Dari ${data.feeDebt.orderCount} transaksi cash. Akan dipotong otomatis dari saldo pada pencairan berikutnya.`)
  } else {
    doc.fontSize(9).fillColor(GREEN).font('Helvetica').text('Tidak ada hutang fee tersisa untuk event ini. Lunas.')
  }

  // ── 8. Ringkasan Petty Cash ──
  sectionTitle('8. RINGKASAN PETTY CASH (KAS LAPANGAN)')
  if (data.pettyCash.length === 0) {
    note('Tidak ada akun petty cash crew di event ini.')
  } else {
    data.pettyCash.forEach((p) => {
      br()
      doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text(`${p.division} — ${p.crewName}`)
      doc.font('Helvetica').fontSize(9)
      row('    Top-up', fmtIDR(p.topup), { color: GRAY })
      row('    Belanja (expense)', fmtIDR(p.expense), { color: GRAY })
      row('    Dikembalikan (return)', fmtIDR(p.ret), { color: GRAY })
      row('    Sisa saldo crew', fmtIDR(p.saldo), { bold: true })
    })
    doc.moveDown(0.15); hr(GREEN); doc.moveDown(0.2)
    row('TOTAL — Top-up', fmtIDR(data.pettyTotal.topup))
    row('TOTAL — Belanja', fmtIDR(data.pettyTotal.expense))
    row('TOTAL — Dikembalikan', fmtIDR(data.pettyTotal.ret))
    row('TOTAL — Sisa saldo', fmtIDR(data.pettyTotal.saldo), { bold: true })
  }

  // ── 9. Status Pencairan Dana (Payout) ──
  sectionTitle('9. STATUS PENCAIRAN DANA')
  const p = data.payout
  row('Pendapatan bersih EVENT ini (net fee)', fmtIDR(p.eventNetRevenue), { bold: true })
  note('Pencairan dana (payout) di nexEvent dicatat PER-AKUN promotor (lintas seluruh event), BUKAN per-event. '
    + 'Angka di bawah adalah konteks saldo akun Anda secara keseluruhan — tidak dapat diatribusikan ke satu event.')
  row('Saldo akun — Total bersih (semua event)', fmtIDR(p.accountGross), { color: GRAY })
  row('Saldo akun — Sudah diajukan/dicairkan', '- ' + fmtIDR(p.accountReserved), { color: GRAY })
  row('Saldo akun — Sisa bisa ditarik', fmtIDR(p.accountAvailable), { color: GRAY })
  row('Saldo akun — Total sudah ditransfer', fmtIDR(p.accountTransferred), { color: GRAY })

  // ── Footer ──
  doc.moveDown(1); br(40); hr('#e2e8f0'); doc.moveDown(0.3)
  doc.fontSize(8).fillColor(GRAY).font('Helvetica')
    .text(`Dibuat otomatis oleh nexEvent pada ${fmtDate(new Date())} — laporan akhir event.`, { align: 'center' })
    .text('nexeventapp.tech', { align: 'center' })
}

const sanitizeTitle = (t) => (t || 'Event').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 40)

// POST /api/events/:eventId/finish — promotor: tandai selesai + generate + kirim laporan (satu aksi).
const finishEvent = async (req, res) => {
  const { eventId } = req.params
  const userId = req.user.id
  try {
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: userId } })
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan atau bukan milik Anda.' })

    // Idempotent: set finishedAt sekali. Re-finish tetap regenerate + kirim ulang laporan (boleh).
    const finishedAt = event.finishedAt || new Date()
    if (!event.finishedAt) {
      await prisma.event.update({ where: { id: eventId }, data: { finishedAt } })
    }

    const data = await gatherEventSummaryData(event, userId)
    const pdfBuffer = await buildEventSummaryPDFBuffer({ ...event, finishedAt }, data)

    let emailSent = false
    if (data.promotor?.email) {
      const r = await sendEventSummaryEmail({
        to: data.promotor.email,
        promotorName: data.promotor.name,
        eventTitle: event.title,
        filename: `Laporan-Event-${sanitizeTitle(event.title)}.pdf`,
        pdfBuffer,
        pl: data.pl,
      })
      emailSent = r.sent
    }

    return res.json({
      success: true,
      finishedAt,
      emailSent,
      message: emailSent
        ? 'Event ditandai selesai. Laporan akhir telah dikirim ke email Anda.'
        : 'Event ditandai selesai. Laporan berhasil dibuat, tapi pengiriman email gagal — unduh manual dari tombol laporan.',
    })
  } catch (err) {
    console.error('[EVENT SUMMARY FINISH ERROR]', err)
    return res.status(500).json({ success: false, message: 'Gagal menyelesaikan event / membuat laporan.' })
  }
}

// GET /api/events/:eventId/summary-pdf — promotor: unduh ulang laporan akhir (buffer → res.send).
const getEventSummaryPDF = async (req, res) => {
  const { eventId } = req.params
  const userId = req.user.id

  let event, data, buffer
  try {
    event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: userId } })
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan atau bukan milik Anda.' })
    data = await gatherEventSummaryData(event, userId)
  } catch (err) {
    console.error('[EVENT SUMMARY PDF DATA ERROR]', err)
    return res.status(500).json({ success: false, message: 'Gagal mengambil data laporan.' })
  }

  // Buffer dibangun PENUH sebelum dikirim → kegagalan render masih bisa balas JSON (belum ada byte terkirim).
  try {
    buffer = await buildEventSummaryPDFBuffer(event, data)
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Gagal membuat PDF laporan.' })
  }

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-Event-${sanitizeTitle(event.title)}.pdf"`)
  return res.send(buffer)
}

module.exports = { finishEvent, getEventSummaryPDF, gatherEventSummaryData, buildEventSummaryPDFBuffer }
