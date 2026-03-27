// backend/routes/entrainement.routes.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { CENTER_DEFAULT, STATUS, NOMBRE_QUESTIONS_OPTIONS, getPartiesByNiveau } = require('../config/constants');
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
    console.error('Erreur config entraînement:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/start
 */
// CORRECTION dans backend/routes/entrainement.routes.js
// Remplacer le bloc POST /api/entrainement/start par celui-ci :

router.post('/start', async (req, res) => {
  try {
    // FIX : ajouter centerId au body — le stagiaire connaît son centre
    const { userId, centerId, niveau, partieId, nbQuestions } = req.body;

    if (!userId || !niveau) {
      return res.status(400).json({ error: 'userId et niveau requis' });
    }

    // FIX : utiliser le centerId fourni, sinon fallback sur CENTER_DEFAULT
    const effectiveCenterId = centerId || CENTER_DEFAULT;

    const niveauInt = parseInt(niveau);
    if (![1, 2, 3].includes(niveauInt)) {
      return res.status(400).json({ error: 'Niveau doit être 1, 2 ou 3' });
    }

    const nbQuestionsInt = parseInt(nbQuestions) || 30;
    if (!NOMBRE_QUESTIONS_OPTIONS.includes(nbQuestionsInt)) {
      return res.status(400).json({
        error: `Nombre de questions invalide. Options: ${NOMBRE_QUESTIONS_OPTIONS.join(', ')}`
      });
    }

    // FIX : lire les questions du bon centre
    const snapshot = await db.ref(`centers/${effectiveCenterId}/questions/${niveauInt}`).once('value');
    const allQuestions = snapshot.val() || {};
    let questionsArray = Object.entries(allQuestions).map(([id, data]) => ({ id, ...data }));

    if (partieId && partieId !== 'toutes') {
      questionsArray = questionsArray.filter(q => q.partie === partieId);
    }

    if (questionsArray.length < nbQuestionsInt) {
      console.warn(`⚠️ Seulement ${questionsArray.length} questions disponibles (demandé: ${nbQuestionsInt}) dans ${effectiveCenterId}/questions/${niveauInt}`);
    }

    if (questionsArray.length === 0) {
      return res.status(404).json({
        error: `Aucune question disponible pour le niveau SSIAP ${niveauInt}.`,
        centerId: effectiveCenterId
      });
    }

    const shuffled = questionsArray.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(nbQuestionsInt, questionsArray.length));

    const sessionRef = db.ref('sessions').push();
    const sessionData = {
      centerId: effectiveCenterId,
      userId,
      niveau: niveauInt,
      partieId: partieId || 'toutes',
      nbQuestionsRequested: nbQuestionsInt,
      questions: selected.map(q => q.id),
      answers: {},
      startedAt: Date.now(),
      status: STATUS.EN_COURS,
      type: 'entrainement'
    };
    await sessionRef.set(sessionData);

    // Mettre à jour lastActivity du stagiaire dans son centre
    await db.ref(`centers/${effectiveCenterId}/stagiaires/${userId}`).update({ lastActivity: Date.now() });

    res.json({
      success: true,
      sessionId: sessionRef.key,
      niveau: niveauInt,
      partieId: partieId || 'toutes',
      nbQuestions: selected.length,
      questions: selected
    });

  } catch (error) {
    console.error('Erreur démarrage entraînement:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/answer
 */
router.post('/answer', async (req, res) => {
  try {
    const { sessionId, questionId, answers } = req.body;
    if (!sessionId || !questionId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'sessionId, questionId et answers (array) requis' });
    }
    await db.ref(`sessions/${sessionId}/answers/${questionId}`).set({
      selected: answers,
      timestamp: Date.now()
    });
    res.json({ success: true, message: 'Réponse enregistrée' });
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
    if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });

    const sessionSnapshot = await db.ref(`sessions/${sessionId}`).once('value');
    const session = sessionSnapshot.val();
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const { centerId, niveau, questions: questionIds, answers, userId } = session;

    const questionsSnapshot = await db.ref(`centers/${centerId}/questions/${niveau}`).once('value');
    const allQuestions = questionsSnapshot.val();

    let score = 0;
    const total = questionIds.length;
    const details = [];

    for (const questionId of questionIds) {
      const question = allQuestions[questionId];
      const userAnswer = answers[questionId]?.selected || [];
      const correctAnswers = question.correctAnswers || [];
      const isCorrect = userAnswer.length === correctAnswers.length &&
                       userAnswer.every(ans => correctAnswers.includes(ans));
      if (isCorrect) score++;
      details.push({ questionId, question: question.question, userAnswer, correctAnswers, isCorrect, explanation: question.explanation });
    }

    const percentage = ((score / total) * 100).toFixed(1);

    await db.ref(`results/${centerId}/${userId}/${sessionId}`).set({
      type: 'entrainement',
      niveau,
      partieId: session.partieId,
      score,
      total,
      percentage,
      details,
      temps: Date.now() - session.startedAt,
      completedAt: Date.now()
    });

    await db.ref(`sessions/${sessionId}`).update({ status: STATUS.TERMINEE, score, completedAt: Date.now() });

    const stagiairesService = require('../services/stagiaires.service');
    await stagiairesService.updateProgression(centerId, userId, niveau, score, total);

    res.json({ success: true, results: { sessionId, score, total, percentage, details } });

  } catch (error) {
    console.error('Erreur fin entraînement:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
/**
 * GET /api/entrainement/results/:centerId/:userId
 * Récupère tous les résultats d'un stagiaire
 * Structure Firebase : results/{centerId}/{userId}/{sessionId}
 * Utilisé par le dashboard centre pour afficher scores et historique
 */
router.get('/results/:centerId/:userId', async (req, res) => {
  try {
    const { centerId, userId } = req.params;
    if (!centerId || !userId) {
      return res.status(400).json({ error: 'centerId et userId requis' });
    }

    const snapshot = await db.ref(`results/${centerId}/${userId}`).once('value');
    if (!snapshot.exists()) {
      return res.json({ success: true, results: [], total: 0, scoreMoyen: 0, meilleurScore: 0 });
    }

    const raw = snapshot.val();
    const results = Object.entries(raw).map(([sessionId, data]) => ({
      sessionId,
      niveau:      data.niveau      ?? null,
      partieId:    data.partieId    || 'toutes',
      score:       data.score       || 0,
      total:       data.total       || 0,
      percentage:  parseFloat(data.percentage) || 0,
      completedAt: data.completedAt || null,
      temps:       data.temps       || null,
      type:        data.type        || 'entrainement',
    }));

    // Trier par date décroissante
    results.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    const total = results.length;
    const scoreMoyen = total
      ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total)
      : 0;
    const meilleurScore = total
      ? Math.round(Math.max(...results.map(r => r.percentage)))
      : 0;

    res.json({ success: true, results, total, scoreMoyen, meilleurScore });

  } catch (error) {
    console.error('Erreur results stagiaire:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/entrainement/stats/:centerId
 * Stats globales d'un centre : nb quiz par niveau, taux de réussite
 * Utilisé par le dashboard admin
 */
router.get('/stats/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    const snapshot = await db.ref(`results/${centerId}`).once('value');

    if (!snapshot.exists()) {
      return res.json({ success: true, n1: 0, n2: 0, n3: 0, total: 0 });
    }

    let n1 = 0, n2 = 0, n3 = 0;
    snapshot.forEach(userSnap => {
      userSnap.forEach(sessionSnap => {
        const d = sessionSnap.val();
        if (d.niveau === 1) n1++;
        else if (d.niveau === 2) n2++;
        else if (d.niveau === 3) n3++;
      });
    });

    res.json({ success: true, n1, n2, n3, total: n1 + n2 + n3 });

  } catch (error) {
    console.error('Erreur stats entrainement:', error);
    res.status(500).json({ error: error.message });
  }
});
/**
 * GET /api/entrainement/stats/all
 * Stats globales TOUTES centres confondus — pour le dashboard admin
 * Lit results/{centerId} pour chaque centre enregistré dans Firebase
 * Pas de JWT requis (données agrégées anonymes)
 */
router.get('/stats/all', async (req, res) => {
  try {
    // 1. Récupérer tous les centres enregistrés
    const centresSnap = await db.ref('centers').once('value');
    if (!centresSnap.exists()) {
      return res.json({ success: true, n1: 0, n2: 0, n3: 0, total: 0, centres: [] });
    }

    const centerIds = Object.keys(centresSnap.val());
    let n1 = 0, n2 = 0, n3 = 0;
    const centreStats = [];

    // 2. Lire results/{centerId} pour chaque centre en parallèle
    await Promise.all(centerIds.map(async centerId => {
      try {
        const snap = await db.ref(`results/${centerId}`).once('value');
        if (!snap.exists()) {
          centreStats.push({ centerId, n1: 0, n2: 0, n3: 0 });
          return;
        }
        let cn1 = 0, cn2 = 0, cn3 = 0;
        snap.forEach(userSnap => {
          userSnap.forEach(sessionSnap => {
            const d = sessionSnap.val();
            if (d.niveau === 1 || d.niveau === '1') cn1++;
            else if (d.niveau === 2 || d.niveau === '2') cn2++;
            else if (d.niveau === 3 || d.niveau === '3') cn3++;
          });
        });
        n1 += cn1; n2 += cn2; n3 += cn3;
        centreStats.push({ centerId, n1: cn1, n2: cn2, n3: cn3 });
      } catch (e) {
        console.warn(`stats/all: erreur centre ${centerId}:`, e.message);
      }
    }));

    res.json({
      success: true,
      n1, n2, n3,
      total: n1 + n2 + n3,
      centres: centreStats
    });

  } catch (error) {
    console.error('Erreur stats/all:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
