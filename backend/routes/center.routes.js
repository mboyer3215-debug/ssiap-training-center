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

// ══════════════════════════════════════════════════════════════════════════
// PATCH center.routes.js — Route POST /register
// Remplace la route existante /register par celle-ci.
//
// Changements :
//  1. Lit licenseData.type OU licenseData.plan pour compatibilité les deux sources
//     (license.routes.js stocke `type`, stripe.routes.js stockait `plan`)
//  2. Pour les licences INDÉPENDANT : crée automatiquement un formateur
//     avec le pinHash stocké dans Firebase lors de la génération de licence.
// ══════════════════════════════════════════════════════════════════════════

router.post('/register', async (req, res) => {
  const { licenseKey, nom, email, password, telephone, ville } = req.body;
  if (!licenseKey || !nom || !email || !password)
    return res.status(400).json({ success: false, error: 'Champs requis : licenseKey, nom, email, password' });
  if (password.length < 8)
    return res.status(400).json({ success: false, error: 'Mot de passe minimum 8 caractères' });

  try {
    // ── Lire la licence (nœud `licences/` pour Stripe, `licenses/` pour license.routes) ──
    let licenseData = null;
    let licenceNode = null;

    // Essai 1 : nœud `licences` (stripe.routes.js)
    const snapNew = await db.ref(`licences/${licenseKey}`).once('value');
    if (snapNew.exists()) {
      licenseData = snapNew.val();
      licenceNode = 'licences';
    } else {
      // Essai 2 : nœud `licenses` (license.routes.js)
      const snapOld = await db.ref(`licenses/${licenseKey}`).once('value');
      if (snapOld.exists()) {
        licenseData = snapOld.val();
        licenceNode = 'licenses';
      }
    }

    if (!licenseData)
      return res.status(400).json({ success: false, error: 'Clé de licence invalide' });
    if (licenseData.used && licenseData.centerId)
      return res.status(400).json({ success: false, error: 'Cette clé de licence est déjà utilisée' });
    if (licenseData.expiresAt && new Date(licenseData.expiresAt).getTime() < Date.now())
      return res.status(400).json({ success: false, error: 'Cette clé de licence a expiré' });

    const emailCheck = await db.ref('centers').orderByChild('info/email').equalTo(email).once('value');
    if (emailCheck.exists())
      return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });

    // ── Normalisation du type de licence ──
    // stripe.routes.js stocke `plan` (lowercase) et `type` (label normalisé)
    // license.routes.js stocke `type` (uppercase)
    const rawType     = licenseData.type || licenseData.plan || 'DEMO';
    const licenceType = rawType.toUpperCase()
      .replace('INDÉPENDANT', 'INDEPENDANT')  // normalise accent
      .replace('INDEPENDANT', 'INDEPENDANT');

    const passwordHash = await bcrypt.hash(password, 12);
    const centerId     = licenseData.centerId
      || `center_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const maxFormateurs = licenseData.maxFormateurs || 1;
    const maxStagiaires = licenseData.maxStagiaires || licenseData.maxStagiaires || 10;

    // ── Créer le centre ──
    await db.ref(`centers/${centerId}`).set({
      centerId,
      info: {
        nom, email,
        telephone: telephone || '',
        ville:     ville     || '',
        createdAt: Date.now(),
        isIndependant: licenceType === 'INDEPENDANT',
      },
      auth:    { email, passwordHash, createdAt: Date.now(), lastLogin: null },
      license: {
        key:           licenseKey,
        type:          licenceType,
        expiresAt:     licenseData.expiresAt || null,
        maxFormateurs,
        maxStagiaires,
        activatedAt:   Date.now(),
      },
      stats:  { formateurs: 0, stagiaires: 0, sessions: 0 },
      status: 'active',
    });

    // ── Marquer la licence comme utilisée ──
    await db.ref(`${licenceNode}/${licenseKey}`).update({
      used:        true,
      centerId,
      usedAt:      Date.now(),
      centerNom:   nom,
      centerEmail: email,
    });

    // ══════════════════════════════════════════════════════════════
    // AUTO-CRÉATION FORMATEUR INDÉPENDANT
    // Si la licence est de type INDÉPENDANT et qu'un pinHash a été
    // généré lors de l'activation (stripe.routes.js), on crée
    // automatiquement le formateur unique du centre.
    // ══════════════════════════════════════════════════════════════
    if (licenceType === 'INDEPENDANT' && licenseData.pinHash) {
      const formateurId = `fmt_indep_${centerId}`;
      await db.ref(`centers/${centerId}/formateurs/${formateurId}`).set({
        formateurId,
        nom:           nom,          // nom du centre = nom du formateur indépendant
        prenom:        'Formateur',
        email:         email,
        pinHash:       licenseData.pinHash,
        niveaux:       [1, 2, 3],
        isIndependant: true,
        centerId,
        createdAt:     Date.now(),
        status:        'active',
      });

      // Mettre à jour le compteur formateurs
      await db.ref(`centers/${centerId}/stats/formateurs`).set(1);

      console.log(`👤 Formateur indépendant créé automatiquement : ${formateurId} pour ${centerId}`);
    }

    // ── Email de bienvenue (simple confirmation) ──
    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from:    `"SSIAP Training" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: '✅ Votre compte SSIAP Training est activé',
        html:    `<p>Bienvenue ${nom} ! Votre compte a été créé avec succès.<br>
                  Identifiant centre : <strong>${centerId}</strong></p>`,
      });
    } catch (e) { console.log('Email confirmation non envoyé:', e.message); }

    res.json({
      success:        true,
      centerId,
      nom,
      email,
      licenceType,
      isIndependant:  licenceType === 'INDEPENDANT',
      message:        'Compte créé avec succès',
    });

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
// GET /api/center/list
// - Sans JWT  → infos minimales pour le dropdown formateur
// - Avec JWT  → données enrichies pour le dashboard admin
// ─────────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const snapshot = await db.ref('centers').once('value');
    if (!snapshot.exists()) return res.json({ centers: [], total: 0 });

    // Requête enrichie si Authorization header présent (dashboard admin)
    const isAdmin = !!(req.headers['authorization'] || '').startsWith('Bearer ');

    const centers = [];
    snapshot.forEach(child => {
      const c = child.val();
      if (c.status === 'inactive') return;

      const base = {
        centerId: child.key,
        nom:      c.info?.nom   || '—',
        ville:    c.info?.ville || '',
        license:  { type: c.license?.type || 'DEMO' },
        status:   c.status || 'active',
      };

      if (isAdmin) {
        // Données complètes pour le dashboard admin
        base.info = {
          nom:       c.info?.nom       || '—',
          email:     c.info?.email     || c.auth?.email || null,
          telephone: c.info?.telephone || '',
          ville:     c.info?.ville     || '',
          createdAt: c.info?.createdAt || null,
        };
        base.license = {
          type:          c.license?.type          || 'DEMO',
          expiresAt:     c.license?.expiresAt     || null,
          activatedAt:   c.license?.activatedAt   || c.info?.createdAt || null,
          maxFormateurs: c.license?.maxFormateurs  || 1,
          maxStagiaires: c.license?.maxStagiaires  || 10,
        };
        base.stats = {
          formateurs: c.stats?.formateurs || 0,
          stagiaires: c.stats?.stagiaires || 0,
          sessions:   c.stats?.sessions   || 0,
        };
        base.lastLogin = c.auth?.lastLogin || null;
      }

      centers.push(base);
    });

    res.json({ centers, total: centers.length });
  } catch (err) {
    console.error('Erreur center/list:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// ROUTES PROTÉGÉES — JWT requis
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// ROUTES OTP — Réinitialisation mot de passe avec code email
// À insérer AVANT router.use(verifyCenterToken) dans center.routes.js
// ══════════════════════════════════════════════════════════════

// ── Mailgun helper (réutilise les variables déjà en place) ──
async function sendOtpEmail({ to, code, nomCentre }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
      <div style="background:#1a3a5c;padding:20px 24px;border-radius:10px 10px 0 0">
        <h2 style="color:#fff;margin:0;font-size:20px">🔒 SSIAP Training</h2>
        <p style="color:#90cdf4;margin:4px 0 0;font-size:13px">MIB PRÉVENTION</p>
      </div>
      <div style="background:#f8fafc;padding:28px 24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;border-top:none">
        <p style="font-size:15px;color:#1e1a17;margin-bottom:16px">Bonjour${nomCentre ? ' ' + nomCentre : ''},</p>
        <p style="font-size:14px;color:#6b6760;margin-bottom:20px">Voici votre code de vérification pour réinitialiser votre mot de passe :</p>
        <div style="background:#fff;border:2px solid #1a3a5c;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-family:'Courier New',monospace;font-size:36px;font-weight:700;color:#c25a3a;letter-spacing:10px">${code}</div>
        </div>
        <p style="font-size:13px;color:#8c8078;margin-bottom:8px">⏱️ Ce code est valable <strong>10 minutes</strong>.</p>
        <p style="font-size:13px;color:#8c8078;margin-bottom:8px">🔒 Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#9e9b96">MIB PRÉVENTION — <a href="mailto:contact@mib-prevention.fr" style="color:#c25a3a">contact@mib-prevention.fr</a></p>
      </div>
    </div>`;

  const formData = new URLSearchParams();
  formData.append('from', 'SSIAP Training <contact@mib-prevention.fr>');
  formData.append('to', to);
  formData.append('subject', `🔑 Votre code de vérification SSIAP : ${code}`);
  formData.append('html', html);

  const response = await fetch(
    `https://api.eu.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mailgun OTP error: ${err}`);
  }
}

// ── ÉTAPE 1 : Demande de code OTP ──────────────────────────
// POST /api/center/forgot-password-otp
// Body : { email }
router.post('/forgot-password-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });

  try {
    const snapshot = await db.ref('centers').orderByChild('auth/email').equalTo(email).once('value');

    // Réponse identique que l'email existe ou non (anti-énumération)
    if (!snapshot.exists()) {
      return res.json({ success: true, message: 'Si cet email est enregistré, un code a été envoyé.' });
    }

    let centerId, centerData;
    snapshot.forEach(c => { centerId = c.key; centerData = c.val(); });

    // Générer code 6 chiffres cryptographiquement sûr
    const code = String(parseInt(crypto.randomBytes(3).toString('hex'), 16) % 1000000).padStart(6, '0');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Stocker le code hashé dans Firebase (jamais en clair)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    await db.ref(`centers/${centerId}/auth`).update({
      otpHash:     codeHash,
      otpExpires:  expiresAt,
      otpAttempts: 0,
    });

    // Envoyer l'email
    await sendOtpEmail({
      to:         email,
      code,
      nomCentre:  centerData.info?.nom || '',
    });

    console.log(`📧 OTP envoyé à ${email} pour ${centerId}`);
    res.json({ success: true, message: 'Code envoyé.' });

  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi du code' });
  }
});

