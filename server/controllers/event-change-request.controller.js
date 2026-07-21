// ============================================================================
// Permintaan Perubahan Event — alur ajuan promotor → persetujuan admin (2026-07-21)
// ----------------------------------------------------------------------------
// 5 field terkunci (nama event, lokasi venue, kapasitas venue, target profit,
// target sponsor) + HAPUS EVENT tidak lagi dieksekusi langsung oleh promotor.
// Semuanya lewat tabel EventChangeRequest dan hanya berlaku setelah admin approve.
//
// Kenapa hapus event ikut dikunci: deleteEvent lama (verifyToken + cek pemilik saja)
// mencascade seluruh data turunan event — termasuk order Ticket Box cash yang jadi
// dasar hutang fee ke nexEvent. Promotor bisa menghapus event untuk menghilangkan
// hutangnya. Dengan admin sebagai gerbang + ringkasan hutang/payout/order yang
// ditampilkan di panel admin, jalur penghindaran itu tertutup tanpa perlu menaruh
// logika cek hutang di jalur promotor.
// ============================================================================

const prisma = require('../src/lib/prisma');
const { getEventFeeDebt } = require('../services/fee-debt.service');
const { sendEventChangeRequestNotification } = require('../services/email.service');
const {
  DELETE_TYPE,
  VALID_REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  readEventValue,
  validateNewValue,
  buildUpdateData,
} = require('../services/event-change-request.service');

// ── Promotor ────────────────────────────────────────────────────────────────

