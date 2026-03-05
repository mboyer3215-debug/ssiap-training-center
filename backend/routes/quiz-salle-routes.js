// routes/quiz-salle.routes.js
// Quiz en Salle — multi-sessions, code temporaire 6 chiffres
// Structure Firebase : centers/{centerId}/quizSalles/{code}/

const express = require('express');
const router  = express.Router();

// ── Récupérer la DB Firebase (déjà initialisée dans le projet) ──
let db;
try {
  const admin = require('firebase-admin');
  db = admin.database();
} catch(e) {
  console.error('❌ quiz-salle.routes: firebase-admin non disponible', e.message);
}

function quizRef(centerId, code) {
  return db.ref(`centers/${centerId}/quizSalles/${code}`);
}
function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ══════════════════════════════════════════════════════════════
//  POST /api/quiz/creer-salle
//  Formateur génère un code de salle multi-sessions
// ══════════════════════════════════════════════════════════════
router.post('/creer-salle', async (req, res) => {
  if (!db) return res.json({ success: false, error: 'Firebase non initialisé' });
  const { centerId, formateurId, sessionsIncluded = [], niveau, type, nbQuestions, partieId } = req.body;
  if (!centerId) return res.json({ success: false, error: 'centerId requis' });

  try {
    // Générer un code unique
    let code, snap, exists = true, tries = 0;
    while (exists && tries < 10) {
      code  = genCode();
      snap  = await db.ref(`centers/${centerId}/quizSalles/${code}`).once('value');
      exists = snap.exists();
      tries++;
    }

    const salleData = {
      code,
      phase:      'attente',
      formateurId: formateurId || '',
      createdAt:  Date.now(),
      expiresAt:  Date.now() + 4 * 3600 * 1000,
      config: {
        niveau:           niveau      || '1',
        type:             type        || 'debut_session',
        nbQuestions:      parseInt(nbQuestions) || 10,
        partieId:         partieId    || 'toutes',
        sessionsIncluded: sessionsIncluded,
      },
      participants: {}
    };

    await quizRef(centerId, code).set(salleData);
    console.log(`✅ Quiz salle créée : ${code} (centre ${centerId})`);
    res.json({ success: true, code, expiresAt: salleData.expiresAt });

  } catch(e) {
    console.error('creer-salle:', e);
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  POST /api/quiz/rejoindre
//  Stagiaire rejoint avec son pseudo + code
// ══════════════════════════════════════════════════════════════
router.post('/rejoindre', async (req, res) => {
  if (!db) return res.json({ success: false, error: 'Firebase non initialisé' });
  const { code, centerId, pseudo, mode, stagiaireId, sessionId } = req.body;
  if (!code)     return res.json({ success: false, error: 'Code requis' });
  if (!centerId) return res.json({ success: false, error: 'centerId requis' });
  if (!pseudo)   return res.json({ success: false, error: 'Pseudo requis' });

  try {
    const snap = await quizRef(centerId, code).once('value');
    if (!snap.exists())          return res.json({ success: false, error: 'Code invalide ou inexistant' });

    const salle = snap.val();
    if (salle.phase === 'termine') return res.json({ success: false, error: 'Ce quiz est déjà terminé' });
    if (Date.now() > salle.expiresAt) return res.json({ success: false, error: 'Code expiré' });

    // Récupérer nom de session si dispo
    let sessionNom = '';
    if (sessionId) {
      try {
        const sSnap = await db.ref(`centers/${centerId}/sessions/${sessionId}/titre`).once('value');
        sessionNom  = sSnap.val() || '';
      } catch(e) {}
    }

    const participantId = stagiaireId || ('anon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));

    await quizRef(centerId, code).child('participants').child(participantId).set({
      pseudo:     pseudo,
      mode:       mode || 'solo',
      sessionId:  sessionId  || '',
      sessionNom: sessionNom || '',
      phase:      'attente',
      joinedAt:   Date.now(),
      score: null, total: null, pct: null,
    });

    res.json({
      success: true,
      participantId,
      centerId,
      quiz: {
        type:        salle.config.type,
        niveau:      salle.config.niveau,
        nbQuestions: salle.config.nbQuestions,
        partieId:    salle.config.partieId,
      }
    });

  } catch(e) {
    console.error('rejoindre:', e);
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  GET /api/quiz/statut/:code
//  Polling formateur ET stagiaire
// ══════════════════════════════════════════════════════════════
router.get('/statut/:code', async (req, res) => {
  if (!db) return res.json({ success: false, error: 'Firebase non initialisé' });
  const { code }     = req.params;
  const { centerId } = req.query;
  if (!centerId) return res.json({ success: false, error: 'centerId requis' });

  try {
    const snap = await quizRef(centerId, code).once('value');
    if (!snap.exists()) return res.json({ success: false, error: 'Salle introuvable' });

    const salle = snap.val();
    res.json({
      success:      true,
      phase:        salle.phase,
      participants: salle.participants || {},
      // Questions envoyées seulement si phase actif
      questions:    salle.phase === 'actif' ? (salle.questions || []) : [],
    });

  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  POST /api/quiz/lancer/:code
//  Formateur démarre → charge les questions depuis Firebase
// ══════════════════════════════════════════════════════════════
router.post('/lancer/:code', async (req, res) => {
  if (!db) return res.json({ success: false, error: 'Firebase non initialisé' });
  const { code }     = req.params;
  const { centerId } = req.body;
  if (!centerId) return res.json({ success: false, error: 'centerId requis' });

  try {
    const snap  = await quizRef(centerId, code).once('value');
    if (!snap.exists()) return res.json({ success: false, error: 'Salle introuvable' });

    const salle    = snap.val();
    const config   = salle.config || {};
    const niveau   = config.niveau   || '1';
    const nb       = parseInt(config.nbQuestions) || 10;
    const partieId = config.partieId || 'toutes';

    // Charger questions — même structure que entrainement.routes.js
    const qSnap = await db.ref(`questions/SSIAP${niveau}`).once('value');
    let allQuestions = [];
    qSnap.forEach(q => {
      const d = q.val();
      const matchPartie = !partieId || partieId === 'toutes'
        || d.partieId === partieId
        || d.partie   === partieId
        || d.category === partieId;
      if (matchPartie) allQuestions.push({ id: q.key, ...d });
    });

    // Mélanger
    allQuestions.sort(() => Math.random() - 0.5);
    const questions = allQuestions.slice(0, nb).map(q => ({
      id:             q.id,
      question:       q.question || q.texte || '',
      options:        q.options  || q.reponses || [],
      correctAnswers: Array.isArray(q.correctAnswers)
        ? q.correctAnswers
        : [q.correctAnswer ?? q.bonneReponse ?? 0],
      explanation:    q.explanation || q.explication || '',
      partieId:       q.partieId || q.partie || '',
    }));

    if (!questions.length) {
      return res.json({ success: false, error: `Aucune question trouvée pour SSIAP ${niveau}${partieId !== 'toutes' ? ' partie ' + partieId : ''}` });
    }

    // Passer la salle en mode actif
    await quizRef(centerId, code).update({
      phase:     'actif',
      startedAt: Date.now(),
      questions,
    });

    // Mettre les participants en phase 'quiz'
    const parts   = salle.participants || {};
    const updates = {};
    Object.keys(parts).forEach(pid => { updates[`participants/${pid}/phase`] = 'quiz'; });
    if (Object.keys(updates).length) await quizRef(centerId, code).update(updates);

    console.log(`▶ Quiz lancé : ${code} — ${questions.length} questions`);
    res.json({ success: true, nbQuestions: questions.length });

  } catch(e) {
    console.error('lancer:', e);
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  POST /api/quiz/repondre
//  Suivi live des réponses (optionnel)
// ══════════════════════════════════════════════════════════════
router.post('/repondre', async (req, res) => {
  if (!db) return res.json({ success: false });
  const { code, centerId, participantId, questionIndex, answers, isCorrect } = req.body;
  if (!code || !centerId || !participantId) return res.json({ success: false });
  try {
    await quizRef(centerId, code)
      .child('participants').child(participantId)
      .child(`reponses/${questionIndex}`)
      .set({ answers: answers || [], isCorrect: !!isCorrect, at: Date.now() });
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

// ══════════════════════════════════════════════════════════════
//  POST /api/quiz/fin-participant
//  Stagiaire termine → score enregistré + classement renvoyé
// ══════════════════════════════════════════════════════════════
router.post('/fin-participant', async (req, res) => {
  if (!db) return res.json({ success: false });
  const { code, centerId, participantId, pseudo, mode, score, total, pct, detailsEchecs } = req.body;
  if (!code || !centerId || !participantId) return res.json({ success: false });

  try {
    await quizRef(centerId, code)
      .child('participants').child(participantId)
      .update({
        phase:         'done',
        pseudo:        pseudo || '',
        mode:          mode   || 'solo',
        score:         score  ?? 0,
        total:         total  ?? 0,
        pct:           pct    ?? 0,
        finishedAt:    Date.now(),
        detailsEchecs: detailsEchecs || null,
      });

    // Renvoyer classement instantané
    const snap  = await quizRef(centerId, code).child('participants').once('value');
    const parts = snap.val() || {};
    const classement = Object.entries(parts)
      .filter(([, p]) => p.pct != null)
      .map(([pid, p]) => ({
        participantId: pid,
        pseudo:        p.pseudo || p.prenom || '—',
        mode:          p.mode   || 'solo',
        sessionNom:    p.sessionNom || '',
        score:         p.score,
        total:         p.total,
        pct:           p.pct,
      }))
      .sort((a, b) => (parseFloat(b.pct) || 0) - (parseFloat(a.pct) || 0));

    res.json({ success: true, classement });

  } catch(e) {
    console.error('fin-participant:', e);
    res.json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  POST /api/quiz/terminer/:code
//  Formateur ferme la salle → résultats finaux
// ══════════════════════════════════════════════════════════════
router.post('/terminer/:code', async (req, res) => {
  if (!db) return res.json({ success: false });
  const { code }             = req.params;
  const { centerId, annule } = req.body;
  if (!centerId) return res.json({ success: false });

  try {
    await quizRef(centerId, code).update({
      phase:      annule ? 'annule' : 'termine',
      finishedAt: Date.now(),
    });

    const snap  = await quizRef(centerId, code).child('participants').once('value');
    const parts = snap.val() || {};
    const resultats = Object.entries(parts)
      .filter(([, p]) => p.pct != null)
      .map(([pid, p]) => ({
        participantId: pid,
        pseudo:        p.pseudo || '—',
        mode:          p.mode   || 'solo',
        sessionNom:    p.sessionNom || '',
        pct:           p.pct,
        score:         p.score,
        total:         p.total,
      }))
      .sort((a, b) => (parseFloat(b.pct) || 0) - (parseFloat(a.pct) || 0));

    console.log(`⏹ Quiz terminé : ${code}`);
    res.json({ success: true, resultats });

  } catch(e) {
    console.error('terminer:', e);
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;