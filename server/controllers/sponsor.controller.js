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

// ─── Invite Codes ─────────────────────────────────────────────────────────────

const generateCode = async (req, res) => {
  try {
    const { eventId } = req.body;
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
      data: { code, createdBy: req.user.id, isActive: true, eventId: eventId ?? null },
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
    const inviteCode = await prisma.inviteCode.findUnique({ where: { code }, select: { createdBy: true } });
    if (!inviteCode) return res.status(200).json({ success: true, data: { packages: [], benefits: [] } });
    const promotorId = inviteCode.createdBy;
    const [packages, benefits] = await Promise.all([
      prisma.sponsorPackage.findMany({
        where: { promotorId },
        orderBy: { createdAt: 'desc' },
        include: { benefits: { include: { benefit: true } } },
      }),
      prisma.sponsorBenefit.findMany({ where: { promotorId }, orderBy: { createdAt: 'asc' } }),
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
      select: { promotorId: true, tier: true },
    });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
    const threshold = await prisma.sponsorThreshold.findFirst({
      where: { promotorId: deal.promotorId, tierName: deal.tier },
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
    const benefits = await prisma.sponsorBenefit.findMany({
      where: { promotorId: req.user.id },
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
    const { name, category, description, price, maxQty } = req.body;
    if (!name || !category || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, category, dan price wajib diisi.' });
    }
    const benefit = await prisma.sponsorBenefit.create({
      data: {
        promotorId: req.user.id,
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

const getDeals = async (req, res) => {
  try {
    const deals = await prisma.sponsorDeal.findMany({
      where: { promotorId: req.user.id },
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
    const eventId = inviteCode.eventId ?? null;

    // Semua benefit/paket yang dipilih WAJIB milik promotor yang sama (cegah rujukan lintas-akun).
    let benefitRecords = [];
    if (Array.isArray(selectedBenefits) && selectedBenefits.length > 0) {
      const benefitIds = selectedBenefits.map((b) => b.benefitId);
      benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds }, promotorId } });
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
      const pkg = await prisma.sponsorPackage.findFirst({ where: { id: packageId, promotorId }, select: { price: true } });
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
    const packages = await prisma.sponsorPackage.findMany({
      where: { promotorId: req.user.id },
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
    const { name, price, slots, description, benefits } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name wajib diisi.' });

    // Validasi qty benefit ≤ maxQty — benefit HARUS milik promotor ini.
    if (Array.isArray(benefits) && benefits.length > 0) {
      const benefitIds = benefits.map((b) => b.benefitId);
      const benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds }, promotorId: req.user.id } });
      const foundIds = new Set(benefitRecords.map((b) => b.id));
      if (benefitIds.some((bid) => !foundIds.has(bid))) {
        return res.status(400).json({ success: false, message: 'Benefit yang dipilih tidak valid.' });
      }
      for (const { benefitId, qty } of benefits) {
        const benefit = benefitRecords.find((b) => b.id === benefitId);
        if (benefit && Number(qty) > benefit.maxQty) {
          return res.status(400).json({ success: false, message: `Qty benefit "${benefit.name}" melebihi stok maksimal. Maksimal: ${benefit.maxQty} pcs.` });
        }
      }
    }

    // Harga paket dari threshold tier milik promotor ini (bukan global).
    const threshold = await prisma.sponsorThreshold.findFirst({ where: { tierName: name, promotorId: req.user.id } });
    const packagePrice = threshold ? Number(threshold.minPrice) : Number(price ?? 0);

    const pkg = await prisma.sponsorPackage.create({
      data: {
        promotorId: req.user.id,
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
    const thresholds = await prisma.sponsorThreshold.findMany({
      where: { promotorId: req.user.id },
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
    const { thresholds } = req.body;
    if (!Array.isArray(thresholds)) {
      return res.status(400).json({ success: false, message: 'thresholds harus berupa array.' });
    }
    const promotorId = req.user.id;
    const results = await Promise.all(
      thresholds.map(({ tierName, minPrice }) =>
        prisma.sponsorThreshold.upsert({
          where: { promotorId_tierName: { promotorId, tierName } },
          update: { minPrice: Number(minPrice) },
          create: { promotorId, tierName, minPrice: Number(minPrice) },
        }),
      ),
    );
    return res.status(200).json({ success: true, data: results });
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
  createAccount,
  verifyAccount,
  resendCredential,
  getDeliverables,
  createDeliverable,
  updateDeliverable,
};
