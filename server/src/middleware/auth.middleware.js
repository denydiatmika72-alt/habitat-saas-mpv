const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Token lama (sebelum field role ditambahkan) tidak mengandung role.
    // Fallback: ambil dari DB agar tidak perlu force re-login semua user.
    if (decoded.role === undefined) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { role: true },
      });
      decoded.role = user?.role ?? 'promotor';
    }

    req.user = decoded; // { id, email, name, role }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah expired.' });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya admin yang bisa mengakses ini.',
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { protect, verifyToken: protect, requireAdmin };
