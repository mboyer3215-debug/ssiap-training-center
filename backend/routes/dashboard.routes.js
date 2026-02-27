// backend/routes/dashboard.routes.js
// DASHBOARD FORMATEUR - Statistiques et suivi des stagiaires

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data-local');

/**
 * GET /api/dashboard/overview
 * Vue d'ensemble : statistiques globales
 */
router.get('/overview', (req, res) => {
  try {
    const sessions = getAllSessions();
    const results = getAllResults();
    
    // Statistiques globales
    const stats = {
      totalSessions: sessions.length,
      totalStagiaires: getUniqueStagiaires(sessions).length,
      tauxReussite: calculateSuccessRate(results),
      moyenneScore: calculateAverageScore(results),
      sessionsByNiveau: getSessionsByNiveau(sessions),
      recentSessions: sessions.slice(-10).reverse(),
      topPerformers: getTopPerformers(results, 5),
      weakQuestions: getWeakQuestions(results, 10)
    };
    
    res.json({ success: true, stats });
    
  } catch (error) {
    console.error('Erreur overview:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dashboard/stagiaires
 * Liste de tous les stagiaires avec leurs stats
 */
router.get('/stagiaires', (req, res) => {
  try {
    const sessions = getAllSessions();
    const results = getAllResults();
    
    const stagiairesList = getUniqueStagiaires(sessions).map(userId => {
      const userSessions = sessions.filter(s => s.userId === userId);
      const userResults = results.filter(r => 
        userSessions.some(s => s.sessionId === r.sessionId)
      );
      
      return {
        userId,
        nom: userSessions[0]?.userId.split('_')[0] || 'Inconnu',
        prenom: userSessions[0]?.userId.split('_')[1] || '',
        nombreSessions: userSessions.length,
        dernierEntrainement: getLastSessionDate(userSessions),
        moyenneScore: calculateAverageScore(userResults),
        niveauxPratiques: [...new Set(userSessions.map(s => s.niveau))],
        progression: calculateProgression(userResults)
      };
    });
    
    res.json({ success: true, stagiaires: stagiairesList });
    
  } catch (error) {
    console.error('Erreur stagiaires:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dashboard/stagiaire/:userId
 * Détails complets d'un stagiaire
 */
router.get('/stagiaire/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    const sessions = getAllSessions().filter(s => s.userId === userId);
    const results = getAllResults().filter(r => 
      sessions.some(s => s.sessionId === r.sessionId)
    );
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Stagiaire introuvable' });
    }
    
    const details = {
      userId,
      nom: userId.split('_')[0],
      prenom: userId.split('_')[1],
      statistiques: {
        nombreSessions: sessions.length,
        moyenneScore: calculateAverageScore(results),
        tauxReussite: calculateSuccessRate(results),
        tempsTotal: calculateTotalTime(sessions),
        derniereSession: getLastSessionDate(sessions)
      },
      historique: results.map(r => ({
        sessionId: r.sessionId,
        date: new Date(r.completedAt).toLocaleString('fr-FR'),
        niveau: sessions.find(s => s.sessionId === r.sessionId)?.niveau,
        score: r.score,
        total: r.total,
        percentage: r.percentage,
        temps: r.temps
      })).reverse(),
      performanceParNiveau: getPerformanceByNiveau(sessions, results),
      questionsEchouees: getFailedQuestions(results, 5)
    };
    
    res.json({ success: true, stagiaire: details });
    
  } catch (error) {
    console.error('Erreur détails stagiaire:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dashboard/questions-stats
 * Statistiques des questions (taux de réussite par question)
 */
router.get('/questions-stats', (req, res) => {
  try {
    const results = getAllResults();
    
    const questionStats = {};
    
    // Analyser toutes les questions
    results.forEach(result => {
      result.details.forEach(detail => {
        const qId = detail.questionId;
        
        if (!questionStats[qId]) {
          questionStats[qId] = {
            questionId: qId,
            question: detail.question,
            totalReponses: 0,
            bonnesReponses: 0,
            tauxReussite: 0
          };
        }
        
        questionStats[qId].totalReponses++;
        if (detail.isCorrect) {
          questionStats[qId].bonnesReponses++;
        }
      });
    });
    
    // Calculer taux de réussite
    const questionsArray = Object.values(questionStats).map(q => ({
      ...q,
      tauxReussite: ((q.bonnesReponses / q.totalReponses) * 100).toFixed(1)
    }));
    
    // Trier par difficulté (taux de réussite le plus bas)
    questionsArray.sort((a, b) => parseFloat(a.tauxReussite) - parseFloat(b.tauxReussite));
    
    res.json({ 
      success: true, 
      questions: questionsArray,
      difficiles: questionsArray.slice(0, 20),
      faciles: questionsArray.slice(-20).reverse()
    });
    
  } catch (error) {
    console.error('Erreur stats questions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dashboard/export
 * Export des données en CSV
 */
router.get('/export', (req, res) => {
  try {
    const sessions = getAllSessions();
    const results = getAllResults();
    
    let csv = 'Stagiaire,Date,Niveau,Score,Total,Pourcentage,Temps\n';
    
    results.forEach(result => {
      const session = sessions.find(s => s.sessionId === result.sessionId);
      if (session) {
        const date = new Date(result.completedAt).toLocaleString('fr-FR');
        csv += `${session.userId},${date},${result.niveau},${result.score},${result.total},${result.percentage},${result.temps}\n`;
      }
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export_ssiap.csv');
    res.send(csv);
    
  } catch (error) {
    console.error('Erreur export:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

function getAllSessions() {
  if (!fs.existsSync(DATA_DIR)) return [];
  
  const files = fs.readdirSync(DATA_DIR);
  const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));
  
  return sessionFiles.map(file => {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(content);
  });
}

function getAllResults() {
  if (!fs.existsSync(DATA_DIR)) return [];
  
  const files = fs.readdirSync(DATA_DIR);
  const resultFiles = files.filter(f => f.startsWith('results_') && f.endsWith('.json'));
  
  return resultFiles.map(file => {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(content);
  });
}

function getUniqueStagiaires(sessions) {
  return [...new Set(sessions.map(s => s.userId))];
}

function calculateSuccessRate(results) {
  if (results.length === 0) return 0;
  const passed = results.filter(r => parseFloat(r.percentage) >= 50).length;
  return ((passed / results.length) * 100).toFixed(1);
}

function calculateAverageScore(results) {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + parseFloat(r.percentage), 0);
  return (sum / results.length).toFixed(1);
}

function getSessionsByNiveau(sessions) {
  const byNiveau = { 1: 0, 2: 0, 3: 0 };
  sessions.forEach(s => {
    byNiveau[s.niveau] = (byNiveau[s.niveau] || 0) + 1;
  });
  return byNiveau;
}

function getLastSessionDate(sessions) {
  if (sessions.length === 0) return null;
  const latest = sessions.reduce((max, s) => 
    s.startedAt > max.startedAt ? s : max
  );
  return new Date(latest.startedAt).toLocaleString('fr-FR');
}

function calculateProgression(results) {
  if (results.length < 2) return 0;
  const sorted = results.sort((a, b) => a.completedAt - b.completedAt);
  const first = parseFloat(sorted[0].percentage);
  const last = parseFloat(sorted[sorted.length - 1].percentage);
  return (last - first).toFixed(1);
}

function getTopPerformers(results, limit = 5) {
  const byUser = {};
  
  results.forEach(r => {
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === r.sessionId);
    if (!session) return;
    
    if (!byUser[session.userId]) {
      byUser[session.userId] = {
        userId: session.userId,
        scores: []
      };
    }
    byUser[session.userId].scores.push(parseFloat(r.percentage));
  });
  
  return Object.values(byUser)
    .map(u => ({
      userId: u.userId,
      moyenne: (u.scores.reduce((a, b) => a + b, 0) / u.scores.length).toFixed(1)
    }))
    .sort((a, b) => parseFloat(b.moyenne) - parseFloat(a.moyenne))
    .slice(0, limit);
}

function getWeakQuestions(results, limit = 10) {
  const questionStats = {};
  
  results.forEach(result => {
    result.details.forEach(detail => {
      const qId = detail.questionId;
      if (!questionStats[qId]) {
        questionStats[qId] = { questionId: qId, total: 0, correct: 0 };
      }
      questionStats[qId].total++;
      if (detail.isCorrect) questionStats[qId].correct++;
    });
  });
  
  return Object.values(questionStats)
    .map(q => ({
      ...q,
      tauxReussite: ((q.correct / q.total) * 100).toFixed(1)
    }))
    .sort((a, b) => parseFloat(a.tauxReussite) - parseFloat(b.tauxReussite))
    .slice(0, limit);
}

function calculateTotalTime(sessions) {
  return sessions.reduce((sum, s) => sum + (s.completedAt || Date.now()) - s.startedAt, 0);
}

function getPerformanceByNiveau(sessions, results) {
  const byNiveau = { 1: [], 2: [], 3: [] };
  
  results.forEach(r => {
    const session = sessions.find(s => s.sessionId === r.sessionId);
    if (session && byNiveau[session.niveau]) {
      byNiveau[session.niveau].push(parseFloat(r.percentage));
    }
  });
  
  return Object.keys(byNiveau).reduce((acc, niveau) => {
    const scores = byNiveau[niveau];
    acc[niveau] = scores.length > 0 
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : 0;
    return acc;
  }, {});
}

function getFailedQuestions(results, limit = 5) {
  const failed = [];
  
  results.forEach(result => {
    result.details.forEach(detail => {
      if (!detail.isCorrect) {
        failed.push({
          question: detail.question,
          sessionId: result.sessionId
        });
      }
    });
  });
  
  return failed.slice(0, limit);
}

module.exports = router;