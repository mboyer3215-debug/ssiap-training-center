// backend/routes/formateur.routes.js
// Gestion des formateurs : CRUD + login par PIN (centerId+PIN ou email+PIN)

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const admin   = require('firebase-admin');
const db      = admin.database();

// ── Générer un PIN à 4 chiffres unique dans le centre ──
async function generateUniquePin(centerId) {
  let attempts = 0;
  while (attempts < 20) {
    // PIN à 6 chiffres : 1 000 000 combinaisons (standard bancaire)
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const snap = await db.ref(`centers/${centerId}/formateurs`)
      .orderByChild('pin').equalTo(pin).once('value');
    if (!snap.exists()) return pin;
    attempts++;
  }
  throw new Error('Impossible de générer un PIN unique');
}

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/create
// Body: { centerId, nom, prenom, email?, telephone?, niveaux? }
// ══════════════════════════════════════════════════════════════
router.post('/create', async (req, res) => {
  const { centerId, nom, prenom, email, telephone, niveaux } = req.body;

  if (!centerId || !nom || !prenom) {
    return res.status(400).json({ success: false, error: 'centerId, nom et prenom requis' });
  }

  try {
    // Vérifier limite licence
    const centerSnap = await db.ref(`centers/${centerId}`).once('value');
    if (!centerSnap.exists()) {
      return res.status(404).json({ success: false, error: 'Centre non trouvé' });
    }
    const center = centerSnap.val();
    const maxF   = center.license?.maxFormateurs || 1;

    const listSnap = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const count    = listSnap.exists() ? Object.keys(listSnap.val()).length : 0;

    if (count >= maxF && maxF !== 9999) {
      return res.status(403).json({
        success: false,
        error: `Limite atteinte : ${maxF} formateur(s) maximum avec votre licence`
      });
    }

    // Vérifier email unique dans le centre (si fourni)
    if (email) {
      const emailCheck = await db.ref(`centers/${centerId}/formateurs`)
        .orderByChild('email').equalTo(email).once('value');
      if (emailCheck.exists()) {
        return res.status(400).json({ success: false, error: 'Email déjà utilisé dans ce centre' });
      }
    }

    const pin        = await generateUniquePin(centerId);
    const formateurId = `form_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const formateurData = {
      formateurId,
      centerId,
      nom,
      prenom,
      email:      email      || '',
      telephone:  telephone  || '',
      niveaux:    niveaux    || ['SSIAP1', 'SSIAP2', 'SSIAP3'],
      pin,
      createdAt:  Date.now(),
      lastLogin:  null,
      status:     'actif',
      stats:      { sessions: 0, stagiaires: 0 }
    };

    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).set(formateurData);

    // Mettre à jour le compteur du centre
    const newCount = count + 1;
    await db.ref(`centers/${centerId}/stats/formateurs`).set(newCount);

    res.json({
      success:    true,
      formateurId,
      nom,
      prenom,
      pin,
      message:    `Formateur créé — PIN : ${pin}`
    });

  } catch (err) {
    console.error('Erreur création formateur:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/login
// Accepte DEUX méthodes :
//   - { centerId, pin }   → connexion rapide sur site
//   - { email, pin }      → connexion depuis n'importe où
// ══════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  const { centerId, email, pin } = req.body;

  if (!pin || pin.length !== 6) {
    return res.status(400).json({ success: false, error: 'Code PIN à 6 chiffres requis' });
  }
  if (!centerId && !email) {
    return res.status(400).json({ success: false, error: 'Fournir centerId OU email' });
  }

  try {
    let formateurData = null;
    let formCenterId  = centerId;

    if (centerId) {
      // Méthode 1 : centerId + pin
      const snap = await db.ref(`centers/${centerId}/formateurs`)
        .orderByChild('pin').equalTo(pin).once('value');

      if (!snap.exists()) {
        return res.status(401).json({ success: false, error: 'PIN incorrect pour ce centre' });
      }
      snap.forEach(child => { formateurData = { id: child.key, ...child.val() }; });

    } else {
      // Méthode 2 : email + pin → scan tous les centres
      const centersSnap = await db.ref('centers').once('value');
      if (!centersSnap.exists()) {
        return res.status(401).json({ success: false, error: 'Email ou PIN incorrect' });
      }

      centersSnap.forEach(centerChild => {
        if (formateurData) return; // déjà trouvé
        const formateurs = centerChild.val()?.formateurs || {};
        Object.entries(formateurs).forEach(([fid, f]) => {
          if (f.email === email && f.pin === pin) {
            formateurData = { id: fid, ...f };
            formCenterId  = centerChild.key;
          }
        });
      });

      if (!formateurData) {
        return res.status(401).json({ success: false, error: 'Email ou PIN incorrect' });
      }
    }

    // Vérifier statut
    if (formateurData.status === 'inactif' || formateurData.status === 'suspendu') {
      return res.status(403).json({ success: false, error: 'Compte formateur désactivé, contactez votre centre' });
    }

    // Récupérer infos centre
    const centerSnap = await db.ref(`centers/${formCenterId}`).once('value');
    const centerInfo = centerSnap.val()?.info || {};

    // Mettre à jour lastLogin
    await db.ref(`centers/${formCenterId}/formateurs/${formateurData.id}/lastLogin`).set(Date.now());

    res.json({
      success:     true,
      token:       `ftoken_${crypto.randomBytes(16).toString('hex')}`,
      formateurId: formateurData.id,
      nom:         formateurData.nom,
      prenom:      formateurData.prenom,
      email:       formateurData.email || '',
      pin:         formateurData.pin,
      centerId:    formCenterId,
      centerNom:   centerInfo.nom || '—',
      niveaux:     formateurData.niveaux || [],
      stats:       formateurData.stats  || {}
    });

  } catch (err) {
    console.error('Erreur login formateur:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/formateur/list/:centerId
// ══════════════════════════════════════════════════════════════
router.get('/list/:centerId', async (req, res) => {
  const { centerId } = req.params;
  try {
    const snap = await db.ref(`centers/${centerId}/formateurs`).once('value');
    if (!snap.exists()) return res.json({ success: true, formateurs: [] });

    const formateurs = [];
    snap.forEach(child => {
      const f = child.val();
      formateurs.push({
        formateurId: child.key,
        nom:        f.nom,
        prenom:     f.prenom,
        email:      f.email      || '',
        telephone:  f.telephone  || '',
        pin:        f.pin,          // PIN visible au centre pour récupération
        niveaux:    f.niveaux    || [],
        status:     f.status     || 'actif',
        createdAt:  f.createdAt  || null,
        lastLogin:  f.lastLogin  || null,
        stats:      f.stats      || {}
      });
    });

    res.json({ success: true, formateurs, total: formateurs.length });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/formateur/:formateurId
// ══════════════════════════════════════════════════════════════
router.get('/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId } = req.query;

  if (!centerId) return res.status(400).json({ error: 'centerId requis en query' });

  try {
    const snap = await db.ref(`centers/${centerId}/formateurs/${formateurId}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Formateur non trouvé' });

    const f = snap.val();
    res.json({ success: true, formateur: { formateurId, ...f } });

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/formateur/update/:formateurId
// Body: { centerId, nom?, prenom?, email?, telephone?, niveaux?, status? }
// ══════════════════════════════════════════════════════════════
router.put('/update/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId, nom, prenom, email, telephone, niveaux, status } = req.body;

  if (!centerId) return res.status(400).json({ error: 'centerId requis' });

  try {
    const updates = {};
    if (nom)       updates.nom       = nom;
    if (prenom)    updates.prenom    = prenom;
    if (email !== undefined) updates.email = email;
    if (telephone !== undefined) updates.telephone = telephone;
    if (niveaux)   updates.niveaux   = niveaux;
    if (status)    updates.status    = status;

    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).update(updates);
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/regenerate-pin/:formateurId
// Régénère le PIN du formateur (utile si perdu)
// Body: { centerId }
// ══════════════════════════════════════════════════════════════
router.post('/regenerate-pin/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId } = req.body;

  if (!centerId) return res.status(400).json({ error: 'centerId requis' });

  try {
    const newPin = await generateUniquePin(centerId);
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).update({ pin: newPin });
    res.json({ success: true, pin: newPin, message: `Nouveau PIN : ${newPin}` });

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/formateur/delete/:formateurId
// Query: centerId
// ══════════════════════════════════════════════════════════════
router.delete('/delete/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId }    = req.query;

  if (!centerId) return res.status(400).json({ error: 'centerId requis' });

  try {
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).remove();

    // Mettre à jour le compteur
    const listSnap = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const count    = listSnap.exists() ? Object.keys(listSnap.val()).length : 0;
    await db.ref(`centers/${centerId}/stats/formateurs`).set(count);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
// backend/routes/formateur.access.route.js
// À ajouter dans server.js : app.use('/api/formateur', require('./routes/formateur.access.route'));
// (déjà monté sur /api/formateur via formateurRoutes — ajouter à la fin du fichier formateur.routes.js)

const express  = require('express');
const router   = express.Router();
const { db }   = require('../config/firebase');
const FormData = require('form-data');
const Mailgun  = require('mailgun.js');

// ── Config Mailgun (variables d'env existantes) ──────────────
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN  = process.env.MAILGUN_DOMAIN;      // ex: mg.mib-prevention.fr
const MAILGUN_FROM    = process.env.MAILGUN_FROM || `SSIAP Training <noreply@${MAILGUN_DOMAIN}>`;
const APP_URL         = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';

/**
 * POST /api/formateur/send-access
 * Envoie un email HTML d'accès à un formateur via Mailgun
 * Body : { centerId, formateurId }
 * Auth : JWT centre
 */
router.post('/send-access', async (req, res) => {
  try {
    const { centerId, formateurId } = req.body;
    if (!centerId || !formateurId) {
      return res.status(400).json({ error: 'centerId et formateurId requis' });
    }

    // Récupérer les données du formateur depuis Firebase
    const fSnap = await db.ref(`centers/${centerId}/formateurs/${formateurId}`).once('value');
    if (!fSnap.exists()) {
      return res.status(404).json({ error: 'Formateur introuvable' });
    }
    const f = fSnap.val();

    if (!f.email) {
      return res.status(400).json({ error: 'Ce formateur n\'a pas d\'adresse email enregistrée' });
    }

    // Récupérer les données du centre
    const cSnap = await db.ref(`centers/${centerId}`).once('value');
    const centre = cSnap.val() || {};
    const centreNom = centre.nom || centre.info?.nom || centerId;

    const nom      = [f.prenom, f.nom].filter(Boolean).join(' ') || 'Formateur';
    const pin      = f.pin || f.code || '——';
    const loginUrl = `${APP_URL}/formateur/formateur-login.html?centreId=${centerId}`;
    const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(loginUrl)}&bgcolor=ffffff&color=1e1a17&margin=10`;

    // ── Email HTML ───────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Accès SSIAP Training</title></head>
<body style="margin:0;padding:0;background:#f7f4f0;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4f0;padding:30px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#c25a3a,#aa4a2c);padding:28px 32px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">🔥</div>
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700">SSIAP Training</h1>
          <p style="color:rgba(255,255,255,.8);font-size:13px;margin:4px 0 0">${centreNom}</p>
        </td></tr>

        <!-- Bonjour -->
        <tr><td style="padding:28px 32px 0">
          <p style="font-size:16px;color:#1e1a17;margin:0 0 8px">Bonjour <strong>${nom}</strong>,</p>
          <p style="font-size:14px;color:#4a4340;margin:0;line-height:1.6">
            Voici vos informations de connexion au tableau de bord formateur.
          </p>
        </td></tr>

        <!-- PIN -->
        <tr><td style="padding:20px 32px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2ee;border:2px solid #c25a3a;border-radius:12px">
            <tr><td style="padding:18px;text-align:center">
              <p style="font-size:11px;color:#8c8078;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Code PIN de connexion</p>
              <p style="font-family:'Courier New',monospace;font-size:40px;font-weight:700;color:#c25a3a;letter-spacing:12px;margin:0">${pin}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- QR Code -->
        <tr><td style="padding:0 32px;text-align:center">
          <p style="font-size:13px;color:#8c8078;margin:0 0 12px">Scannez le QR code pour accéder au dashboard</p>
          <img src="${qrUrl}" width="160" height="160" alt="QR Code" style="border-radius:10px;border:1px solid #e8e2db">
        </td></tr>

        <!-- Bouton -->
        <tr><td style="padding:20px 32px;text-align:center">
          <a href="${loginUrl}" style="display:inline-block;background:#c25a3a;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:9px;text-decoration:none">
            🚀 Accéder au dashboard formateur
          </a>
        </td></tr>

        <!-- Instructions -->
        <tr><td style="padding:0 32px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4f0;border-radius:10px">
            <tr><td style="padding:16px">
              <p style="font-size:11px;color:#8c8078;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px">Instructions</p>
              <ol style="margin:0;padding-left:18px;font-size:13px;color:#4a4340;line-height:1.8">
                <li>Cliquez sur le bouton ci-dessus ou scannez le QR code</li>
                <li>Sélectionnez le centre : <strong>${centreNom}</strong></li>
                <li>Entrez votre PIN : <strong style="color:#c25a3a;font-size:15px">${pin}</strong></li>
              </ol>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f0ece7;padding:16px 32px;text-align:center;border-top:1px solid #e8e2db">
          <p style="font-size:11px;color:#8c8078;margin:0">
            Cet email a été envoyé par <strong>${centreNom}</strong> via SSIAP Training.<br>
            <a href="${loginUrl}" style="color:#c25a3a;font-size:10px">${loginUrl}</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

    // ── Envoi via Mailgun ────────────────────────────────────
    const mailgun = new Mailgun(FormData);
    const mg      = mailgun.client({ username: 'api', key: MAILGUN_API_KEY, url: 'https://api.eu.mailgun.net' }); // EU endpoint

    await mg.messages.create(MAILGUN_DOMAIN, {
      from:    MAILGUN_FROM,
      to:      [f.email],
      subject: `Accès SSIAP Training — ${centreNom}`,
      html,
      text: `Bonjour ${nom},\n\nVoici vos informations de connexion.\n\nCentre : ${centreNom}\nCode PIN : ${pin}\nLien : ${loginUrl}\n\nCordialement,\n${centreNom}`,
    });

    console.log(`[send-access] Email envoyé à ${f.email} (formateur: ${formateurId})`);
    res.json({ success: true, message: `Email envoyé à ${f.email}` });

  } catch (error) {
    console.error('[send-access] Erreur:', error.message);
    // Erreur Mailgun spécifique
    if (error.status === 400 || error.status === 401) {
      return res.status(500).json({ error: 'Erreur configuration Mailgun', detail: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports = router;
