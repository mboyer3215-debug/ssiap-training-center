const express = require('express');
const router = express.Router();
const qcmService = require('../services/qcm.service');
const { CENTER_DEFAULT } = require('../config/constants');

router.post('/start', async (req, res) => {
  try {
    const { userId, niveau } = req.body;
    
    if (!userId || !niveau) {
      return res.status(400).json({ error: 'userId et niveau requis' });
    }
    
    const niveauInt = parseInt(niveau);
    if (![1, 2, 3].includes(niveauInt)) {
      return res.status(400).json({ error: 'Niveau doit être 1, 2 ou 3' });
    }
    
    const session = await qcmService.createSession(CENTER_DEFAULT, userId, niveauInt);
    
    res.json({
      success: true,
      sessionId: session.sessionId,
      niveau: session.niveau,
      nbQuestions: session.questionsData.length,
      questions: session.questionsData
    });
    
  } catch (error) {
    console.error('Erreur /api/qcm/start:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/answer', async (req, res) => {
  try {
    const { sessionId, questionId, answers } = req.body;
    
    if (!sessionId || !questionId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'sessionId, questionId et answers requis' });
    }
    
    await qcmService.saveAnswer(sessionId, questionId, answers);
    res.json({ success: true, message: 'Réponse enregistrée' });
    
  } catch (error) {
    console.error('Erreur /api/qcm/answer:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/finish', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId requis' });
    }
    
    const results = await qcmService.calculateScore(sessionId);
    
    res.json({
      success: true,
      results: {
        score: results.score,
        total: results.total,
        percentage: results.percentage,
        details: results.details
      }
    });
    
  } catch (error) {
    console.error('Erreur /api/qcm/finish:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await qcmService.getUserHistory(CENTER_DEFAULT, userId);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Erreur /api/qcm/history:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;