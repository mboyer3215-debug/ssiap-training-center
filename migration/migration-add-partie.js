// migration-add-partie.js
// Script pour ajouter le champ "partie" aux questions existantes

const admin = require('firebase-admin');
require('dotenv').config();

// Configuration Firebase
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Mots-clés pour identifier les parties SSIAP 1
const MOTS_CLES_SSIAP_1 = {
  partie1: [
    'feu', 'combustion', 'incendie', 'flamme', 'fumée', 'chaleur', 
    'triangle du feu', 'tétraèdre', 'propagation', 'conduction',
    'convection', 'rayonnement', 'combustible', 'comburant', 'énergie',
    'classes de feu', 'extinction', 'effets du feu'
  ],
  partie2: [
    'principes de sécurité', 'fondamentaux', 'évacuation', 'alarme',
    'dégagement', 'issue de secours', 'compartimentage', 'résistance au feu',
    'réaction au feu', 'désenfumage', 'signalisation', 'consignes de sécurité',
    'exercice évacuation', 'plan', 'SSI', 'système de sécurité incendie'
  ],
  partie3: [
    'installation', 'RIA', 'robinet incendie armé', 'colonne sèche',
    'colonne humide', 'surpresseur', 'sprinkler', 'extinction automatique',
    'détecteur', 'déclencheur manuel', 'central', 'tableau', 'cloisonnement',
    'électrique', 'gaz', 'ascenseur', 'ventilation', 'climatisation'
  ],
  partie4: [
    'agent de sécurité', 'ronde', 'surveillance', 'PC sécurité', 'poste central',
    'main courante', 'consigne', 'intervention', 'premiers secours',
    'évacuer', 'guider', 'accueillir les secours', 'sapeurs-pompiers',
    'permis de feu', 'travaux', 'contrôle', 'vérification'
  ],
  partie5: [
    'visite', 'application', 'pratique', 'mise en situation', 'synthèse',
    'concrétisation', 'exercice', 'cas pratique', 'QCM', 'évaluation'
  ]
};

// Mots-clés pour identifier les parties SSIAP 2
const MOTS_CLES_SSIAP_2 = {
  partie1: [
    'chef équipe', 'management', 'équipe sécurité', 'gestion équipe',
    'formation agent', 'planification', 'conflit', 'motivation',
    'pédagogie', 'animation', 'communication', 'compte rendu', 'rapport',
    'permis de feu', 'consignes', 'ronde', 'planning'
  ],
  partie2: [
    'SSI', 'système de mise en sécurité', 'tableau signalisation',
    'détection incendie', 'zone', 'boucle', 'CMSI', 'UGCIS',
    'DAS', 'dispositif actionné', 'centrale', 'unité signalisation',
    'extinction automatique', 'sprinkler', 'gaz'
  ],
  partie3: [
    'code du travail', 'hygiène', 'sécurité travail', 'accident travail',
    'danger', 'risque', 'prévention', 'droit de retrait', 'danger imminent',
    'commission sécurité', 'CHSCT', 'document unique', 'registre',
    'accessibilité'
  ],
  partie4: [
    'poste central sécurité', 'PC sécurité', 'situation crise',
    'gestion crise', 'alarme', 'levée de doute', 'évacuation',
    'alerte', 'accueillir secours', 'guide secours', 'ascenseur',
    'plan', 'clés', 'ERP', 'IGH'
  ]
};

// Mots-clés pour identifier les parties SSIAP 3
const MOTS_CLES_SSIAP_3 = {
  partie1: [
    'feu', 'combustion', 'incendie', 'flamme', 'fumée', 'propagation'
  ],
  partie2: [
    'bâtiment', 'construction', 'structure', 'matériaux', 'isolement',
    'façade', 'toiture', 'plancher', 'mur', 'compartimentage'
  ],
  partie3: [
    'réglementation', 'code construction', 'arrêté', 'règlement sécurité',
    'ERP', 'IGH', 'type', 'catégorie', 'commission', 'visite',
    'vérification', 'contrôle périodique', 'registre sécurité'
  ],
  partie4: [
    'gestion risques', 'analyse risque', 'évaluation', 'prévention',
    'document unique', 'plan prévention', 'inspection', 'audit'
  ],
  partie5: [
    'conseil', 'chef établissement', 'assistance', 'préconisation',
    'note de sécurité', 'avis technique', 'notice sécurité'
  ],
  partie6: [
    'commission sécurité', 'correspondant', 'sous-commission',
    'dossier', 'pièces', 'visite périodique', 'réunion commission'
  ],
  partie7: [
    'management équipe', 'chef service', 'encadrement', 'recrutement',
    'formation', 'motivation', 'évaluation', 'planning', 'organisation'
  ],
  partie8: [
    'budget', 'coût', 'investissement', 'maintenance', 'contrat',
    'devis', 'marché', 'appel offres', 'gestion budgétaire'
  ]
};

