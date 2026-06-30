const adminMiddleware = (req, res, next) => {
  const raw = process.env.ADMIN_EMAILS
  console.log('[ADMIN MW] raw ADMIN_EMAILS:', JSON.stringify(raw))
  console.log('[ADMIN MW] type:', typeof raw, 'length:', raw ? raw.length : 0)

  const ADMIN_EMAILS = (raw || '')
    .replace(/[﻿​-‍]/g, '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0)

  const userEmail = (req.user?.email || '').toLowerCase().trim()
  console.log('[ADMIN MW] parsed adminEmails:', ADMIN_EMAILS)
  console.log('[ADMIN MW] userEmail:', userEmail)

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
