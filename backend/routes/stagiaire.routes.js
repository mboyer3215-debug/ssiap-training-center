// backend/routes/stagiaire.routes.js
// Gestion des stagiaires par centre - avec notion de session

const express = require('express');
const router  = express.Router();
const { db }  = require('../config/firebase');

// Générer PIN 4 chiffres UNIQUE sur tous les centres (pas de doublon global)
async function generateUniquePIN() {
    let pin;
    let exists   = true;
    let attempts = 0;
    while (exists && attempts < 100) {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
        const snapshot  = await db.ref('centers').once('value');
        const allCenters = snapshot.val() || {};
        exists = Object.values(allCenters).some(center => {
            const stagiaires = center.stagiaires || {};
            return Object.values(stagiaires).some(s => s.pin === pin);
        });
        attempts++;
    }
    return pin;
}

// Helper : vérifier si la licence est expirée
function isLicenseExpired(centerData) {
    const license = centerData?.license || {};
    if (!license.expiresAt) return false;
    return Date.now() > license.expiresAt;
}

/**
 * POST /api/stagiaire/create
 */
router.post('/create', async (req, res) => {
    try {
        const { centerId, sessionId, nom, prenom, email, telephone } = req.body;

        if (!centerId || !sessionId || !nom || !prenom) {
            return res.status(400).json({
                success: false,
                error: 'centerId, sessionId, nom et prenom sont requis'
            });
        }

        const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
        const centerData     = centerSnapshot.val();
        if (!centerData) {
            return res.status(404).json({ success: false, error: 'Centre introuvable' });
        }
        if (isLicenseExpired(centerData)) {
            return res.status(403).json({ success: false, error: 'Licence expirée', licenseExpired: true });
        }

        const sessionSnapshot = await db.ref(`centers/${centerId}/sessions/${sessionId}`).once('value');
        const session         = sessionSnapshot.val();
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session introuvable' });
        }

        const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
        const stagiaires         = stagiairesSnapshot.val() || {};
        const stagiairesActifs   = Object.values(stagiaires).filter(s => s.status === 'actif');
        const maxStagiaires      = centerData.license?.maxStagiaires || 999;
        if (stagiairesActifs.length >= maxStagiaires) {
            return res.status(403).json({
                success: false,
                error: `Limite atteinte : ${maxStagiaires} stagiaires actifs maximum`
            });
        }

        const pin         = await generateUniquePIN();
        const stagiaireId = 'STG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const qrCodeData  = Buffer.from(JSON.stringify({ centerId, stagiaireId, pin, type: 'stagiaire' })).toString('base64');

        const stagiaireData = {
            stagiaireId,
            centerId,
            sessionId,
            nom:       nom.toUpperCase(),
            prenom,
            email:     email || '',
            telephone: telephone || '',
            pin,
            qrCodeData,
            status:    'actif',
            dateDebut: session.dateDebut,
            dateFin:   session.dateFin,
            createdAt: Date.now()
        };

        await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`).set(stagiaireData);
        await db.ref(`centers/${centerId}/sessions/${sessionId}/nbStagiaires`)
            .transaction(count => (count || 0) + 1);

        console.log(`✅ Stagiaire créé: ${nom} ${prenom} - PIN: ${pin} - Session: ${session.titre}`);
        res.json({ success: true, stagiaire: stagiaireData });

    } catch (error) {
        console.error('Erreur création stagiaire:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/stagiaire/list/:centerId
 */
router.get('/list/:centerId', async (req, res) => {
    try {
        const { centerId }  = req.params;
        const { sessionId } = req.query;

        const snapshot      = await db.ref(`centers/${centerId}/stagiaires`).once('value');
        const stagiairesRaw = snapshot.val() || {};
        let stagiaires      = Object.values(stagiairesRaw);

        if (sessionId) stagiaires = stagiaires.filter(s => s.sessionId === sessionId);

        const now = Date.now();
        stagiaires = stagiaires.map(s => ({
            ...s,
            status: s.dateFin && now > s.dateFin ? 'expiré' : 'actif'
        }));
        stagiaires.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

        res.json({ success: true, stagiaires });
    } catch (error) {
        console.error('Erreur liste stagiaires:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/stagiaire/update/:stagiaireId
 */
router.put('/update/:stagiaireId', async (req, res) => {
    try {
        const { stagiaireId }                         = req.params;
        const { centerId, nom, prenom, email, telephone } = req.body;

        if (!centerId) return res.status(400).json({ success: false, error: 'centerId requis' });

        const stagRef = db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`);
        const snap    = await stagRef.once('value');
        if (!snap.exists()) return res.status(404).json({ success: false, error: 'Stagiaire introuvable' });

        const updates = { updatedAt: Date.now() };
        if (nom)                     updates.nom       = nom.toUpperCase();
        if (prenom)                  updates.prenom    = prenom;
        if (email !== undefined)     updates.email     = email;
        if (telephone !== undefined) updates.telephone = telephone;

        await stagRef.update(updates);
        res.json({ success: true, message: 'Stagiaire mis à jour' });
    } catch (error) {
        console.error('Erreur update stagiaire:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/stagiaire/delete/:stagiaireId
 */
router.delete('/delete/:stagiaireId', async (req, res) => {
    try {
        const { stagiaireId } = req.params;
        const { centerId }    = req.query;

        if (!centerId) return res.status(400).json({ success: false, error: 'centerId requis' });

        const stagRef  = db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`);
        const snap     = await stagRef.once('value');
        const stagiaire = snap.val();
        if (!stagiaire) return res.status(404).json({ success: false, error: 'Stagiaire introuvable' });

        if (stagiaire.sessionId) {
            await db.ref(`centers/${centerId}/sessions/${stagiaire.sessionId}/nbStagiaires`)
                .transaction(count => Math.max(0, (count || 1) - 1));
        }
        await stagRef.remove();
        res.json({ success: true, message: 'Stagiaire supprimé' });
    } catch (error) {
        console.error('Erreur suppression stagiaire:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/stagiaire/login
 * - Avec centerId : recherche dans ce centre
 * - Sans centerId : recherche globale par PIN sur tous les centres
 */
router.post('/login', async (req, res) => {
    try {
        const { centerId, pin, qrCode, sessionId, loginType, stagiaireId } = req.body;

        let stagiaire        = null;
        let centerData       = null;
        let resolvedCenterId = centerId;

        // ── MODE SANS centerId : recherche globale par PIN ──
        if (!centerId && pin) {
            const allSnap    = await db.ref('centers').once('value');
            const allCenters = allSnap.val() || {};
            for (const [cId, center] of Object.entries(allCenters)) {
                const stagiaires = center.stagiaires || {};
                const found      = Object.values(stagiaires).find(s => s.pin === pin);
                if (found) {
                    stagiaire        = found;
                    centerData       = center;
                    resolvedCenterId = cId;
                    break;
                }
            }
            if (!stagiaire) {
                return res.status(401).json({ success: false, error: 'Code PIN incorrect' });
            }

        } else {
            // ── MODE NORMAL avec centerId ──
            if (!centerId) return res.status(400).json({ success: false, error: 'centerId requis' });

            const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
            centerData = centerSnapshot.val();
            if (!centerData) return res.status(404).json({ success: false, error: 'Centre introuvable' });
            if (isLicenseExpired(centerData)) {
                return res.status(403).json({ success: false, error: 'Licence expirée', licenseExpired: true });
            }

            if (qrCode) {
                try {
                    const decoded = JSON.parse(Buffer.from(qrCode, 'base64').toString('utf8'));
                    if (decoded.type !== 'stagiaire' || decoded.centerId !== centerId) {
                        return res.status(400).json({ success: false, error: 'QR code invalide (format)' });
                    }
                    const snap = await db.ref(`centers/${centerId}/stagiaires/${decoded.stagiaireId}`).once('value');
                    stagiaire  = snap.val();
                } catch (e) {
                    return res.status(400).json({ success: false, error: 'QR code invalide' });
                }
            } else if (stagiaireId) {
                const snap = await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`).once('value');
                stagiaire  = snap.val();
                if (stagiaire && pin && stagiaire.pin !== pin) stagiaire = null;
            } else if (pin) {
                const snap = await db.ref(`centers/${centerId}/stagiaires`)
                    .orderByChild('pin').equalTo(pin).once('value');
                if (snap.exists()) stagiaire = Object.values(snap.val())[0];
            } else {
                return res.status(400).json({ success: false, error: 'PIN ou QR code requis' });
            }
        }

        if (!stagiaire) return res.status(401).json({ success: false, error: 'Stagiaire non trouvé' });
        if (isLicenseExpired(centerData)) return res.status(403).json({ success: false, error: 'Licence expirée' });

        const now = Date.now();
        if (stagiaire.dateFin && now > stagiaire.dateFin) {
            return res.status(403).json({ success: false, error: 'Accès expiré - votre session de formation est terminée' });
        }

        let sessionInfo = null;
        if (stagiaire.sessionId) {
            const sessionSnap = await db.ref(`centers/${resolvedCenterId}/sessions/${stagiaire.sessionId}`).once('value');
            sessionInfo = sessionSnap.val();
        }

        console.log(`✅ Connexion stagiaire: ${stagiaire.nom} ${stagiaire.prenom} (centre: ${resolvedCenterId})`);
        res.json({
            success: true,
            stagiaire: {
                ...stagiaire,
                centerId: resolvedCenterId,
                session: sessionInfo ? {
                    titre:     sessionInfo.titre,
                    niveau:    sessionInfo.niveau,
                    dateDebut: sessionInfo.dateDebut,
                    dateFin:   sessionInfo.dateFin
                } : null
            },
            centerInfo: { nom: centerData.info?.nom || centerData.nom || '' }
        });

    } catch (error) {
        console.error('Erreur login stagiaire:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/stagiaire/save-result
 * Sauvegarde un résultat d'entraînement dans l'historique du stagiaire
 */
router.post('/save-result', async (req, res) => {
    try {
        const { centerId, sessionId, stagiaireId, score, total, pct, niveau, partieId, temps } = req.body;

        if (!centerId || !stagiaireId) {
            return res.status(400).json({ success: false, error: 'centerId et stagiaireId requis' });
        }

        const timestamp = Date.now();
        const resultId  = `TRAIN_${timestamp}`;

        const resultData = {
            resultId,
            sessionId:   sessionId || '',
            score:       score  || 0,
            total:       total  || 0,
            pct:         pct    || 0,
            niveau:      niveau || 1,
            partieId:    partieId || 'toutes',
            temps:       temps  || 0,
            mode:        'entrainement',
            date:        timestamp,
            completedAt: timestamp,
        };

        await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}/historique/${resultId}`).set(resultData);

        console.log(`✅ Résultat sauvegardé: ${stagiaireId} - ${score}/${total} (${pct}%)`);
        res.json({ success: true, resultId });

    } catch (error) {
        console.error('Erreur save-result:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/stagiaire/historique/:stagiaireId
 * Récupère l'historique d'entraînements d'un stagiaire
 */
router.get('/historique/:stagiaireId', async (req, res) => {
    try {
        const { stagiaireId } = req.params;
        const { centerId }    = req.query;

        if (!centerId) {
            return res.status(400).json({ success: false, error: 'centerId requis' });
        }

        const snap = await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}/historique`).once('value');
        const raw  = snap.val() || {};

        // Convertir en tableau, trier du plus récent au plus ancien
        const historique = Object.values(raw)
            .sort((a, b) => (b.date || b.completedAt || 0) - (a.date || a.completedAt || 0));

        res.json({ success: true, historique });

    } catch (error) {
        console.error('Erreur historique:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/stagiaire/quiz-result
 */
router.post('/quiz-result', async (req, res) => {
    try {
        const { centerId, sessionId, type, scores, nbQuestions } = req.body;

        if (!centerId || !sessionId || !scores) {
            return res.status(400).json({ success: false, error: 'Paramètres manquants' });
        }

        const timestamp = Date.now();
        const resultId  = `QUIZ_${timestamp}`;

        await db.ref(`centers/${centerId}/sessions/${sessionId}/quizResults/${resultId}`).set({
            resultId, type, nbQuestions, scores, completedAt: timestamp
        });

        for (const [stagiaireId, score] of Object.entries(scores)) {
            await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}/historique/${resultId}`).set({
                resultId, sessionId, type,
                score: score.score, total: score.total, pct: score.pct,
                completedAt: timestamp, date: timestamp, mode: 'salle'
            });
        }

        console.log(`✅ Quiz résultats sauvegardés - Session ${sessionId} - ${Object.keys(scores).length} stagiaires`);
        res.json({ success: true, resultId });

    } catch (error) {
        console.error('Erreur sauvegarde quiz result:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;