// Fonction pour analyser et attribuer une partie
function determinerPartie(question, niveau) {
  const questionLower = question.toLowerCase();
  
  let motsClésParNiveau;
  switch(niveau) {
    case 1: motsClésParNiveau = MOTS_CLES_SSIAP_1; break;
    case 2: motsClésParNiveau = MOTS_CLES_SSIAP_2; break;
    case 3: motsClésParNiveau = MOTS_CLES_SSIAP_3; break;
    default: return 'partie1';
  }
  
  const scores = {};
  
  // Calculer le score pour chaque partie
  for (const [partie, motsCles] of Object.entries(motsClésParNiveau)) {
    scores[partie] = 0;
    for (const mot of motsCles) {
      if (questionLower.includes(mot.toLowerCase())) {
        scores[partie]++;
      }
    }
  }
  
  // Trouver la partie avec le meilleur score
  let meilleurPartie = 'partie1';
  let meilleurScore = scores.partie1 || 0;
  
  for (const [partie, score] of Object.entries(scores)) {
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleurPartie = partie;
    }
  }
  
  // Si aucun mot-clé trouvé, répartir équitablement
  if (meilleurScore === 0) {
    const nbParties = Object.keys(motsClésParNiveau).length;
    const hash = question.length % nbParties;
    meilleurPartie = `partie${hash + 1}`;
  }
  
  return meilleurPartie;
}

// Fonction principale de migration
async function migrerQuestions() {
  console.log('🔥 Début de la migration...\n');
  
  const niveaux = [1, 2, 3];
  let totalMigrees = 0;
  let totalErreurs = 0;
  
  for (const niveau of niveaux) {
    console.log(`\n📊 Traitement SSIAP Niveau ${niveau}...`);
    
    try {
      // Lire toutes les questions du niveau
      const snapshot = await db.ref(`centers/center_default/questions/${niveau}`).once('value');
      const questions = snapshot.val();
      
      if (!questions) {
        console.log(`  ⚠️  Aucune question trouvée pour le niveau ${niveau}`);
        continue;
      }
      
      const questionIds = Object.keys(questions);
      console.log(`  📝 ${questionIds.length} questions trouvées`);
      
      // Compteurs par partie
      const compteurParties = {};
      
      // Traiter chaque question
      for (const questionId of questionIds) {
        const question = questions[questionId];
        
        // Vérifier si la question a déjà un champ partie
        if (question.partie) {
          console.log(`  ⏭️  ${questionId} - déjà migré (partie: ${question.partie})`);
          continue;
        }
        
        // Déterminer la partie
        const partie = determinerPartie(question.question, niveau);
        
        // Compter
        compteurParties[partie] = (compteurParties[partie] || 0) + 1;
        
        // Mettre à jour Firebase
        try {
          await db.ref(`centers/center_default/questions/${niveau}/${questionId}`).update({
            partie: partie
          });
          
          console.log(`  ✅ ${questionId} → ${partie}`);
          totalMigrees++;
        } catch (error) {
          console.error(`  ❌ Erreur ${questionId}:`, error.message);
          totalErreurs++;
        }
      }
      
      // Afficher le résumé du niveau
      console.log(`\n  📊 Répartition Niveau ${niveau}:`);
      for (const [partie, count] of Object.entries(compteurParties)) {
        console.log(`     ${partie}: ${count} questions`);
      }
      
    } catch (error) {
      console.error(`❌ Erreur niveau ${niveau}:`, error.message);
      totalErreurs++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎊 MIGRATION TERMINÉE');
  console.log('='.repeat(50));
  console.log(`✅ Questions migrées : ${totalMigrees}`);
  console.log(`❌ Erreurs : ${totalErreurs}`);
  console.log('='.repeat(50));
  
  process.exit(0);
}

// Lancer la migration
migrerQuestions().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});