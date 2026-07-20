const prisma = require('../src/lib/prisma');
const bcrypt = require('bcryptjs');
const { sendSponsorCredential } = require('../services/email.service');

// ═══════════════════════════════════════════════════════════════════════════════
// KEAMANAN — ISOLASI DATA PER-PROMOTOR (fix cross-account leak, 2026-07-17)
// SponsorDeal/SponsorBenefit/SponsorPackage/SponsorThreshold WAJIB punya promotorId.
// Aturan yang DITEGAKKAN di seluruh file ini:
//   1. Semua GET milik promotor difilter `where: { promotorId: req.user.id }`.
//   2. Semua CREATE mengeset promotorId dari sesi (req.user.id) — TIDAK dari client.
//      (Kecuali createDeal via portal publik → promotorId diturunkan dari InviteCode.createdBy.)
//   3. Semua UPDATE/DELETE mengecek kepemilikan dulu: not found → 404, bukan pemilik → 403.
//   4. Endpoint sponsor-facing publik (portal & sponsor-dashboard) memakai jalur khusus yang
//      di-scope oleh resource yang sah dipegang pemanggil (kode undangan / dealId), BUKAN token promotor.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Code helpers ─────────────────────────────────────────────────────────────
function makeCodeString() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SPN-${seg()}-${seg()}`;
}

// Verifikasi eventId ada & milik promotor login (dipakai semua CREATE katalog per-event —
// benefit/package/threshold). Mengembalikan { ok, status, message }. Pola sama seperti generateCode/invoice fix:
// jangan pernah percaya eventId dari client tanpa memverifikasi event-nya milik req.user.id.
async function verifyEventOwnership(eventId, userId) {
  if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
    return { ok: false, status: 400, message: 'Event wajib dipilih.' };
  }
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { promotor_id: true } });
  if (!event) return { ok: false, status: 404, message: 'Event tidak ditemukan.' };
  if (event.promotor_id !== userId) {
    return { ok: false, status: 403, message: 'Akses ditolak — event bukan milik Anda.' };
  }
  return { ok: true };
}

// ─── Invite Codes ─────────────────────────────────────────────────────────────

const generateCode = async (req, res) => {
  try {
    const { eventId } = req.body;
    // eventId WAJIB (2026-07-18) — kode undangan sponsor selalu terikat 1 event. Cegah kode mengambang.
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({ success: false, message: 'Event wajib dipilih untuk membuat kode undangan sponsor.' });
    }
    // Event harus ada DAN milik promotor yang login (cegah bikin kode untuk event promotor lain).
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { promotor_id: true } });
    if (!event) {
      return res.status(400).json({ success: false, message: 'Event tidak ditemukan.' });
    }
    if (event.promotor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak — event bukan milik Anda.' });
    }
    let code = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = makeCodeString();
      const exists = await prisma.inviteCode.findUnique({ where: { code: candidate } });
      if (!exists) { code = candidate; break; }
    }
    if (!code) {
      return res.status(500).json({ success: false, message: 'Gagal generate kode unik, coba lagi.' });
    }
    const inviteCode = await prisma.inviteCode.create({
      data: { code, createdBy: req.user.id, isActive: true, eventId },
    });
    return res.status(201).json({
      success: true,
      data: { code: inviteCode.code, id: inviteCode.id, createdAt: inviteCode.createdAt, eventId: inviteCode.eventId },
    });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const validateInviteCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Kode wajib diisi.' });

    const inviteCode = await prisma.inviteCode.findFirst({
      where: { code: code.toUpperCase(), isActive: true },
    });
    if (!inviteCode) {
      return res.status(400).json({ success: false, message: 'Kode tidak valid atau sudah digunakan.' });
    }
    await prisma.inviteCode.update({
      where: { id: inviteCode.id },
      data: { isActive: false, usedAt: new Date() },
    });
    // promotorId diikutkan supaya portal bisa memuat katalog milik promotor pengundang.
    return res.status(200).json({
      success: true,
      data: { code: inviteCode.code, eventId: inviteCode.eventId ?? null, promotorId: inviteCode.createdBy },
    });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Public catalog (sponsor portal — di-scope oleh KODE, bukan token promotor) ──
// Portal publik memuat paket + benefit milik promotor PENGUNDANG. Kode undangan sudah
// dikonsumsi (isActive:false) saat gate, jadi lookup di sini SENGAJA mengabaikan isActive —
// yang penting menurunkan promotorId dari createdBy. Kalau kode tak dikenal → array kosong.
const getPortalCatalog = async (req, res) => {
  try {
    const code = String(req.query.code || '').toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: 'code wajib diisi.' });
    // eventId diturunkan SERVER-SIDE dari kode undangan (fix cross-event bleed 2026-07-19) —
    // sponsor hanya melihat katalog event yang mengundangnya, bukan seluruh katalog promotor.
    const inviteCode = await prisma.inviteCode.findUnique({ where: { code }, select: { createdBy: true, eventId: true } });
    if (!inviteCode) return res.status(200).json({ success: true, data: { packages: [], benefits: [] } });
    const promotorId = inviteCode.createdBy;
    const eventId = inviteCode.eventId;
    const [packages, benefits] = await Promise.all([
      prisma.sponsorPackage.findMany({
        where: { promotorId, eventId },
        orderBy: { createdAt: 'desc' },
        include: { benefits: { include: { benefit: true } } },
      }),
      prisma.sponsorBenefit.findMany({ where: { promotorId, eventId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return res.status(200).json({ success: true, data: { packages, benefits } });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Public tier price (sponsor-dashboard — di-scope oleh dealId) ────────────────
// Sponsor yang login (ClientAccount) butuh harga tier paketnya. Di-scope ke promotor DEAL-nya
// sendiri (deal.promotorId), sehingga tidak membocorkan threshold promotor lain.
const getPublicTierPrice = async (req, res) => {
  try {
    const dealId = String(req.query.dealId || '');
    if (!dealId) return res.status(400).json({ success: false, message: 'dealId wajib diisi.' });
    const deal = await prisma.sponsorDeal.findUnique({
      where: { id: dealId },
      select: { promotorId: true, tier: true, eventId: true },
    });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
    // Threshold di-scope ke event deal-nya (fix cross-event bleed 2026-07-19).
    const threshold = await prisma.sponsorThreshold.findFirst({
      where: { promotorId: deal.promotorId, eventId: deal.eventId, tierName: deal.tier },
      select: { minPrice: true },
    });
    return res.status(200).json({ success: true, tierPrice: threshold ? Number(threshold.minPrice) : 0 });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Benefits (promotor-facing — verifyToken + filter promotorId) ───────────────

const getBenefits = async (req, res) => {
  try {
    // eventId WAJIB (fix cross-event bleed 2026-07-19) — katalog benefit di-scope per-event.
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    }
    const benefits = await prisma.sponsorBenefit.findMany({
      where: { promotorId: req.user.id, eventId: String(eventId) },
      orderBy: { createdAt: 'asc' },
    });
    return res.status(200).json({ success: true, data: benefits });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createBenefit = async (req, res) => {
  try {
    const { name, category, description, price, maxQty, eventId } = req.body;
    if (!name || !category || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, category, dan price wajib diisi.' });
    }
    // eventId dari body + verifikasi event milik promotor (jangan percaya owner dari client).
    const own = await verifyEventOwnership(eventId, req.user.id);
    if (!own.ok) return res.status(own.status).json({ success: false, message: own.message });
    const benefit = await prisma.sponsorBenefit.create({
      data: {
        promotorId: req.user.id,
        eventId,
        name,
        category,
        description: description ?? '',
        price: Number(price),
        maxQty: Number(maxQty ?? 1),
      },
    });
    return res.status(201).json({ success: true, data: benefit });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteBenefit = async (req, res) => {
  try {
    const { id } = req.params;
    const benefit = await prisma.sponsorBenefit.findUnique({ where: { id }, select: { promotorId: true } });
    if (!benefit) return res.status(404).json({ success: false, message: 'Benefit tidak ditemukan.' });
    if (benefit.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    await prisma.sponsorBenefit.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Deals ────────────────────────────────────────────────────────────────────

// GET /api/sponsor/deals?eventId=  — eventId WAJIB sejak 2026-07-21.
// Dulu mengembalikan SELURUH deal promotor lintas event. Itu kelas bug yang sama dengan
// daftar invoice lintas-event (lihat known-bugs [2026-07-20]): data kerjasama dihitung
// per-event, bukan per-akun. Pola scoping identik dgn getInvoices / katalog sponsor:
// 400 kalau kosong, 404 event tak ada, 403 kalau bukan milik pemanggil.
// Catatan: `promotorId` TETAP ikut di-filter (bukan hanya eventId) — defense in depth.
const getDeals = async (req, res) => {
  try {
    const { eventId } = req.query;
    const own = await verifyEventOwnership(eventId, req.user.id);
    if (!own.ok) return res.status(own.status).json({ success: false, message: own.message });

    const deals = await prisma.sponsorDeal.findMany({
      where: { promotorId: req.user.id, eventId: String(eventId) },
      orderBy: { createdAt: 'desc' },
      include: {
        account: { select: { id: true } },
        dealBenefits: {
          include: { benefit: { select: { name: true, category: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const normalized = deals.map((deal) => {
      if (Number(deal.totalValue) > 0) return deal;
      const computed = deal.dealBenefits.reduce((sum, db) => sum + Number(db.totalPrice), 0);
      return { ...deal, totalValue: computed };
    });
    return res.status(200).json({ success: true, data: normalized });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// createDeal = PUBLIK (portal sponsor). Kepemilikan (promotorId) & eventId diturunkan SERVER-SIDE
// dari InviteCode (codeUsed) → TIDAK percaya promotorId/eventId dari client. Deal tanpa kode valid
// ditolak supaya tidak pernah ada deal tanpa pemilik.
const createDeal = async (req, res) => {
  try {
    const { sponsorName, contactName, email, tier, codeUsed, packageId, selectedBenefits, totalValue } = req.body;
    if (!sponsorName || !email || !tier || !codeUsed) {
      return res.status(400).json({ success: false, message: 'sponsorName, email, tier, dan codeUsed wajib diisi.' });
    }

    // Turunkan pemilik dari kode undangan (createdBy). Lookup mengabaikan isActive (kode sudah dikonsumsi di gate).
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code: String(codeUsed).toUpperCase() },
      select: { createdBy: true, eventId: true },
    });
    if (!inviteCode) {
      return res.status(400).json({ success: false, message: 'Kode undangan tidak dikenal — pendaftaran ditolak.' });
    }
    const promotorId = inviteCode.createdBy;
    // eventId SELALU dari InviteCode (kini wajib non-null di schema) — tidak pernah dari client, tidak pernah null.
    const eventId = inviteCode.eventId;
    if (!eventId) {
      // Defensif: kode lama tanpa event tidak boleh dipakai (seharusnya mustahil pasca-migrasi NOT NULL).
      return res.status(400).json({ success: false, message: 'Kode undangan tidak terikat event — pendaftaran ditolak.' });
    }

    // Semua benefit/paket yang dipilih WAJIB milik promotor yang sama DAN event deal ini
    // (cegah rujukan lintas-akun & lintas-event — fix cross-event bleed 2026-07-19).
    let benefitRecords = [];
    if (Array.isArray(selectedBenefits) && selectedBenefits.length > 0) {
      const benefitIds = selectedBenefits.map((b) => b.benefitId);
      benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds }, promotorId, eventId } });
      const foundIds = new Set(benefitRecords.map((b) => b.id));
      const foreign = benefitIds.filter((bid) => !foundIds.has(bid));
      if (foreign.length > 0) {
        return res.status(400).json({ success: false, message: 'Benefit yang dipilih tidak valid untuk event ini.' });
      }
      // Validasi stok
      for (const { benefitId, qty } of selectedBenefits) {
        const benefit = benefitRecords.find((b) => b.id === benefitId);
        const available = benefit.maxQty - benefit.usedQty - benefit.heldQty;
        if (Number(qty) > available) {
          return res.status(400).json({ success: false, message: `Stok "${benefit.name}" tidak mencukupi. Tersedia: ${available} unit.` });
        }
      }
    }

    // Hitung totalValue di server (tidak percaya client)
    let computedTotalValue = 0;
    if (packageId) {
      const pkg = await prisma.sponsorPackage.findFirst({ where: { id: packageId, promotorId, eventId }, select: { price: true } });
      if (!pkg) return res.status(400).json({ success: false, message: 'Paket tidak valid untuk event ini.' });
      computedTotalValue = Number(pkg.price);
    } else if (benefitRecords.length > 0) {
      const priceMap = new Map(benefitRecords.map((b) => [b.id, Number(b.price)]));
      computedTotalValue = selectedBenefits.reduce((sum, { benefitId, qty }) => sum + (priceMap.get(benefitId) ?? 0) * Number(qty), 0);
    }

    const deal = await prisma.sponsorDeal.create({
      data: {
        promotorId,
        sponsorName,
        contactName: contactName ?? '',
        email,
        tier,
        codeUsed,
        status: 'Negosiasi',
        packageId: packageId ?? null,
        eventId,
        totalValue: computedTotalValue,
        ...(Array.isArray(selectedBenefits) && selectedBenefits.length > 0 && {
          dealBenefits: {
            create: selectedBenefits.map(({ benefitId, qty, unitPrice }) => ({
              benefitId,
              qty: Number(qty),
              unitPrice: Number(unitPrice ?? 0),
              totalPrice: Number(qty) * Number(unitPrice ?? 0),
            })),
          },
        }),
      },
    });

    // Tahan stok (heldQty += qty)
    if (Array.isArray(selectedBenefits) && selectedBenefits.length > 0) {
      for (const { benefitId, qty } of selectedBenefits) {
        await prisma.sponsorBenefit.update({ where: { id: benefitId }, data: { heldQty: { increment: Number(qty) } } });
      }
    }

    return res.status(201).json({ success: true, data: deal });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateDealStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Negosiasi', 'Disetujui', 'Ditolak'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }

    const dealBefore = await prisma.sponsorDeal.findUnique({
      where: { id },
      select: {
        promotorId: true,
        tier: true,
        dealBenefits: {
          select: { benefitId: true, qty: true, benefit: { select: { name: true, category: true, description: true } } },
        },
      },
    });
    if (!dealBefore) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
    if (dealBefore.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    const deal = await prisma.sponsorDeal.update({ where: { id }, data: { status } });
    const dealBenefits = dealBefore.dealBenefits ?? [];

    if (status === 'Disetujui') {
      const existing = await prisma.sponsorDeliverable.count({ where: { dealId: id } });
      if (existing === 0 && dealBenefits.length > 0) {
        await prisma.sponsorDeliverable.createMany({
          data: dealBenefits.map(({ benefit, qty }) => ({
            dealId: id,
            title: `${qty}× ${benefit.name}`,
            category: benefit.category,
            status: 'Planning',
            notes: benefit.description || null,
          })),
        });
      }
      for (const { benefitId, qty } of dealBenefits) {
        await prisma.sponsorBenefit.update({ where: { id: benefitId }, data: { usedQty: { increment: qty }, heldQty: { decrement: qty } } });
      }
    } else if (status === 'Ditolak') {
      for (const { benefitId, qty } of dealBenefits) {
        await prisma.sponsorBenefit.update({ where: { id: benefitId }, data: { heldQty: { decrement: qty } } });
      }
    }

    return res.status(200).json({ success: true, data: deal });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Packages (promotor-facing — verifyToken + filter promotorId) ───────────────

const getPackages = async (req, res) => {
  try {
    // eventId WAJIB (fix cross-event bleed 2026-07-19) — daftar paket di-scope per-event.
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    }
    const packages = await prisma.sponsorPackage.findMany({
      where: { promotorId: req.user.id, eventId: String(eventId) },
      orderBy: { createdAt: 'desc' },
      include: { benefits: { include: { benefit: true } } },
    });
    return res.status(200).json({ success: true, data: packages });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createPackage = async (req, res) => {
  try {
    const { name, price, slots, description, benefits, eventId } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name wajib diisi.' });

    // eventId dari body + verifikasi event milik promotor.
    const own = await verifyEventOwnership(eventId, req.user.id);
    if (!own.ok) return res.status(own.status).json({ success: false, message: own.message });

    // Validasi qty benefit ≤ maxQty — benefit HARUS milik promotor ini DAN event yang sama.
    if (Array.isArray(benefits) && benefits.length > 0) {
      const benefitIds = benefits.map((b) => b.benefitId);
      const benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds }, promotorId: req.user.id, eventId } });
      const foundIds = new Set(benefitRecords.map((b) => b.id));
      if (benefitIds.some((bid) => !foundIds.has(bid))) {
        return res.status(400).json({ success: false, message: 'Benefit yang dipilih tidak valid untuk event ini.' });
      }
      for (const { benefitId, qty } of benefits) {
        const benefit = benefitRecords.find((b) => b.id === benefitId);
        if (benefit && Number(qty) > benefit.maxQty) {
          return res.status(400).json({ success: false, message: `Qty benefit "${benefit.name}" melebihi stok maksimal. Maksimal: ${benefit.maxQty} pcs.` });
        }
      }
    }

    // Harga paket dari threshold tier milik promotor ini di event ini (bukan global/lintas-event).
    const threshold = await prisma.sponsorThreshold.findFirst({ where: { tierName: name, promotorId: req.user.id, eventId } });
    const packagePrice = threshold ? Number(threshold.minPrice) : Number(price ?? 0);

    const pkg = await prisma.sponsorPackage.create({
      data: {
        promotorId: req.user.id,
        eventId,
        name,
        price: packagePrice,
        slots: Number(slots ?? 1),
        description: description ?? '',
        ...(Array.isArray(benefits) && benefits.length > 0 && {
          benefits: { create: benefits.map(({ benefitId, qty }) => ({ benefitId, qty: Number(qty || 1) })) },
        }),
      },
      include: { benefits: { include: { benefit: true } } },
    });
    return res.status(201).json({ success: true, data: pkg });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await prisma.sponsorPackage.findUnique({ where: { id }, select: { promotorId: true } });
    if (!pkg) return res.status(404).json({ success: false, message: 'Paket tidak ditemukan.' });
    if (pkg.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    await prisma.sponsorPackage.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Thresholds (promotor-facing — verifyToken + filter promotorId) ─────────────

const getThresholds = async (req, res) => {
  try {
    // eventId WAJIB (fix cross-event bleed 2026-07-19) — harga tier di-scope per-event.
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    }
    const thresholds = await prisma.sponsorThreshold.findMany({
      where: { promotorId: req.user.id, eventId: String(eventId) },
      orderBy: { minPrice: 'asc' },
    });
    return res.status(200).json({ success: true, data: thresholds });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const saveThresholds = async (req, res) => {
  try {
    const { thresholds, eventId } = req.body;
    if (!Array.isArray(thresholds)) {
      return res.status(400).json({ success: false, message: 'thresholds harus berupa array.' });
    }
    const promotorId = req.user.id;
    // eventId dari body + verifikasi event milik promotor.
    const own = await verifyEventOwnership(eventId, promotorId);
    if (!own.ok) return res.status(own.status).json({ success: false, message: own.message });
    const results = await Promise.all(
      thresholds.map(({ tierName, minPrice }) =>
        prisma.sponsorThreshold.upsert({
          where: { promotorId_eventId_tierName: { promotorId, eventId, tierName } },
          update: { minPrice: Number(minPrice) },
          create: { promotorId, eventId, tierName, minPrice: Number(minPrice) },
        }),
      ),
    );
    return res.status(200).json({ success: true, data: results });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/sponsor/thresholds/:id — rename dan/atau reprice tier by id (BUKAN by name).
// Keputusan founder 2026-07-20: rename/reprice tier CASCADE LIVE ke SponsorPackage & SponsorDeal
// yang merujuk tier ini — tidak ada versioning/penguncian harga historis. Untuk mempertahankan
// harga lama bagi sponsor tertentu, buat tier BARU (bukan edit tier lama). Cascade dilakukan di
// level aplikasi (name-based) dalam SATU transaksi — bukan FK live — karena tabel paket sudah
// berisi data produksi sehingga konversi FK NOT NULL butuh backfill yang tidak boleh ditebak
// (data-safety check 2026-07-20: sponsor_packages=1, sponsor_deals=0 baris).
const updateThreshold = async (req, res) => {
  try {
    const { id } = req.params;
    const { tierName, minPrice } = req.body;

    const existing = await prisma.sponsorThreshold.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Tier tidak ditemukan.' });
    if (existing.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    const newName = tierName === undefined ? existing.tierName : String(tierName).trim();
    if (!newName) return res.status(400).json({ success: false, message: 'Nama tier tidak boleh kosong.' });
    const newPrice = minPrice === undefined ? Number(existing.minPrice) : Number(minPrice);
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return res.status(400).json({ success: false, message: 'Harga minimum tidak valid.' });
    }

    const { eventId, promotorId } = existing;
    const oldName = existing.tierName;

    // Uniqueness dalam (promotorId, eventId) — kecuali row ini sendiri. Cegah dua tier senama di 1 event.
    if (newName !== oldName) {
      const clash = await prisma.sponsorThreshold.findFirst({
        where: { promotorId, eventId, tierName: newName, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        return res.status(409).json({ success: false, message: `Tier "${newName}" sudah ada di event ini. Pakai nama lain.` });
      }
    }

    // Ambil id paket tier ini SEBELUM rename (by oldName) — id tidak berubah oleh rename, dipakai untuk
    // cascade harga ke deal berbasis-paket (totalValue-nya diturunkan dari harga paket saat deal dibuat).
    const pkgs = await prisma.sponsorPackage.findMany({
      where: { promotorId, eventId, name: oldName },
      select: { id: true },
    });
    const pkgIds = pkgs.map((p) => p.id);

    const ops = [
      // 1. Threshold-nya sendiri.
      prisma.sponsorThreshold.update({ where: { id }, data: { tierName: newName, minPrice: newPrice } }),
      // 2. SponsorPackage (paket = cermin tier) → nama & harga baru.
      prisma.sponsorPackage.updateMany({ where: { promotorId, eventId, name: oldName }, data: { name: newName, price: newPrice } }),
      // 3. Label tier di SEMUA deal tier ini → nama baru.
      prisma.sponsorDeal.updateMany({ where: { promotorId, eventId, tier: oldName }, data: { tier: newName } }),
    ];
    // 4. Harga deal BERBASIS-PAKET dari tier ini → harga baru. Deal berbasis-benefit TIDAK disentuh
    //    nilainya (nilainya dari benefit, bukan tier). Filter by packageId → tak terpengaruh langkah 3.
    if (pkgIds.length > 0) {
      ops.push(prisma.sponsorDeal.updateMany({ where: { promotorId, eventId, packageId: { in: pkgIds } }, data: { totalValue: newPrice } }));
    }

    const results = await prisma.$transaction(ops);
    return res.status(200).json({ success: true, data: results[0] });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/sponsor/thresholds/:id — hapus tier by id. DIBLOKIR (409) kalau masih dipakai paket
// sponsor (name-based) supaya tidak ada paket dengan tier menggantung — hapus paketnya dulu.
const deleteThreshold = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.sponsorThreshold.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Tier tidak ditemukan.' });
    if (existing.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    const usedByPackage = await prisma.sponsorPackage.count({
      where: { promotorId: existing.promotorId, eventId: existing.eventId, name: existing.tierName },
    });
    if (usedByPackage > 0) {
      return res.status(409).json({ success: false, message: 'Tier ini masih dipakai di paket sponsor, hapus paket tersebut dulu atau pilih tier lain.' });
    }
    await prisma.sponsorThreshold.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Client Accounts ──────────────────────────────────────────────────────────

const createAccount = async (req, res) => {
  try {
    const { dealId, sponsorName, username, password, tier } = req.body;
    if (!dealId || !username || !password) {
      return res.status(400).json({ success: false, message: 'dealId, username, dan password wajib diisi.' });
    }
    // Deal harus milik promotor yang login.
    const deal = await prisma.sponsorDeal.findUnique({ where: { id: dealId }, select: { promotorId: true } });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
    if (deal.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    const existingDeal = await prisma.clientAccount.findFirst({ where: { dealId } });
    if (existingDeal) {
      return res.status(409).json({ success: false, message: 'Akun untuk deal ini sudah ada.' });
    }
    let finalUsername = username;
    const existingUser = await prisma.clientAccount.findUnique({ where: { username } });
    if (existingUser) {
      finalUsername = `${username}${dealId.slice(0, 4).toLowerCase()}`;
    }
    const hashed = await bcrypt.hash(password, 10);
    const account = await prisma.clientAccount.create({
      data: { dealId, sponsorName: sponsorName ?? '', username: finalUsername, password: hashed, tier: tier ?? '' },
    });
    return res.status(201).json({ success: true, data: { id: account.id, username: account.username, password } });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const verifyAccount = async (req, res) => {
  try {
    const identifier = req.body.identifier || req.body.username;
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier dan password wajib diisi.' });
    }
    let account;
    if (identifier.includes('@')) {
      const deal = await prisma.sponsorDeal.findFirst({ where: { email: identifier }, select: { id: true } });
      if (deal) account = await prisma.clientAccount.findUnique({ where: { dealId: deal.id } });
    } else {
      account = await prisma.clientAccount.findUnique({ where: { username: identifier } });
    }
    if (!account) return res.status(401).json({ success: false, message: 'Username/email atau password salah.' });
    const match = await bcrypt.compare(password, account.password);
    if (!match) return res.status(401).json({ success: false, message: 'Username/email atau password salah.' });
    return res.status(200).json({ success: true, data: { sponsorName: account.sponsorName, tier: account.tier, dealId: account.dealId } });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const resendCredential = async (req, res) => {
  try {
    const { id: dealId } = req.params;
    const deal = await prisma.sponsorDeal.findUnique({
      where: { id: dealId },
      select: { email: true, sponsorName: true, promotorId: true },
    });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
    if (deal.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    const account = await prisma.clientAccount.findUnique({ where: { dealId } });
    if (!account) return res.status(404).json({ success: false, message: 'Akun sponsor belum dibuat. Setujui deal dulu.' });

    const newPassword = Math.random().toString(36).slice(-8).toUpperCase();
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.clientAccount.update({ where: { dealId }, data: { password: hashed } });

    await sendSponsorCredential({
      promotorEmail: req.user.email,
      sponsorEmail: deal.email,
      sponsorName: deal.sponsorName,
      username: account.username,
      password: newPassword,
    });

    return res.status(200).json({ success: true, message: 'Kredensial baru berhasil dikirim ke email promotor.', data: { username: account.username, password: newPassword } });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Deliverables ─────────────────────────────────────────────────────────────
// GET publik (sponsor-dashboard + promotor dashboard baca via dealId). Internal package lookup
// di-scope ke deal.promotorId. Mutasi (create/update) promotor-only + cek kepemilikan via deal.

const getDeliverables = async (req, res) => {
  try {
    const { dealId } = req.query;
    if (!dealId) return res.status(400).json({ success: false, message: 'dealId query param wajib diisi.' });

    let [items, deal] = await Promise.all([
      prisma.sponsorDeliverable.findMany({ where: { dealId: String(dealId) }, orderBy: { createdAt: 'asc' } }),
      prisma.sponsorDeal.findUnique({
        where: { id: String(dealId) },
        select: { tier: true, createdAt: true, status: true, promotorId: true },
      }),
    ]);

    if (items.length === 0 && deal?.status === 'Disetujui') {
      const dealFull = await prisma.sponsorDeal.findUnique({
        where: { id: String(dealId) },
        select: { dealBenefits: { select: { qty: true, benefit: { select: { name: true, category: true, description: true } } } } },
      });
      if (dealFull?.dealBenefits.length > 0) {
        await prisma.sponsorDeliverable.createMany({
          data: dealFull.dealBenefits.map(({ benefit, qty }) => ({
            dealId: String(dealId),
            title: `${qty}× ${benefit.name}`,
            category: benefit.category,
            status: 'Planning',
            notes: benefit.description || null,
          })),
        });
        items = await prisma.sponsorDeliverable.findMany({ where: { dealId: String(dealId) }, orderBy: { createdAt: 'asc' } });
      }
    }

    const benefitPriceMap = new Map();
    if (deal) {
      const pkg = await prisma.sponsorPackage.findFirst({
        where: { name: deal.tier, promotorId: deal.promotorId },
        include: { benefits: { include: { benefit: true } } },
      });
      pkg?.benefits.forEach(({ benefit }) => {
        benefitPriceMap.set(`${benefit.name}::${benefit.category}`, Number(benefit.price));
      });
    }

    const data = items.map((d) => ({
      ...d,
      value: benefitPriceMap.get(`${d.title}::${d.category}`) ?? null,
      dealCreatedAt: deal?.createdAt ?? null,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createDeliverable = async (req, res) => {
  try {
    const { dealId, title, category, status } = req.body;
    if (!dealId || !title || !category) {
      return res.status(400).json({ success: false, message: 'dealId, title, dan category wajib diisi.' });
    }
    const deal = await prisma.sponsorDeal.findUnique({ where: { id: dealId }, select: { promotorId: true } });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
    if (deal.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    const item = await prisma.sponsorDeliverable.create({ data: { dealId, title, category, status: status ?? 'Planning' } });
    return res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateDeliverable = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, proofImageUrl, notes } = req.body;
    const validStatuses = ['Planning', 'InProduction', 'Executed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }
    // Cek kepemilikan via deal induk.
    const existing = await prisma.sponsorDeliverable.findUnique({
      where: { id },
      select: { deal: { select: { promotorId: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Deliverable tidak ditemukan.' });
    if (existing.deal.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    const item = await prisma.sponsorDeliverable.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(proofImageUrl !== undefined && { proofImageUrl }),
        ...(notes !== undefined && { notes }),
      },
    });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  generateCode,
  validateInviteCode,
  getPortalCatalog,
  getPublicTierPrice,
  getBenefits,
  createBenefit,
  deleteBenefit,
  getDeals,
  createDeal,
  updateDealStatus,
  getPackages,
  createPackage,
  deletePackage,
  getThresholds,
  saveThresholds,
  updateThreshold,
  deleteThreshold,
  createAccount,
  verifyAccount,
  resendCredential,
  getDeliverables,
  createDeliverable,
  updateDeliverable,
};
