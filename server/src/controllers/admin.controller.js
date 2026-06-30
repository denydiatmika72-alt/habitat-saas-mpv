const prisma = require('../lib/prisma');

const getPendingUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { status: 'pending' },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error('[ADMIN ERROR]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id },
      data: { status: 'active' },
      select: { id: true, name: true, email: true, status: true },
    });
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('[ADMIN ERROR]', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getPendingUsers, approveUser };
