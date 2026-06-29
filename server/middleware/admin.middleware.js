const adminMiddleware = (req, res, next) => {
  const rawEmails = process.env.ADMIN_EMAILS || ''
  const ADMIN_EMAILS = rawEmails.split(',').map(e => e.trim().toLowerCase())
  const userEmail = (req.user?.email || '').toLowerCase().trim()

  console.log('[ADMIN MIDDLEWARE] userEmail:', userEmail)
  console.log('[ADMIN MIDDLEWARE] adminEmails:', ADMIN_EMAILS)
  console.log('[ADMIN MIDDLEWARE] isAdmin:', ADMIN_EMAILS.includes(userEmail))

  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Hanya admin yang bisa mengakses ini.',
      debug: {
        yourEmail: userEmail,
        adminEmails: ADMIN_EMAILS
      }
    })
  }
  next()
}

module.exports = adminMiddleware
