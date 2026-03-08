// backend/middleware/center.auth.middleware.js
const jwt = require('jsonwebtoken');

function verifyCenterToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token manquant. Veuillez vous reconnecter.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'center') {
      return res.status(403).json({ success: false, error: 'Accès refusé.' });
    }
    req.center = decoded; // { centerId, email, role: 'center' }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expirée. Veuillez vous reconnecter.', expired: true });
    }
    return res.status(401).json({ success: false, error: 'Token invalide.' });
  }
}

module.exports = { verifyCenterToken };
