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
const quizSalleRoutes = require('./routes/quizsalle.routes');
const adminQuestionsRoutes = require('./routes/admin_questions.routes');
const adminAuthRoutes = require('./routes/admin.auth.routes');

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, '..');

// ── Sécurité CORS ──
const ALLOWED_ORIGINS = [
  'https://ssiap-training-center.onrender.com',
  'http://localhost:3000',
  'http://localhost:10000',
];
app.use(cors({
  origin: function(origin, callback) {
    // Autoriser les requêtes sans origin (Postman, mobile natif, même domaine)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS : origine non autorisée'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body size limité à 1 Mo (évite les payloads géants) ──
app.use(express.json({ limit: '1mb' }));

// ── Fichiers statiques (uniquement les dossiers publics) ──
app.use(express.static(path.join(ROOT, 'stagiaire')));
app.use(express.static(path.join(ROOT, 'formateur')));
app.use(express.static(path.join(ROOT, 'admin')));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/api/qcm', qcmRoutes);
app.use('/api/stagiaire', stagiaireRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/entrainement', entrainementRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/center', centerRoutes);
app.use('/api/formateur', formateurRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api', demandesAvisRoutes);
app.use('/api/quiz', quizSalleRoutes);
app.use('/api/admin/auth', adminAuthRoutes);   // ← public : login
app.use('/api/admin', adminQuestionsRoutes);   // ← protégé : JWT requis
// Route santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// ── Pages HTML ──
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/admin/:page', (req, res) => res.sendFile(path.join(ROOT, 'admin', req.params.page)));
app.get('/center/:page', (req, res) => res.sendFile(path.join(ROOT, 'center', req.params.page)));
app.get('/formateur/:page', (req, res) => res.sendFile(path.join(ROOT, 'formateur', req.params.page)));
app.get('/stagiaire/:page', (req, res) => res.sendFile(path.join(ROOT, 'stagiaire', req.params.page)));
// Démarrer serveur
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`✅ Serveur SSIAP ENTRAÎNEMENT lancé sur port ${PORT}`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log('='.repeat(60));
});
module.exports = app;
