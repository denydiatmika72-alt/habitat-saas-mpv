const adminMiddleware = (req, res, next) => {
  const raw = process.env.ADMIN_EMAILS || ''
  console.log('[ADMIN MW] raw ADMIN_EMAILS:', JSON.stringify(raw))

  const ADMIN_EMAILS = raw
    .replace(/[\uFEFF\u200B-\u200D]/g, '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0)

  const userEmail = (req.user?.email || '').toLowerCase().trim()
  console.log('[ADMIN MW] adminEmails:', ADMIN_EMAILS, '| userEmail:', userEmail)

  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Hanya admin yang bisa mengakses ini.',
      debug: { yourEmail: userEmail, adminEmails: ADMIN_EMAILS }
    })
  }
  next()
}

module.exports = adminMiddleware
