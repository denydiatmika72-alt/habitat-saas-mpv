const adminMiddleware = (req, res, next) => {
  const raw = process.env.ADMIN_EMAILS || 'denydiatmika72@gmail.com'

  const ADMIN_EMAILS = raw
    .replace(/[﻿​-‍]/g, '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0)

  const userEmail = (req.user?.email || '').toLowerCase().trim()

  console.log('[ADMIN MW] adminEmails:', ADMIN_EMAILS)
  console.log('[ADMIN MW] userEmail:', userEmail)
  console.log('[ADMIN MW] match:', ADMIN_EMAILS.includes(userEmail))

  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak.',
      debug: { yourEmail: userEmail, adminEmails: ADMIN_EMAILS }
    })
  }
  next()
}

module.exports = adminMiddleware
