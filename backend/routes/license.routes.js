// backend/routes/license.routes.js
// Gestion des licences et centres de formation

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const crypto = require('crypto');

// Types de licences
const LICENSE_TYPES = {
  DEMO: {
    name: 'DEMO',
    duration: 7, // jours
    maxFormateurs: 1,
    maxStagiaires: 10,
    price: 0,
    features: []
  },
  STARTER: {
    name: 'STARTER',
    duration: 30,
    maxFormateurs: 2,
    maxStagiaires: 50,
    price: 49,
    features: ['export_csv']
  },
  PRO: {
    name: 'PRO',
    duration: 30,
    maxFormateurs: 5,
    maxStagiaires: 200,
    price: 99,
    features: ['export_csv', 'statistiques_avancees', 'import_csv']
  },
  BUSINESS: {
    name: 'BUSINESS',
    duration: 365,
    maxFormateurs: 10,
    maxStagiaires: 500,
    price: 999,
    features: ['export_csv', 'statistiques_avancees', 'import_csv', 'multi_formateurs', 'api_access']
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    duration: 365,
    maxFormateurs: 999,
    maxStagiaires: 9999,
    price: null, // Sur devis
    features: ['all']
  }
};

/**
 * POST /api/license/generate
 * Générer une nouvelle licence (ADMIN ONLY)
 */
router.post('/generate', async (req, res) => {
  try {
    const { centerName, email, type } = req.body;
    
    if (!centerName || !email || !type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nom du centre, email et type de licence requis' 
      });
    }
    
    if (!LICENSE_TYPES[type]) {
      return res.status(400).json({ 
        success: false, 
        error: 'Type de licence invalide' 
      });
    }
    
    // Générer clé de licence unique
    const licenseKey = generateLicenseKey();
    
    // Créer ID centre
    const centerId = `center_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Dates de validité
    const startDate = Date.now();
    const endDate = startDate + (LICENSE_TYPES[type].duration * 24 * 60 * 60 * 1000);
    
    // Créer centre dans Firebase
    const centerData = {
      centerId,
      info: {
        nom: centerName,
        email,
        createdAt: startDate
      },
      license: {
        licenseKey,
        type,
        startDate,
        endDate,
        status: 'active',
        maxFormateurs: LICENSE_TYPES[type].maxFormateurs,
        maxStagiaires: LICENSE_TYPES[type].maxStagiaires,
        features: LICENSE_TYPES[type].features
      },
      stats: {
        nbFormateurs: 0,
        nbStagiaires: 0,
        nbSessions: 0
      }
    };
    
    await db.ref(`centers/${centerId}`).set(centerData);
    
    // Enregistrer la licence
    await db.ref(`licenses/${licenseKey}`).set({
      centerId,
      generatedAt: startDate,
      activatedAt: startDate,
      type,
      status: 'active'
    });
    
    console.log(`✅ Licence générée: ${licenseKey} pour ${centerName}`);
    
    res.json({
      success: true,
      license: {
        licenseKey,
        centerId,
        type,
        validUntil: new Date(endDate).toLocaleDateString('fr-FR'),
        maxFormateurs: LICENSE_TYPES[type].maxFormateurs,
        maxStagiaires: LICENSE_TYPES[type].maxStagiaires
      }
    });
    
  } catch (error) {
    console.error('Erreur génération licence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/license/verify
 * Vérifier validité d'une licence
 */
router.post('/verify', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Clé de licence requise' 
      });
    }
    
    // Récupérer info licence
    const licenseSnapshot = await db.ref(`licenses/${licenseKey}`).once('value');
    const licenseData = licenseSnapshot.val();
    
    if (!licenseData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Licence introuvable' 
      });
    }
    
    // Récupérer info centre
    const centerSnapshot = await db.ref(`centers/${licenseData.centerId}`).once('value');
    const centerData = centerSnapshot.val();
    
    if (!centerData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Centre introuvable' 
      });
    }
    
    // Vérifier validité
    const now = Date.now();
    const isExpired = now > centerData.license.endDate;
    const status = isExpired ? 'expired' : centerData.license.status;
    
    // Mettre à jour statut si expiré
    if (isExpired && centerData.license.status === 'active') {
      await db.ref(`centers/${licenseData.centerId}/license/status`).set('expired');
      await db.ref(`licenses/${licenseKey}/status`).set('expired');
    }
    
    res.json({
      success: true,
      valid: status === 'active',
      center: {
        centerId: licenseData.centerId,
        nom: centerData.info.nom,
        email: centerData.info.email
      },
      license: {
        type: centerData.license.type,
        status,
        startDate: new Date(centerData.license.startDate).toLocaleDateString('fr-FR'),
        endDate: new Date(centerData.license.endDate).toLocaleDateString('fr-FR'),
        daysRemaining: Math.max(0, Math.ceil((centerData.license.endDate - now) / (24 * 60 * 60 * 1000))),
        maxFormateurs: centerData.license.maxFormateurs,
        maxStagiaires: centerData.license.maxStagiaires,
        features: centerData.license.features
      },
      stats: centerData.stats
    });
    
  } catch (error) {
    console.error('Erreur vérification licence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/license/types
 * Liste des types de licences disponibles
 */
router.get('/types', (req, res) => {
  try {
    const types = Object.keys(LICENSE_TYPES).map(key => ({
      type: key,
      ...LICENSE_TYPES[key]
    }));
    
    res.json({ success: true, types });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/license/renew/:centerId
 * Renouveler une licence
 */
router.put('/renew/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    const { type, duration } = req.body; // duration en jours
    
    const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
    const centerData = centerSnapshot.val();
    
    if (!centerData) {
      return res.status(404).json({ success: false, error: 'Centre introuvable' });
    }
    
    const licenseType = LICENSE_TYPES[type] || LICENSE_TYPES[centerData.license.type];
    const durationDays = duration || licenseType.duration;
    
    const now = Date.now();
    const newEndDate = now + (durationDays * 24 * 60 * 60 * 1000);
    
    // Mettre à jour licence
    await db.ref(`centers/${centerId}/license`).update({
      status: 'active',
      endDate: newEndDate,
      renewedAt: now
    });
    
    await db.ref(`licenses/${centerData.license.licenseKey}`).update({
      status: 'active',
      renewedAt: now
    });
    
    console.log(`✅ Licence renouvelée pour ${centerData.info.nom}`);
    
    res.json({
      success: true,
      license: {
        status: 'active',
        validUntil: new Date(newEndDate).toLocaleDateString('fr-FR')
      }
    });
    
  } catch (error) {
    console.error('Erreur renouvellement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Générer une clé de licence unique
 * Format: SSIAP-XXXX-XXXX-XXXX
 */
function generateLicenseKey() {
  const segments = [];
  for (let i = 0; i < 3; i++) {
    const segment = crypto.randomBytes(2).toString('hex').toUpperCase();
    segments.push(segment);
  }
  return `SSIAP-${segments.join('-')}`;
}

module.exports = router;