const prisma = require('../src/lib/prisma');
const PDFDocument = require('pdfkit');
const { getPromotorFeeDebt } = require('../services/fee-debt.service');

// Pencairan Dana (Payout) — MVP MANUAL.
// App hanya TRACK request + status approval. Transfer bank sesungguhnya dilakukan admin/founder
// manual di luar app (via banking app sendiri), lalu ditandai "transferred". BUKAN disbursement otomatis.
//
// Aturan bisnis (dikonfirmasi founder):
// - Promotor bisa request KAPAN SAJA (tidak nunggu event selesai).
// - Saldo cair = SUM(order.totalAmount - order.feeAmount) untuk semua TicketOrder status "paid" milik
//   promotor (lintas tipe order & channel), DIKURANGI request yang masih menahan uang
//   (status pending/approved/transferred). Pajak (taxAmount) TIDAK dipotong — itu hak promotor;
//   nexEvent hanya menahan platform fee.
// - Semua request WAJIB approval admin. Kalau dispute, promotor hubungi CS/admin langsung.

// Status yang MENAHAN saldo (uang sudah diminta/dikirim → tidak boleh diminta lagi).
const RESERVING_STATUSES = ['pending', 'approved', 'transferred'];

// Hitung saldo cair promotor. Return { gross, reserved, available }.
async function computeBalance(promotorId) {
  const orders = await prisma.ticketOrder.findMany({
    where: { status: 'paid', event: { promotor_id: promotorId } },
    select: { totalAmount: true, feeAmount: true },
  });
  // Gross = total pemasukan tiket bersih fee (pajak tetap masuk hak promotor).
  const gross = orders.reduce((sum, o) => sum + (o.totalAmount - o.feeAmount), 0);

  const reservedAgg = await prisma.payoutRequest.aggregate({
    where: { promotorId, status: { in: RESERVING_STATUSES } },
    _sum: { amount: true },
  });
  const reserved = reservedAgg._sum.amount || 0;

  return { gross, reserved, available: gross - reserved };
}

// Cek kelengkapan rekening promotor (reuse PromoterSettings — sama dgn yang dipakai Invoice PDF).
async function getBankInfo(userId) {
  const s = await prisma.promoterSettings.findUnique({
    where: { userId },
    select: { bankName: true, bankAccount: true, accountHolder: true },
  });
  const filled = !!(s && s.bankName?.trim() && s.bankAccount?.trim() && s.accountHolder?.trim());
  return { filled, bankName: s?.bankName || null, bankAccount: s?.bankAccount || null, accountHolder: s?.accountHolder || null };
}

