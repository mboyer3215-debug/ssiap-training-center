// backend/services/qcm.service.js (VERSION AMÉLIORÉE)
const { db } = require('../config/firebase');
const { QCM_CONFIG, CENTER_DEFAULT, STATUS } = require('../config/constants');
const stagiairesService = require('./stagiaires.service');

class QCMService {
  
  async getQuestionsByNiveau(centerId, niveau) {
    try {
      const snapshot = await db.ref(`questions/${niveau}`).once('value');
      return snapshot.val() || {};
    } catch (error) {
      console.error('Erreur lecture questions:', error);
      throw error;
    }
  }
  
  async generateQCM(centerId, niveau) {
    const nbQuestions = QCM_CONFIG[niveau].nb_questions;
    const allQuestions = await this.getQuestionsByNiveau(centerId, niveau);
    const questionsArray = Object.entries(allQuestions).map(([id, data]) => ({ id, ...data }));
    const shuffled = questionsArray.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, nbQuestions);
  }
  
  async createSession(centerId, userId, niveau) {
    const questions = await this.generateQCM(centerId, niveau);
    const sessionRef = db.ref('sessions').push();
    const sessionData = {
      centerId,
      userId,
      niveau,
      questions: questions.map(q => q.id),
      answers: {},
      startedAt: Date.now(),
      status: STATUS.EN_COURS
    };
    await sessionRef.set(sessionData);
    
    // Mettre à jour l'activité du stagiaire
    await db.ref(`centers/${centerId}/stagiaires/${userId}`).update({
      lastActivity: Date.now()
    });
    
    return {
      sessionId: sessionRef.key,
      ...sessionData,
      questionsData: questions
    };
  }
  
  async saveAnswer(sessionId, questionId, selectedAnswers) {
    await db.ref(`sessions/${sessionId}/answers/${questionId}`).set({
      selected: selectedAnswers,
      timestamp: Date.now()
    });
  }
  
  async calculateScore(sessionId) {
    const sessionSnapshot = await db.ref(`sessions/${sessionId}`).once('value');
    const session = sessionSnapshot.val();
    const { centerId, niveau, questions: questionIds, answers, userId } = session;
    const allQuestions = await this.getQuestionsByNiveau(centerId, niveau);
    
    let score = 0;
    const total = questionIds.length;
    const details = [];
    
    for (const questionId of questionIds) {
      const question = allQuestions[questionId];
      const userAnswer = answers[questionId]?.selected || [];
      const correctAnswers = question.correctAnswers || [];
      const isCorrect = userAnswer.length === correctAnswers.length && userAnswer.every(ans => correctAnswers.includes(ans));
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
      niveau, 
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
    await stagiairesService.updateProgression(centerId, userId, niveau, score, total);
    
    return { sessionId, score, total, percentage, details };
  }
  
  async getUserHistory(centerId, userId) {
    const snapshot = await db.ref(`results/${centerId}/${userId}`).once('value');
    if (!snapshot.exists()) return [];
    const results = snapshot.val();
    return Object.entries(results).map(([sessionId, data]) => ({ sessionId, ...data }));
  }
}

module.exports = new QCMService();