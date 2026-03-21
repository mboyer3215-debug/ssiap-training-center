// À AJOUTER dans backend/routes/admin_questions.routes.js
// (ou dans un nouveau fichier admin_center.routes.js, avec app.use('/api/admin', ...) dans server.js)

// Nécessite le middleware adminAuth déjà appliqué sur /api/admin

/**
 * GET /api/admin/center/:centreId/license
 * Retourne les données complètes de licence d'un centre (dates incluses)
 * Lit directement Firebase : centers/{centreId}/license
 */
router.get('/center/:centreId/license', async (req, res) => {
  try {
    const { centreId } = req.params;
    if (!centreId) return res.status(400).json({ error: 'centreId requis' });

    // Lire la licence depuis Firebase
    const snap = await db.ref(`centers/${centreId}/license`).once('value');

    if (!snap.exists()) {
      // Essayer aussi le chemin alternatif
      const snap2 = await db.ref(`centers/${centreId}`).once('value');
      const centerData = snap2.val();
      if (!centerData) return res.status(404).json({ error: 'Centre introuvable' });

      // La licence peut être directement dans les champs du centre
      const license = {
        type:        centerData.licenseType || centerData.plan || centerData.licence || 'DEMO',
        createdAt:   centerData.licenseCreatedAt || centerData.activatedAt || centerData.createdAt || null,
        expiresAt:   centerData.licenseExpiresAt || centerData.expiresAt || null,
        active:      centerData.active !== false,
        maxFormateurs: centerData.maxFormateurs || null,
        maxStagiaires: centerData.maxStagiaires || null,
      };
      return res.json({ success: true, centreId, license });
    }

    const licData = snap.val();
    const license = {
      type:          licData.type        || licData.plan        || 'DEMO',
      createdAt:     licData.createdAt   || licData.activatedAt || licData.startDate || null,
      expiresAt:     licData.expiresAt   || licData.endDate     || licData.expiry    || null,
      active:        licData.active      !== false,
      stripeSubId:   licData.stripeSubscriptionId || licData.stripeSubId || null,
      maxFormateurs: licData.maxFormateurs || null,
      maxStagiaires: licData.maxStagiaires || null,
    };

    res.json({ success: true, centreId, license });

  } catch (error) {
    console.error('Erreur admin center license:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/centers/licenses
 * Toutes les licences de tous les centres en un seul appel
 */
router.get('/centers/licenses', async (req, res) => {
  try {
    const snap = await db.ref('centers').once('value');
    if (!snap.exists()) return res.json({ success: true, licenses: [] });

    const licenses = [];
    snap.forEach(centreSnap => {
      const centreId = centreSnap.key;
      const data = centreSnap.val();
      const lic = data.license || {};
      licenses.push({
        centreId,
        nom:         data.nom || data.info?.nom || data.name || centreId,
        type:        lic.type        || data.licenseType || 'DEMO',
        createdAt:   lic.createdAt   || data.licenseCreatedAt || null,
        expiresAt:   lic.expiresAt   || data.licenseExpiresAt || null,
        active:      lic.active      !== false && data.status !== 'inactive',
        maxFormateurs: lic.maxFormateurs || null,
        maxStagiaires: lic.maxStagiaires || null,
      });
    });

    res.json({ success: true, licenses });

  } catch (error) {
    console.error('Erreur admin centers licenses:', error);
    res.status(500).json({ error: error.message });
  }
});
