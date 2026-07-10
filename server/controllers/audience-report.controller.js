const prisma = require('../src/lib/prisma');
const PDFDocument = require('pdfkit');
const { parseNik, ageBucket, AGE_BUCKETS } = require('../services/nik-parser.service');

// Data Audiens / Pembeli Tiket (Payout & Laporan Keuangan Roadmap #5 — item TERAKHIR).
// Promotor unduh 1 PDF gabungan: (1) dashboard visual (sebaran umur + gender) + (2) tabel data mentah
// (nama, NIK, tgl beli, jenis tiket) sebagai bukti otentik yang bisa di-cross-check sponsor.
//
// Sumber demografi: NIK 16-digit yang WAJIB diisi saat beli tiket (anti-calo) — TIDAK ada perubahan
// form beli tiket. NIK ada 1 per ORDER (TicketOrder.buyerNik).
//
// SATU level penghitungan — PER-TIKET (revisi FINAL founder 2026-07-10):
//   - DASHBOARD (sebaran umur + gender + "Total tiket terjual") DAN TABEL DATA MENTAH sama-sama
//     dihitung PER-TIKET, dari SATU sumber yang sama: array hasil buildTicketRows(). 1 baris = 1 tiket.
//     Pembeli dengan 4 tiket → berkontribusi 4x ke bucket umur/gender-nya (bukan 1x) DAN muncul 4 baris
//     berulang di tabel (NIK/nama sama, jenis tiket per baris = jenis tiket individual).
//   - Alasan founder (kredibilitas): kalau dashboard & tabel mentah pakai unit hitung berbeda
//     (per-buyer vs per-tiket), sponsor yang cross-check manual akan lihat angka tidak konsisten & bisa
//     curiga dashboard "dikarang biar terlihat bagus". Dengan keduanya per-tiket dari SATU array yang
//     sama, konsistensi DIJAMIN secara struktural: total dashboard = jumlah semua bucket = jumlah baris
//     tabel = total tiket terjual. Bukan cuma kebetulan cocok — memang satu sumber data.
//
// Yang MASUK: order status "paid" dengan orderType di ['ticket','mixed','bundling'] (mengandung tiket →
// NIK valid dijamin). Order 'merch' (merch-only) DIKECUALIKAN — NIK-nya kosong (buyerNik = '').
// Entri dengan NIK unparseable (mis. merch-only bundle tanpa tiket, atau data korup) DI-SKIP dari
// demografi (dihitung sebagai `excluded`), TIDAK bikin report crash.
//
// Pola aman PDF (lihat known-bugs.md — PL Report corruption): SEMUA query Prisma selesai SEBELUM
// doc.pipe(res); teks pakai flow (moveDown + { continued } + { align:'right' }); shape (rect) & sel tabel
// pakai koordinat eksplisit single-call; post-pipe dibungkus try { doc.end() } catch {}.

const AUDIENCE_ORDER_TYPES = ['ticket', 'mixed', 'bundling'];

// Ambil ORDER (sumber NIK + info pembeli per order; NIK disimpan per ORDER, bukan per Ticket).
// Dipakai buildAudienceData untuk parse NIK sekali & bangun validOrderMap → info diteruskan ke tiap tiket.
async function fetchAudienceOrders(where) {
  return prisma.ticketOrder.findMany({
    where: { status: 'paid', orderType: { in: AUDIENCE_ORDER_TYPES }, ...where },
    select: {
      id: true, buyerName: true, buyerNik: true, paidAt: true, createdAt: true,
      event: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

// Ambil TIKET INDIVIDUAL (untuk tabel data mentah — 1 baris = 1 tiket, Roadmap #5 revisi founder).
// `orderWhere` = filter di TicketOrder (mis. { eventId } atau { eventId:{ in } }) — SAMA persis dengan
// fetchAudienceOrders agar himpunan order konsisten. Tiket bisa berasal dari 2 jalur:
//   1. tiket langsung → Ticket.orderItem.order (TicketOrderItem)
//   2. tiket di dalam paket bundling → Ticket.bundleOrderItem.order (BundleOrderItem)
// Ticket.ticketTypeId di-set di KEDUA jalur (lihat services/ticket.service.js generateTicketsForOrderItems
// + payment.controller webhook bundle) → nama jenis tiket selalu bisa diambil dari relasi ticketType.
async function fetchAudienceTickets(orderWhere) {
  const orderMatch = { status: 'paid', orderType: { in: AUDIENCE_ORDER_TYPES }, ...orderWhere };
  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { orderItem: { order: orderMatch } },
        { bundleOrderItem: { order: orderMatch } },
      ],
    },
    select: {
      ticketType: { select: { name: true } },
      orderItem: { select: { orderId: true } },
      bundleOrderItem: { select: { orderId: true } },
    },
  });
  return tickets.map((t) => ({
    orderId: t.orderItem?.orderId ?? t.bundleOrderItem?.orderId ?? null,
    ticketTypeName: t.ticketType?.name || '-',
  }));
}

