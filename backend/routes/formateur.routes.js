// backend/routes/formateur.routes.js
// Gestion des formateurs par centre

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'ssiap_secret_key_2025';

/**
 * POST /api/formateur/create
 * Créer un formateur (admin centre)
 */
router.post('/create', async (req, res) => {
  try {
    const { centerId, nom, prenom, email, password } = req.body;
    
    if (!centerId || !nom || !prenom || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tous les champs sont requis' 
      });
    }
    
    // Vérifier que le centre existe
    const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
    const centerData = centerSnapshot.val();
    
    if (!centerData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Centre introuvable' 
      });
    }
    
    // Vérifier limite formateurs
    const formateursSnapshot = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const formateurs = formateursSnapshot.val() || {};
    const nbFormateurs = Object.keys(formateurs).length;
    
    if (nbFormateurs >= centerData.license.maxFormateurs) {
      return res.status(403).json({ 
        success: false, 
        error: `Limite atteinte : ${centerData.license.maxFormateurs} formateurs maximum` 
      });
    }
    
    // Vérifier que l'email n'existe pas déjà
    const existingFormateurs = Object.values(formateurs);
    if (existingFormateurs.some(f => f.email === email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cet email est déjà utilisé' 
      });
    }
    
    // Générer PIN unique (4 chiffres)
    let pin = generateUniquePIN(existingFormateurs);
    
    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Créer ID formateur
    const formateurId = `form_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Créer formateur
    const formateurData = {
      formateurId,
      centerId,
      nom: nom.toUpperCase(),
      prenom: prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase(),
      email,
      password: hashedPassword,
      pin,
      role: 'formateur',
      createdAt: Date.now(),
      status: 'actif'
    };
    
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).set(formateurData);
    
    console.log(`✅ Formateur créé: ${formateurData.nom} ${formateurData.prenom} (PIN: ${pin})`);
    
    // Retourner sans le password
    const { password: _, ...formateurResponse } = formateurData;
    
    res.json({
      success: true,
      formateur: formateurResponse
    });
    
  } catch (error) {
    console.error('Erreur création formateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/formateur/list/:centerId
 * Liste des formateurs d'un centre
 */
router.get('/list/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    
    const formateursSnapshot = await db.ref(`centers/${centerId}/formateurs`).once('value');
    const formateurs = formateursSnapshot.val() || {};
    
    // Retirer les passwords
    const formateursList = Object.values(formateurs).map(f => {
      const { password, ...rest } = f;
      return rest;
    });
    
    res.json({
      success: true,
      formateurs: formateursList
    });
    
  } catch (error) {
    console.error('Erreur liste formateurs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/formateur/:formateurId
 * Détails d'un formateur
 */
router.get('/:formateurId', async (req, res) => {
  try {
    const { formateurId } = req.params;
    const { centerId } = req.query;
    
    const formateurSnapshot = await db.ref(`centers/${centerId}/formateurs/${formateurId}`).once('value');
    const formateurData = formateurSnapshot.val();
    
    if (!formateurData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Formateur introuvable' 
      });
    }
    
    // Retirer le password
    const { password, ...formateur } = formateurData;
    
    // Compter ses stagiaires
    const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
    const stagiaires = stagiairesSnapshot.val() || {};
    const mesStagiaires = Object.values(stagiaires).filter(s => s.formateurId === formateurId);
    
    res.json({
      success: true,
      formateur: {
        ...formateur,
        nbStagiaires: mesStagiaires.length
      }
    });
    
  } catch (error) {
    console.error('Erreur détails formateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/formateur/update/:formateurId
 * Modifier un formateur
 */
router.put('/update/:formateurId', async (req, res) => {
  try {
    const { formateurId } = req.params;
    const { centerId, nom, prenom, email, password } = req.body;
    
    const updates = {};
    if (nom) updates.nom = nom.toUpperCase();
    if (prenom) updates.prenom = prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase();
    if (email) updates.email = email;
    if (password) {
      updates.password = await bcrypt.hash(password, 10);
    }
    
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).update(updates);
    
    console.log(`✅ Formateur modifié: ${formateurId}`);
    
    res.json({ success: true, message: 'Formateur mis à jour' });
    
  } catch (error) {
    console.error('Erreur modification formateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/formateur/delete/:formateurId
 * Supprimer un formateur
 */
router.delete('/delete/:formateurId', async (req, res) => {
  try {
    const { formateurId } = req.params;
    const { centerId } = req.query;
    
    // Vérifier s'il a des stagiaires
    const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
    const stagiaires = stagiairesSnapshot.val() || {};
    const mesStagiaires = Object.values(stagiaires).filter(s => s.formateurId === formateurId);
    
    if (mesStagiaires.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Ce formateur a ${mesStagiaires.length} stagiaire(s). Réattribuez-les d'abord.` 
      });
    }
    
    await db.ref(`centers/${centerId}/formateurs/${formateurId}`).remove();
    
    console.log(`✅ Formateur supprimé: ${formateurId}`);
    
    res.json({ success: true, message: 'Formateur supprimé' });
    
  } catch (error) {
    console.error('Erreur suppression formateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/formateur/login
 * Connexion formateur (email+password OU PIN)
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, pin } = req.body;
    
    if (pin) {
      // Connexion par PIN
      return loginByPIN(pin, res);
    } else {
      // Connexion par email + password
      return loginByEmail(email, password, res);
    }
    
  } catch (error) {
    console.error('Erreur connexion formateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Générer un PIN unique à 4 chiffres
 */
function generateUniquePIN(existingFormateurs) {
  let pin;
  let exists = true;
  
  while (exists) {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    exists = existingFormateurs.some(f => f.pin === pin);
  }
  
  return pin;
}

/**
 * Connexion par email + password
 */
async function loginByEmail(email, password, res) {
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email et mot de passe requis' 
    });
  }
  
  // Chercher le formateur dans tous les centres
  const centersSnapshot = await db.ref('centers').once('value');
  const centers = centersSnapshot.val();
  
  let formateurFound = null;
  let centerFound = null;
  
  for (const [centerId, center] of Object.entries(centers)) {
    if (center.formateurs) {
      for (const formateur of Object.values(center.formateurs)) {
        if (formateur.email === email) {
          formateurFound = formateur;
          centerFound = centerId;
          break;
        }
      }
    }
    if (formateurFound) break;
  }
  
  if (!formateurFound) {
    return res.status(404).json({ 
      success: false, 
      error: 'Email non trouvé' 
    });
  }
  
  // Vérifier mot de passe
  const validPassword = await bcrypt.compare(password, formateurFound.password);
  
  if (!validPassword) {
    return res.status(401).json({ 
      success: false, 
      error: 'Mot de passe incorrect' 
    });
  }
  
  // Vérifier licence du centre
  const centerData = centers[centerFound];
  const now = Date.now();
  const isExpired = now > centerData.license.endDate;
  
  if (isExpired || centerData.license.status !== 'active') {
    return res.status(403).json({ 
      success: false, 
      error: 'Licence du centre expirée',
      expired: true
    });
  }
  
  // Générer token JWT
  const token = jwt.sign(
    { 
      formateurId: formateurFound.formateurId,
      centerId: centerFound,
      email,
      role: 'formateur'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  console.log(`✅ Connexion formateur: ${formateurFound.nom} ${formateurFound.prenom}`);
  
  const { password: _, ...formateurResponse } = formateurFound;
  
  return res.json({
    success: true,
    token,
    formateur: formateurResponse,
    center: {
      centerId: centerFound,
      nom: centerData.info.nom
    }
  });
}

/**
 * Connexion par PIN
 */
async function loginByPIN(pin, res) {
  if (!pin || pin.length !== 4) {
    return res.status(400).json({ 
      success: false, 
      error: 'PIN invalide (4 chiffres requis)' 
    });
  }
  
  // Chercher le formateur par PIN dans tous les centres
  const centersSnapshot = await db.ref('centers').once('value');
  const centers = centersSnapshot.val();
  
  let formateurFound = null;
  let centerFound = null;
  
  for (const [centerId, center] of Object.entries(centers)) {
    if (center.formateurs) {
      for (const formateur of Object.values(center.formateurs)) {
        if (formateur.pin === pin) {
          formateurFound = formateur;
          centerFound = centerId;
          break;
        }
      }
    }
    if (formateurFound) break;
  }
  
  if (!formateurFound) {
    return res.status(404).json({ 
      success: false, 
      error: 'PIN incorrect' 
    });
  }
  
  // Vérifier licence du centre
  const centerData = centers[centerFound];
  const now = Date.now();
  const isExpired = now > centerData.license.endDate;
  
  if (isExpired || centerData.license.status !== 'active') {
    return res.status(403).json({ 
      success: false, 
      error: 'Licence du centre expirée',
      expired: true
    });
  }
  
  // Générer token JWT
  const token = jwt.sign(
    { 
      formateurId: formateurFound.formateurId,
      centerId: centerFound,
      pin,
      role: 'formateur'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  console.log(`✅ Connexion formateur (PIN): ${formateurFound.nom} ${formateurFound.prenom}`);
  
  const { password: _, ...formateurResponse } = formateurFound;
  
  return res.json({
    success: true,
    token,
    formateur: formateurResponse,
    center: {
      centerId: centerFound,
      nom: centerData.info.nom
    }
  });
}

module.exports = router;