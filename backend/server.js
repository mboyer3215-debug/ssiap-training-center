const express = require('express');
const cors = require('cors');
const path = require('path');
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
const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, '..');

// Middleware
app.use(cors());
app.use(express.json());

// ── Fichiers statiques ──
app.use(express.static(ROOT));

// Routes API
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
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ── Pages HTML ──
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/admin/:page', (req, res) => res.sendFile(path.join(ROOT, 'admin', req.params.page)));
app.get('/center/:page', (req, res) => res.sendFile(path.join(ROOT, 'center', req.params.page)));
app.get('/formateur/:page', (req, res) => res.sendFile(path.join(ROOT, 'formateur', req.params.page)));

// Démarrer serveur
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`✅ Serveur SSIAP ENTRAÎNEMENT lancé sur port ${PORT}`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log('='.repeat(60));
});

module.exports = app;
