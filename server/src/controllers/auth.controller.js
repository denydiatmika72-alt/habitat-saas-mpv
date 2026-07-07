const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { sendNewUserNotification } = require('../../services/email.service');

const register = async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ success: false, message: 'name, email, dan password wajib diisi.' });

  if (password.length < 6)
    return res.status(400).json({ success: false, message: 'Password minimal 6 karakter.' });

  const validRoles = ['promotor', 'crew', 'scanner'];
  const userRole = validRoles.includes(role) ? role : 'promotor';

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, password: hashed, phone: phone ?? null, status: 'pending', role: userRole },
      select: { id: true, name: true, email: true, phone: true, status: true, plan: true, role: true, isAdmin: true, createdAt: true },
    });

    sendNewUserNotification(user); // fire-and-forget — jangan await agar tidak blokir response

    return res.status(201).json({
      success: true,
      message: 'Pendaftaran berhasil! Akun kamu sedang direview oleh admin.',
      status: 'pending',
      data: user,
    });
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });

    if (user.status === 'pending')
      return res.status(403).json({ success: false, message: 'Akun kamu belum diaktifkan. Hubungi admin untuk konfirmasi.' });

    if (user.status === 'suspended')
      return res.status(403).json({ success: false, message: 'Akun kamu telah disuspend. Hubungi admin.' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login berhasil!',
      token,
      data: { id: user.id, name: user.name, email: user.email, plan: user.plan, role: user.role, isAdmin: user.isAdmin },
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, phone: true, status: true, plan: true, role: true, isAdmin: true, createdAt: true,
        proEventId: true, proExpiresAt: true, proStartedAt: true,
      },
    });

    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error('[GET ME ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { register, login, getMe };
