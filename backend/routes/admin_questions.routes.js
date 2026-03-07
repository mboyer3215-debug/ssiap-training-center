// routes/admin-questions.routes.js
// CRUD questions Firebase pour l'interface admin

const express = require('express');
const router  = express.Router();
const { db }  = require('../config/firebase');

// Vérification admin simple (à renforcer avec ton système auth)
async function checkAdmin(adminId) {
  if (!adminId) return false;
  try {
    const snap = await db.ref(`admins/${adminId}`).once('value');
    return snap.exists();
  } catch(e) { return false; }
}

// ── GET /api/admin/questions/:niveau ──────────────────────────────────────
// Liste toutes les questions d'un niveau
router.get('/questions/:niveau', async (req, res) => {
  const niveau   = parseInt(req.params.niveau);
  const adminId  = req.query.adminId || '';

  if (![1,2,3].includes(niveau)) return res.json({ success:false, error:'Niveau invalide' });

  try {
    const snap = await db.ref(`questions/${niveau}`).once('value');
    const raw  = snap.val() || {};
    const questions = Object.entries(raw).map(([id, d]) => ({
      id,
      type:           d.type || 'quiz',
      question:       d.question || d.texte || '',
      scenario:       d.scenario || d.contexte || '',
      options:        d.options || d.propositions || [],
      correctAnswers: Array.isArray(d.correctAnswers)   ? d.correctAnswers.map(Number)
                    : Array.isArray(d.reponse_correcte)  ? d.reponse_correcte.map(Number)
                    : [0],
      explanation:    typeof d.explanation === 'string' ? d.explanation
                    : (d.explanation?.complete || d.explanation?.simple || d.explication || ''),
      partie:         d.partie || d.partieId || 'partie1',
    }));

    res.json({ success:true, niveau, count:questions.length, questions });
  } catch(e) {
    res.json({ success:false, error:e.message });
  }
});

// ── POST /api/admin/questions/save ────────────────────────────────────────
// Créer ou modifier une question
router.post('/questions/save', async (req, res) => {
  const { adminId, niveau, questionId, data } = req.body;

  if (![1,2,3].includes(niveau)) return res.json({ success:false, error:'Niveau invalide' });
  if (!data || !data.question) return res.json({ success:false, error:'question requise' });

  try {
    const questionData = {
      type:           data.type || 'quiz',
      question:       data.question.trim(),
      options:        data.options || [],
      correctAnswers: data.correctAnswers || [0],
      explanation:    data.explanation || '',
      partie:         data.partie || 'partie1',
      updatedAt:      Date.now(),
    };

    if (data.scenario) questionData.scenario = data.scenario.trim();

    let ref;
    if (questionId) {
      // Modification
      ref = db.ref(`questions/${niveau}/${questionId}`);
      await ref.update(questionData);
    } else {
      // Création — générer un nouvel ID
      questionData.createdAt = Date.now();
      ref = db.ref(`questions/${niveau}`).push();
      await ref.set(questionData);
    }

    res.json({ success:true, questionId: questionId || ref.key });
  } catch(e) {
    res.json({ success:false, error:e.message });
  }
});

// ── POST /api/admin/questions/delete ─────────────────────────────────────
// Supprimer une question
router.post('/questions/delete', async (req, res) => {
  const { adminId, niveau, questionId } = req.body;

  if (!questionId) return res.json({ success:false, error:'questionId requis' });
  if (![1,2,3].includes(niveau)) return res.json({ success:false, error:'Niveau invalide' });

  try {
    await db.ref(`questions/${niveau}/${questionId}`).remove();
    res.json({ success:true });
  } catch(e) {
    res.json({ success:false, error:e.message });
  }
});

module.exports = router;