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
    const { eventId } = req.body;
    let code, attempt = 0;
    while (attempt < 5) {
      code = makeCodeString();
      const exists = await prisma.inviteCode.findUnique({ where: { code } });
      if (!exists) break;
      attempt++;
    }
    const inviteCode = await prisma.inviteCode.create({
      data: { code, createdBy: req.user.id, isActive: true, eventId: eventId ?? null },
    });
    console.log('[GENERATE CODE] created:', inviteCode.code);
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
    console.log('[VALIDATE CODE] received code:', code);

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
    return res.status(200).json({ success: true, data: { code: inviteCode.code, eventId: inviteCode.eventId ?? null } });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Benefits ─────────────────────────────────────────────────────────────────

const getBenefits = async (req, res) => {
  try {
    const benefits = await prisma.sponsorBenefit.findMany({ orderBy: { createdAt: 'asc' } });
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
      orderBy: { createdAt: 'desc' },
      include: {
        account: { select: { id: true } },
        dealBenefits: {
          include: { benefit: { select: { name: true, category: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Compute totalValue from dealBenefits for deals where it was not saved
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

const createDeal = async (req, res) => {
  try {
    const { sponsorName, contactName, email, tier, codeUsed, packageId, selectedBenefits, totalValue, eventId } = req.body;
    if (!sponsorName || !email || !tier || !codeUsed) {
      return res.status(400).json({ success: false, message: 'sponsorName, email, tier, dan codeUsed wajib diisi.' });
    }

    // Validasi stok sebelum membuat deal
    if (Array.isArray(selectedBenefits) && selectedBenefits.length > 0) {
      const benefitIds = selectedBenefits.map((b) => b.benefitId);
      const benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds } } });
      for (const { benefitId, qty } of selectedBenefits) {
        const benefit = benefitRecords.find((b) => b.id === benefitId);
        if (!benefit) continue;
        const available = benefit.maxQty - benefit.usedQty - benefit.heldQty;
        if (Number(qty) > available) {
          return res.status(400).json({
            success: false,
            message: `Stok "${benefit.name}" tidak mencukupi. Tersedia: ${available} unit.`,
          });
        }
      }
    }

    // Hitung totalValue di server (tidak percaya data dari client)
    let computedTotalValue = 0;
    if (packageId) {
      const pkg = await prisma.sponsorPackage.findUnique({ where: { id: packageId }, select: { price: true } });
      computedTotalValue = pkg ? Number(pkg.price) : 0;
    } else if (Array.isArray(selectedBenefits) && selectedBenefits.length > 0) {
      const benefitIds = selectedBenefits.map((b) => b.benefitId);
      const benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds } } });
      const priceMap = new Map(benefitRecords.map((b) => [b.id, Number(b.price)]));
      computedTotalValue = selectedBenefits.reduce((sum, { benefitId, qty }) => {
        return sum + (priceMap.get(benefitId) ?? 0) * Number(qty);
      }, 0);
    }

    // Buat deal beserta relasi SponsorDealBenefit
    const deal = await prisma.sponsorDeal.create({
      data: {
        sponsorName,
        contactName: contactName ?? '',
        email,
        tier,
        codeUsed,
        status: 'Negosiasi',
        packageId: packageId ?? null,
        eventId: eventId ?? null,
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

    // Tahan stok (heldQty += qty) per benefit yang dipesan
    if (Array.isArray(selectedBenefits) && selectedBenefits.length > 0) {
      for (const { benefitId, qty } of selectedBenefits) {
        await prisma.sponsorBenefit.update({
          where: { id: benefitId },
          data: { heldQty: { increment: Number(qty) } },
        });
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

    // Ambil tier dan dealBenefits sebelum update
    const dealBefore = await prisma.sponsorDeal.findUnique({
      where: { id },
      select: {
        tier: true,
        dealBenefits: { select: { benefitId: true, qty: true } },
      },
    });
    const deal = await prisma.sponsorDeal.update({ where: { id }, data: { status } });
    const dealBenefits = dealBefore?.dealBenefits ?? [];

    if (status === 'Disetujui' && dealBefore) {
      // Auto-create deliverables dari benefit paket
      const existing = await prisma.sponsorDeliverable.count({ where: { dealId: id } });
      if (existing === 0) {
        const pkg = await prisma.sponsorPackage.findFirst({
          where: { name: dealBefore.tier },
          include: { benefits: { include: { benefit: true } } },
        });
        if (pkg && pkg.benefits.length > 0) {
          await prisma.sponsorDeliverable.createMany({
            data: pkg.benefits.map(({ benefit }) => ({
              dealId: id,
              title: benefit.name,
              category: benefit.category,
              status: 'Planning',
              notes: benefit.description || null,
            })),
          });
          console.log(`[UPDATE DEAL STATUS] Auto-created ${pkg.benefits.length} deliverables for deal ${id}`);
        }
      }

      // Pindahkan stok: heldQty → usedQty
      for (const { benefitId, qty } of dealBenefits) {
        await prisma.sponsorBenefit.update({
          where: { id: benefitId },
          data: { usedQty: { increment: qty }, heldQty: { decrement: qty } },
        });
      }
    } else if (status === 'Ditolak') {
      // Kembalikan stok yang ditahan
      for (const { benefitId, qty } of dealBenefits) {
        await prisma.sponsorBenefit.update({
          where: { id: benefitId },
          data: { heldQty: { decrement: qty } },
        });
      }
    }

    return res.status(200).json({ success: true, data: deal });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
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
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createPackage = async (req, res) => {
  try {
    const { name, price, slots, description, benefits } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'name wajib diisi.' });
    }

    // Validasi qty setiap benefit tidak melebihi maxQty
    if (Array.isArray(benefits) && benefits.length > 0) {
      const benefitIds = benefits.map((b) => b.benefitId);
      const benefitRecords = await prisma.sponsorBenefit.findMany({ where: { id: { in: benefitIds } } });
      for (const { benefitId, qty } of benefits) {
        const benefit = benefitRecords.find((b) => b.id === benefitId);
        if (benefit && Number(qty) > benefit.maxQty) {
          return res.status(400).json({
            success: false,
            message: `Qty benefit "${benefit.name}" melebihi stok maksimal. Maksimal: ${benefit.maxQty} pcs.`,
          });
        }
      }
    }

    // Ambil harga paket dari threshold tier (bukan dari kalkulasi benefit)
    const threshold = await prisma.sponsorThreshold.findFirst({ where: { tierName: name } });
    const packagePrice = threshold ? Number(threshold.minPrice) : Number(price ?? 0);

    const pkg = await prisma.sponsorPackage.create({
      data: {
        name,
        price: packagePrice,
        slots: Number(slots ?? 1),
        description: description ?? '',
        ...(Array.isArray(benefits) && benefits.length > 0 && {
          benefits: {
            create: benefits.map(({ benefitId, qty }) => ({ benefitId, qty: Number(qty || 1) })),
          },
        }),
      },
      include: {
        benefits: { include: { benefit: true } },
      },
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
    await prisma.sponsorPackage.delete({ where: { id } });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Thresholds ───────────────────────────────────────────────────────────────

const getThresholds = async (req, res) => {
  try {
    const thresholds = await prisma.sponsorThreshold.findMany({ orderBy: { minPrice: 'asc' } });
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
    return res.status(201).json({
      success: true,
      data: { id: account.id, username: account.username, password },
    });
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
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
  } catch (error) {
    console.error('[SPONSOR ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Deliverables ─────────────────────────────────────────────────────────────

const getDeliverables = async (req, res) => {
  try {
    const { dealId } = req.query;
    if (!dealId) {
      return res.status(400).json({ success: false, message: 'dealId query param wajib diisi.' });
    }

    const [items, deal] = await Promise.all([
      prisma.sponsorDeliverable.findMany({
        where: { dealId: String(dealId) },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sponsorDeal.findUnique({
        where: { id: String(dealId) },
        select: { tier: true, createdAt: true },
      }),
    ]);

    // Cari harga benefit dari paket yang cocok dengan tier deal
    const benefitPriceMap = new Map();
    if (deal) {
      const pkg = await prisma.sponsorPackage.findFirst({
        where: { name: deal.tier },
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
    const item = await prisma.sponsorDeliverable.create({
      data: { dealId, title, category, status: status ?? 'Planning' },
    });
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
  getDeliverables,
  createDeliverable,
  updateDeliverable,
};
