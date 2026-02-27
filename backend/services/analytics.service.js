// backend/services/analytics.service.js
const { db } = require('../config/firebase');
const { CENTER_DEFAULT } = require('../config/constants');

class AnalyticsService {
  
  async getDashboardStats(centerId) {
    const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
    const stagiaires = stagiairesSnapshot.val() || {};
    
    const stagiairesList = Object.values(stagiaires);
    
    if (stagiairesList.length === 0) {
      return {
        tauxReussite: 0,
        actifs24h: 0,
        alertes: 0,
        totalStagiaires: 0
      };
    }
    
    const totalScores = stagiairesList.reduce((sum, s) => sum + (s.stats?.averageScore || 0), 0);
    const tauxReussite = ((totalScores / stagiairesList.length / 20) * 100).toFixed(1);
    
    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    const actifs24h = stagiairesList.filter(s => s.lastActivity > yesterday).length;
    
    const alertes = stagiairesList.filter(s => (s.stats?.averageScore || 0) < 10).length;
    
    return {
      tauxReussite: parseFloat(tauxReussite),
      actifs24h,
      alertes,
      totalStagiaires: stagiairesList.length
    };
  }
  
  async getQuestionsDifficiles(centerId, limit = 10) {
    const resultsSnapshot = await db.ref(`results/${centerId}`).once('value');
    const allResults = resultsSnapshot.val() || {};
    
    const questionStats = {};
    
    Object.values(allResults).forEach(userResults => {
      Object.values(userResults).forEach(session => {
        if (session.details) {
          session.details.forEach(detail => {
            if (!questionStats[detail.questionId]) {
              questionStats[detail.questionId] = {
                questionId: detail.questionId,
                question: detail.question,
                attempts: 0,
                failures: 0,
                failureRate: 0
              };
            }
            
            questionStats[detail.questionId].attempts++;
            if (!detail.isCorrect) {
              questionStats[detail.questionId].failures++;
            }
          });
        }
      });
    });
    
    const questionsArray = Object.values(questionStats)
      .filter(q => q.attempts >= 3)
      .map(q => ({
        ...q,
        failureRate: ((q.failures / q.attempts) * 100).toFixed(1)
      }))
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, limit);
    
    return questionsArray;
  }
  
  async getProgressionParModule(centerId, userId) {
    const stagiaireSnapshot = await db.ref(`centers/${centerId}/stagiaires/${userId}`).once('value');
    const stagiaire = stagiaireSnapshot.val();
    
    if (!stagiaire || !stagiaire.progression) {
      return [];
    }
    
    return Object.entries(stagiaire.progression).map(([niveau, data]) => ({
      niveau: niveau.replace('niveau', 'SSIAP '),
      completed: data.completed,
      score: data.score,
      attempts: data.attempts || 0,
      lastAttempt: data.lastAttempt || null
    }));
  }
  
  async getStatistiquesGlobales(centerId) {
    const resultsSnapshot = await db.ref(`results/${centerId}`).once('value');
    const allResults = resultsSnapshot.val() || {};
    
    let totalSessions = 0;
    let totalQuestions = 0;
    let totalCorrect = 0;
    const scoreDistribution = { 0: 0, 10: 0, 12: 0, 14: 0, 16: 0, 18: 0 };
    
    Object.values(allResults).forEach(userResults => {
      Object.values(userResults).forEach(session => {
        totalSessions++;
        totalQuestions += session.total;
        totalCorrect += session.score;
        
        const score = (session.score / session.total) * 20;
        if (score < 10) scoreDistribution[0]++;
        else if (score < 12) scoreDistribution[10]++;
        else if (score < 14) scoreDistribution[12]++;
        else if (score < 16) scoreDistribution[14]++;
        else if (score < 18) scoreDistribution[16]++;
        else scoreDistribution[18]++;
      });
    });
    
    return {
      totalSessions,
      totalQuestions,
      totalCorrect,
      tauxReussiteGlobal: totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(1) : 0,
      scoreDistribution
    };
  }
  
  async getEvolutionTemporelle(centerId, jours = 7) {
    const resultsSnapshot = await db.ref(`results/${centerId}`).once('value');
    const allResults = resultsSnapshot.val() || {};
    
    const dateLimit = Date.now() - (jours * 24 * 60 * 60 * 1000);
    const evolution = {};
    
    Object.values(allResults).forEach(userResults => {
      Object.values(userResults).forEach(session => {
        if (session.completedAt && session.completedAt > dateLimit) {
          const date = new Date(session.completedAt).toISOString().split('T')[0];
          if (!evolution[date]) {
            evolution[date] = { sessions: 0, scoreTotal: 0, questionsTotal: 0 };
          }
          evolution[date].sessions++;
          evolution[date].scoreTotal += session.score;
          evolution[date].questionsTotal += session.total;
        }
      });
    });
    
    return Object.entries(evolution)
      .map(([date, data]) => ({
        date,
        sessions: data.sessions,
        tauxReussite: ((data.scoreTotal / data.questionsTotal) * 100).toFixed(1)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

module.exports = new AnalyticsService();