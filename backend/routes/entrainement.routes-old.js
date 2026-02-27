// backend/routes/entrainement.routes.js
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { CENTER_DEFAULT, STATUS, NOMBRE_QUESTIONS_OPTIONS, getPartiesByNiveau } = require('../config/constants');
const constants = require('../config/constants');

/**
 * GET /api/entrainement/config/:niveau
 * Récupère la configuration disponible pour un niveau
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
      config: {
        niveau,
        parties,
        nombresQuestions: NOMBRE_QUESTIONS_OPTIONS
      }
    });
    
  } catch (error) {
    console.error('Erreur config entraînement:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/start
 * Démarre un entraînement personnalisé
 */
router.post('/start', async (req, res) => {
  try {
    const { userId, niveau, partieId, nbQuestions } = req.body;
    
    // Validation
    if (!userId || !niveau) {
      return res.status(400).json({ error: 'userId et niveau requis' });
    }
    
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
    
    // Récupérer les questions du niveau
    const snapshot = await db.ref(`centers/${CENTER_DEFAULT}/questions/${niveauInt}`).once('value');
    const allQuestions = snapshot.val() || {};
    
    let questionsArray = Object.entries(allQuestions).map(([id, data]) => ({
      id,
      ...data
    }));
    
    // Filtrer par partie si spécifié
    if (partieId && partieId !== 'toutes') {
      questionsArray = questionsArray.filter(q => q.partie === partieId);
      console.log(`Filtrage par partie ${partieId}: ${questionsArray.length} questions disponibles`);
    }
    
    // Vérifier qu'il y a assez de questions
    if (questionsArray.length < nbQuestionsInt) {
      console.warn(`⚠️ Seulement ${questionsArray.length} questions disponibles (demandé: ${nbQuestionsInt})`);
    }
    
    // Mélanger et sélectionner
    const shuffled = questionsArray.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(nbQuestionsInt, questionsArray.length));
    
    // Créer la session
    const sessionRef = db.ref('sessions').push();
    const sessionData = {
      centerId: CENTER_DEFAULT,
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
    
    // Mettre à jour l'activité du stagiaire
    await db.ref(`centers/${CENTER_DEFAULT}/stagiaires/${userId}`).update({
      lastActivity: Date.now()
    });
    
    console.log(`✅ Entraînement créé: ${selected.length} questions, partie: ${partieId || 'toutes'}`);
    
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
 * Enregistre une réponse (identique à QCM)
 */
router.post('/answer', async (req, res) => {
  try {
    const { sessionId, questionId, answers } = req.body;
    
    if (!sessionId || !questionId || !Array.isArray(answers)) {
      return res.status(400).json({ 
        error: 'sessionId, questionId et answers (array) requis' 
      });
    }
    
    await db.ref(`sessions/${sessionId}/answers/${questionId}`).set({
      selected: answers,
      timestamp: Date.now()
    });
    
    res.json({ 
      success: true,
      message: 'Réponse enregistrée'
    });
    
  } catch (error) {
    console.error('Erreur sauvegarde réponse:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/entrainement/finish
 * Termine l'entraînement et calcule le score
 */
router.post('/finish', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId requis' });
    }
    
    // Récupérer la session
    const sessionSnapshot = await db.ref(`sessions/${sessionId}`).once('value');
    const session = sessionSnapshot.val();
    
    if (!session) {
      return res.status(404).json({ error: 'Session introuvable' });
    }
    
    const { centerId, niveau, questions: questionIds, answers, userId } = session;
    
    // Récupérer les questions
    const questionsSnapshot = await db.ref(`centers/${centerId}/questions/${niveau}`).once('value');
    const allQuestions = questionsSnapshot.val();
    
    let score = 0;
    const total = questionIds.length;
    const details = [];
    
    // Calculer le score
    for (const questionId of questionIds) {
      const question = allQuestions[questionId];
      const userAnswer = answers[questionId]?.selected || [];
      const correctAnswers = question.correctAnswers || [];
      
      const isCorrect = userAnswer.length === correctAnswers.length && 
                       userAnswer.every(ans => correctAnswers.includes(ans));
      
      if (isCorrect) score++;
      
      details.push({ 
        questionId, 
        question: question.question, 
        userAnswer, 
        correctAnswers, 
        isCorrect, 
        explanation: question.explanation 
      });
    }
    
    const percentage = ((score / total) * 100).toFixed(1);
    
    // Sauvegarder résultats
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
    
    // Mettre à jour session
    await db.ref(`sessions/${sessionId}`).update({ 
      status: STATUS.TERMINEE, 
      score, 
      completedAt: Date.now() 
    });
    
    // Mettre à jour progression du stagiaire
    const stagiairesService = require('../services/stagiaires.service');
    await stagiairesService.updateProgression(centerId, userId, niveau, score, total);
    
    console.log(`✅ Entraînement terminé: ${score}/${total} (${percentage}%)`);
    
    res.json({
      success: true,
      results: { 
        sessionId, 
        score, 
        total, 
        percentage, 
        details 
      }
    });
    
  } catch (error) {
    console.error('Erreur fin entraînement:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;