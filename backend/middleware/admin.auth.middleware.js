// backend/middleware/admin.auth.middleware.js
// Vérifie le JWT admin sur chaque requête protégée

const jwt = require('jsonwebtoken');

function verifyAdminToken(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token manquant' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('❌ JWT_SECRET non défini dans .env');
        return res.status(500).json({ success: false, error: 'Configuration serveur manquante' });
    }

    try {
        const decoded = jwt.verify(token, secret);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        req.admin = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Session expirée', expired: true });
        }
        return res.status(401).json({ success: false, error: 'Token invalide' });
    }
}

module.exports = { verifyAdminToken };
