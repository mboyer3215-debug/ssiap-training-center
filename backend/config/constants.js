// backend/config/constants.js - VERSION MISE À JOUR

module.exports = {
  // Configuration flexible du nombre de questions
  NOMBRE_QUESTIONS_OPTIONS: [5, 10, 15, 20, 25, 30, 40],
  
  // Configuration par défaut pour examens complets
  QCM_CONFIG: {
    1: { nb_questions: 30 },
    2: { nb_questions: 40 },
    3: { nb_questions: 40 }
  },
  
  // Parties officielles SSIAP 1
  PARTIES_SSIAP_1: [
    { id: 'partie1', label: 'Le feu et ses conséquences' },
    { id: 'partie2', label: 'Sécurité incendie' },
    { id: 'partie3', label: 'Installations techniques' },
    { id: 'partie4', label: 'Rôle et missions des agents de sécurité incendie' },
    { id: 'partie5', label: 'Concrétisation des acquis' }
  ],
  
  // Parties officielles SSIAP 2
  PARTIES_SSIAP_2: [
    { id: 'partie1', label: "Rôles et missions du chef d'équipe" },
    { id: 'partie2', label: 'Manipulation du système de sécurité incendie' },
    { id: 'partie3', label: "Hygiène et sécurité en matière de sécurité incendie" },
    { id: 'partie4', label: 'Chef du poste central de sécurité en situation de crise' }
  ],
  
  // Parties officielles SSIAP 3
  PARTIES_SSIAP_3: [
    { id: 'partie1', label: 'Le feu et ses conséquences' },
    { id: 'partie2', label: 'La sécurité incendie et les bâtiments' },
    { id: 'partie3', label: 'La réglementation incendie' },
    { id: 'partie4', label: 'Gestion des risques' },
    { id: 'partie5', label: "Conseil au chef d'établissement" },
    { id: 'partie6', label: 'Correspondant des commissions de sécurité' },
    { id: 'partie7', label: "Le management de l'équipe de sécurité" },
    { id: 'partie8', label: 'Le budget du service sécurité' }
  ],
  
  CENTER_DEFAULT: 'center_default',
  
  STATUS: {
    EN_COURS: 'en_cours',
    TERMINEE: 'terminee'
  },
  
  // Helper pour obtenir les parties par niveau
  getPartiesByNiveau(niveau) {
    switch(niveau) {
      case 1: return this.PARTIES_SSIAP_1;
      case 2: return this.PARTIES_SSIAP_2;
      case 3: return this.PARTIES_SSIAP_3;
      default: return [];
    }
  }
};