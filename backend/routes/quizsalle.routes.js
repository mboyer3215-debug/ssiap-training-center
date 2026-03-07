// routes/quizSalle.routes.js — Mode Kahoot : formateur pilote question par question
const express = require('express');
const router  = express.Router();
const { db }  = require('../config/firebase');

function salleRef(centerId, code) {
  return db.ref(`centers/${centerId}/quizSalles/${code}`);
}
function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── POST /api/quiz/creer-salle ──────────────────────────────────────────────
router.post('/creer-salle', async (req, res) => {
  const { centerId, formateurId, sessionId, sessionsIncluded=[], niveau, type, nbQuestions, partieId } = req.body;
  if (!centerId) return res.json({ success:false, error:'centerId requis' });
  try {
    let code, snap, exists=true, tries=0;
    while (exists && tries<10) {
      code  = genCode();
      snap  = await salleRef(centerId, code).once('value');
      exists = snap.exists(); tries++;
    }
    await salleRef(centerId, code).set({
      code, phase:'attente',
      formateurId: formateurId||'',
      sessionId:   sessionId||'',
      createdAt:   Date.now(),
      expiresAt:   Date.now() + 4*3600*1000,
      currentQuestion: -1,
      showResults: false,
      config: {
        niveau:      niveau||'1',
        type:        type||'debut_session',
        nbQuestions: parseInt(nbQuestions)||10,
        partieId:    partieId||'toutes',
        sessionsIncluded
      },
      participants: {},
      questions:    []
    });
    res.json({ success:true, code });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── POST /api/quiz/rejoindre ────────────────────────────────────────────────
router.post('/rejoindre', async (req, res) => {
  const { code, centerId, pseudo, mode, stagiaireId, sessionId } = req.body;
  if (!code||!centerId||!pseudo) return res.json({ success:false, error:'Paramètres manquants' });
  try {
    const snap = await salleRef(centerId, code).once('value');
    if (!snap.exists()) return res.json({ success:false, error:'Code invalide' });
    const salle = snap.val();
    if (salle.phase==='termine'||salle.phase==='annule') return res.json({ success:false, error:'Quiz terminé' });
    if (Date.now()>salle.expiresAt) return res.json({ success:false, error:'Code expiré' });

    let sessionNom='';
    if (sessionId) {
      try { const s=await db.ref(`centers/${centerId}/sessions/${sessionId}/titre`).once('value'); sessionNom=s.val()||''; } catch(e){}
    }
    const participantId = stagiaireId||('anon_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
    await salleRef(centerId,code).child('participants').child(participantId).set({
      pseudo, mode:mode||'solo',
      sessionId:sessionId||'', sessionNom,
      phase:'attente', joinedAt:Date.now(),
      score:0, tempsTotal:0, reponses:{}
    });
    res.json({ success:true, participantId, centerId,
      quiz:{ niveau:salle.config.niveau, nbQuestions:salle.config.nbQuestions }
    });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── GET /api/quiz/statut/:code ──────────────────────────────────────────────
// Utilisé par formateur ET stagiaire en polling
router.get('/statut/:code', async (req, res) => {
  const { code }     = req.params;
  const { centerId } = req.query;
  if (!centerId) return res.json({ success:false, error:'centerId requis' });
  try {
    const snap = await salleRef(centerId, code).once('value');
    if (!snap.exists()) return res.json({ success:false, error:'Salle introuvable' });
    const salle = snap.val();
    const cq    = salle.currentQuestion ?? -1;
    const qs    = salle.questions || [];
    // On envoie la question courante (sans les autres — sécurité)
    const questionCourante = (salle.phase==='actif' && cq>=0 && qs[cq]) ? qs[cq] : null;
    res.json({
      success:true,
      phase:            salle.phase,
      currentQuestion:  cq,
      totalQuestions:   qs.length,
      questionCourante,
      showResults:      salle.showResults||false,
      participants:     salle.participants||{}
    });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── POST /api/quiz/lancer/:code ─────────────────────────────────────────────
// Formateur démarre → charge questions, passe en phase actif, currentQuestion=0
router.post('/lancer/:code', async (req, res) => {
  const { code }     = req.params;
  const { centerId } = req.body;
  if (!centerId) return res.json({ success:false, error:'centerId requis' });
  try {
    const snap  = await salleRef(centerId, code).once('value');
    if (!snap.exists()) return res.json({ success:false, error:'Salle introuvable' });
    const salle  = snap.val();
    const config = salle.config||{};
    const niveau   = parseInt(config.niveau)||1;
    const nb       = parseInt(config.nbQuestions)||10;
    const partieId = config.partieId||'toutes';

    // Charger questions depuis Firebase (même chemin qu'entrainement.routes.js)
    const qSnap = await db.ref(`questions/${niveau}`).once('value');
    const raw   = qSnap.val()||{};
    let all = Object.entries(raw).map(([id,d])=>({id,...d}));

    if (partieId && partieId!=='toutes') {
      const f = all.filter(q=>q.partie===partieId||q.partieId===partieId);
      if (f.length>0) all=f;
    }
    all.sort(()=>Math.random()-.5);

    const questions = all.slice(0,nb).map(q=>({
      id:       q.id,
      question: q.question||q.texte||'',
      options:  q.options||q.propositions||[],
      correctAnswers: Array.isArray(q.correctAnswers)  ? q.correctAnswers.map(Number)
                    : Array.isArray(q.reponse_correcte) ? q.reponse_correcte.map(Number)
                    : [Number(q.correctAnswer??0)],
      explanation: typeof q.explanation==='string' ? q.explanation
                 : (q.explanation?.complete||q.explanation?.simple||q.explication||''),
      partieId: q.partieId||q.partie||''
    }));

    if (!questions.length) return res.json({ success:false, error:'Aucune question trouvée pour ce niveau/partie' });

    // Passer en actif
    await salleRef(centerId,code).update({
      phase:'actif', startedAt:Date.now(), questions,
      currentQuestion:0, questionStartedAt:Date.now(), showResults:false
    });

    // Mettre les participants en phase quiz
    const parts = salle.participants||{};
    const upd={};
    Object.keys(parts).forEach(pid=>{ upd[`participants/${pid}/phase`]='quiz'; });
    if (Object.keys(upd).length) await salleRef(centerId,code).update(upd);

    res.json({ success:true, nbQuestions:questions.length });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── POST /api/quiz/afficher-resultats/:code ─────────────────────────────────
// Formateur affiche les bonnes réponses (showResults=true)
router.post('/afficher-resultats/:code', async (req, res) => {
  const { code }     = req.params;
  const { centerId } = req.body;
  if (!centerId) return res.json({ success:false });
  try {
    await salleRef(centerId,code).update({ showResults:true });
    res.json({ success:true });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── POST /api/quiz/question-suivante/:code ──────────────────────────────────
// Formateur passe à la question suivante (ou termine)
router.post('/question-suivante/:code', async (req, res) => {
  const { code }     = req.params;
  const { centerId } = req.body;
  if (!centerId) return res.json({ success:false });
  try {
    const snap  = await salleRef(centerId, code).once('value');
    const salle = snap.val();
    if (!salle) return res.json({ success:false, error:'Salle introuvable' });

    const next  = (salle.currentQuestion??0)+1;
    const total = (salle.questions||[]).length;

    if (next>=total) {
      // FIN : calculer classement
      await salleRef(centerId,code).update({ phase:'termine', finishedAt:Date.now(), showResults:false });
      const parts = salle.participants||{};
      const classement = Object.entries(parts).map(([pid,p])=>({
        participantId:pid, pseudo:p.pseudo||'—', mode:p.mode||'solo',
        score:p.score||0, tempsTotal:p.tempsTotal||0,
        pct:Math.round(((p.score||0)/total)*100)
      })).sort((a,b)=>b.score-a.score||a.tempsTotal-b.tempsTotal);
      return res.json({ success:true, termine:true, classement, totalQuestions:total });
    }

    await salleRef(centerId,code).update({
      currentQuestion:next, questionStartedAt:Date.now(), showResults:false
    });
    res.json({ success:true, termine:false, currentQuestion:next });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── POST /api/quiz/repondre ─────────────────────────────────────────────────
// Stagiaire soumet sa réponse à la question courante
router.post('/repondre', async (req, res) => {
  const { code, centerId, participantId, questionIndex, answers } = req.body;
  if (!code||!centerId||!participantId) return res.json({ success:false });
  try {
    const snap  = await salleRef(centerId, code).once('value');
    const salle = snap.val();
    if (!salle||salle.phase!=='actif') return res.json({ success:false, error:'Quiz non actif' });

    const q = (salle.questions||[])[questionIndex];
    if (!q) return res.json({ success:false, error:'Question introuvable' });

    // Vérifier si déjà répondu
    const p = (salle.participants||{})[participantId]||{};
    if (p.reponses&&p.reponses[questionIndex]) {
      return res.json({ success:false, error:'Déjà répondu' });
    }

    const correctIdxs = (q.correctAnswers||[0]).map(Number);
    const userAnswers = (answers||[]).map(Number);
    const isCorrect   = correctIdxs.length===userAnswers.length
      && correctIdxs.every(c=>userAnswers.includes(c));

    const tempsReponse = Date.now()-(salle.questionStartedAt||Date.now());

    await salleRef(centerId,code).child('participants').child(participantId).update({
      [`reponses/${questionIndex}`]: { answers:userAnswers, isCorrect, tempsReponse, at:Date.now() },
      score:      (p.score||0)+(isCorrect?1:0),
      tempsTotal: (p.tempsTotal||0)+tempsReponse
    });

    res.json({ success:true, isCorrect, correctAnswers:correctIdxs, explanation:q.explanation||'' });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

// ── POST /api/quiz/terminer/:code ───────────────────────────────────────────
// Formateur arrête/annule le quiz
router.post('/terminer/:code', async (req, res) => {
  const { code }             = req.params;
  const { centerId, annule } = req.body;
  if (!centerId) return res.json({ success:false });
  try {
    const snap  = await salleRef(centerId, code).once('value');
    const salle = snap.val()||{};
    await salleRef(centerId,code).update({ phase:annule?'annule':'termine', finishedAt:Date.now() });
    const parts = salle.participants||{};
    const nb    = (salle.questions||[]).length||1;
    const resultats = Object.entries(parts).map(([pid,p])=>({
      participantId:pid, pseudo:p.pseudo||'—', mode:p.mode||'solo',
      score:p.score||0, tempsTotal:p.tempsTotal||0,
      pct:Math.round(((p.score||0)/nb)*100)
    })).sort((a,b)=>b.score-a.score||a.tempsTotal-b.tempsTotal);
    res.json({ success:true, resultats });
  } catch(e) { res.json({ success:false, error:e.message }); }
});

module.exports = router;