// POST /api/events/:id/change-requests — ajukan perubahan/hapus (promotor, pemilik event).
const createChangeRequest = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const { requestType, newValue } = req.body;

    if (!VALID_REQUEST_TYPES.includes(requestType)) {
      return res.status(400).json({
        success: false,
        message: `Jenis permintaan tidak valid. Pilihan: ${VALID_REQUEST_TYPES.join(', ')}.`,
      });
    }

    // Kepemilikan: hanya pemilik event yang boleh mengajukan (404 kalau bukan miliknya,
    // konsisten dengan getEventById/deleteEvent lama — tidak membocorkan keberadaan event).
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    // Satu permintaan pending per (event, jenis) — cegah antrean ganda yang saling bertabrakan
    // saat admin menyetujui (mis. dua usulan nama berbeda untuk event yang sama).
    const existing = await prisma.eventChangeRequest.findFirst({
      where: { eventId, requestType, status: 'pending' },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Sudah ada permintaan "${REQUEST_TYPE_LABELS[requestType]}" yang menunggu persetujuan admin untuk event ini.`,
      });
    }

    let oldValue = null;
    let storedNewValue = null;

    if (requestType !== DELETE_TYPE) {
      const check = validateNewValue(requestType, newValue);
      if (!check.ok) return res.status(400).json({ success: false, message: check.message });

      // oldValue SELALU dibaca server dari record event — nilai dari client tidak dipercaya.
      oldValue = readEventValue(event, requestType);
      storedNewValue = check.value;

      if (oldValue !== null && oldValue === storedNewValue) {
        return res.status(400).json({ success: false, message: 'Nilai baru sama dengan nilai saat ini.' });
      }
    }

    const request = await prisma.eventChangeRequest.create({
      data: {
        eventId,
        eventTitle: event.title, // snapshot: riwayat tetap terbaca setelah event terhapus
        promotorId: req.user.id,
        requestType,
        oldValue,
        newValue: storedNewValue,
      },
    });

    // Fire-and-forget (pola sendNewUserNotification): kegagalan email tidak membatalkan permintaan.
    sendEventChangeRequestNotification({ request, event, promotor: req.user }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Permintaan terkirim dan menunggu persetujuan admin.',
      data: request,
    });
  } catch (err) {
    console.error('[CREATE CHANGE REQUEST ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/events/:id/change-requests — riwayat permintaan milik promotor untuk event ini.
const getMyChangeRequests = async (req, res) => {
  try {
    const { id: eventId } = req.params;

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const requests = await prisma.eventChangeRequest.findMany({
      where: { eventId, promotorId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: requests });
  } catch (err) {
    console.error('[GET MY CHANGE REQUESTS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Admin ───────────────────────────────────────────────────────────────────

// Ringkasan risiko untuk permintaan "delete": hutang fee cash, pencairan pending, order berbayar.
// Reuse getEventFeeDebt (definisi hutang tunggal di fee-debt.service) — jangan re-implement filternya.
async function buildDeleteImpact(eventId, promotorId) {
  const [debt, pendingPayouts, paidOrders] = await Promise.all([
    getEventFeeDebt(eventId),
    prisma.payoutRequest.aggregate({
      where: { promotorId, status: { in: ['pending', 'approved'] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.ticketOrder.aggregate({
      where: { eventId, status: 'paid' },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    feeDebt: { totalDebt: debt.totalDebt, orderCount: debt.orderCount },
    // Payout TIDAK terikat satu event (saldo promotor lintas-event) — angka ini konteks
    // tingkat promotor, sengaja bukan per-event. Lihat catatan payout lintas-event di CLAUDE.md.
    pendingPayout: {
      count: pendingPayouts._count._all,
      totalAmount: pendingPayouts._sum.amount || 0,
    },
    paidOrders: {
      count: paidOrders._count._all,
      totalAmount: paidOrders._sum.totalAmount || 0,
    },
  };
}

// GET /api/admin/change-requests?status=pending — daftar permintaan (default pending dulu).
const getAllChangeRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const where = status && status !== 'all' ? { status } : {};

    const requests = await prisma.eventChangeRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // "approved" < "pending" < "rejected" alfabetis
      include: {
        promotor: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, event_date: true, storefrontStatus: true } },
      },
    });

    // Ringkasan dampak hanya untuk permintaan hapus yang masih pending & event-nya masih ada.
    const withImpact = await Promise.all(
      requests.map(async (r) => {
        if (r.requestType !== DELETE_TYPE || r.status !== 'pending' || !r.eventId) return r;
        const deleteImpact = await buildDeleteImpact(r.eventId, r.promotorId);
        return { ...r, deleteImpact };
      })
    );

    // Pending selalu di atas, apa pun filternya.
    const sorted = withImpact.sort((a, b) => {
      if (a.status === b.status) return new Date(b.createdAt) - new Date(a.createdAt);
      if (a.status === 'pending') return -1;
      if (b.status === 'pending') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return res.json({ success: true, data: sorted });
  } catch (err) {
    console.error('[GET ALL CHANGE REQUESTS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/admin/change-requests/:id/approve — setujui DAN terapkan perubahannya.
const approveChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.eventChangeRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ success: false, message: 'Permintaan tidak ditemukan.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Permintaan ini sudah "${request.status}".` });
    }
    if (!request.eventId) {
      return res.status(400).json({ success: false, message: 'Event untuk permintaan ini sudah tidak ada.' });
    }

    const event = await prisma.event.findUnique({ where: { id: request.eventId } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan (mungkin sudah dihapus).' });

    const reviewed = {
      status: 'approved',
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      adminNote: adminNote || null,
    };

    if (request.requestType === DELETE_TYPE) {
      // Tandai approved DULU, lalu hapus event. FK eventId onDelete: SetNull → baris audit
      // ini SELAMAT dari cascade dan tetap tercatat (eventTitle sudah di-snapshot).
      // Urutan ini penting: kalau dibalik, update setelah delete akan gagal cari record-nya.
      await prisma.eventChangeRequest.update({ where: { id }, data: reviewed });
      await prisma.event.delete({ where: { id: request.eventId } });

      const updated = await prisma.eventChangeRequest.findUnique({ where: { id } });
      return res.json({ success: true, message: `Event "${request.eventTitle}" dihapus permanen.`, data: updated });
    }

    const updateData = buildUpdateData(request.requestType, request.newValue);
    if (!updateData) {
      return res.status(400).json({ success: false, message: 'Jenis permintaan tidak dikenal.' });
    }

    const [updatedRequest] = await prisma.$transaction([
      prisma.eventChangeRequest.update({ where: { id }, data: reviewed }),
      prisma.event.update({ where: { id: request.eventId }, data: updateData }),
    ]);

    return res.json({
      success: true,
      message: `${REQUEST_TYPE_LABELS[request.requestType]} berhasil diperbarui.`,
      data: updatedRequest,
    });
  } catch (err) {
    console.error('[APPROVE CHANGE REQUEST ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/admin/change-requests/:id/reject — tolak, TIDAK menerapkan perubahan apa pun.
const rejectChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await prisma.eventChangeRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ success: false, message: 'Permintaan tidak ditemukan.' });
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Permintaan ini sudah "${request.status}".` });
    }

    const updated = await prisma.eventChangeRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        adminNote: adminNote || null,
      },
    });

    return res.json({ success: true, message: 'Permintaan ditolak.', data: updated });
  } catch (err) {
    console.error('[REJECT CHANGE REQUEST ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createChangeRequest,
  getMyChangeRequests,
  getAllChangeRequests,
  approveChangeRequest,
  rejectChangeRequest,
};