// Parse ORDER → map order ber-NIK valid (orderId → info pembeli parsed) untuk ekspansi ke baris tiket.
// Order dengan NIK unparseable di-skip (dihitung `excluded`). Umur/gender di-parse SEKALI di sini via
// parseNik dan diteruskan ke setiap baris tiket lewat validOrderMap → dashboard & tabel pakai hasil
// parse yang IDENTIK (tak ada parse kedua yang bisa menyimpang). Pure (tak sentuh DB).
function buildAudienceData(orders, refDate = new Date()) {
  let excluded = 0;
  const validOrderMap = new Map();
  for (const o of orders) {
    const parsed = parseNik(o.buyerNik, refDate);
    if (!parsed.valid) { excluded++; continue; }
    validOrderMap.set(o.id, {
      name: o.buyerName || '-',
      nik: o.buyerNik,
      age: parsed.age,
      gender: parsed.gender,
      purchaseDate: o.paidAt || o.createdAt,
      eventTitle: o.event?.title || '-',
    });
  }
  return { excluded, validOrderMap };
}

// Stats DASHBOARD (sebaran umur + gender + total) dihitung PER-TIKET dari SATU array `rows` yang SAMA
// PERSIS dengan yang mengisi tabel data mentah (output buildTicketRows). Ini jaminan konsistensi
// STRUKTURAL (revisi FINAL founder 2026-07-10): sumbernya satu, jadi total = Σ bucket = jumlah baris
// tabel, mustahil menyimpang. Umur/gender tiap baris = hasil parseNik order-nya (diteruskan lewat
// validOrderMap) → pembeli dengan N tiket menyumbang N kali ke bucket & gender-nya. Pure.
function computeDashboardStats(rows) {
  const buckets = {}; AGE_BUCKETS.forEach((b) => (buckets[b] = 0));
  let male = 0, female = 0;
  for (const r of rows) {
    buckets[ageBucket(r.age)] += 1;
    if (r.gender === 'male') male += 1; else female += 1;
  }
  const total = rows.length; // = male + female = jumlah tiket = jumlah baris tabel data mentah
  return { total, male, female, buckets };
}

