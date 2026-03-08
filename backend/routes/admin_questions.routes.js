// routes/admin-questions.routes.js
// CRUD questions Firebase — protégé par JWT admin

const express              = require('express');
const router               = express.Router();
const { db }               = require('../config/firebase');
const { verifyAdminToken } = require('../middleware/admin.auth.middleware'); 

// Toutes les routes de ce fichier exigent un JWT admin valide
router.use(verifyAdminToken);

// ── GET /api/admin/questions/:niveau ──────────────────────────────────────
router.get('/questions/:niveau', async (req, res) => {
    const niveau = parseInt(req.params.niveau);
    if (![1,2,3].includes(niveau)) return res.json({ success:false, error:'Niveau invalide' });

    try {
        const snap = await db.ref(`questions/${niveau}`).once('value');
        const raw  = snap.val() || {};
        const questions = Object.entries(raw).map(([id, d]) => ({
            id,
            type:           d.type || 'quiz',
            question:       d.question || d.texte || '',
            scenario:       d.scenario || d.contexte || '',
            options:        d.options || d.propositions || [],
            correctAnswers: Array.isArray(d.correctAnswers)  ? d.correctAnswers.map(Number)
                          : Array.isArray(d.reponse_correcte) ? d.reponse_correcte.map(Number)
                          : [0],
            explanation:    typeof d.explanation === 'string' ? d.explanation
                          : (d.explanation?.complete || d.explanation?.simple || d.explication || ''),
            partie:         d.partie || d.partieId || 'partie1',
        }));

        res.json({ success:true, niveau, count:questions.length, questions });
    } catch(e) {
        res.json({ success:false, error:e.message });
    }
});

// ── POST /api/admin/questions/save ────────────────────────────────────────
router.post('/questions/save', async (req, res) => {
    const { niveau, questionId, data } = req.body;

    if (![1,2,3].includes(niveau)) return res.json({ success:false, error:'Niveau invalide' });
    if (!data || !data.question)   return res.json({ success:false, error:'Question requise' });

    try {
        const questionData = {
            type:           data.type || 'quiz',
            question:       data.question.trim().slice(0, 1000),
            options:        (data.options || []).map(o => String(o).slice(0, 300)),
            correctAnswers: data.correctAnswers || [0],
            explanation:    (data.explanation || '').slice(0, 2000),
            partie:         data.partie || 'partie1',
            updatedAt:      Date.now(),
        };
        if (data.scenario) questionData.scenario = data.scenario.trim().slice(0, 1000);

        let ref;
        if (questionId) {
            ref = db.ref(`questions/${niveau}/${questionId}`);
            await ref.update(questionData);
        } else {
            questionData.createdAt = Date.now();
            ref = db.ref(`questions/${niveau}`).push();
            await ref.set(questionData);
        }

        console.log(`✅ Question ${questionId ? 'modifiée' : 'créée'} — niveau ${niveau}`);
        res.json({ success:true, questionId: questionId || ref.key });
    } catch(e) {
        res.json({ success:false, error:e.message });
    }
});

// ── POST /api/admin/questions/delete ─────────────────────────────────────
router.post('/questions/delete', async (req, res) => {
    const { niveau, questionId } = req.body;

    if (!questionId)               return res.json({ success:false, error:'questionId requis' });
    if (![1,2,3].includes(niveau)) return res.json({ success:false, error:'Niveau invalide' });

    try {
        await db.ref(`questions/${niveau}/${questionId}`).remove();
        console.log(`🗑️  Question supprimée — niveau ${niveau} — id ${questionId}`);
        res.json({ success:true });
    } catch(e) {
        res.json({ success:false, error:e.message });
    }
});

module.exports = router;
