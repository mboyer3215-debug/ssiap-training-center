// ══════════════════════════════════════════════════════════════
// GET /api/formateur/questions-stats/:formateurId
// Query: centerId (requis), niveau (optionnel: "SSIAP1","SSIAP2","SSIAP3")
//
// Agrège les detailsEchecs de tous les stagiaires du centre
// et retourne les questions les plus échouées.
//
// Structure Firebase lue :
//   centers/{centerId}/stagiaires/{stagId}/historique/{trainId}/detailsEchecs[]
//     - question, correctAnswerLabels[], userAnswerLabels[], explanation
//   + historique/{trainId}: niveau (int 1/2/3), partieId, sessionId
// ══════════════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const db      = admin.database();
router.get('/questions-stats/:formateurId', async (req, res) => {
  const { formateurId } = req.params;
  const { centerId, niveau } = req.query;

  if (!centerId) return res.status(400).json({ error: 'centerId requis' });

  // Convertir "SSIAP1" → 1, "SSIAP2" → 2, etc.
  const niveauFilter = niveau
    ? parseInt(niveau.replace('SSIAP', ''))
    : null;

  try {
    const snap = await db.ref(`centers/${centerId}/stagiaires`).once('value');
    if (!snap.exists()) return res.json({ questions: [], total: 0 });

    // Map : questionText → { count, tentatives, correctAnswerLabels, explanation }
    const questionMap = {};

    snap.forEach(stagChild => {
      const stag = stagChild.val();
      const historique = stag.historique || {};

      Object.values(historique).forEach(train => {
        // Filtrer par niveau si demandé
        if (niveauFilter && train.niveau !== niveauFilter) return;

        const echecs = train.detailsEchecs;
        if (!echecs || !Array.isArray(echecs)) return;

        echecs.forEach(echec => {
          const q = echec.question;
          if (!q) return;

          if (!questionMap[q]) {
            questionMap[q] = {
              question:            q,
              echecCount:          0,
              tentativeCount:      0,
              correctAnswerLabels: echec.correctAnswerLabels || [],
              explanation:         echec.explanation || ''
            };
          }
          questionMap[q].echecCount++;
        });
      });

      // Compter aussi les tentatives totales pour ce stagiaire/niveau
      Object.values(historique).forEach(train => {
        if (niveauFilter && train.niveau !== niveauFilter) return;
        const total = train.total || 0;
        // On incrémente tentativeCount sur toutes les questions échouées de ce train
        const echecs = train.detailsEchecs;
        if (!echecs || !Array.isArray(echecs)) return;
        echecs.forEach(echec => {
          const q = echec.question;
          if (q && questionMap[q]) {
            questionMap[q].tentativeCount += (train.total || 1);
          }
        });
      });
    });

    // Trier par nombre d'échecs décroissant
    const questions = Object.values(questionMap)
      .map(q => ({
        question:            q.question,
        echecCount:          q.echecCount,
        tauxEchec:           q.tentativeCount > 0
          ? Math.round((q.echecCount / q.tentativeCount) * 100)
          : 100,
        tentatives:          q.tentativeCount,
        correctAnswerLabels: q.correctAnswerLabels,
        explanation:         q.explanation
      }))
      .sort((a, b) => b.echecCount - a.echecCount)
      .slice(0, 20); // Top 20

    res.json({ questions, total: questions.length, niveau: niveau || 'tous' });

  } catch (err) {
    console.error('Erreur questions-stats:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
module.exports = router;