// ── ÉTAPE 2 : Vérification du code OTP ─────────────────────
// POST /api/center/verify-otp
// Body : { email, code }
router.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ success: false, error: 'Paramètres manquants' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, error: 'Code invalide' });

  try {
    const snapshot = await db.ref('centers').orderByChild('auth/email').equalTo(email).once('value');
    if (!snapshot.exists()) return res.status(400).json({ success: false, error: 'Email inconnu' });

    let centerId, centerData;
    snapshot.forEach(c => { centerId = c.key; centerData = c.val(); });

    const auth = centerData.auth || {};

    // Vérifier expiration
    if (!auth.otpHash || !auth.otpExpires || Date.now() > auth.otpExpires) {
      return res.status(400).json({ success: false, error: 'Code expiré. Demandez un nouveau code.' });
    }

    // Vérifier tentatives (max 5)
    const attempts = auth.otpAttempts || 0;
    if (attempts >= 5) {
      await db.ref(`centers/${centerId}/auth`).update({ otpHash: null, otpExpires: null });
      return res.status(429).json({ success: false, error: 'Trop de tentatives. Demandez un nouveau code.' });
    }

    // Vérifier le code (comparaison hash)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    if (codeHash !== auth.otpHash) {
      await db.ref(`centers/${centerId}/auth/otpAttempts`).set(attempts + 1);
      const remaining = 5 - (attempts + 1);
      return res.status(400).json({ success: false, error: `Code incorrect. ${remaining} tentative(s) restante(s).` });
    }

    // ✅ Code valide — générer un token de reset à usage unique (valable 15 min)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = Date.now() + 15 * 60 * 1000;

    await db.ref(`centers/${centerId}/auth`).update({
      otpHash:        null,
      otpExpires:     null,
      otpAttempts:    0,
      resetToken,
      resetTokenExpires: resetExpires,
    });

    res.json({ success: true, resetToken, centerId });

  } catch (err) {
    console.error('OTP verify error:', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ── ÉTAPE 3 : Nouveau mot de passe ─────────────────────────
// POST /api/center/reset-password-otp
// Body : { centerId, resetToken, newPassword }
router.post('/reset-password-otp', async (req, res) => {
  const { centerId, resetToken, newPassword } = req.body;
  if (!centerId || !resetToken || !newPassword)
    return res.status(400).json({ success: false, error: 'Paramètres manquants' });
  if (newPassword.length < 8)
    return res.status(400).json({ success: false, error: 'Minimum 8 caractères' });

  try {
    const snap = await db.ref(`centers/${centerId}/auth`).once('value');
    const auth = snap.val();

    if (!auth || auth.resetToken !== resetToken)
      return res.status(400).json({ success: false, error: 'Lien invalide ou déjà utilisé' });
    if (!auth.resetTokenExpires || Date.now() > auth.resetTokenExpires)
      return res.status(400).json({ success: false, error: 'Lien expiré. Recommencez la procédure.' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.ref(`centers/${centerId}/auth`).update({
      passwordHash,
      resetToken:        null,
      resetTokenExpires: null,
      passwordChangedAt: Date.now(),
    });

    console.log(`✅ Mot de passe réinitialisé via OTP pour ${centerId}`);
    res.json({ success: true, message: 'Mot de passe modifié avec succès' });

  } catch (err) {
    console.error('Reset password OTP error:', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

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
  const { nom, telephone, ville, site, adresse, email } = req.body;
  try {
    const updates = {};
    if (nom)      updates['info/nom']       = nom;
    if (telephone !== undefined) updates['info/telephone'] = telephone;
    if (ville     !== undefined) updates['info/ville']     = ville;
    if (site      !== undefined) updates['info/site']      = site;
    if (adresse   !== undefined) updates['info/adresse']   = adresse;
    if (email     !== undefined) updates['info/email']     = email;
    updates['info/updatedAt'] = Date.now();
    await db.ref(`centers/${centerId}`).update(updates);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── Changement mot de passe par le centre lui-même ──
router.post('/change-password', async (req, res) => {
  const { centerId, newPassword } = req.body;
  if (!centerId || !newPassword) return res.status(400).json({ success: false, error: 'Paramètres manquants' });
  if (req.center.centerId !== centerId) return res.status(403).json({ error: 'Accès refusé.' });
  if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Minimum 8 caractères' });
  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.ref(`centers/${centerId}/auth`).update({ passwordHash, passwordChangedAt: Date.now() });
    res.json({ success: true, message: 'Mot de passe modifié' });
  } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur' }); }
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
