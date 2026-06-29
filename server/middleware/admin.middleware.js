const adminMiddleware = (req, res, next) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  console.log('[ADMIN MIDDLEWARE] user email from JWT:', req.user?.email)
  console.log('[ADMIN MIDDLEWARE] allowed emails:', adminEmails)
  console.log('[ADMIN MIDDLEWARE] is admin:', adminEmails.includes(req.user?.email))

  if (!req.user || !adminEmails.includes(req.user.email)) {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Hanya admin yang diizinkan.',
      debug: {
        yourEmail: req.user?.email,
        adminEmails
      }
    });
  }
  next();
};

module.exports = adminMiddleware;
