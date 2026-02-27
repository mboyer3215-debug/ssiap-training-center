// backend/routes/stagiaire.routes.js
// Gestion des stagiaires par centre - avec notion de session

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const crypto = require('crypto');

// Générer PIN 4 chiffres unique pour le centre
async function generateUniquePIN(centerId) {
    let pin;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 50) {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
        const snapshot = await db.ref(`centers/${centerId}/stagiaires`)
            .orderByChild('pin').equalTo(pin).once('value');
        exists = snapshot.exists();
        attempts++;
    }
    return pin;
}

/**
 * POST /api/stagiaire/create
 * Créer un stagiaire et l'associer à une session
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

        // Vérifier centre
        const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
        const centerData = centerSnapshot.val();

        if (!centerData) {
            return res.status(404).json({ success: false, error: 'Centre introuvable' });
        }

        if (centerData.license.status !== 'active' || Date.now() > centerData.license.validUntil) {
            return res.status(403).json({ success: false, error: 'Licence expirée', licenseExpired: true });
        }

        // Vérifier que la session existe
        const sessionSnapshot = await db.ref(`centers/${centerId}/sessions/${sessionId}`).once('value');
        const session = sessionSnapshot.val();

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session introuvable' });
        }

        // Vérifier limite stagiaires actifs (licence)
        const stagiairesSnapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
        const stagiaires = stagiairesSnapshot.val() || {};
        const stagiairesActifs = Object.values(stagiaires).filter(s => s.status === 'actif');

        if (stagiairesActifs.length >= centerData.license.maxStagiaires) {
            return res.status(403).json({
                success: false,
                error: `Limite atteinte : ${centerData.license.maxStagiaires} stagiaires actifs maximum`
            });
        }

        // Générer PIN et ID
        const pin = await generateUniquePIN(centerId);
        const stagiaireId = 'STG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();

        // QR code data : centerId + stagiaireId + pin
        const qrCodeData = Buffer.from(JSON.stringify({
            centerId,
            stagiaireId,
            pin,
            type: 'stagiaire'
        })).toString('base64');

        const stagiaireData = {
            stagiaireId,
            centerId,
            sessionId,
            nom: nom.toUpperCase(),
            prenom,
            email: email || '',
            telephone: telephone || '',
            pin,
            qrCodeData,
            status: 'actif',
            dateDebut: session.dateDebut,
            dateFin: session.dateFin,
            createdAt: Date.now()
        };

        // Sauvegarder le stagiaire
        await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`).set(stagiaireData);

        // Incrémenter le compteur de la session
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
 * Lister tous les stagiaires d'un centre
 */
