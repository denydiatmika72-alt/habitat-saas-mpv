const prisma = require('../src/lib/prisma');

// GET /api/settings/promoter
async function getPromoterSettings(req, res) {
  try {
    // userId dari JWT — satu EO = satu settings
    const userId = req.user?.id ?? 'default';
    const settings = await prisma.promoterSettings.findUnique({ where: { userId } });
    return res.json({ success: true, data: settings ?? null });
  } catch (err) {
    console.error('[getPromoterSettings]', err);
    return res.status(500).json({ success: false, message: 'Gagal memuat settings.' });
  }
}

// POST /api/settings/promoter
async function savePromoterSettings(req, res) {
  try {
    const userId = req.user?.id ?? 'default';
    const { companyName, logoUrl, bankName, bankAccount, accountHolder } = req.body;

    const settings = await prisma.promoterSettings.upsert({
      where: { userId },
      update: { companyName, logoUrl, bankName, bankAccount, accountHolder },
      create: { userId, companyName, logoUrl, bankName, bankAccount, accountHolder },
    });

    return res.json({ success: true, data: settings, message: 'Settings tersimpan.' });
  } catch (err) {
    console.error('[savePromoterSettings]', err);
    return res.status(500).json({ success: false, message: 'Gagal simpan settings.' });
  }
}

module.exports = { getPromoterSettings, savePromoterSettings };
