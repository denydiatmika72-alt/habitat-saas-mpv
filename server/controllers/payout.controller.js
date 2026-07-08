const prisma = require('../src/lib/prisma');

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
    if (amount > available)
      return res.status(400).json({ success: false, message: `Nominal melebihi saldo yang bisa dicairkan (maks Rp ${available.toLocaleString('id-ID')}).` });

    const request = await prisma.payoutRequest.create({
      data: { promotorId: req.user.id, amount, status: 'pending' },
    });

    return res.status(201).json({ success: true, request });
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

module.exports = {
  getAvailableBalance,
  requestPayout,
  getMyPayoutRequests,
  getPendingPayoutRequests,
  approvePayoutRequest,
  rejectPayoutRequest,
  markPayoutTransferred,
};
