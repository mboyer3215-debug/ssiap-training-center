// backend/routes/center.routes.js
// Gestion complète des centres : register, login, dashboard, reset password

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const admin   = require('firebase-admin');
const db      = admin.database();

// ── Utilitaire email (SMTP déjà configuré dans le projet) ──
const nodemailer = require('nodemailer');
function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ionos.fr',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// ══════════════════════════════════════════════════════════════
// POST /api/center/register
// Créer un compte centre avec une clé de licence
// Body: { licenseKey, nom, email, password, telephone?, ville? }
// ══════════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  const { licenseKey, nom, email, password, telephone, ville } = req.body;

  if (!licenseKey || !nom || !email || !password) {
    return res.status(400).json({ success: false, error: 'Champs requis : licenseKey, nom, email, password' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Mot de passe minimum 8 caractères' });
  }

  try {
    // 1. Trouver la licence
    const licSnapshot = await db.ref(`licenses/${licenseKey}`).once('value');
    const licenseData = licSnapshot.val();
    if (!licenseData) {
    return res.status(400).json({ success: false, error: 'Clé de licence invalide' });
    }
    const licenseId = licenseKey;

    // 2. Vérifier que la licence est disponible
    if (licenseData.used && licenseData.centerId) {
      return res.status(400).json({ success: false, error: 'Cette clé de licence est déjà utilisée' });
    }
    if (licenseData.expiresAt && licenseData.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, error: 'Cette clé de licence a expiré' });
    }

    // 3. Vérifier email unique
    const emailCheck = await db.ref('centers').orderByChild('info/email').equalTo(email).once('value');
    if (emailCheck.exists()) {
      return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
    }

    // 4. Hasher le mot de passe
    const passwordHash = await bcrypt.hash(password, 12);

    // 5. Créer le centre dans Firebase
    const centerId = licenseData.centerId || `center_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const centerData = {
      centerId,
      info: {
        nom,
        email,
        telephone:  telephone || '',
        ville:      ville || '',
        createdAt:  Date.now()
      },
      auth: {
        email,
        passwordHash,
        createdAt: Date.now(),
        lastLogin: null
      },
      license: {
        key:            licenseKey,
        type:           licenseData.type || 'DEMO',
        expiresAt:      licenseData.expiresAt || null,
        maxFormateurs:  licenseData.maxFormateurs || 1,
        maxStagiaires:  licenseData.maxStagiaires || 10,
        activatedAt:    Date.now()
      },
      stats: { formateurs: 0, stagiaires: 0, sessions: 0 },
      status: 'active'
    };

    await db.ref(`centers/${centerId}`).set(centerData);

    // 6. Marquer la licence comme utilisée
    await db.ref(`licenses/${licenseId}`).update({
      used:      true,
      centerId,
      usedAt:    Date.now(),
      centerNom: nom,
      centerEmail: email
    });

    // 7. Email de bienvenue (optionnel, ne bloque pas si SMTP absent)
    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `"SSIAP Training" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '✅ Votre compte SSIAP Training est créé',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
            <h2 style="color:#c25a3a">🔥 Bienvenue sur SSIAP Training !</h2>
            <p>Votre compte centre <strong>${nom}</strong> a été créé avec succès.</p>
            <div style="background:#fdf0eb;border-radius:8px;padding:16px;margin:20px 0">
              <p><strong>Email de connexion :</strong> ${email}</p>
              <p><strong>ID Centre :</strong> ${centerId}</p>
              <p><strong>Licence :</strong> ${licenseData.type || 'DEMO'}</p>
            </div>
            <a href="https://ssiap-training.netlify.app/center/center-login.html"
               style="display:inline-block;background:#c25a3a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
              Se connecter →
            </a>
            <p style="margin-top:24px;font-size:12px;color:#999">
              Si vous n'êtes pas à l'origine de cette création, contactez-nous immédiatement.
            </p>
          </div>
        `
      });
    } catch (mailErr) {
      console.log('Email bienvenue non envoyé (SMTP non configuré):', mailErr.message);
    }

    res.json({
      success:     true,
      centerId,
      nom,
      email,
      licenseType: licenseData.type || 'DEMO',
      message:     'Compte créé avec succès'
    });

  } catch (err) {
    console.error('Erreur register centre:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur lors de la création du compte' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/center/login
// Body: { email, password }
// ══════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
  }

  try {
    // Trouver le centre par email
    const snapshot = await db.ref('centers').orderByChild('auth/email').equalTo(email).once('value');
    if (!snapshot.exists()) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    let centerData;
    snapshot.forEach(child => { centerData = { id: child.key, ...child.val() }; });

    if (!centerData?.auth?.passwordHash) {
      return res.status(401).json({ success: false, error: 'Compte non initialisé, contactez l\'administrateur' });
    }

    // Vérifier le mot de passe
    const valid = await bcrypt.compare(password, centerData.auth.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    // Vérifier statut
    if (centerData.status === 'inactive') {
      return res.status(403).json({ success: false, error: 'Compte désactivé, contactez l\'administrateur' });
    }

    // Vérifier licence
    const licExp = centerData.license?.expiresAt;
    const licOk  = !licExp || licExp > Date.now();

    // Mettre à jour lastLogin
    await db.ref(`centers/${centerData.id}/auth`).update({ lastLogin: Date.now() });

    res.json({
      success:   true,
      centerId:  centerData.id,
      nom:       centerData.info?.nom || '—',
      email:     centerData.auth.email,
      license: {
        type:           centerData.license?.type || 'DEMO',
        expiresAt:      licExp,
        active:         licOk,
        maxFormateurs:  centerData.license?.maxFormateurs || 1,
        maxStagiaires:  centerData.license?.maxStagiaires || 10,
      }
    });

  } catch (err) {
    console.error('Erreur login centre:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/center/forgot-password
// Envoie un lien de réinitialisation par email
// Body: { email }
// ══════════════════════════════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });

  try {
    const snapshot = await db.ref('centers').orderByChild('auth/email').equalTo(email).once('value');
    
    // Réponse toujours positive pour éviter l'énumération d'emails
    if (!snapshot.exists()) {
      return res.json({ success: true, message: 'Si cet email existe, un lien a été envoyé' });
    }

    let centerId, centerData;
    snapshot.forEach(c => { centerId = c.key; centerData = c.val(); });

    // Générer token de reset
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 3600000; // 1 heure

    await db.ref(`centers/${centerId}/auth`).update({ resetToken: token, resetTokenExpires: expiresAt });

    const resetUrl = `https://ssiap-training.netlify.app/center/center-reset-password.html?token=${token}&id=${centerId}`;

    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `"SSIAP Training" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🔑 Réinitialisation de votre mot de passe SSIAP Training',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
            <h2 style="color:#c25a3a">🔥 SSIAP Training</h2>
            <p>Vous avez demandé la réinitialisation du mot de passe pour <strong>${centerData.info?.nom || email}</strong>.</p>
            <p style="margin:16px 0">Cliquez sur le bouton ci-dessous dans l'heure qui suit :</p>
            <a href="${resetUrl}"
               style="display:inline-block;background:#c25a3a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
              Réinitialiser mon mot de passe →
            </a>
            <p style="margin-top:20px;font-size:12px;color:#999">
              Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.
            </p>
            <p style="font-size:11px;color:#bbb">Lien : ${resetUrl}</p>
          </div>
        `
      });
      res.json({ success: true, message: 'Email de réinitialisation envoyé' });
    } catch (mailErr) {
      console.error('Erreur envoi email reset:', mailErr.message);
      // En cas d'échec SMTP, retourner le token en dev
      if (process.env.NODE_ENV !== 'production') {
        res.json({ success: true, debug_token: token, debug_id: centerId, message: 'SMTP non dispo — token en réponse (dev uniquement)' });
      } else {
        res.status(500).json({ success: false, error: 'Erreur envoi email, contactez l\'administrateur' });
      }
    }

  } catch (err) {
    console.error('Erreur forgot-password:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/center/reset-password
// Body: { centerId, token, newPassword }
// ══════════════════════════════════════════════════════════════
router.post('/reset-password', async (req, res) => {
  const { centerId, token, newPassword } = req.body;
  if (!centerId || !token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Paramètres manquants' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'Mot de passe minimum 8 caractères' });
  }

  try {
    const snapshot = await db.ref(`centers/${centerId}/auth`).once('value');
    const auth = snapshot.val();

    if (!auth || auth.resetToken !== token) {
      return res.status(400).json({ success: false, error: 'Lien invalide ou déjà utilisé' });
    }
    if (auth.resetTokenExpires < Date.now()) {
      return res.status(400).json({ success: false, error: 'Lien expiré, faites une nouvelle demande' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.ref(`centers/${centerId}/auth`).update({
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
      passwordChangedAt: Date.now()
    });

    res.json({ success: true, message: 'Mot de passe modifié avec succès' });

  } catch (err) {
    console.error('Erreur reset-password:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/center/admin-reset-password
// Reset forcé par l'admin (sans token)
// Body: { centerId, newPassword }
// ══════════════════════════════════════════════════════════════
router.post('/admin-reset-password', async (req, res) => {
  const { centerId, newPassword } = req.body;
  if (!centerId || !newPassword) {
    return res.status(400).json({ success: false, error: 'centerId et newPassword requis' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Minimum 6 caractères' });
  }
  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.ref(`centers/${centerId}/auth`).update({
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
      passwordChangedAt: Date.now(),
      resetByAdmin: true
    });
    res.json({ success: true, message: `Mot de passe réinitialisé pour ${centerId}` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/center/list
// Liste tous les centres (admin)
// ══════════════════════════════════════════════════════════════
router.get('/list', async (req, res) => {
  try {
    const snapshot = await db.ref('centers').once('value');
    if (!snapshot.exists()) return res.json({ centers: [] });

    const centers = [];
    snapshot.forEach(child => {
      const c = child.val();
      centers.push({
        centerId:  child.key,
        info: {
          nom:       c.info?.nom || '—',
          email:     c.info?.email || c.auth?.email || '—',
          telephone: c.info?.telephone || '',
          ville:     c.info?.ville || '',
          createdAt: c.info?.createdAt || c.auth?.createdAt || null
        },
        license: {
          type:          c.license?.type || 'DEMO',
          expiresAt:     c.license?.expiresAt || null,
          maxFormateurs: c.license?.maxFormateurs || 1,
          maxStagiaires: c.license?.maxStagiaires || 10,
          activatedAt:   c.license?.activatedAt || null
        },
        stats:     c.stats  || { formateurs: 0, stagiaires: 0, sessions: 0 },
        status:    c.status || 'active',
        lastLogin: c.auth?.lastLogin || null
        // NB: passwordHash intentionnellement exclus
      });
    });

    res.json({ centers, total: centers.length });

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/center/dashboard/:centerId
// ══════════════════════════════════════════════════════════════
router.get('/dashboard/:centerId', async (req, res) => {
  const { centerId } = req.params;
  try {
    const snapshot = await db.ref(`centers/${centerId}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Centre non trouvé' });
    }
    const c = snapshot.val();
    res.json({
      centerId,
      nom:   c.info?.nom || '—',
      email: c.info?.email || c.auth?.email || '—',
      info:  c.info || {},
      license: {
        type:          c.license?.type || 'DEMO',
        expiresAt:     c.license?.expiresAt || null,
        active:        !c.license?.expiresAt || c.license.expiresAt > Date.now(),
        maxFormateurs: c.license?.maxFormateurs || 1,
        maxStagiaires: c.license?.maxStagiaires || 10,
      },
      stats:  c.stats  || {},
      status: c.status || 'active'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/center/update/:centerId
// Mettre à jour les infos du centre
// ══════════════════════════════════════════════════════════════
router.put('/update/:centerId', async (req, res) => {
  const { centerId } = req.params;
  const { nom, telephone, ville } = req.body;
  try {
    const updates = {};
    if (nom)       updates['info/nom']       = nom;
    if (telephone) updates['info/telephone'] = telephone;
    if (ville)     updates['info/ville']     = ville;
    await db.ref(`centers/${centerId}`).update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
