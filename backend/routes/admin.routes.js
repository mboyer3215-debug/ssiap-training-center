// backend/routes/admin.routes.js
// Login super admin — identifiants dans variables d'environnement

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

// ══════════════════════════════════════════════════════════════
// POST /api/admin/login
// Body: { username, password }
// Credentials définis dans les variables d'environnement Render :
//   ADMIN_USERNAME  (défaut: admin)
//   ADMIN_PASSWORD  (défaut: Ssiap@2026!)
// ══════════════════════════════════════════════════════════════
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Identifiant et mot de passe requis' });
  }

  const validUser = process.env.ADMIN_USERNAME || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'Ssiap@2026!';

  // Comparaison en temps constant pour éviter timing attacks
  const userOk = username.length === validUser.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(validUser));
  const passOk = password.length === validPass.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(validPass));

  if (userOk && passOk) {
    const token = `admin_${crypto.randomBytes(32).toString('hex')}`;
    return res.json({
      success: true,
      token,
      username,
      message: 'Connexion admin réussie'
    });
  }

  // Délai volontaire de 500ms pour ralentir les attaques brute force
  setTimeout(() => {
    res.status(401).json({ success: false, error: 'Identifiant ou mot de passe incorrect' });
  }, 500);
});

// ══════════════════════════════════════════════════════════════
// GET /api/admin/verify
// Vérifie si un token admin est valide (simple check de présence)
// ══════════════════════════════════════════════════════════════
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || (!token.startsWith('admin_') && token !== 'local_admin_token')) {
    return res.status(401).json({ valid: false });
  }
  res.json({ valid: true });
});

module.exports = router;