// backend/server.js - VERSION 2 avec Entraînement + Licences + Formateurs
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const qcmRoutes = require('./routes/qcm.routes');
const stagiaireRoutes = require('./routes/stagiaire.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const entrainementRoutes = require('./routes/entrainement.routes');
const licenseRoutes = require('./routes/license.routes');
const centerRoutes = require('./routes/center.routes');
const formateurRoutes = require('./routes/formateur.routes');
const sessionRoutes = require('./routes/session.routes');
const demandesAvisRoutes = require('./routes/demandes_avis.routes');
    
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/qcm', qcmRoutes);
app.use('/api/stagiaire', stagiaireRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/entrainement', entrainementRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/center', centerRoutes);
app.use('/api/formateur', formateurRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api', demandesAvisRoutes);

// Route santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server SSIAP Entraînement running',
    timestamp: new Date().toISOString()
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'API SSIAP Training Center - VERSION MULTI-TENANT',
    version: '2.1',
    endpoints: {
      health: '/api/health',
      entrainement: {
        config: 'GET /api/entrainement/config/:niveau',
        start: 'POST /api/entrainement/start',
        answer: 'POST /api/entrainement/answer',
        finish: 'POST /api/entrainement/finish'
      },
      license: {
        generate: 'POST /api/license/generate',
        verify: 'POST /api/license/verify',
        types: 'GET /api/license/types',
        renew: 'PUT /api/license/renew/:centerId'
      },
      center: {
        register: 'POST /api/center/register',
        login: 'POST /api/center/login',
        dashboard: 'GET /api/center/dashboard/:centerId',
        update: 'PUT /api/center/update/:centerId'
      },
      formateur: {
        create: 'POST /api/formateur/create',
        list: 'GET /api/formateur/list/:centerId',
        details: 'GET /api/formateur/:formateurId',
        update: 'PUT /api/formateur/update/:formateurId',
        delete: 'DELETE /api/formateur/delete/:formateurId',
        login: 'POST /api/formateur/login'
      },
      qcm: {
        start: 'POST /api/qcm/start',
        answer: 'POST /api/qcm/answer',
        finish: 'POST /api/qcm/finish',
        history: 'GET /api/qcm/history/:userId'
      },
      stagiaires: {
        create: 'POST /api/stagiaires',
        list: 'GET /api/stagiaires',
        detail: 'GET /api/stagiaires/:userId',
        progression: 'GET /api/stagiaires/:userId/progression',
        alertes: 'GET /api/stagiaires/alerte/list'
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats',
        questionsDifficiles: 'GET /api/dashboard/questions-difficiles',
        tableau: 'GET /api/dashboard/stagiaires-tableau',
        statistiques: 'GET /api/dashboard/statistiques-globales',
        evolution: 'GET /api/dashboard/evolution?jours=7',
        synthese: 'GET /api/dashboard/synthese'
      }
    }
  });
});

// Démarrer serveur
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`✅ Serveur SSIAP ENTRAÎNEMENT lancé sur port ${PORT}`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('📋 Endpoints disponibles:');
  console.log('   - Entraînement: /api/entrainement/* (NOUVEAU)');
  console.log('   - QCM: /api/qcm/*');
  console.log('   - Stagiaires: /api/stagiaires/*');
  console.log('   - Dashboard: /api/dashboard/*');
  console.log('   - Licences: /api/license/*');
  console.log('   - Centres: /api/center/*');
  console.log('   - Formateurs: /api/formateur/* ← NOUVEAU');
  console.log('='.repeat(60));
});

module.exports = app;