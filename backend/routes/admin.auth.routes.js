// backend/routes/admin.auth.routes.js
// Login admin : vérifie email + mot de passe, retourne un JWT 8h

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

/**
 * POST /api/admin/login
 * Body : { email, password }
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
    }

    const adminEmail    = process.env.ADMIN_EMAIL;
    const adminHashedPw = process.env.ADMIN_PASSWORD_HASH;
    const jwtSecret     = process.env.JWT_SECRET;

    if (!adminEmail || !adminHashedPw || !jwtSecret) {
        console.error('❌ Variables admin manquantes dans .env (ADMIN_EMAIL, ADMIN_PASSWORD_HASH, JWT_SECRET)');
        return res.status(500).json({ success: false, error: 'Configuration serveur incomplète' });
    }

    // Vérifier email (insensible à la casse)
    if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }

    // Vérifier mot de passe avec bcrypt
    const valid = await bcrypt.compare(password, adminHashedPw);
    if (!valid) {
        return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    }

    // Générer JWT valable 8 heures
    const token = jwt.sign(
        { role: 'admin', email: adminEmail },
        jwtSecret,
        { expiresIn: '8h' }
    );

    console.log(`✅ Connexion admin : ${adminEmail}`);
    res.json({ success: true, token, expiresIn: 8 * 3600 });
});

module.exports = router;
