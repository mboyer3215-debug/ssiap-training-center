// backend/routes/center.routes.js
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const admin    = require('firebase-admin');
const db       = admin.database();
const { verifyCenterToken } = require('../middleware/center.auth.middleware');

const nodemailer = require('nodemailer');
function getMailer() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.ionos.fr',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 587,
    connectionTimeout: 10000,
    greetingTimeout:   5000,
    socketTimeout:     10000,    
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// ══════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES (pas de JWT requis)
// ══════════════════════════════════════════════════════════════

router.post('/register', async (req, res) => {
  const { licenseKey, nom, email, password, telephone, ville } = req.body;
  if (!licenseKey || !nom || !email || !password)
    return res.status(400).json({ success: false, error: 'Champs requis : licenseKey, nom, email, password' });
  if (password.length < 8)
    return res.status(400).json({ success: false, error: 'Mot de passe minimum 8 caractères' });
  try {
    const licSnapshot = await db.ref(`licenses/${licenseKey}`).once('value');
    const licenseData = licSnapshot.val();
    if (!licenseData) return res.status(400).json({ success: false, error: 'Clé de licence invalide' });
    if (licenseData.used && licenseData.centerId) return res.status(400).json({ success: false, error: 'Cette clé de licence est déjà utilisée' });
    if (licenseData.expiresAt && licenseData.expiresAt < Date.now()) return res.status(400).json({ success: false, error: 'Cette clé de licence a expiré' });

    const emailCheck = await db.ref('centers').orderByChild('info/email').equalTo(email).once('value');
    if (emailCheck.exists()) return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });

    const passwordHash = await bcrypt.hash(password, 12);
    const centerId = licenseData.centerId || `center_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    await db.ref(`centers/${centerId}`).set({
      centerId,
      info:    { nom, email, telephone: telephone || '', ville: ville || '', createdAt: Date.now() },
      auth:    { email, passwordHash, createdAt: Date.now(), lastLogin: null },
      license: { key: licenseKey, type: licenseData.type || 'DEMO', expiresAt: licenseData.expiresAt || null, maxFormateurs: licenseData.maxFormateurs || 1, maxStagiaires: licenseData.maxStagiaires || 10, activatedAt: Date.now() },
      stats:   { formateurs: 0, stagiaires: 0, sessions: 0 },
      status:  'active'
    });
    await db.ref(`licenses/${licenseKey}`).update({ used: true, centerId, usedAt: Date.now(), centerNom: nom, centerEmail: email });

    try {
      const mailer = getMailer();
      await mailer.sendMail({ from: `"SSIAP Training" <${process.env.SMTP_USER}>`, to: email, subject: '✅ Votre compte SSIAP Training est créé', html: `<p>Bienvenue ${nom} ! Votre compte a été créé. ID : ${centerId}</p>` });
    } catch (e) { console.log('Email non envoyé:', e.message); }

    res.json({ success: true, centerId, nom, email, licenseType: licenseData.type || 'DEMO', message: 'Compte créé avec succès' });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

const centerAttempts = {};
const MAX_ATTEMPTS   = 5;
const WINDOW_MS      = 15 * 60 * 1000;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });

  const key = email.toLowerCase();
  const now = Date.now();
  if (!centerAttempts[key] || now - centerAttempts[key].firstAttempt > WINDOW_MS)
    centerAttempts[key] = { count: 0, firstAttempt: now };
  if (centerAttempts[key].count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((centerAttempts[key].firstAttempt + WINDOW_MS - now) / 60000);
    return res.status(429).json({ success: false, error: `Trop de tentatives. Réessayez dans ${remaining} min.` });
  }

  try {
    const snapshot = await db.ref('centers').orderByChild('auth/email').equalTo(email).once('value');
    if (!snapshot.exists()) {
      centerAttempts[key].count++;
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }
    let centerData;
    snapshot.forEach(child => { centerData = { id: child.key, ...child.val() }; });

    if (!centerData?.auth?.passwordHash)
      return res.status(401).json({ success: false, error: "Compte non initialisé, contactez l'administrateur" });

    const valid = await bcrypt.compare(password, centerData.auth.passwordHash);
    if (!valid) {
      centerAttempts[key].count++;
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }
    if (centerData.status === 'inactive')
      return res.status(403).json({ success: false, error: "Compte désactivé, contactez l'administrateur" });

    delete centerAttempts[key];
    const licExp = centerData.license?.expiresAt;
    await db.ref(`centers/${centerData.id}/auth`).update({ lastLogin: Date.now() });

    const token = jwt.sign(
      { centerId: centerData.id, email: centerData.auth.email, role: 'center' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      success: true, token, centerId: centerData.id,
      nom:   centerData.info?.nom || '—',
      email: centerData.auth.email,
      license: {
        type: centerData.license?.type || 'DEMO', expiresAt: licExp,
        active: !licExp || licExp > Date.now(),
        maxFormateurs: centerData.license?.maxFormateurs || 1,
        maxStagiaires: centerData.license?.maxStagiaires || 10,
      }
    });
  } catch (err) {
    console.error('Erreur login centre:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  try {
    const snapshot = await db.ref('centers').orderByChild('auth/email').equalTo(email).once('value');
    if (!snapshot.exists()) return res.json({ success: true, message: 'Si cet email existe, un lien a été envoyé' });
    let centerId, centerData;
    snapshot.forEach(c => { centerId = c.key; centerData = c.val(); });
    const token = crypto.randomBytes(32).toString('hex');
    await db.ref(`centers/${centerId}/auth`).update({ resetToken: token, resetTokenExpires: Date.now() + 3600000 });
    const resetUrl = `https://ssiap-training-center.onrender.com/center/center-reset-password.html?token=${token}&id=${centerId}`;
    try {
      const mailer = getMailer();
      await mailer.sendMail({ from: `"SSIAP Training" <${process.env.SMTP_USER}>`, to: email, subject: '🔑 Réinitialisation mot de passe', html: `<p>Cliquez ici : <a href="${resetUrl}">${resetUrl}</a></p><p>Lien valable 1 heure.</p>` });
      res.json({ success: true, message: 'Email envoyé' });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') res.json({ success: true, debug_token: token, debug_id: centerId });
      else res.status(500).json({ success: false, error: "Erreur envoi email" });
    }
  } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

