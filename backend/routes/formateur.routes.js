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

module.exports = router;