const jwt = require('jsonwebtoken');

/**
 * verifyToken — Auth Middleware
 *
 * Mengekstrak JWT dari header "Authorization: Bearer <token>",
 * memverifikasi dengan JWT_SECRET, lalu menyimpan payload ke req.user.
 *
 * - Tidak ada token     → 401 Unauthorized
 * - Token tidak valid   → 401 Unauthorized
 * - Token valid         → req.user = { id, email, name, ... } + next()
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Cek header ada dan formatnya "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[AUTH] 401 No token:', req.method, req.originalUrl);
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    console.warn('[AUTH] 401 Empty token:', req.method, req.originalUrl);
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, name, iat, exp }
    next();
  } catch (err) {
    console.warn('[AUTH] 401 Invalid token:', req.method, req.originalUrl, '-', err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = { verifyToken };
