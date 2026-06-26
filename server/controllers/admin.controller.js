const prisma = require('../src/lib/prisma');

const getAdminStats = async (req, res) => {
  try {
    const [totalUsers, pendingUsers, activeUsers, suspendedUsers, totalEvents] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'pending' } }),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: 'suspended' } }),
      prisma.event.count(),
    ]);
    return res.json({ success: true, data: { totalUsers, pendingUsers, activeUsers, suspendedUsers, totalEvents } });
  } catch (err) {
    console.error('[ADMIN STATS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getPendingUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { status: 'pending' },
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error('[ADMIN PENDING USERS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error('[ADMIN ALL USERS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
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
    return res.json({ success: true, message: `Akun ${user.name} berhasil diaktifkan.`, data: user });
  } catch (err) {
    console.error('[ADMIN APPROVE ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id },
      data: { status: 'suspended' },
      select: { id: true, name: true, email: true, status: true },
    });
    return res.json({ success: true, message: `Akun ${user.name} berhasil disuspend.`, data: user });
  } catch (err) {
    console.error('[ADMIN SUSPEND ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAdminStats, getPendingUsers, getAllUsers, approveUser, suspendUser };
