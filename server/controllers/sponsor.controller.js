const prisma = require('../src/lib/prisma');
const bcrypt = require('bcryptjs');

// ─── Code helpers ─────────────────────────────────────────────────────────────
function makeCodeString() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SPN-${seg()}-${seg()}`;
}

// ─── Invite Codes ─────────────────────────────────────────────────────────────

const generateCode = async (req, res) => {
  console.log('[GENERATE CODE] hit by user:', req.user?.id);
  try {
    let code, attempt = 0;
    while (attempt < 5) {
      code = makeCodeString();
      const exists = await prisma.inviteCode.findUnique({ where: { code } });
      if (!exists) break;
      attempt++;
    }
    const inviteCode = await prisma.inviteCode.create({
      data: { code, createdBy: req.user.id, isActive: true },
    });
    console.log('[GENERATE CODE] created:', inviteCode.code);
    return res.status(201).json({
      success: true,
      data: { code: inviteCode.code, id: inviteCode.id, createdAt: inviteCode.createdAt },
    });
  } catch (err) {
    console.error('[GENERATE CODE ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const validateInviteCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Kode wajib diisi.' });

    const inviteCode = await prisma.inviteCode.findUnique({ where: { code: code.toUpperCase() } });
    if (!inviteCode || !inviteCode.isActive) {
      return res.status(400).json({ success: false, message: 'Kode tidak valid atau sudah digunakan.' });
    }
    await prisma.inviteCode.update({
      where: { id: inviteCode.id },
      data: { isActive: false, usedAt: new Date() },
    });
    return res.status(200).json({ success: true, data: { code: inviteCode.code } });
  } catch (err) {
    console.error('[VALIDATE CODE ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Benefits ─────────────────────────────────────────────────────────────────

const getBenefits = async (req, res) => {
  try {
    const benefits = await prisma.sponsorBenefit.findMany({ orderBy: { createdAt: 'desc' } });
    return res.status(200).json({ success: true, data: benefits });
  } catch (err) {
    console.error('[GET BENEFITS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createBenefit = async (req, res) => {
  try {
    const { name, category, description, price } = req.body;
    if (!name || !category || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, category, dan price wajib diisi.' });
    }
    const benefit = await prisma.sponsorBenefit.create({
      data: { name, category, description: description ?? '', price: Number(price) },
    });
    return res.status(201).json({ success: true, data: benefit });
  } catch (err) {
    console.error('[CREATE BENEFIT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const deleteBenefit = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.sponsorBenefit.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[DELETE BENEFIT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Deals ────────────────────────────────────────────────────────────────────

const getDeals = async (req, res) => {
  try {
    const deals = await prisma.sponsorDeal.findMany({
      orderBy: { createdAt: 'desc' },
      include: { account: { select: { id: true } } },
    });
    return res.status(200).json({ success: true, data: deals });
  } catch (err) {
    console.error('[GET DEALS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createDeal = async (req, res) => {
  try {
    const { sponsorName, contactName, email, tier, codeUsed } = req.body;
    if (!sponsorName || !email || !tier || !codeUsed) {
      return res.status(400).json({ success: false, message: 'sponsorName, email, tier, dan codeUsed wajib diisi.' });
    }
    const deal = await prisma.sponsorDeal.create({
      data: { sponsorName, contactName: contactName ?? '', email, tier, codeUsed, status: 'Negosiasi' },
    });
    return res.status(201).json({ success: true, data: deal });
  } catch (err) {
    console.error('[CREATE DEAL ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateDealStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Negosiasi', 'Disetujui'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status harus "Negosiasi" atau "Disetujui".' });
    }
    const deal = await prisma.sponsorDeal.update({ where: { id }, data: { status } });
    return res.status(200).json({ success: true, data: deal });
  } catch (err) {
    console.error('[UPDATE DEAL STATUS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Packages ─────────────────────────────────────────────────────────────────

const getPackages = async (req, res) => {
  try {
    const packages = await prisma.sponsorPackage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        benefits: { include: { benefit: true } },
      },
    });
    return res.status(200).json({ success: true, data: packages });
  } catch (err) {
    console.error('[GET PACKAGES ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createPackage = async (req, res) => {
  try {
    const { name, price, slots, description, benefitIds } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: 'name dan price wajib diisi.' });
    }
    const pkg = await prisma.sponsorPackage.create({
      data: {
        name,
        price: Number(price),
        slots: Number(slots ?? 1),
        description: description ?? '',
        ...(Array.isArray(benefitIds) && benefitIds.length > 0 && {
          benefits: {
            create: benefitIds.map((benefitId) => ({ benefitId })),
          },
        }),
      },
      include: {
        benefits: { include: { benefit: true } },
      },
    });
    return res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    console.error('[CREATE PACKAGE ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Thresholds ───────────────────────────────────────────────────────────────

const getThresholds = async (req, res) => {
  try {
    const thresholds = await prisma.sponsorThreshold.findMany({ orderBy: { minPrice: 'asc' } });
    return res.status(200).json({ success: true, data: thresholds });
  } catch (err) {
    console.error('[GET THRESHOLDS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const saveThresholds = async (req, res) => {
  try {
    const { thresholds } = req.body;
    if (!Array.isArray(thresholds)) {
      return res.status(400).json({ success: false, message: 'thresholds harus berupa array.' });
    }
    const results = await Promise.all(
      thresholds.map(({ tierName, minPrice }) =>
        prisma.sponsorThreshold.upsert({
          where: { tierName },
          update: { minPrice: Number(minPrice) },
          create: { tierName, minPrice: Number(minPrice) },
        }),
      ),
    );
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error('[SAVE THRESHOLDS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Client Accounts ──────────────────────────────────────────────────────────

const createAccount = async (req, res) => {
  try {
    const { dealId, sponsorName, username, password, tier } = req.body;
    if (!dealId || !username || !password) {
      return res.status(400).json({ success: false, message: 'dealId, username, dan password wajib diisi.' });
    }
    const existing = await prisma.clientAccount.findFirst({ where: { dealId } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Akun untuk deal ini sudah ada.' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const account = await prisma.clientAccount.create({
      data: { dealId, sponsorName: sponsorName ?? '', username, password: hashed, tier: tier ?? '' },
    });
    return res.status(201).json({
      success: true,
      data: { id: account.id, username: account.username, password },
    });
  } catch (err) {
    console.error('[CREATE ACCOUNT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const verifyAccount = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
    }
    const account = await prisma.clientAccount.findUnique({ where: { username } });
    if (!account) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }
    const match = await bcrypt.compare(password, account.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }
    return res.status(200).json({
      success: true,
      data: { sponsorName: account.sponsorName, tier: account.tier, dealId: account.dealId },
    });
  } catch (err) {
    console.error('[VERIFY ACCOUNT ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Deliverables ─────────────────────────────────────────────────────────────

const getDeliverables = async (req, res) => {
  try {
    const { dealId } = req.query;
    if (!dealId) {
      return res.status(400).json({ success: false, message: 'dealId query param wajib diisi.' });
    }
    const items = await prisma.sponsorDeliverable.findMany({
      where: { dealId: String(dealId) },
      orderBy: { createdAt: 'asc' },
    });
    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    console.error('[GET DELIVERABLES ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createDeliverable = async (req, res) => {
  try {
    const { dealId, title, category, status } = req.body;
    if (!dealId || !title || !category) {
      return res.status(400).json({ success: false, message: 'dealId, title, dan category wajib diisi.' });
    }
    const item = await prisma.sponsorDeliverable.create({
      data: { dealId, title, category, status: status ?? 'Planning' },
    });
    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error('[CREATE DELIVERABLE ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
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
    const item = await prisma.sponsorDeliverable.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(proofImageUrl !== undefined && { proofImageUrl }),
        ...(notes !== undefined && { notes }),
      },
    });
    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    console.error('[UPDATE DELIVERABLE ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  generateCode,
  validateInviteCode,
  getBenefits,
  createBenefit,
  deleteBenefit,
  getDeals,
  createDeal,
  updateDealStatus,
  getPackages,
  createPackage,
  getThresholds,
  saveThresholds,
  createAccount,
  verifyAccount,
  getDeliverables,
  createDeliverable,
  updateDeliverable,
};
