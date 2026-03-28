// backend/routes/entrainement.routes.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { CENTER_DEFAULT, STATUS, NOMBRE_QUESTIONS_OPTIONS } = require('../config/constants');
const constants = require('../config/constants');

// Helper : charge les questions d'un niveau depuis le centre ou la racine Firebase
async function loadQuestions(centerId, niveauInt) {
  // 1. Dans le centre
  if (centerId && centerId !== CENTER_DEFAULT) {
    const snap = await db.ref(`centers/${centerId}/questions/${niveauInt}`).once('value');
    if (snap.exists()) {
      const data = snap.val();
      const arr  = Object.entries(data).map(([id, q]) => ({ id, ...q }));
      if (arr.length > 0) {
        console.log(`[questions] ${arr.length} depuis centers/${centerId}/questions/${niveauInt}`);
        return arr;
      }
    }
  }
  // 2. Fallback racine (questions/1, questions/2, questions/3)
  const snapRoot = await db.ref(`questions/${niveauInt}`).once('value');
  if (snapRoot.exists()) {
    const data = snapRoot.val();
    const arr  = Object.entries(data).map(([id, q]) => ({ id, ...q }));
    console.log(`[questions] ${arr.length} depuis racine questions/${niveauInt}`);
    return arr;
  }
  return [];
}

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
    const { userId, centerId, niveau, partieId, nbQuestions } = req.body;

    if (!userId || !niveau) {
      return res.status(400).json({ error: 'userId et niveau requis' });
    }

    const niveauInt = parseInt(niveau);
    if (![1, 2, 3].includes(niveauInt)) {
      return res.status(400).json({ error: 'Niveau doit être 1, 2 ou 3' });
    }

    const nbQuestionsInt = parseInt(nbQuestions) || 10;

    // Charger les questions (centre → racine)
    let questionsArray = await loadQuestions(centerId, niveauInt);

    // Filtrer par partie
    if (partieId && partieId !== 'toutes') {
      questionsArray = questionsArray.filter(q =>
        q.partie === partieId || q.partieId === partieId
      );
    }

    if (questionsArray.length === 0) {
      console.warn(`[start] 0 questions pour SSIAP ${niveauInt} (centerId: ${centerId})`);
      return res.status(404).json({
        error: `Aucune question disponible pour le niveau SSIAP ${niveauInt}.`
      });
    }

    // Mélanger et sélectionner
    const shuffled = questionsArray.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(nbQuestionsInt, questionsArray.length));

    // Créer la session
    const effectiveCenterId = centerId || CENTER_DEFAULT;
    const sessionRef  = db.ref('sessions').push();
    const sessionData = {
      centerId:             effectiveCenterId,
      userId,
      niveau:               niveauInt,
      partieId:             partieId || 'toutes',
      nbQuestionsRequested: nbQuestionsInt,
      questions:            selected.map(q => q.id),
      answers:              {},
      startedAt:            Date.now(),
      status:               STATUS.EN_COURS,
      type:                 'entrainement'
    };
    await sessionRef.set(sessionData);

    // Mettre à jour lastActivity (optionnel, ne bloque pas si échoue)
    if (centerId) {
      db.ref(`centers/${centerId}/stagiaires/${userId}`)
        .update({ lastActivity: Date.now() })
        .catch(() => {});
    }

    res.json({
      success:     true,
      sessionId:   sessionRef.key,
      niveau:      niveauInt,
      partieId:    partieId || 'toutes',
      nbQuestions: selected.length,
      questions:   selected
    });

  } catch (error) {
    console.error('[start] Erreur:', error);
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
      return res.status(400).json({ error: 'sessionId, questionId et answers requis' });
    }
    await db.ref(`sessions/${sessionId}/answers/${questionId}`).set({
      selected:  answers,
      timestamp: Date.now()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[answer] Erreur:', error);
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

    // Charger les questions pour la correction (centre → racine)
    const allQuestionsArr = await loadQuestions(centerId, niveau);
    const allQuestionsMap = {};
    allQuestionsArr.forEach(q => { allQuestionsMap[q.id] = q; });

    let score = 0;
    const total   = (questionIds || []).length;
    const details = [];

    for (const questionId of (questionIds || [])) {
      const question    = allQuestionsMap[questionId] || allQuestionsArr.find(q => q.id == questionId) || {};
      const userAnswer  = answers?.[questionId]?.selected || [];
      const correctAnswers = question.correctAnswers || [];
      const isCorrect   = userAnswer.length === correctAnswers.length &&
                          userAnswer.every(ans => correctAnswers.includes(ans));
      if (isCorrect) score++;

      const opts = question.options || [];
      details.push({
        questionId,
        question:            question.question     || '',
        userAnswer,
        correctAnswers,
        isCorrect,
        explanation:         question.explanation  || '',
        userAnswerLabels:    userAnswer.map(i => opts[i] || '?'),
        correctAnswerLabels: correctAnswers.map(i => opts[i] || '?'),
        partie:              question.partie        || question.partieId || null,
        partieLabel:         question.partieLabel   || null,
      });
    }

    const percentage = total > 0 ? ((score / total) * 100).toFixed(1) : '0.0';
    const temps      = Date.now() - (session.startedAt || Date.now());

    // Sauvegarder dans results/{centerId}/{userId}/{sessionId}
    await db.ref(`results/${centerId}/${userId}/${sessionId}`).set({
      type:        'entrainement',
      niveau,
      partieId:    session.partieId || 'toutes',
      score,
      total,
      percentage,
      details,
      temps,
      completedAt: Date.now()
    });

    await db.ref(`sessions/${sessionId}`).update({
      status:      STATUS.TERMINEE,
      score,
      completedAt: Date.now()
    });

    // Sauvegarder dans l'historique du stagiaire (champ historique)
    try {
      const stagiairesService = require('../services/stagiaires.service');
      await stagiairesService.updateProgression(centerId, userId, niveau, score, total);
    } catch(e) {
      console.warn('[finish] updateProgression:', e.message);
    }

    res.json({
      success: true,
      results: {
        sessionId,
        score,
        total,
        percentage,
        details,
        temps
      }
    });

  } catch (error) {
    console.error('[finish] Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/entrainement/results/:centerId/:userId
 */
router.get('/results/:centerId/:userId', async (req, res) => {
  try {
    const { centerId, userId } = req.params;
    const snapshot = await db.ref(`results/${centerId}/${userId}`).once('value');
    if (!snapshot.exists()) {
      return res.json({ success: true, results: [], total: 0, scoreMoyen: 0, meilleurScore: 0 });
    }
    const raw     = snapshot.val();
    const results = Object.entries(raw).map(([sessionId, data]) => ({
      sessionId,
      niveau:     data.niveau      ?? null,
      partieId:   data.partieId    || 'toutes',
      score:      data.score       || 0,
      total:      data.total       || 0,
      percentage: parseFloat(data.percentage) || 0,
      completedAt:data.completedAt || null,
      temps:      data.temps       || null,
      type:       data.type        || 'entrainement',
    }));
    results.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const total       = results.length;
    const scoreMoyen  = total ? Math.round(results.reduce((s,r) => s+r.percentage, 0) / total) : 0;
    const meilleurScore = total ? Math.round(Math.max(...results.map(r => r.percentage))) : 0;
    res.json({ success: true, results, total, scoreMoyen, meilleurScore });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/entrainement/stats/:centerId
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
        const niv = parseInt(d.niveau);
        if (niv === 1) n1++;
        else if (niv === 2) n2++;
        else if (niv === 3) n3++;
      });
    });
    res.json({ success: true, n1, n2, n3, total: n1+n2+n3 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/entrainement/stats/all
 */
router.get('/stats/all', async (req, res) => {
  try {
    const centresSnap = await db.ref('centers').once('value');
    if (!centresSnap.exists()) {
      return res.json({ success: true, n1: 0, n2: 0, n3: 0, total: 0, centres: [] });
    }
    const centerIds = Object.keys(centresSnap.val());
    let n1 = 0, n2 = 0, n3 = 0;
    const centreStats = [];
    await Promise.all(centerIds.map(async centerId => {
      try {
        const snap = await db.ref(`results/${centerId}`).once('value');
        if (!snap.exists()) { centreStats.push({ centerId, n1:0, n2:0, n3:0 }); return; }
        let cn1=0, cn2=0, cn3=0;
        snap.forEach(userSnap => {
          userSnap.forEach(sessionSnap => {
            const niv = parseInt(sessionSnap.val().niveau);
            if (niv===1) cn1++; else if (niv===2) cn2++; else if (niv===3) cn3++;
          });
        });
        n1+=cn1; n2+=cn2; n3+=cn3;
        centreStats.push({ centerId, n1:cn1, n2:cn2, n3:cn3 });
      } catch(e) { console.warn(`stats/all: ${centerId}:`, e.message); }
    }));
    res.json({ success: true, n1, n2, n3, total: n1+n2+n3, centres: centreStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
