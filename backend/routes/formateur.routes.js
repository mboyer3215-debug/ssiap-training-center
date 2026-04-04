// backend/routes/formateur.routes.js
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');  // pure JS — pas de compilation native requise
const jwt     = require('jsonwebtoken');
const admin   = require('firebase-admin');
const db      = admin.database();

// ── Config Mailgun ──────────────────────────────────────────
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN  = process.env.MAILGUN_DOMAIN;
const MAILGUN_FROM    = process.env.MAILGUN_FROM || `SSIAP Training <noreply@${MAILGUN_DOMAIN}>`;
const APP_URL         = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';

// ── Générer un PIN à 6 chiffres unique dans le centre ──
async function generateUniquePin(centerId) {
  let attempts = 0;
  while (attempts < 20) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const snap = await db.ref(`centers/${centerId}/formateurs`)
      .orderByChild('pin').equalTo(pin).once('value');
    if (!snap.exists()) return pin;
    attempts++;
  }
  throw new Error('Impossible de générer un PIN unique');
}

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/activate-independant
// Première connexion d'un formateur indépendant.
// Vérifie la clé de licence + PIN → crée le centre + formateur
// → retourne un JWT prêt à l'emploi.
// ⚠️  Doit rester AVANT tout middleware d'authentification.
// ══════════════════════════════════════════════════════════════
router.post('/activate-independant', async (req, res) => {
  const { licenceKey, pin } = req.body;

  if (!licenceKey || !pin)
    return res.status(400).json({ success: false, error: 'Clé de licence et PIN requis' });
  if (!/^\d{6}$/.test(pin))
    return res.status(400).json({ success: false, error: 'PIN invalide (6 chiffres requis)' });

  try {
    // ── 1. Lire la licence ──
    const licSnap = await db.ref(`licences/${licenceKey.toUpperCase()}`).once('value');
    if (!licSnap.exists())
      return res.status(404).json({ success: false, error: 'Clé de licence invalide ou inexistante' });

    const lic = licSnap.val();

    if (!lic.isIndependant)
      return res.status(400).json({ success: false, error: "Cette clé n'est pas une licence INDÉPENDANT" });

    if (lic.used && lic.centerId)
      return res.status(409).json({
        success: false,
        error: 'Cette licence est déjà activée. Connectez-vous avec votre PIN.',
        alreadyActivated: true,
        centerId: lic.centerId,
      });

    if (!lic.actif)
      return res.status(403).json({ success: false, error: 'Licence désactivée. Contactez l\'administrateur.' });

    if (lic.expiresAt && new Date(lic.expiresAt).getTime() < Date.now())
      return res.status(403).json({ success: false, error: 'Licence expirée.' });

    // ── 2. Vérifier le PIN ──
    // stripe.routes.js stocke le PIN en clair dans lic.pinClear (no bcrypt côté Stripe)
    // On compare directement, puis on le hashe ici avec bcryptjs pour le formateur.
    if (!lic.pinClear)
      return res.status(500).json({ success: false, error: 'Licence corrompue (PIN manquant) — contactez l\'administrateur' });

    if (String(lic.pinClear) !== String(pin))
      return res.status(401).json({ success: false, error: 'Code PIN incorrect pour cette clé de licence' });

    // Hash bcryptjs (pure JS — pas de module natif)
    const pinHash = await bcrypt.hash(pin, 10);
    console.log(`[formateur] activate-independant: PIN OK, pinHash longueur=${pinHash.length}`);

    // ── 3. Créer le centre INDÉPENDANT ──
    const centerId    = `center_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const formateurId = `fmt_indep_${centerId}`;
    const now         = Date.now();

    await db.ref(`centers/${centerId}`).set({
      centerId,
      info: {
        nom:           lic.nomCentre,
        email:         lic.email,
        telephone:     '',
        ville:         '',
        createdAt:     now,
        isIndependant: true,
      },
      license: {
        key:           licenceKey.toUpperCase(),
        type:          'INDEPENDANT',
        expiresAt:     lic.expiresAt || null,
        maxFormateurs: lic.maxFormateurs || 1,
        maxStagiaires: lic.maxStagiaires || 20,
        activatedAt:   now,
      },
      stats:  { formateurs: 1, stagiaires: 0, sessions: 0 },
      status: 'active',
    });

    // ── 4. Créer le formateur avec pinHash (bcryptjs) ──
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).set({
      formateurId,
      centerId,
      nom:           lic.nomCentre,
      prenom:        'Formateur',
      email:         lic.email,
      pinHash,                        // hash bcryptjs créé à l'activation
      niveaux:       [1, 2, 3],
      isIndependant: true,
      createdAt:     now,
      lastLogin:     now,
      status:        'actif',
      stats:         { sessions: 0, stagiaires: 0 },
    });

    // ── 5. Marquer la licence utilisée + effacer le PIN en clair ──
    await db.ref(`licences/${licenceKey.toUpperCase()}`).update({
      used:        true,
      centerId,
      usedAt:      now,
      centerNom:   lic.nomCentre,
      centerEmail: lic.email,
    });
    // Effacer le PIN en clair — inutilisable après la première activation
    await db.ref(`licences/${licenceKey.toUpperCase()}/pinClear`).remove();

    console.log(`✅ Licence INDÉPENDANT activée : ${licenceKey} → ${centerId}`);
    console.log(`🗑️  pinClear effacé de Firebase pour ${licenceKey}`);

    // ── 6. Générer JWT (même format que /login) ──
    const token = jwt.sign(
      { formateurId, centerId, role: 'formateur', isIndependant: true },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    return res.json({
      success:      true,
      token,
      formateurId,
      centerId,
      nom:          lic.nomCentre,
      prenom:       'Formateur',
      email:        lic.email,
      centerNom:    lic.nomCentre,
      niveaux:      [1, 2, 3],
      isFirstLogin: true,
      message:      '🎉 Licence activée ! Bienvenue sur SSIAP Training.',
    });

  } catch (err) {
    console.error('activate-independant error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/create
// ══════════════════════════════════════════════════════════════
router.post('/create', async (req, res) => {
  const { centerId, nom, prenom, email, telephone, niveaux } = req.body;

  if (!centerId || !nom || !prenom)
    return res.status(400).json({ success: false, error: 'centerId, nom et prenom requis' });

  try {
    const centerSnap = await db.ref(`centers/${centerId}`).once('value');
    if (!centerSnap.exists())
      return res.status(404).json({ success: false, error: 'Centre non trouvé' });

    const center = centerSnap.val();
    const maxF   = center.license?.maxFormateurs || 1;

    const listSnap = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const count    = listSnap.exists() ? Object.keys(listSnap.val()).length : 0;

    if (count >= maxF && maxF !== 9999)
      return res.status(403).json({
        success: false,
        error: `Limite atteinte : ${maxF} formateur(s) maximum avec votre licence`,
      });

    if (email) {
      const emailCheck = await db.ref(`centers/${centerId}/formateurs`)
        .orderByChild('email').equalTo(email).once('value');
      if (emailCheck.exists())
        return res.status(400).json({ success: false, error: 'Email déjà utilisé dans ce centre' });
    }

    const pin         = await generateUniquePin(centerId);
    const formateurId = `form_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const formateurData = {
      formateurId,
      centerId,
      nom,
      prenom,
      email:     email     || '',
      telephone: telephone || '',
      niveaux:   niveaux   || ['SSIAP1', 'SSIAP2', 'SSIAP3'],
      pin,                          // PIN en clair pour les formateurs non-indépendants
      createdAt: Date.now(),
      lastLogin: null,
      status:    'actif',
      stats:     { sessions: 0, stagiaires: 0 },
    };

    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).set(formateurData);
    await db.ref(`centers/${centerId}/stats/formateurs`).set(count + 1);

    res.json({ success: true, formateurId, nom, prenom, pin, message: `Formateur créé — PIN : ${pin}` });

  } catch (err) {
    console.error('Erreur création formateur:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/login
// Supporte deux modes :
//   • formateurs classiques  : champ `pin` (clair) stocké en Firebase
//   • formateurs INDÉPENDANT : champ `pinHash` (bcrypt)
// ══════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  const { centerId, email, pin } = req.body;

  if (!pin || pin.length !== 6)
    return res.status(400).json({ success: false, error: 'Code PIN à 6 chiffres requis' });
  if (!centerId && !email)
    return res.status(400).json({ success: false, error: 'Fournir centerId OU email' });

  try {
    let formateurData = null;
    let formCenterId  = centerId;

    if (centerId) {
      const formateursSnap = await db.ref(`centers/${centerId}/formateurs`).once('value');

      if (!formateursSnap.exists())
        return res.status(401).json({ success: false, error: 'PIN incorrect pour ce centre' });

      // Chercher parmi tous les formateurs du centre
      const checks = [];
      formateursSnap.forEach(child => {
        const f = child.val();
        checks.push({ key: child.key, data: f });
      });

      for (const { key, data: f } of checks) {
        let match = false;
        if (f.pinHash) {
          // Formateur INDÉPENDANT → comparaison bcrypt
          match = await bcrypt.compare(pin, f.pinHash);
        } else if (f.pin) {
          // Formateur classique → comparaison directe
          match = (f.pin === pin);
        }
        if (match) {
          formateurData = { id: key, ...f };
          break;
        }
      }

      if (!formateurData)
        return res.status(401).json({ success: false, error: 'PIN incorrect pour ce centre' });

    } else {
      // Recherche par email sur tous les centres
      const centersSnap = await db.ref('centers').once('value');
      if (!centersSnap.exists())
        return res.status(401).json({ success: false, error: 'Email ou PIN incorrect' });

      const centreList = [];
      centersSnap.forEach(c => centreList.push({ key: c.key, val: c.val() }));

      for (const { key: ckey, val: cval } of centreList) {
        if (formateurData) break;
        const formateurs = cval?.formateurs || {};
        for (const [fid, f] of Object.entries(formateurs)) {
          if (f.email !== email) continue;
          let match = false;
          if (f.pinHash) match = await bcrypt.compare(pin, f.pinHash);
          else if (f.pin) match = (f.pin === pin);
          if (match) { formateurData = { id: fid, ...f }; formCenterId = ckey; break; }
        }
      }

      if (!formateurData)
        return res.status(401).json({ success: false, error: 'Email ou PIN incorrect' });
    }

    if (formateurData.status === 'inactif' || formateurData.status === 'suspendu')
      return res.status(403).json({ success: false, error: 'Compte formateur désactivé, contactez votre centre' });

    const centerSnap = await db.ref(`centers/${formCenterId}`).once('value');
    const centerInfo = centerSnap.val()?.info || {};

    await db.ref(`centers/${formCenterId}/formateurs/${formateurData.id}/lastLogin`).set(Date.now());

    // JWT signé (remplace l'ancien token aléatoire non vérifiable)
    const token = jwt.sign(
      { formateurId: formateurData.id, centerId: formCenterId, role: 'formateur' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    return res.json({
      success:     true,
      token,
      formateurId: formateurData.id,
      nom:         formateurData.nom,
      prenom:      formateurData.prenom,
      email:       formateurData.email || '',
      centerId:    formCenterId,
      centerNom:   centerInfo.nom || '—',
      niveaux:     formateurData.niveaux || [],
      stats:       formateurData.stats   || {},
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
        formateurId:   child.key,
        nom:           f.nom,
        prenom:        f.prenom,
        email:         f.email      || '',
        telephone:     f.telephone  || '',
        // Ne jamais exposer pinHash ; pour les indépendants, pin est masqué
        pin:           f.pinHash ? '••••••' : (f.pin || ''),
        isIndependant: f.isIndependant || false,
        niveaux:       f.niveaux    || [],
        status:        f.status     || 'actif',
        actif:         f.status !== 'inactif',
        createdAt:     f.createdAt  || null,
        lastLogin:     f.lastLogin  || null,
        stats:         f.stats      || {},
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
    // Masquer pinHash
    const { pinHash: _, ...safe } = f;
    res.json({ success: true, formateur: { formateurId, ...safe } });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/formateur/update/:formateurId
// ══════════════════════════════════════════════════════════════
router.put('/update/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId, nom, prenom, email, telephone, niveaux, status, actif } = req.body;
  if (!centerId) return res.status(400).json({ error: 'centerId requis' });
  try {
    const updates = {};
    if (nom       !== undefined) updates.nom       = nom;
    if (prenom    !== undefined) updates.prenom    = prenom;
    if (email     !== undefined) updates.email     = email;
    if (telephone !== undefined) updates.telephone = telephone;
    if (niveaux   !== undefined) updates.niveaux   = niveaux;
    if (status    !== undefined) updates.status    = status;
    if (actif     !== undefined) updates.status    = actif ? 'actif' : 'inactif';
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/regenerate-pin/:formateurId
// ══════════════════════════════════════════════════════════════
router.post('/regenerate-pin/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId } = req.body;
  if (!centerId) return res.status(400).json({ error: 'centerId requis' });
  try {
    const snap = await db.ref(`centers/${centerId}/formateurs/${formateurId}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Formateur non trouvé' });
    const f = snap.val();

    if (f.isIndependant)
      return res.status(403).json({ error: 'Le PIN d\'un formateur indépendant ne peut pas être régénéré depuis ici.' });

    const newPin = await generateUniquePin(centerId);
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).update({ pin: newPin });
    res.json({ success: true, pin: newPin, message: `Nouveau PIN : ${newPin}` });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/formateur/delete/:formateurId
// ══════════════════════════════════════════════════════════════
router.delete('/delete/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId }    = req.query;
  if (!centerId) return res.status(400).json({ error: 'centerId requis' });
  try {
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).remove();
    const listSnap = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const count    = listSnap.exists() ? Object.keys(listSnap.val()).length : 0;
    await db.ref(`centers/${centerId}/stats/formateurs`).set(count);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/formateur/send-access
// ══════════════════════════════════════════════════════════════
router.post('/send-access', async (req, res) => {
  try {
    const { centerId, formateurId } = req.body;
    if (!centerId || !formateurId)
      return res.status(400).json({ error: 'centerId et formateurId requis' });

    const fSnap = await db.ref(`centers/${centerId}/formateurs/${formateurId}`).once('value');
    if (!fSnap.exists()) return res.status(404).json({ error: 'Formateur introuvable' });
    const f = fSnap.val();

    if (!f.email) return res.status(400).json({ error: "Ce formateur n'a pas d'adresse email" });
    if (f.isIndependant)
      return res.status(400).json({ error: "Le PIN d'un formateur indépendant ne peut pas être envoyé par email (déjà reçu lors de l'activation de la licence)." });

    const cSnap     = await db.ref(`centers/${centerId}`).once('value');
    const centre    = cSnap.val() || {};
    const centreNom = centre.nom || centre.info?.nom || centerId;
    const nom       = [f.prenom, f.nom].filter(Boolean).join(' ') || 'Formateur';
    const pin       = f.pin || '——';
    const loginUrl  = `${APP_URL}/center/formateur-login.html`;
    const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(loginUrl)}&bgcolor=ffffff&color=1e1a17&margin=10`;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Accès SSIAP Training</title></head>
<body style="margin:0;padding:0;background:#f7f4f0;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;background:#f7f4f0">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)">
  <tr><td style="background:linear-gradient(135deg,#c25a3a,#aa4a2c);padding:28px 32px;text-align:center">
    <div style="font-size:32px;margin-bottom:8px">🔥</div>
    <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700">SSIAP Training</h1>
    <p style="color:rgba(255,255,255,.8);font-size:13px;margin:4px 0 0">${centreNom}</p>
  </td></tr>
  <tr><td style="padding:28px 32px 0">
    <p style="font-size:16px;color:#1e1a17;margin:0 0 8px">Bonjour <strong>${nom}</strong>,</p>
    <p style="font-size:14px;color:#4a4340;margin:0;line-height:1.6">Voici vos informations de connexion au tableau de bord formateur.</p>
  </td></tr>
  <tr><td style="padding:20px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2ee;border:2px solid #c25a3a;border-radius:12px">
      <tr><td style="padding:18px;text-align:center">
        <p style="font-size:11px;color:#8c8078;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Code PIN de connexion</p>
        <p style="font-family:'Courier New',monospace;font-size:40px;font-weight:700;color:#c25a3a;letter-spacing:12px;margin:0">${pin}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 32px;text-align:center">
    <p style="font-size:13px;color:#8c8078;margin:0 0 12px">Scannez le QR code pour accéder au dashboard</p>
    <img src="${qrUrl}" width="160" height="160" alt="QR Code" style="border-radius:10px;border:1px solid #e8e2db">
  </td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <a href="${loginUrl}" style="display:inline-block;background:#c25a3a;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:9px;text-decoration:none">
      🚀 Accéder au dashboard formateur
    </a>
  </td></tr>
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
  <tr><td style="background:#f0ece7;padding:16px 32px;text-align:center;border-top:1px solid #e8e2db">
    <p style="font-size:11px;color:#8c8078;margin:0">Email envoyé par <strong>${centreNom}</strong> via SSIAP Training</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    const formData = new URLSearchParams();
    formData.append('from',    MAILGUN_FROM);
    formData.append('to',      f.email);
    formData.append('subject', `Accès SSIAP Training — ${centreNom}`);
    formData.append('html',    html);
    formData.append('text',    `Bonjour ${nom},\n\nCentre : ${centreNom}\nCode PIN : ${pin}\nLien : ${loginUrl}\n\nCordialement,\n${centreNom}`);

    const mgRes = await fetch(`https://api.eu.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64'),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!mgRes.ok) {
      const err = await mgRes.text();
      console.error('[send-access] Mailgun error:', err);
      return res.status(500).json({ error: 'Erreur Mailgun : ' + err });
    }

    console.log(`[send-access] Email envoyé à ${f.email}`);
    res.json({ success: true, message: `Email envoyé à ${f.email}` });

  } catch (error) {
    console.error('[send-access] Erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