// Ekspansi ke SATU BARIS PER TIKET (revisi founder): pembeli dengan N tiket muncul N baris berulang
// (NIK/nama/tgl sama), tapi jenis tiket sesuai tiket individual. Tiket dari order ber-NIK invalid di-skip
// (konsisten dgn dashboard). Jumlah baris = total tiket terjual dari order ber-NIK valid.
function buildTicketRows(tickets, validOrderMap) {
  const rows = [];
  for (const t of tickets) {
    const info = validOrderMap.get(t.orderId);
    if (!info) continue; // order NIK invalid / di luar scope → tiketnya ikut dikecualikan
    rows.push({
      name: info.name,
      nik: info.nik,
      age: info.age,
      gender: info.gender,
      purchaseDate: info.purchaseDate,
      eventTitle: info.eventTitle,
      ticketType: t.ticketTypeName || '-',
    });
  }
  // Urutkan agar baris pembeli yang sama (satu order) berdampingan & kronologis.
  rows.sort((a, b) => {
    const da = new Date(a.purchaseDate).getTime() || 0;
    const db = new Date(b.purchaseDate).getTime() || 0;
    if (da !== db) return da - db;
    if (a.nik !== b.nik) return a.nik < b.nik ? -1 : 1;
    return (a.ticketType || '').localeCompare(b.ticketType || '');
  });
  return rows;
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

// ── Render PDF (pure terhadap DB — semua data sudah siap) ──
function renderAudiencePDF(res, { title, subtitle, contextLines, data, filename, showEventCol }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const GREEN = '#065f46';
  const BLUE = '#1d4ed8';
  const PINK = '#be185d';
  const DARK = '#0f172a';
  const GRAY = '#64748b';
  const TRACK = '#e2e8f0';
  const LEFT = 50, RIGHT = 545, WIDTH = RIGHT - LEFT;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  try {
    // Header
    doc.fontSize(18).fillColor(GREEN).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor(DARK).font('Helvetica').text(subtitle, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(2).strokeColor(GREEN).stroke();
    doc.moveDown(0.8);

    // Context info (flow, satu label per baris)
    doc.fontSize(9).font('Helvetica');
    contextLines.forEach(([label, val]) => {
      doc.fillColor(GRAY).text(`${label}: `, { continued: true }).fillColor(DARK).text(val);
    });
    doc.moveDown(0.6);

    // Ringkasan angka
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINGKASAN AUDIENS');
    doc.moveDown(0.3);
    // Satu-satunya angka total: per-tiket. DIJAMIN = jumlah baris tabel data mentah = Σ semua bucket.
    const summary = [
      ['Total tiket terjual', `${data.total} tiket`],
      ['Laki-laki', `${data.male} tiket (${pct(data.male, data.total)}%)`],
      ['Perempuan', `${data.female} tiket (${pct(data.female, data.total)}%)`],
    ];
    summary.forEach(([label, val]) => {
      doc.fontSize(9).fillColor(DARK).font('Helvetica').text(label, { continued: true }).text(val, { align: 'right' });
    });
    if (data.excluded > 0) {
      doc.fontSize(8).fillColor(GRAY).moveDown(0.2)
        .text(`* ${data.excluded} order dilewati karena NIK tidak bisa dibaca (mis. pembelian tanpa tiket / data tidak lengkap).`);
    }
    doc.moveDown(0.8);

    // ── DASHBOARD: sebaran umur (bar) ──
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('SEBARAN UMUR');
    doc.moveDown(0.4);
    const maxBucket = Math.max(1, ...AGE_BUCKETS.map((b) => data.buckets[b]));
    AGE_BUCKETS.forEach((b) => {
      const count = data.buckets[b];
      // Label + count (flow, satu baris)
      doc.fontSize(9).fillColor(DARK).font('Helvetica')
        .text(`Umur ${b}`, { continued: true })
        .text(`${count} tiket (${pct(count, data.total)}%)`, { align: 'right' });
      // Bar: track + fill (rect, koordinat dari doc.y)
      const barY = doc.y + 1;
      doc.rect(LEFT, barY, WIDTH, 7).fill(TRACK);
      if (count > 0) doc.rect(LEFT, barY, Math.max(4, Math.round((WIDTH * count) / maxBucket)), 7).fill(GREEN);
      doc.y = barY + 7;
      doc.moveDown(0.6);
    });
    doc.moveDown(0.3);

    // ── DASHBOARD: gender split (bar) ──
    doc.fillColor(DARK).fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('PERBANDINGAN GENDER');
    doc.moveDown(0.4);
    const genderRows = [['Laki-laki', data.male, BLUE], ['Perempuan', data.female, PINK]];
    const maxGender = Math.max(1, data.male, data.female);
    genderRows.forEach(([label, count, color]) => {
      doc.fontSize(9).fillColor(DARK).font('Helvetica')
        .text(label, { continued: true })
        .text(`${count} tiket (${pct(count, data.total)}%)`, { align: 'right' });
      const barY = doc.y + 1;
      doc.rect(LEFT, barY, WIDTH, 7).fill(TRACK);
      if (count > 0) doc.rect(LEFT, barY, Math.max(4, Math.round((WIDTH * count) / maxGender)), 7).fill(color);
      doc.y = barY + 7;
      doc.moveDown(0.6);
    });
    doc.moveDown(0.5);

    // ── TABEL DATA MENTAH ── (wajib untuk kredibilitas sponsor)
    doc.fillColor(DARK).fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('DATA MENTAH PEMBELI (BUKTI OTENTIK)');
    doc.fontSize(8).fillColor(GRAY).font('Helvetica').moveDown(0.2)
      .text('Data asli pembeli untuk verifikasi sponsor. Umur & gender diturunkan otomatis dari NIK. '
        + '1 BARIS = 1 TIKET — pembeli dengan beberapa tiket muncul di beberapa baris (NIK sama). '
        + `Total baris = total tiket terjual (${data.rows.length}).`);
    doc.moveDown(0.4);

    // Kolom (koordinat eksplisit, no-wrap + ellipsis). Layout beda utk all-events (ada kolom Event).
    const cols = showEventCol
      ? [
          { key: 'i', label: 'No', x: 50, w: 20, align: 'left' },
          { key: 'name', label: 'Nama', x: 70, w: 88, align: 'left' },
          { key: 'nik', label: 'NIK', x: 158, w: 96, align: 'left' },
          { key: 'age', label: 'Umur', x: 254, w: 28, align: 'right' },
          { key: 'gender', label: 'L/P', x: 284, w: 26, align: 'left' },
          { key: 'date', label: 'Tgl Beli', x: 312, w: 58, align: 'left' },
          { key: 'event', label: 'Event', x: 372, w: 88, align: 'left' },
          { key: 'ticket', label: 'Jenis Tiket', x: 462, w: 83, align: 'left' },
        ]
      : [
          { key: 'i', label: 'No', x: 50, w: 24, align: 'left' },
          { key: 'name', label: 'Nama', x: 74, w: 130, align: 'left' },
          { key: 'nik', label: 'NIK', x: 204, w: 118, align: 'left' },
          { key: 'age', label: 'Umur', x: 322, w: 32, align: 'right' },
          { key: 'gender', label: 'L/P', x: 356, w: 34, align: 'left' },
          { key: 'date', label: 'Tgl Beli', x: 392, w: 72, align: 'left' },
          { key: 'ticket', label: 'Jenis Tiket', x: 466, w: 79, align: 'left' },
        ];

    const drawHeader = () => {
      const y = doc.y;
      doc.fontSize(8).fillColor(GREEN).font('Helvetica-Bold');
      cols.forEach((c) => doc.text(c.label, c.x, y, { width: c.w, align: c.align, lineBreak: false, ellipsis: true }));
      doc.y = y + 12;
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.5).strokeColor(GREEN).stroke();
      doc.moveDown(0.2);
    };
    drawHeader();

    if (data.rows.length === 0) {
      doc.fontSize(9).fillColor(GRAY).font('Helvetica').text('Belum ada pembeli tiket dengan NIK valid.');
    } else {
      data.rows.forEach((r, idx) => {
        // Page break sebelum baris kalau mepet bawah (A4 tinggi 842, margin bawah 50 → batas ~780).
        if (doc.y > 780) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        const cell = {
          i: String(idx + 1),
          name: r.name,
          nik: r.nik,
          age: String(r.age),
          gender: r.gender === 'male' ? 'L' : 'P',
          date: fmtDate(r.purchaseDate),
          event: r.eventTitle,
          ticket: r.ticketType,
        };
        doc.fontSize(8).fillColor(DARK).font('Helvetica');
        cols.forEach((c) => doc.text(cell[c.key] ?? '-', c.x, y, { width: c.w, align: c.align, lineBreak: false, ellipsis: true }));
        doc.y = y + 12;
      });
    }

    doc.moveDown(1);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text(`Dibuat otomatis oleh nexEvent pada ${fmtDate(new Date())} — data audiens untuk keperluan pitching sponsor.`, { align: 'center' })
      .text('nexeventapp.tech', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[AUDIENCE PDF GENERATION ERROR]', err);
    try { doc.end(); } catch { /* stream sudah tertutup */ }
  }
}

// GET /api/tickets/audience-report/event/:eventId — promotor (own event only)
const getEventAudienceReport = async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  let event, user, orders, tickets;
  try {
    // Ownership: findFirst by id + promotor_id → tidak ketemu = bukan milik / tidak ada → 404.
    event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: userId },
      select: { id: true, title: true, event_date: true, location: true },
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan atau bukan milik Anda.' });

    user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    // Filter order SAMA untuk orders (dashboard) & tickets (tabel mentah) agar himpunan konsisten.
    orders = await fetchAudienceOrders({ eventId });
    tickets = await fetchAudienceTickets({ eventId });
  } catch (err) {
    console.error('[AUDIENCE EVENT DATA ERROR]', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data audiens.' });
  }

  const { excluded, validOrderMap } = buildAudienceData(orders);
  const rows = buildTicketRows(tickets, validOrderMap); // 1 baris = 1 tiket — SATU sumber
  const dash = computeDashboardStats(rows);             // dashboard dari array `rows` yang SAMA
  const data = { total: dash.total, male: dash.male, female: dash.female, excluded, buckets: dash.buckets, rows };
  const safeTitle = (event.title || 'Event').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').slice(0, 40);
  renderAudiencePDF(res, {
    title: 'DATA AUDIENS EVENT',
    subtitle: event.title || '-',
    contextLines: [
      ['Promotor', user?.name || '-'],
      ['Event', event.title || '-'],
      ['Lokasi', event.location || '-'],
      ['Tanggal Event', fmtDate(event.event_date)],
    ],
    data,
    filename: `Data-Audiens-${safeTitle}.pdf`,
    showEventCol: false,
  });
};

// GET /api/tickets/audience-report/all-events — promotor (semua event miliknya, TOTAL gabungan)
const getAllEventsAudienceReport = async (req, res) => {
  const userId = req.user.id;

  let user, events, orders, tickets;
  try {
    user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    events = await prisma.event.findMany({ where: { promotor_id: userId }, select: { id: true } });
    const eventIds = events.map((e) => e.id);
    // Batasi tegas ke event milik promotor (bukan cuma percaya relasi) — cross-promotor mustahil.
    if (eventIds.length > 0) {
      orders = await fetchAudienceOrders({ eventId: { in: eventIds } });
      tickets = await fetchAudienceTickets({ eventId: { in: eventIds } });
    } else {
      orders = []; tickets = [];
    }
  } catch (err) {
    console.error('[AUDIENCE ALL-EVENTS DATA ERROR]', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data audiens.' });
  }

  const { excluded, validOrderMap } = buildAudienceData(orders);
  const rows = buildTicketRows(tickets, validOrderMap); // 1 baris = 1 tiket (gabungan semua event) — SATU sumber
  const dash = computeDashboardStats(rows);             // dashboard gabungan = Σ kontribusi tiap tiket seluruh event
  const data = { total: dash.total, male: dash.male, female: dash.female, excluded, buckets: dash.buckets, rows };
  renderAudiencePDF(res, {
    title: 'DATA AUDIENS — SEMUA EVENT',
    subtitle: user?.name || 'Promotor',
    contextLines: [
      ['Promotor', user?.name || '-'],
      ['Jumlah Event', `${events.length} event`],
      ['Cakupan', 'Total gabungan seluruh event (bukan per-event)'],
    ],
    data,
    filename: 'Data-Audiens-Semua-Event.pdf',
    showEventCol: true,
  });
};

module.exports = {
  getEventAudienceReport, getAllEventsAudienceReport,
  buildAudienceData, buildTicketRows, computeDashboardStats, fetchAudienceOrders, fetchAudienceTickets,
};
