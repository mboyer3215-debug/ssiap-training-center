// backend/routes/entrainement.routes-local.js
// VERSION LOCALE - SANS FIREBASE

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-local');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const { db } = require('../config/firebase');
const { CENTER_DEFAULT, NOMBRE_QUESTIONS_OPTIONS } = require('../config/constants');
const constants = require('../config/constants');

/**
 * GET /api/entrainement/config/:niveau
 */
router.get('/config/:niveau', (req, res) => {
  try {
    const niveau = parseInt(req.params.niveau);
    if (![1, 2, 3].includes(niveau)) {
      return res.status(400).json({ error: 'Niveau invalide' });
    }
    const parties = constants.getPartiesByNiveau(niveau);
    res.json({
      success: true,
      config: { niveau, parties, nombresQuestions: NOMBRE_QUESTIONS_OPTIONS }
    });
  } catch (error) {
    console.error('Erreur config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/start
 */
router.post('/start', async (req, res) => {
  try {
    const { userId, niveau, partieId, nbQuestions } = req.body;
    if (!userId || !niveau) {
      return res.status(400).json({ error: 'userId et niveau requis' });
    }

    const niveauInt = parseInt(niveau);
    const nbQuestionsInt = parseInt(nbQuestions) || 30;

    const snapshot = await db.ref(`centers/${CENTER_DEFAULT}/questions/${niveauInt}`).once('value');
    const allQuestions = snapshot.val() || {};
    console.log(`   📊 Questions Firebase niveau ${niveauInt}:`, Object.keys(allQuestions).length);

    let questionsArray = Object.entries(allQuestions).map(([id, data]) => ({
      id,
      question: data.question || '',
      options: data.options || data.propositions || [],
      correctAnswers: (data.correctAnswers || data.reponse_correcte || []).map(Number),
      explanation: data.explanation || { complete: '', references: [] },
      partie: data.partie || 'partie1'
    }));

    if (partieId && partieId !== 'toutes') {
      const filtered = questionsArray.filter(q => q.partie === partieId);
      if (filtered.length > 0) {
        questionsArray = filtered;
        console.log(`   ✅ Filtré par ${partieId}: ${filtered.length} questions`);
      } else {
        console.log(`   ⚠️  Aucune question avec partie=${partieId}, toutes utilisées`);
      }
    }

    const shuffled = questionsArray.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(nbQuestionsInt, questionsArray.length));
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sessionData = {
      sessionId,
      centerId: CENTER_DEFAULT,
      userId,
      niveau: niveauInt,
      partieId: partieId || 'toutes',
      nbQuestionsRequested: nbQuestionsInt,
      questions: selected.map(q => q.id),
      answers: {},
      startedAt: Date.now(),
      status: 'en_cours',
      type: 'entrainement'
    };

    fs.writeFileSync(path.join(DATA_DIR, `${sessionId}.json`), JSON.stringify(sessionData, null, 2));
    console.log(`✅ Session créée LOCALEMENT: ${sessionId}`);

    res.json({
      success: true,
      sessionId,
      niveau: niveauInt,
      partieId: partieId || 'toutes',
      nbQuestions: selected.length,
      questions: selected
    });

  } catch (error) {
    console.error('Erreur démarrage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/answer
 */
router.post('/answer', (req, res) => {
  try {
    const { sessionId, questionId, answers } = req.body;
    const sessionFile = path.join(DATA_DIR, `${sessionId}.json`);

    if (!fs.existsSync(sessionFile)) {
      return res.status(404).json({ error: 'Session introuvable' });
    }

    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    if (!session.answers) session.answers = {};

    // Stocker toujours comme nombres
    session.answers[questionId] = {
      selected: (answers || []).map(Number),
      timestamp: Date.now()
    };

    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
    res.json({ success: true });

  } catch (error) {
    console.error('Erreur sauvegarde réponse:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/finish
 */
router.post('/finish', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const sessionFile = path.join(DATA_DIR, `${sessionId}.json`);

    if (!fs.existsSync(sessionFile)) {
      return res.status(404).json({ error: 'Session introuvable' });
    }

    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    const { niveau, questions: questionIds, answers } = session;

    const questionsSnapshot = await db.ref(`centers/${CENTER_DEFAULT}/questions/${niveau}`).once('value');
    const allQuestions = questionsSnapshot.val();

    let score = 0;
    const total = questionIds.length;
    const details = [];

    for (const questionId of questionIds) {
      const question = allQuestions[questionId];
      if (!question) continue;

      // ── Normaliser en nombres ──
      const userAnswer = (answers[questionId]?.selected || []).map(Number);
      const correctAnswers = (question.correctAnswers || question.reponse_correcte || []).map(Number);

      // ── Comparaison STRICTE : mêmes éléments, même quantité (ordre indépendant) ──
      const userSorted    = [...userAnswer].sort((a, b) => a - b);
      const correctSorted = [...correctAnswers].sort((a, b) => a - b);
      const isCorrect = userSorted.length === correctSorted.length &&
                        userSorted.every((v, i) => v === correctSorted[i]);

      if (isCorrect) score++;

      const options = question.options || question.propositions || [];
      const userAnswerLabels   = userAnswer.map(idx => options[idx]).filter(Boolean);
      const correctAnswerLabels = correctAnswers.map(idx => options[idx]).filter(Boolean);

      // Nettoyer l'explication
      let explanation = '';
      if (question.explanation) {
        explanation = typeof question.explanation === 'string'
          ? question.explanation
          : (question.explanation.complete || question.explanation.complexe ||
             question.explanation.moyenne  || question.explanation.simple || '');
      } else if (question.explications) {
        const e = question.explications;
        explanation = e.complete || e.complexe || e.moyenne || e.simple || '';
      }

      details.push({
        questionId,
        question: question.question,
        options,
        userAnswer,
        userAnswerLabels,
        correctAnswers,
        correctAnswerLabels,
        isCorrect,
        explanation: explanation.trim()
      });
    }

    const percentage = ((score / total) * 100).toFixed(1);

    const results = {
      sessionId, type: 'entrainement', niveau,
      partieId: session.partieId,
      score, total, percentage, details,
      temps: Date.now() - session.startedAt,
      completedAt: Date.now()
    };

    fs.writeFileSync(
      path.join(DATA_DIR, `results_${sessionId}.json`),
      JSON.stringify(results, null, 2)
    );

    console.log(`✅ Score STRICT: ${score}/${total} (${percentage}%)`);

    res.json({ success: true, results: { sessionId, score, total, percentage, details } });

  } catch (error) {
    console.error('Erreur fin entraînement:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;