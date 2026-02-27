// backend/routes/center.routes.js
// Gestion des centres de formation (clients)

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ssiap_secret_key_2025';

/**
 * POST /api/center/register
 * Inscription d'un nouveau centre (création compte admin)
 */
router.post('/register', async (req, res) => {
  try {
    const { licenseKey, email, password, nom, prenom } = req.body;
    
    if (!licenseKey || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Licence, email et mot de passe requis' 
      });
    }
    
    // Vérifier que la licence existe et est valide
    const licenseSnapshot = await db.ref(`licenses/${licenseKey}`).once('value');
    const licenseData = licenseSnapshot.val();
    
    if (!licenseData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Clé de licence invalide' 
      });
    }
    
    const centerId = licenseData.centerId;
    
    // Vérifier que le centre existe
    const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
    const centerData = centerSnapshot.val();
    
    if (!centerData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Centre introuvable' 
      });
    }
    
    // Vérifier que le centre n'a pas déjà un admin
    const adminSnapshot = await db.ref(`centers/${centerId}/admin`).once('value');
    if (adminSnapshot.exists()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ce centre a déjà un administrateur' 
      });
    }
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Créer admin du centre
    const adminData = {
      email,
      password: hashedPassword,
      nom: nom || '',
      prenom: prenom || '',
      role: 'admin_centre',
      createdAt: Date.now()
    };
    
    await db.ref(`centers/${centerId}/admin`).set(adminData);
    
    // Générer token JWT
    const token = jwt.sign(
      { centerId, email, role: 'admin_centre' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log(`✅ Admin centre créé: ${email} pour ${centerData.info.nom}`);
    
    res.json({
      success: true,
      token,
      center: {
        centerId,
        nom: centerData.info.nom,
        license: centerData.license
      }
    });
    
  } catch (error) {
    console.error('Erreur inscription centre:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/center/login
 * Connexion admin centre
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, licenseKey } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email et mot de passe requis' 
      });
    }
    
    let centerId;
    
    // Si licenseKey fournie, trouver le centre via la licence
    if (licenseKey) {
      const licenseSnapshot = await db.ref(`licenses/${licenseKey}`).once('value');
      const licenseData = licenseSnapshot.val();
      
      if (!licenseData) {
        return res.status(404).json({ 
          success: false, 
          error: 'Licence invalide' 
        });
      }
      
      centerId = licenseData.centerId;
    } else {
      // Sinon, chercher le centre par email admin
      const centersSnapshot = await db.ref('centers').once('value');
      const centers = centersSnapshot.val();
      
      let found = false;
      for (const [id, center] of Object.entries(centers)) {
        if (center.admin && center.admin.email === email) {
          centerId = id;
          found = true;
          break;
        }
      }
      
      if (!found) {
        return res.status(404).json({ 
          success: false, 
          error: 'Email non trouvé' 
        });
      }
    }
    
    // Récupérer données centre
    const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
    const centerData = centerSnapshot.val();
    
    if (!centerData || !centerData.admin) {
      return res.status(404).json({ 
        success: false, 
        error: 'Centre ou admin introuvable' 
      });
    }
    
    // Vérifier mot de passe
    const validPassword = await bcrypt.compare(password, centerData.admin.password);
    
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Mot de passe incorrect' 
      });
    }
    
    // Vérifier licence active
    const now = Date.now();
    const isExpired = now > centerData.license.endDate;
    
    if (isExpired || centerData.license.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        error: 'Licence expirée. Veuillez renouveler votre abonnement.',
        expired: true
      });
    }
    
    // Générer token JWT
    const token = jwt.sign(
      { centerId, email, role: 'admin_centre' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log(`✅ Connexion admin: ${email} - ${centerData.info.nom}`);
    
    res.json({
      success: true,
      token,
      center: {
        centerId,
        nom: centerData.info.nom,
        email: centerData.info.email,
        license: {
          type: centerData.license.type,
          status: centerData.license.status,
          validUntil: new Date(centerData.license.endDate).toLocaleDateString('fr-FR'),
          daysRemaining: Math.ceil((centerData.license.endDate - now) / (24 * 60 * 60 * 1000)),
          maxFormateurs: centerData.license.maxFormateurs,
          maxStagiaires: centerData.license.maxStagiaires,
          features: centerData.license.features
        },
        stats: centerData.stats || { nbFormateurs: 0, nbStagiaires: 0, nbSessions: 0 }
      }
    });
    
  } catch (error) {
    console.error('Erreur connexion centre:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/center/dashboard/:centerId
 * Récupérer données dashboard centre
 */
router.get('/dashboard/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    
    const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
    const centerData = centerSnapshot.val();
    
    if (!centerData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Centre introuvable' 
      });
    }
    
    // Compter formateurs actifs
    const formateursSnapshot = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const formateurs = formateursSnapshot.val() || {};
    const nbFormateurs = Object.keys(formateurs).length;
    
    // Compter stagiaires actifs
    const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
    const stagiaires = stagiairesSnapshot.val() || {};
    const nbStagiaires = Object.keys(stagiaires).filter(id => {
      const stag = stagiaires[id];
      return stag.status === 'actif' && Date.now() < stag.dateFin;
    }).length;
    
    // Compter sessions
    const sessionsSnapshot = await db.ref(`centers/${centerId}/sessions`).once('value');
    const sessions = sessionsSnapshot.val() || {};
    const nbSessions = Object.keys(sessions).length;
    
    // Mettre à jour stats
    await db.ref(`centers/${centerId}/stats`).set({
      nbFormateurs,
      nbStagiaires,
      nbSessions,
      lastUpdate: Date.now()
    });
    
    const now = Date.now();
    const daysRemaining = Math.max(0, Math.ceil((centerData.license.endDate - now) / (24 * 60 * 60 * 1000)));
    
    res.json({
      success: true,
      center: {
        nom: centerData.info.nom,
        email: centerData.info.email
      },
      license: {
        type: centerData.license.type,
        status: centerData.license.status,
        validUntil: new Date(centerData.license.endDate).toLocaleDateString('fr-FR'),
        daysRemaining,
        maxFormateurs: centerData.license.maxFormateurs,
        maxStagiaires: centerData.license.maxStagiaires,
        features: centerData.license.features
      },
      stats: {
        nbFormateurs,
        nbStagiaires,
        nbSessions,
        usageFormateurs: `${nbFormateurs}/${centerData.license.maxFormateurs}`,
        usageStagiaires: `${nbStagiaires}/${centerData.license.maxStagiaires}`
      },
      formateurs: Object.values(formateurs),
      stagiaires: Object.values(stagiaires).filter(s => s.status === 'actif')
    });
    
  } catch (error) {
    console.error('Erreur dashboard centre:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/center/update/:centerId
 * Mettre à jour infos centre
 */
router.put('/update/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    const { nom, email, telephone, adresse } = req.body;
    
    const updates = {};
    if (nom) updates.nom = nom;
    if (email) updates.email = email;
    if (telephone) updates.telephone = telephone;
    if (adresse) updates.adresse = adresse;
    
    await db.ref(`centers/${centerId}/info`).update(updates);
    
    res.json({ success: true, message: 'Centre mis à jour' });
    
  } catch (error) {
    console.error('Erreur mise à jour centre:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;