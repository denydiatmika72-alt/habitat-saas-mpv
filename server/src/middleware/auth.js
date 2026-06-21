const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Token tidak ada atau salah format" });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, 'SECRET_KEY');
        req.user = { id: decoded.userId };
        next();
    } catch (err) {
        res.status(401).json({ error: "Token invalid" });
    }
};