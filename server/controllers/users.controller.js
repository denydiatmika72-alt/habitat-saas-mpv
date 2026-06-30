const prisma = require('../src/lib/prisma');

const VALID_PLANS = ['starter', 'pro'];

const updatePlan = async (req, res) => {
  const { plan } = req.body;

  if (!plan || !VALID_PLANS.includes(plan)) {
    return res.status(400).json({
      success: false,
      message: `Plan tidak valid. Nilai yang diperbolehkan: ${VALID_PLANS.join(', ')}.`,
    });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { plan },
      select: { id: true, name: true, email: true, phone: true, status: true, plan: true, createdAt: true },
    });

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }
    console.error('[UPDATE PLAN ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { updatePlan };