router.post('/reset-password', async (req, res) => {
  const { centerId, token, newPassword } = req.body;
  if (!centerId || !token || !newPassword) return res.status(400).json({ success: false, error: 'Paramètres manquants' });
  if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Mot de passe minimum 8 caractères' });
  try {
    const snap = await db.ref(`centers/${centerId}/auth`).once('value');
    const auth = snap.val();
    if (!auth || auth.resetToken !== token) return res.status(400).json({ success: false, error: 'Lien invalide ou déjà utilisé' });
    if (auth.resetTokenExpires < Date.now()) return res.status(400).json({ success: false, error: 'Lien expiré' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.ref(`centers/${centerId}/auth`).update({ passwordHash, resetToken: null, resetTokenExpires: null, passwordChangedAt: Date.now() });
    res.json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

// ─────────────────────────────────────────────────────────────
// GET /api/center/list — PUBLIQUE
// Utilisée par formateur-login.html pour peupler le dropdown.
// Ne renvoie que les infos non-sensibles (pas de hash, pas d'email).
// ─────────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const snapshot = await db.ref('centers').once('value');
    if (!snapshot.exists()) return res.json({ centers: [] });
    const centers = [];
    snapshot.forEach(child => {
      const c = child.val();
      if (c.status === 'inactive') return; // masquer les centres désactivés
      centers.push({
        centerId: child.key,
        nom:      c.info?.nom   || '—',
        ville:    c.info?.ville || '',
        license:  { type: c.license?.type || 'DEMO' },
        status:   c.status || 'active'
      });
    });
    res.json({ centers, total: centers.length });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ══════════════════════════════════════════════════════════════
// ROUTES PROTÉGÉES — JWT requis
// ══════════════════════════════════════════════════════════════
router.use(verifyCenterToken);

router.get('/dashboard/:centerId', async (req, res) => {
  const { centerId } = req.params;
  if (req.center.centerId !== centerId) return res.status(403).json({ error: 'Accès refusé.' });
  try {
    const snapshot = await db.ref(`centers/${centerId}`).once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'Centre non trouvé' });
    const c = snapshot.val();
    res.json({
      centerId, nom: c.info?.nom || '—', email: c.info?.email || c.auth?.email || '—', info: c.info || {},
      license: { type: c.license?.type || 'DEMO', expiresAt: c.license?.expiresAt || null, active: !c.license?.expiresAt || c.license.expiresAt > Date.now(), maxFormateurs: c.license?.maxFormateurs || 1, maxStagiaires: c.license?.maxStagiaires || 10 },
      stats: c.stats || {}, status: c.status || 'active'
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/update/:centerId', async (req, res) => {
  const { centerId } = req.params;
  if (req.center.centerId !== centerId) return res.status(403).json({ error: 'Accès refusé.' });
  const { nom, telephone, ville } = req.body;
  try {
    const updates = {};
    if (nom)       updates['info/nom']       = nom;
    if (telephone) updates['info/telephone'] = telephone;
    if (ville)     updates['info/ville']     = ville;
    await db.ref(`centers/${centerId}`).update(updates);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/admin-reset-password', async (req, res) => {
  const { centerId, newPassword } = req.body;
  if (!centerId || !newPassword) return res.status(400).json({ success: false, error: 'centerId et newPassword requis' });
  if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Minimum 6 caractères' });
  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.ref(`centers/${centerId}/auth`).update({ passwordHash, resetToken: null, resetTokenExpires: null, passwordChangedAt: Date.now(), resetByAdmin: true });
    res.json({ success: true, message: `Mot de passe réinitialisé pour ${centerId}` });
  } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
});

module.exports = router;
