const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Compteur brute-force en mémoire
const attempts = {};
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 min

router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  // Init ou reset si fenêtre expirée
  if (!attempts[ip] || now - attempts[ip].firstAttempt > WINDOW_MS) {
    attempts[ip] = { count: 0, firstAttempt: now };
  }

  // Vérifier limite
  if (attempts[ip].count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((attempts[ip].firstAttempt + WINDOW_MS - now) / 60000);
    return res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${remaining} min.` });
  }

  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminHash  = process.env.ADMIN_PASSWORD_HASH;

  if (!email || !password) {
    return res.status(400).json({ error: 'Champs manquants.' });
  }

  const emailOk = email === adminEmail;
  const passOk  = emailOk && await bcrypt.compare(password, adminHash);

  if (!emailOk || !passOk) {
    attempts[ip].count++;
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  // Succès → reset compteur
  delete attempts[ip];

  const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token });
});

module.exports = router;
