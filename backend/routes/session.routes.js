// backend/routes/session.routes.js
// Gestion des sessions de formation

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

/**
 * POST /api/session/create
 */
router.post('/create', async (req, res) => {
    try {
        const { centerId, titre, niveau, dateDebut, dateFin, formateurIds } = req.body;

        if (!centerId || !titre || !niveau || !dateDebut || !dateFin) {
            return res.status(400).json({
                success: false,
                error: 'centerId, titre, niveau, dateDebut et dateFin sont requis'
            });
        }

        // Vérifier que le centre existe
        const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
        const centerData = centerSnapshot.val();

        if (!centerData) {
            return res.status(404).json({ success: false, error: 'Centre introuvable' });
        }

        // FIX : lire la licence depuis le nœud licenses/ séparé
        const licenseSnapshot = await db.ref(`licenses/${centerId}`).once('value');
        const licenseData = licenseSnapshot.val();

        // Vérifier licence : si elle existe, vérifier expiration (expiresAt pas validUntil)
        if (licenseData && licenseData.expiresAt && Date.now() > licenseData.expiresAt) {
            return res.status(403).json({ success: false, error: 'Licence expirée' });
        }

        // Vérifier que les formateurs appartiennent bien au centre
        const formateursValides = [];
        if (formateurIds && formateurIds.length > 0) {
            for (const fId of formateurIds) {
                const fSnap = await db.ref(`centers/${centerId}/formateurs/${fId}`).once('value');
                if (fSnap.exists()) formateursValides.push(fId);
            }
        }

        // Générer ID session
        const sessionId = 'SES_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();

        const sessionData = {
            sessionId,
            centerId,
            titre,
            niveau,
            dateDebut: new Date(dateDebut).getTime(),
            dateFin:   new Date(dateFin).getTime(),
            formateurIds: formateursValides,
            nbStagiaires: 0,
            status: 'à venir',
            createdAt: Date.now()
        };

        await db.ref(`centers/${centerId}/sessions/${sessionId}`).set(sessionData);

        // Mettre à jour les formateurs : leur ajouter cette session
        for (const fId of formateursValides) {
            await db.ref(`centers/${centerId}/formateurs/${fId}/sessions/${sessionId}`).set(true);
        }

        res.json({ success: true, session: sessionData });

    } catch (error) {
        console.error('Erreur création session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/session/list/:centerId
 */
router.get('/list/:centerId', async (req, res) => {
    try {
        const { centerId } = req.params;

        const sessionsSnapshot = await db.ref(`centers/${centerId}/sessions`).once('value');
        const sessionsRaw = sessionsSnapshot.val() || {};

        const formateursSnapshot = await db.ref(`centers/${centerId}/formateurs`).once('value');
        const formateursRaw = formateursSnapshot.val() || {};

        const sessions = Object.values(sessionsRaw).map(session => {
            const formateurs = (session.formateurIds || []).map(fId => {
                const f = formateursRaw[fId];
                return f ? { formateurId: fId, nom: f.nom, prenom: f.prenom } : null;
            }).filter(Boolean);

            // Calculer le statut dynamiquement selon les dates
            const now = Date.now();
            let status;
            if (now > session.dateFin)        status = 'terminée';
            else if (now >= session.dateDebut) status = 'en cours';
            else                               status = 'à venir';

            return { ...session, formateurs, status };
        });

        sessions.sort((a, b) => b.dateDebut - a.dateDebut);

        res.json({ success: true, sessions });

    } catch (error) {
        console.error('Erreur liste sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/session/detail/:centerId/:sessionId
 */
router.get('/detail/:centerId/:sessionId', async (req, res) => {
    try {
        const { centerId, sessionId } = req.params;

        const sessionSnapshot = await db.ref(`centers/${centerId}/sessions/${sessionId}`).once('value');
        const session = sessionSnapshot.val();

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session introuvable' });
        }

        // Récupérer les stagiaires de cette session
        const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
        const stagiairesRaw = stagiairesSnapshot.val() || {};
        const stagiaires = Object.values(stagiairesRaw).filter(s => s.sessionId === sessionId);

        // Récupérer les formateurs
        const formateursSnapshot = await db.ref(`centers/${centerId}/formateurs`).once('value');
        const formateursRaw = formateursSnapshot.val() || {};
        const formateurs = (session.formateurIds || []).map(fId => {
            const f = formateursRaw[fId];
            return f ? { formateurId: fId, nom: f.nom, prenom: f.prenom } : null;
        }).filter(Boolean);

        res.json({ success: true, session: { ...session, formateurs, stagiaires } });

    } catch (error) {
        console.error('Erreur détail session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/session/update/:sessionId
 */
router.put('/update/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { centerId, titre, niveau, dateDebut, dateFin, formateurIds } = req.body;

        if (!centerId) {
            return res.status(400).json({ success: false, error: 'centerId requis' });
        }

        const sessionRef  = db.ref(`centers/${centerId}/sessions/${sessionId}`);
        const sessionSnap = await sessionRef.once('value');

        if (!sessionSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Session introuvable' });
        }

        const oldSession = sessionSnap.val();
        const updates    = { updatedAt: Date.now() };

        if (titre)     updates.titre     = titre;
        if (niveau)    updates.niveau    = niveau;
        if (dateDebut) updates.dateDebut = new Date(dateDebut).getTime();
        if (dateFin)   updates.dateFin   = new Date(dateFin).getTime();

        if (formateurIds !== undefined) {
            for (const fId of (oldSession.formateurIds || [])) {
                await db.ref(`centers/${centerId}/formateurs/${fId}/sessions/${sessionId}`).remove();
            }
            for (const fId of formateurIds) {
                await db.ref(`centers/${centerId}/formateurs/${fId}/sessions/${sessionId}`).set(true);
            }
            updates.formateurIds = formateurIds;
        }

        await sessionRef.update(updates);

        res.json({ success: true, message: 'Session mise à jour' });

    } catch (error) {
        console.error('Erreur update session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/session/delete/:sessionId
 */
router.delete('/delete/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { centerId }  = req.query;

        if (!centerId) {
            return res.status(400).json({ success: false, error: 'centerId requis' });
        }

        const sessionSnap = await db.ref(`centers/${centerId}/sessions/${sessionId}`).once('value');
        const session     = sessionSnap.val();

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session introuvable' });
        }

        // Retirer session des formateurs
        for (const fId of (session.formateurIds || [])) {
            await db.ref(`centers/${centerId}/formateurs/${fId}/sessions/${sessionId}`).remove();
        }

        // Désassocier les stagiaires
        const stagiairesSnap = await db.ref(`centers/${centerId}/stagiaires`).once('value');
        const stagiaires     = stagiairesSnap.val() || {};
        for (const [sId, s] of Object.entries(stagiaires)) {
            if (s.sessionId === sessionId) {
                await db.ref(`centers/${centerId}/stagiaires/${sId}/sessionId`).remove();
                await db.ref(`centers/${centerId}/stagiaires/${sId}/status`).set('expiré');
            }
        }

        await db.ref(`centers/${centerId}/sessions/${sessionId}`).remove();

        res.json({ success: true, message: 'Session supprimée' });

    } catch (error) {
        console.error('Erreur suppression session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