// GET /api/payout/balance — promotor
const getAvailableBalance = async (req, res) => {
  try {
    const { gross, reserved, available } = await computeBalance(req.user.id);
    const bank = await getBankInfo(req.user.id);
    return res.json({ success: true, gross, reserved, available, bank });
  } catch (err) {
    console.error('[PAYOUT BALANCE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/payout/request — promotor
const requestPayout = async (req, res) => {
  try {
    const amount = Math.floor(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount <= 0)
      return res.status(400).json({ success: false, message: 'Nominal pencairan tidak valid.' });

    // Rekening WAJIB terisi sebelum bisa request (reuse PromoterSettings).
    const bank = await getBankInfo(req.user.id);
    if (!bank.filled)
      return res.status(400).json({ success: false, message: 'Lengkapi data rekening bank dulu sebelum mengajukan pencairan.' });

    const { available } = await computeBalance(req.user.id);
    if (available <= 0)
      return res.status(400).json({ success: false, message: 'Saldo yang bisa dicairkan Rp 0.' });

    // ── Item #2 (KOREKSI interpretasi — founder-confirmed 2026-07-08): hutang fee = TAMBAHAN, BUKAN potongan ──
    // Model BENAR: promotor menerima PENUH `amount` yang diminta (tidak dikurangi apa pun). Hutang fee
    // cash (Ticket Box) ditarik TERPISAH dari saldo di transaksi yang sama. Syarat WAJIB:
    //   amount + totalDebt <= available
    // Kalau tidak muat → TOLAK SELURUHNYA (jangan auto-turunkan / auto-adjust). Kirim `maxAllowedAmount`
    // (= available - totalDebt) supaya promotor bisa ajukan ULANG dengan nominal lebih kecil SENDIRI.
    const { orderIds: debtOrderIds, totalDebt } = await getPromotorFeeDebt(req.user.id);

    if (amount + totalDebt > available) {
      const maxAllowedAmount = Math.max(0, available - totalDebt);
      const message = totalDebt > 0
        ? `Pencairan ditolak. Nominal (Rp ${amount.toLocaleString('id-ID')}) + hutang fee cash (Rp ${totalDebt.toLocaleString('id-ID')}) melebihi saldo Anda (Rp ${available.toLocaleString('id-ID')}). Maksimal yang bisa Anda ajukan sekarang: Rp ${maxAllowedAmount.toLocaleString('id-ID')}. Turunkan nominal lalu coba lagi.`
        : `Nominal melebihi saldo yang bisa dicairkan (maks Rp ${available.toLocaleString('id-ID')}).`;
      return res.status(400).json({
        success: false,
        message,
        debtBreakdown: { totalDebt, availableBalance: available, requestedAmount: amount, maxAllowedAmount },
      });
    }

    // Diterima (amount + totalDebt <= available). Buat request dengan `amount` PENUH (tidak dikurangi) +
    // settle hutang secara atomik — kalau salah satu gagal, dua-duanya rollback. `debtDeducted` = totalDebt
    // untuk audit: uang efektif ditarik dari saldo di transaksi yang sama, TAPI tidak dipotong dari yang
    // diterima promotor (promotor tetap terima `amount` penuh).
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.payoutRequest.create({
        data: { promotorId: req.user.id, amount, debtDeducted: totalDebt, status: 'pending' },
      });
      if (debtOrderIds.length > 0) {
        await tx.ticketOrder.updateMany({
          where: { id: { in: debtOrderIds } },
          data: { feeSettled: true },
        });
      }
      return created;
    });

    return res.status(201).json({
      success: true,
      request,
      debtDeducted: totalDebt,
      netTransfer: amount, // promotor menerima PENUH nominal yang diminta (hutang ditarik terpisah dari saldo)
    });
  } catch (err) {
    console.error('[PAYOUT REQUEST ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/payout/my-requests — promotor
const getMyPayoutRequests = async (req, res) => {
  try {
    const requests = await prisma.payoutRequest.findMany({
      where: { promotorId: req.user.id },
      orderBy: { requestedAt: 'desc' },
    });
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('[PAYOUT MY REQUESTS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Admin ──────────────────────────────────────────────────────────────────────

// Gabung data request + info promotor + rekening (dari PromoterSettings).
async function decorateWithPromotor(requests) {
  if (requests.length === 0) return [];
  const promotorIds = [...new Set(requests.map((r) => r.promotorId))];
  const [users, settings] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: promotorIds } }, select: { id: true, name: true, email: true } }),
    prisma.promoterSettings.findMany({ where: { userId: { in: promotorIds } }, select: { userId: true, bankName: true, bankAccount: true, accountHolder: true } }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const setMap = new Map(settings.map((s) => [s.userId, s]));
  return requests.map((r) => {
    const u = userMap.get(r.promotorId);
    const s = setMap.get(r.promotorId);
    return {
      id: r.id,
      amount: r.amount,
      // Model BENAR (founder-confirmed 2026-07-09): admin mentransfer PENUH `amount` yang diminta promotor.
      // `debtDeducted` = hutang fee cash yang ikut dilunasi dari SALDO promotor pada transaksi yang sama
      // (audit/bookkeeping) — BUKAN dipotong dari nominal yang ditransfer. Karena itu tidak ada `netAmount`
      // (amount - debt) lagi: admin selalu transfer `amount` bulat.
      debtDeducted: r.debtDeducted,
      status: r.status,
      requestedAt: r.requestedAt,
      processedAt: r.processedAt,
      adminNote: r.adminNote,
      promotorName: u?.name || '(tanpa nama)',
      promotorEmail: u?.email || '',
      bankName: s?.bankName || null,
      bankAccount: s?.bankAccount || null,
      accountHolder: s?.accountHolder || null,
    };
  });
}

// GET /api/admin/payout/pending — admin
// Kembalikan request yang butuh aksi admin: `pending` (perlu approve/reject) + `approved`
// (perlu ditandai sudah ditransfer setelah admin transfer manual).
const getPendingPayoutRequests = async (req, res) => {
  try {
    const [pendingRaw, approvedRaw] = await Promise.all([
      prisma.payoutRequest.findMany({ where: { status: 'pending' }, orderBy: { requestedAt: 'asc' } }),
      prisma.payoutRequest.findMany({ where: { status: 'approved' }, orderBy: { requestedAt: 'asc' } }),
    ]);
    const [pending, approved] = await Promise.all([
      decorateWithPromotor(pendingRaw),
      decorateWithPromotor(approvedRaw),
    ]);
    return res.json({ success: true, pending, approved });
  } catch (err) {
    console.error('[PAYOUT PENDING ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/payout/:id/approve — admin (hanya dari status "pending")
const approvePayoutRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    if (existing.status !== 'pending')
      return res.status(400).json({ success: false, message: `Hanya pengajuan berstatus "pending" yang bisa disetujui (status sekarang: ${existing.status}).` });

    const updated = await prisma.payoutRequest.update({
      where: { id },
      data: { status: 'approved', processedAt: new Date(), processedByAdminId: req.user.id, adminNote: req.body?.adminNote ?? existing.adminNote },
    });
    return res.json({ success: true, request: updated });
  } catch (err) {
    console.error('[PAYOUT APPROVE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/payout/:id/reject — admin (hanya dari status "pending")
const rejectPayoutRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    if (existing.status !== 'pending')
      return res.status(400).json({ success: false, message: `Hanya pengajuan berstatus "pending" yang bisa ditolak (status sekarang: ${existing.status}).` });

    const updated = await prisma.payoutRequest.update({
      where: { id },
      data: { status: 'rejected', processedAt: new Date(), processedByAdminId: req.user.id, adminNote: req.body?.adminNote ?? null },
    });
    return res.json({ success: true, request: updated });
  } catch (err) {
    console.error('[PAYOUT REJECT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// PATCH /api/admin/payout/:id/transferred — admin (HANYA dari status "approved")
// Admin sudah transfer manual via banking app-nya → tandai selesai.
const markPayoutTransferred = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    if (existing.status !== 'approved')
      return res.status(400).json({ success: false, message: `Hanya pengajuan berstatus "approved" yang bisa ditandai sudah ditransfer (status sekarang: ${existing.status}).` });

    const updated = await prisma.payoutRequest.update({
      where: { id },
      data: { status: 'transferred', processedAt: new Date(), processedByAdminId: req.user.id },
    });
    return res.json({ success: true, request: updated });
  } catch (err) {
    console.error('[PAYOUT TRANSFERRED ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/payout/:id/statement-pdf — promotor (item #3)
// Laporan pencairan (PDF) untuk 1 PayoutRequest yang sudah "transferred". Ownership dicek —
// hanya promotor pemilik yang bisa unduh. Isi: rincian penjualan (tiket + merch + bundling),
// detail pencairan (nominal, potongan hutang, net transfer), sisa saldo, sisa hutang fee.
// Pola aman PDF (lihat known-bugs.md): SEMUA query selesai SEBELUM doc.pipe(res); layout pakai
// moveDown + { continued } + { align:'right' } (bukan x,y eksplisit); post-pipe dibungkus
// try/catch { doc.end() } agar stream selalu tertutup.
const getPayoutStatementPDF = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // ── STEP 1: Fetch + validasi SEBELUM menyentuh PDF stream ──
  let payout, user, bank, orders, balance, debt;
  try {
    payout = await prisma.payoutRequest.findUnique({ where: { id } });
    if (!payout)
      return res.status(404).json({ success: false, message: 'Pengajuan pencairan tidak ditemukan.' });
    if (payout.promotorId !== userId)
      return res.status(403).json({ success: false, message: 'Anda tidak berhak mengunduh laporan pencairan ini.' });
    if (payout.status !== 'transferred')
      return res.status(400).json({ success: false, message: 'Laporan hanya tersedia untuk pencairan yang sudah berstatus "Sudah Ditransfer".' });

    user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    bank = await getBankInfo(userId);
    orders = await prisma.ticketOrder.findMany({
      where: { status: 'paid', event: { promotor_id: userId } },
      select: { orderType: true, totalAmount: true, feeAmount: true },
    });
    balance = await computeBalance(userId);
    debt = await getPromotorFeeDebt(userId);
  } catch (err) {
    console.error('[PAYOUT STATEMENT DATA ERROR]', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data laporan pencairan.' });
  }

  // ── STEP 2: Agregasi semua nilai SEBELUM piping ──
  const safe = (n) => Math.round(Number(n) || 0);
  const fmtIDR = (n) => 'Rp ' + safe(n).toLocaleString('id-ID');
  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

  const TYPES = [
    ['ticket', 'Penjualan Tiket'],
    ['merch', 'Penjualan Merchandise'],
    ['bundling', 'Penjualan Bundling'],
  ];
  const group = { ticket: { gross: 0, fee: 0, count: 0 }, merch: { gross: 0, fee: 0, count: 0 }, bundling: { gross: 0, fee: 0, count: 0 } };
  for (const o of orders) {
    const key = group[o.orderType] ? o.orderType : 'ticket';
    group[key].gross += safe(o.totalAmount);
    group[key].fee += safe(o.feeAmount);
    group[key].count += 1;
  }
  const totalGross = TYPES.reduce((s, [k]) => s + group[k].gross, 0);
  const totalFee = TYPES.reduce((s, [k]) => s + group[k].fee, 0);
  const totalNet = totalGross - totalFee; // = balance.gross

  const amount = safe(payout.amount);
  const debtDeducted = safe(payout.debtDeducted);
  // Model benar (founder-confirmed): promotor menerima PENUH `amount`; hutang ditarik terpisah dari saldo.
  const remainingDebt = safe(debt.totalDebt);

  // ── STEP 3: Mulai PDF hanya SETELAH semua data siap ──
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const GREEN = '#065f46';
  const DARK = '#0f172a';
  const GRAY = '#64748b';
  const RED = '#dc2626';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-Pencairan-${id}.pdf"`);
  doc.pipe(res);

  try {
    // Header
    doc.fontSize(18).fillColor(GREEN).font('Helvetica-Bold').text('LAPORAN PENCAIRAN DANA', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor(DARK).font('Helvetica').text('nexEvent — Music Event Operating System', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(2).strokeColor(GREEN).stroke();
    doc.moveDown(0.8);

    // Info promotor + pencairan
    doc.fontSize(9).fillColor(GRAY).font('Helvetica');
    const infoLines = [
      ['Promotor', user?.name || '-'],
      ['Email', user?.email || '-'],
      ['ID Pencairan', id],
      ['Tanggal Pengajuan', fmtDate(payout.requestedAt)],
      ['Tanggal Ditransfer', fmtDate(payout.processedAt)],
      ['Status', 'Sudah Ditransfer'],
    ];
    infoLines.forEach(([label, val]) => {
      doc.fillColor(GRAY).text(`${label}: `, { continued: true }).fillColor(DARK).text(val);
    });
    doc.moveDown(0.8);

    // Detail Pencairan
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('DETAIL PENCAIRAN');
    doc.moveDown(0.3);
    const payRows = [
      ['Nominal Dicairkan (Diterima Penuh)', fmtIDR(amount), true],
    ];
    if (debtDeducted > 0) {
      payRows.push(['Hutang Fee Cash Dilunasi (dari saldo)', fmtIDR(debtDeducted), false]);
    }
    payRows.forEach(([label, val, bold]) => {
      doc.fontSize(9).fillColor(bold ? GREEN : DARK).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, { continued: true }).text(val, { align: 'right' });
    });
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).moveDown(0.3)
      .text(`Rekening tujuan: ${bank.bankName || '-'} • ${bank.bankAccount || '-'} • a/n ${bank.accountHolder || '-'}`);
    if (debtDeducted > 0) {
      doc.fontSize(8).fillColor(GRAY)
        .text('* Anda menerima PENUH nominal di atas. Hutang fee cash (Ticket Box) sebesar itu dilunasi terpisah dari saldo Anda pada transaksi yang sama — tidak mengurangi jumlah yang ditransfer.');
    }
    doc.moveDown(0.8);

    // Rincian Penjualan (sumber saldo)
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINCIAN PENJUALAN (SUMBER SALDO)');
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text('Total penjualan berbayar sepanjang akun ini — dasar perhitungan saldo yang bisa dicairkan.');
    doc.moveDown(0.3);
    TYPES.forEach(([key, label]) => {
      const g = group[key];
      const net = g.gross - g.fee;
      doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold').text(`${label} (${g.count} transaksi)`);
      doc.font('Helvetica').fillColor(GRAY).fontSize(9)
        .text('  Kotor', { continued: true }).fillColor(DARK).text(fmtIDR(g.gross), { align: 'right' });
      doc.fillColor(GRAY).text('  Fee platform', { continued: true }).fillColor(DARK).text('- ' + fmtIDR(g.fee), { align: 'right' });
      doc.fillColor(GRAY).font('Helvetica-Bold').text('  Bersih', { continued: true }).fillColor(DARK).text(fmtIDR(net), { align: 'right' });
      doc.font('Helvetica').moveDown(0.4);
    });
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor(GREEN).stroke();
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor(GREEN).font('Helvetica-Bold')
      .text('TOTAL PENJUALAN BERSIH', { continued: true }).text(fmtIDR(totalNet), { align: 'right' });
    doc.moveDown(0.8);

    // Ringkasan Saldo
    doc.fontSize(11).fillColor(GREEN).font('Helvetica-Bold').text('RINGKASAN SALDO');
    doc.moveDown(0.3);
    const balRows = [
      ['Total Pemasukan Bersih', fmtIDR(balance.gross), false],
      ['Sudah Diajukan / Dicairkan', '- ' + fmtIDR(balance.reserved), false],
      ['Sisa Saldo Bisa Ditarik', fmtIDR(balance.available), true],
    ];
    balRows.forEach(([label, val, bold]) => {
      doc.fontSize(9).fillColor(bold ? GREEN : DARK).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, { continued: true }).text(val, { align: 'right' });
    });
    doc.font('Helvetica').moveDown(0.8);

    // Sisa Hutang Fee
    doc.fontSize(11).fillColor(remainingDebt > 0 ? RED : GREEN).font('Helvetica-Bold').text('SISA HUTANG FEE');
    doc.moveDown(0.3);
    if (remainingDebt > 0) {
      doc.fontSize(9).fillColor(RED).font('Helvetica-Bold')
        .text('Hutang fee cash belum lunas', { continued: true }).text(fmtIDR(remainingDebt), { align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(GRAY).moveDown(0.2)
        .text('Berasal dari transaksi Ticket Box cash setelah pencairan ini. Akan dipotong otomatis pada pencairan berikutnya.');
    } else {
      doc.fontSize(9).fillColor(GREEN).font('Helvetica').text('Tidak ada hutang fee yang tersisa. Lunas.');
    }
    doc.moveDown(1);

    // Footer
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text(`Dokumen ini dibuat otomatis oleh nexEvent pada ${fmtDate(new Date())} — bukti resmi pencairan dana.`, { align: 'center' })
      .text('nexeventapp.tech', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[PAYOUT STATEMENT GENERATION ERROR]', err);
    // Header sudah terkirim (pipe dimulai) — tidak bisa kirim JSON. Tutup stream agar tidak truncated.
    try { doc.end(); } catch {}
  }
};

module.exports = {
  getAvailableBalance,
  requestPayout,
  getMyPayoutRequests,
  getPendingPayoutRequests,
  approvePayoutRequest,
  rejectPayoutRequest,
  markPayoutTransferred,
  getPayoutStatementPDF,
};
