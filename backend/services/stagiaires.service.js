// backend/services/stagiaires.service.js
const { db } = require('../config/firebase');
const { CENTER_DEFAULT } = require('../config/constants');

class StagiairesService {
  
  async createStagiaire(centerId, data) {
    const { nom, prenom, email } = data;
    const stagiaireRef = db.ref(`centers/${centerId}/stagiaires`).push();
    
    const stagiaireData = {
      userId: stagiaireRef.key,
      nom,
      prenom,
      email: email || '',
      dateInscription: Date.now(),
      lastActivity: Date.now(),
      progression: {
        niveau1: { completed: false, score: 0, attempts: 0 },
        niveau2: { completed: false, score: 0, attempts: 0 },
        niveau3: { completed: false, score: 0, attempts: 0 }
      },
      stats: {
        totalQCM: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        averageScore: 0
      }
    };
    
    await stagiaireRef.set(stagiaireData);
    console.log(`✅ Stagiaire créé: ${nom} ${prenom}`);
    
    return stagiaireData;
  }
  
  async getStagiaire(centerId, userId) {
    const snapshot = await db.ref(`centers/${centerId}/stagiaires/${userId}`).once('value');
    return snapshot.val();
  }
  
  async getAllStagiaires(centerId) {
    const snapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
    const stagiaires = snapshot.val() || {};
    
    return Object.entries(stagiaires).map(([id, data]) => ({
      userId: id,
      ...data,
      etat: this.determinerEtat(data)
    }));
  }
  
  determinerEtat(stagiaire) {
    const avgScore = stagiaire.stats?.averageScore || 0;
    
    if (avgScore >= 16) return { code: 'pret', label: '✅ Prêt', color: 'green' };
    if (avgScore >= 12) return { code: 'suivi', label: '⚠️ À suivre', color: 'orange' };
    return { code: 'alerte', label: '❌ Alerte', color: 'red' };
  }
  
  async updateProgression(centerId, userId, niveau, score, total) {
    const percentage = ((score / total) * 100).toFixed(1);
    const completed = percentage >= 50; // 50% minimum pour valider
    
    await db.ref(`centers/${centerId}/stagiaires/${userId}/progression/niveau${niveau}`).update({
      completed,
      score: parseFloat(percentage),
      lastAttempt: Date.now(),
      attempts: db.ref(`centers/${centerId}/stagiaires/${userId}/progression/niveau${niveau}/attempts`).transaction((current) => (current || 0) + 1)
    });
    
    await db.ref(`centers/${centerId}/stagiaires/${userId}`).update({
      lastActivity: Date.now()
    });
    
    await this.updateStats(centerId, userId, score, total);
  }
  
  async updateStats(centerId, userId, score, total) {
    const stagiaireRef = db.ref(`centers/${centerId}/stagiaires/${userId}/stats`);
    const snapshot = await stagiaireRef.once('value');
    const currentStats = snapshot.val() || { totalQCM: 0, totalQuestions: 0, totalCorrect: 0 };
    
    const newStats = {
      totalQCM: currentStats.totalQCM + 1,
      totalQuestions: currentStats.totalQuestions + total,
      totalCorrect: currentStats.totalCorrect + score,
    };
    
    newStats.averageScore = ((newStats.totalCorrect / newStats.totalQuestions) * 20).toFixed(1);
    
    await stagiaireRef.set(newStats);
  }
  
  async getModulesARenforcer(centerId, userId) {
    const resultsSnapshot = await db.ref(`results/${centerId}/${userId}`).once('value');
    const results = resultsSnapshot.val() || {};
    
    const modules = {};
    
    Object.values(results).forEach(result => {
      if (result.details) {
        result.details.forEach(detail => {
          if (!detail.isCorrect) {
            const questionText = detail.question.substring(0, 50);
            modules[questionText] = (modules[questionText] || 0) + 1;
          }
        });
      }
    });
    
    return Object.entries(modules)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([module, count]) => ({ module, erreurs: count }));
  }
  
  async getStagiairesEnAlerte(centerId) {
    const stagiaires = await this.getAllStagiaires(centerId);
    return stagiaires.filter(s => s.etat.code === 'alerte');
  }
  
  async getActifs24h(centerId) {
    const stagiaires = await this.getAllStagiaires(centerId);
    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    return stagiaires.filter(s => s.lastActivity > yesterday).length;
  }
}

module.exports = new StagiairesService();