router.get('/list/:centerId', async (req, res) => {
    try {
        const { centerId } = req.params;
        const { sessionId } = req.query;

        const snapshot = await db.ref(`centers/${centerId}/stagiaires`).once('value');
        const stagiairesRaw = snapshot.val() || {};

        let stagiaires = Object.values(stagiairesRaw);

        // Filtrer par session si demandé
        if (sessionId) {
            stagiaires = stagiaires.filter(s => s.sessionId === sessionId);
        }

        // Mettre à jour les statuts selon les dates
        const now = Date.now();
        stagiaires = stagiaires.map(s => ({
            ...s,
            status: now > s.dateFin ? 'expiré' : 'actif'
        }));

        stagiaires.sort((a, b) => a.nom.localeCompare(b.nom));

        res.json({ success: true, stagiaires });

    } catch (error) {
        console.error('Erreur liste stagiaires:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/stagiaire/update/:stagiaireId
 * Modifier un stagiaire
 */
router.put('/update/:stagiaireId', async (req, res) => {
    try {
        const { stagiaireId } = req.params;
        const { centerId, nom, prenom, email, telephone } = req.body;

        if (!centerId) {
            return res.status(400).json({ success: false, error: 'centerId requis' });
        }

        const stagRef = db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`);
        const snap = await stagRef.once('value');

        if (!snap.exists()) {
            return res.status(404).json({ success: false, error: 'Stagiaire introuvable' });
        }

        const updates = { updatedAt: Date.now() };
        if (nom) updates.nom = nom.toUpperCase();
        if (prenom) updates.prenom = prenom;
        if (email !== undefined) updates.email = email;
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
 * Supprimer un stagiaire
 */
router.delete('/delete/:stagiaireId', async (req, res) => {
    try {
        const { stagiaireId } = req.params;
        const { centerId } = req.query;

        if (!centerId) {
            return res.status(400).json({ success: false, error: 'centerId requis' });
        }

        const stagRef = db.ref(`centers/${centerId}/stagiaires/${stagiaireId}`);
        const snap = await stagRef.once('value');
        const stagiaire = snap.val();

        if (!stagiaire) {
            return res.status(404).json({ success: false, error: 'Stagiaire introuvable' });
        }

        // Décrémenter le compteur de la session
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
 * Connexion stagiaire par PIN ou QR code
 */
router.post('/login', async (req, res) => {
    try {
        const { centerId, pin, qrCode } = req.body;

        if (!centerId) {
            return res.status(400).json({ success: false, error: 'centerId requis' });
        }

        const centerSnapshot = await db.ref(`centers/${centerId}`).once('value');
        const centerData = centerSnapshot.val();

        if (!centerData) {
            return res.status(404).json({ success: false, error: 'Centre introuvable' });
        }

        if (centerData.license.status !== 'active' || Date.now() > centerData.license.validUntil) {
            return res.status(403).json({ success: false, error: 'Licence expirée', licenseExpired: true });
        }

        let stagiaire = null;

        if (qrCode) {
            // Connexion par QR code
            try {
                const decoded = JSON.parse(Buffer.from(qrCode, 'base64').toString('utf8'));
                if (decoded.type !== 'stagiaire' || decoded.centerId !== centerId) {
                    return res.status(400).json({ success: false, error: 'QR code invalide (format)' });
                }
                const snap = await db.ref(`centers/${centerId}/stagiaires/${decoded.stagiaireId}`).once('value');
                stagiaire = snap.val();
            } catch (e) {
                return res.status(400).json({ success: false, error: 'QR code invalide' });
            }
        } else if (pin) {
            // Connexion par PIN
            const snap = await db.ref(`centers/${centerId}/stagiaires`)
                .orderByChild('pin').equalTo(pin).once('value');

            if (snap.exists()) {
                stagiaire = Object.values(snap.val())[0];
            }
        } else {
            return res.status(400).json({ success: false, error: 'PIN ou QR code requis' });
        }

        if (!stagiaire) {
            return res.status(401).json({ success: false, error: 'Stagiaire non trouvé' });
        }

        // Vérifier validité (dates de session)
        const now = Date.now();
        if (now > stagiaire.dateFin) {
            return res.status(403).json({ success: false, error: 'Accès expiré - votre session de formation est terminée' });
        }

        // Récupérer les infos de la session
        let sessionInfo = null;
        if (stagiaire.sessionId) {
            const sessionSnap = await db.ref(`centers/${centerId}/sessions/${stagiaire.sessionId}`).once('value');
            sessionInfo = sessionSnap.val();
        }

        console.log(`✅ Connexion stagiaire: ${stagiaire.nom} ${stagiaire.prenom}`);

        res.json({
            success: true,
            stagiaire: {
                ...stagiaire,
                session: sessionInfo ? {
                    titre: sessionInfo.titre,
                    niveau: sessionInfo.niveau,
                    dateDebut: sessionInfo.dateDebut,
                    dateFin: sessionInfo.dateFin
                } : null
            },
            centerInfo: { nom: centerData.info.nom }
        });

    } catch (error) {
        console.error('Erreur login stagiaire:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// À ajouter dans backend/routes/stagiaire.routes.js
// Route POST /api/stagiaire/quiz-result

/**
 * POST /api/stagiaire/quiz-result
 * Sauvegarder les résultats d'un quiz en salle
 */
router.post('/quiz-result', async (req, res) => {
    try {
        const { centerId, sessionId, type, scores, nbQuestions } = req.body;

        if (!centerId || !sessionId || !scores) {
            return res.status(400).json({ success: false, error: 'Paramètres manquants' });
        }

        const timestamp = Date.now();
        const resultId = `QUIZ_${timestamp}`;

        // Sauvegarder les résultats globaux dans la session
        await db.ref(`centers/${centerId}/sessions/${sessionId}/quizResults/${resultId}`).set({
            resultId,
            type,
            nbQuestions,
            scores,
            completedAt: timestamp
        });

        // Sauvegarder dans le suivi individuel de chaque stagiaire
        for (const [stagiaireId, score] of Object.entries(scores)) {
            await db.ref(`centers/${centerId}/stagiaires/${stagiaireId}/historique/${resultId}`).set({
                resultId,
                sessionId,
                type,
                score: score.score,
                total: score.total,
                pct: score.pct,
                completedAt: timestamp,
                mode: 'salle'
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