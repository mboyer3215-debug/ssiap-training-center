// backend/routes/demandes_avis.routes.js
// Routes Demandes centres + Avis terrain (formateurs/stagiaires)
// Réponses admin → envoyées SIMULTANÉMENT par email ET dashboard centre

const express  = require('express');
const router   = express.Router();
const { db }   = require('../config/firebase');
const nodemailer = require('nodemailer'); // npm install nodemailer

// ─── CONFIG EMAIL ────────────────────────────────────────────────
// À adapter selon votre provider (SMTP, SendGrid, Mailgun, etc.)
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'noreply@ssiap-training.fr',
    pass: process.env.SMTP_PASS || '',
  },
});

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_PASS) {
    console.log(`📧 [DEV] Email simulé → ${to} | Sujet: ${subject}`);
    return { simulated: true };
  }
  return transporter.sendMail({
    from: `"SSIAP Training" <${process.env.SMTP_USER}>`,
    to, subject, html,
  });
}

// ─── TEMPLATES EMAIL ─────────────────────────────────────────────
function emailReplyAvis(centreNom, adminTexte, noteGlobale) {
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f7f5f0;padding:32px;border-radius:12px">
    <div style="font-size:28px;margin-bottom:12px">🔥</div>
    <h2 style="font-size:20px;margin-bottom:4px">SSIAP Training</h2>
    <p style="color:#888;font-size:13px;margin-bottom:24px">Réponse à votre avis</p>
    <div style="background:#fff;border-radius:8px;padding:20px;border-left:4px solid #e8c547;margin-bottom:20px">
      <p style="color:#555;font-size:12px;margin-bottom:8px">Votre note : ${'★'.repeat(Math.round(noteGlobale))} ${noteGlobale}/5</p>
      <p style="font-size:14px;line-height:1.6;color:#333">${adminTexte}</p>
    </div>
    <p style="font-size:12px;color:#888">Merci pour votre retour, il nous aide à améliorer la plateforme.</p>
    <p style="font-size:11px;color:#aaa;margin-top:16px">SSIAP Training — ${centreNom}</p>
  </div>`;
}

function emailReplyDemande(centreNom, objet, adminTexte) {
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f7f5f0;padding:32px;border-radius:12px">
    <div style="font-size:28px;margin-bottom:12px">🔥</div>
    <h2 style="font-size:20px;margin-bottom:4px">SSIAP Training</h2>
    <p style="color:#888;font-size:13px;margin-bottom:24px">Réponse à votre demande</p>
    <p style="font-size:12px;color:#888;background:#fff;padding:8px 12px;border-radius:6px;margin-bottom:16px">
      Objet : <strong>${objet}</strong>
    </p>
    <div style="background:#fff;border-radius:8px;padding:20px;border-left:4px solid #e84060;margin-bottom:20px">
      <p style="font-size:14px;line-height:1.6;color:#333">${adminTexte}</p>
    </div>
    <p style="font-size:11px;color:#aaa;margin-top:16px">SSIAP Training — Support · ${centreNom}</p>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
//  AVIS — ROUTES
// ══════════════════════════════════════════════════════════════

/** POST /api/avis/submit — Soumettre un avis (formateur ou stagiaire) */
router.post('/avis/submit', async (req, res) => {
  try {
    const { centerId, centreNom, userId, role, niveau, prenom, nom,
            ratings, noteGlobale, positifs, negatifs, nps, commentaire } = req.body;
    if (!role || !ratings) return res.status(400).json({ error: 'role et ratings requis' });

    const avisId = `avis_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
    const avis = {
      id: avisId, centerId: centerId || 'anonymous', centreNom: centreNom || '',
      userId: userId || 'anonymous', role, niveau: niveau || '',
      prenom: prenom || '', nom: nom || '',
      ratings: ratings || {}, noteGlobale: parseFloat(noteGlobale) || 0,
      positifs: positifs || [], negatifs: negatifs || [],
      nps: nps !== undefined ? nps : null,
      commentaire: commentaire || '',
      adminReplies: [],
      createdAt: Date.now()
    };

    await db.ref(`avis/${avisId}`).set(avis);
    await updateAvisStats(avis);
    // Notifier admin dans le dashboard (badge)
    await db.ref(`admin_notifications/avis_${avisId}`).set({ type:'avis', avisId, centreNom, noteGlobale, role, createdAt: Date.now(), read: false });

    console.log(`✅ Avis ${avisId} — ${role} — ${noteGlobale}/5`);
    res.json({ success: true, avisId });
  } catch (err) {
    console.error('Erreur avis/submit:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/avis/reply/:avisId
 * Réponse admin à un avis
 * → Enregistrée en Firebase
 * → Envoyée par EMAIL si notifEmail = true
 * → Visible dans DASHBOARD CENTRE si notifDashboard = true
 */
router.post('/avis/reply/:avisId', async (req, res) => {
  try {
    const { avisId } = req.params;
    const { texte, notifEmail = true, notifDashboard = true, centerId } = req.body;
    if (!texte) return res.status(400).json({ error: 'texte requis' });

    const snap = await db.ref(`avis/${avisId}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Avis introuvable' });
    const avis = snap.val();

    const reply = {
      texte,
      timestamp: Date.now(),
      sentEmail: false,
      sentDashboard: false,
    };

    // 1. Email au centre (ou à l'utilisateur si email connu)
    if (notifEmail) {
      try {
        const centreEmail = await getCentreEmail(avis.centerId || centerId);
        if (centreEmail) {
          await sendEmail({
            to: centreEmail,
            subject: `Réponse à votre avis SSIAP Training — ${avis.noteGlobale}/5`,
            html: emailReplyAvis(avis.centreNom || 'votre centre', texte, avis.noteGlobale)
          });
          reply.sentEmail = true;
          console.log(`📧 Email envoyé à ${centreEmail}`);
        }
      } catch (e) { console.error('Email avis error:', e.message); }
    }

    // 2. Notification dashboard centre
    if (notifDashboard) {
      const cId = avis.centerId || centerId || 'unknown';
      await db.ref(`centers/${cId}/notifications/avis_reply_${avisId}`).set({
        type: 'avis_reply',
        avisId,
        texteReponse: texte,
        noteGlobale: avis.noteGlobale,
        role: avis.role,
        timestamp: Date.now(),
        read: false
      });
      reply.sentDashboard = true;
    }

    // 3. Sauvegarder la réponse dans l'avis
    const replies = avis.adminReplies || [];
    replies.push(reply);
    await db.ref(`avis/${avisId}`).update({ adminReplies: replies, lastReplyAt: Date.now() });

    console.log(`✅ Réponse avis ${avisId} — email:${reply.sentEmail} dashboard:${reply.sentDashboard}`);
    res.json({ success: true, reply });

  } catch (err) {
    console.error('Erreur avis/reply:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/avis/list — Tous les avis (admin) */
router.get('/avis/list', async (req, res) => {
  try {
    const { role, limit = 200, centerId } = req.query;
    const snap = await db.ref('avis').orderByChild('createdAt').limitToLast(parseInt(limit)).once('value');
    let avis = Object.values(snap.val() || {}).sort((a,b) => b.createdAt - a.createdAt);
    if (role)     avis = avis.filter(a => a.role === role);
    if (centerId) avis = avis.filter(a => a.centerId === centerId);
    res.json({ success: true, avis, total: avis.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/avis/centre/:centerId — Avis d'un centre + ses réponses admin */
router.get('/avis/centre/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;
    const snap = await db.ref('avis').orderByChild('centerId').equalTo(centerId).once('value');
    const avis = Object.values(snap.val() || {}).sort((a,b) => b.createdAt - a.createdAt);
    const moy  = avis.length ? (avis.reduce((s,a) => s + a.noteGlobale, 0) / avis.length).toFixed(1) : null;
    res.json({ success: true, avis, total: avis.length, noteMoyenne: moy });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/avis/stats — Stats agrégées admin dashboard */
router.get('/avis/stats', async (req, res) => {
  try {
    const statsSnap = await db.ref('avis_stats').once('value');
    const stats = statsSnap.val() || {};
    const snap  = await db.ref('avis').once('value');
    const avis  = Object.values(snap.val() || {});
    const dist  = {1:0,2:0,3:0,4:0,5:0};
    let prom=0, pass=0, detr=0;
    avis.forEach(a => {
      const n = Math.round(a.noteGlobale);
      if(dist[n]!==undefined) dist[n]++;
      if(a.nps>=9) prom++; else if(a.nps>=7) pass++; else if(a.nps!=null) detr++;
    });
    const npsN   = prom+pass+detr;
    const npsScore = npsN ? Math.round(((prom-detr)/npsN)*100) : null;
    res.json({ success: true, stats: {
      ...stats, distribution: dist, npsScore,
      npsBreakdown: { promoteurs: prom, passifs: pass, detracteurs: detr },
      topPositifs: Object.entries(stats.positifs||{}).sort((a,b)=>b[1]-a[1]).slice(0,5),
      topNegatifs: Object.entries(stats.negatifs||{}).sort((a,b)=>b[1]-a[1]).slice(0,5),
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  DEMANDES — ROUTES
// ══════════════════════════════════════════════════════════════

/** POST /api/demandes/create */
router.post('/demandes/create', async (req, res) => {
  try {
    const { centerId, type, objet, description, priorite, messages } = req.body;
    if (!centerId || !objet || !description)
      return res.status(400).json({ error: 'centerId, objet et description requis' });

    const id  = `dem_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
    const dem = {
      id, centerId, type: type||'support', objet, description,
      priorite: priorite||'normal', status: 'new',
      messages: messages || [{ auteur:'centre', texte: description, timestamp: Date.now() }],
      createdAt: Date.now(), updatedAt: Date.now()
    };

    await db.ref(`demandes/${id}`).set(dem);
    await db.ref(`centers/${centerId}/demandes/${id}`).set({ id, status:'new', objet });
    // Notif admin
    await db.ref(`admin_notifications/dem_${id}`).set({ type:'demande', demandeId:id, centerId, objet, priorite: dem.priorite, createdAt: Date.now(), read: false });

    res.json({ success: true, demandeId: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/demandes/list/:centerId */
router.get('/demandes/list/:centerId', async (req, res) => {
  try {
    const snap = await db.ref('demandes').orderByChild('centerId').equalTo(req.params.centerId).once('value');
    const dem  = Object.values(snap.val()||{}).sort((a,b) => b.createdAt - a.createdAt);
    res.json({ success: true, demandes: dem });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/demandes/all (admin) */
router.get('/demandes/all', async (req, res) => {
  try {
    const snap = await db.ref('demandes').once('value');
    const dem  = Object.values(snap.val()||{}).sort((a,b) => b.createdAt - a.createdAt);
    res.json({ success: true, demandes: dem, total: dem.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/demandes/reply/:demandeId
 * Réponse admin à une demande
 * → EMAIL au centre + DASHBOARD centre (les deux simultanément)
 */
router.post('/demandes/reply/:demandeId', async (req, res) => {
  try {
    const { demandeId } = req.params;
    const { texte, auteur = 'admin', notifEmail = true, notifDashboard = true } = req.body;
    if (!texte) return res.status(400).json({ error: 'texte requis' });

    const snap = await db.ref(`demandes/${demandeId}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Demande introuvable' });
    const dem = snap.val();

    const msg = { auteur, texte, timestamp: Date.now(), sentEmail: false, sentDashboard: false };

    // 1. Email
    if (notifEmail && auteur === 'admin') {
      try {
        const email = await getCentreEmail(dem.centerId);
        if (email) {
          await sendEmail({
            to: email,
            subject: `Réponse SSIAP Training — ${dem.objet}`,
            html: emailReplyDemande('votre centre', dem.objet, texte)
          });
          msg.sentEmail = true;
          console.log(`📧 Email demande → ${email}`);
        }
      } catch(e) { console.error('Email demande error:', e.message); }
    }

    // 2. Dashboard centre
    if (notifDashboard && auteur === 'admin') {
      await db.ref(`centers/${dem.centerId}/notifications/dem_reply_${demandeId}`).set({
        type: 'demande_reply',
        demandeId,
        objet: dem.objet,
        texteReponse: texte,
        timestamp: Date.now(),
        read: false
      });
      // Mettre à jour le statut dans le résumé centre
      await db.ref(`centers/${dem.centerId}/demandes/${demandeId}`).update({ status:'pending' });
      msg.sentDashboard = true;
    }

    // 3. Sauvegarder
    const messages  = dem.messages || [];
    messages.push(msg);
    const newStatus = auteur === 'admin' ? 'pending' : dem.status;
    await db.ref(`demandes/${demandeId}`).update({ messages, updatedAt: Date.now(), status: newStatus });

    console.log(`✅ Réponse demande ${demandeId} — email:${msg.sentEmail} dashboard:${msg.sentDashboard}`);
    res.json({ success: true, message: msg });

  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/demandes/status/:demandeId (admin — changer statut) */
router.put('/demandes/status/:demandeId', async (req, res) => {
  try {
    const { status, adminMessage } = req.body;
    if (!['new','pending','done','closed'].includes(status))
      return res.status(400).json({ error: 'Statut invalide' });

    const snap = await db.ref(`demandes/${req.params.demandeId}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Demande introuvable' });
    const dem = snap.val();

    const updates = { status, updatedAt: Date.now() };
    if (adminMessage) {
      const msgs = dem.messages || [];
      msgs.push({ auteur:'admin', texte: adminMessage, timestamp: Date.now() });
      updates.messages = msgs;
    }
    await db.ref(`demandes/${req.params.demandeId}`).update(updates);
    await db.ref(`centers/${dem.centerId}/demandes/${req.params.demandeId}`).update({ status });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  NOTIFICATIONS CENTRE
// ══════════════════════════════════════════════════════════════

/** GET /api/notifications/:centerId — Notifications d'un centre (réponses admin) */
router.get('/notifications/:centerId', async (req, res) => {
  try {
    const snap = await db.ref(`centers/${req.params.centerId}/notifications`).once('value');
    const notifs = Object.values(snap.val()||{}).sort((a,b) => b.timestamp - a.timestamp);
    const unread = notifs.filter(n => !n.read).length;
    res.json({ success: true, notifications: notifs, unread });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/notifications/:centerId/read — Marquer comme lu */
router.put('/notifications/:centerId/read', async (req, res) => {
  try {
    const snap = await db.ref(`centers/${req.params.centerId}/notifications`).once('value');
    const updates = {};
    Object.keys(snap.val()||{}).forEach(k => { updates[k+'/read'] = true; });
    if (Object.keys(updates).length)
      await db.ref(`centers/${req.params.centerId}/notifications`).update(updates);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── HELPER ──────────────────────────────────────────────────
async function getCentreEmail(centerId) {
  if (!centerId) return null;
  const snap = await db.ref(`centers/${centerId}/info/email`).once('value');
  return snap.val() || null;
}

async function updateAvisStats(newAvis) {
  const ref   = db.ref('avis_stats');
  const snap  = await ref.once('value');
  const stats = snap.val() || { total:0, sommeNotes:0, positifs:{}, negatifs:{} };
  stats.total++;
  stats.sommeNotes += newAvis.noteGlobale;
  stats.noteMoyenne = parseFloat((stats.sommeNotes/stats.total).toFixed(2));
  (newAvis.positifs||[]).forEach(p => { stats.positifs[p] = (stats.positifs[p]||0)+1; });
  (newAvis.negatifs||[]).forEach(n => { stats.negatifs[n] = (stats.negatifs[n]||0)+1; });
  stats.lastUpdate = Date.now();
  await ref.set(stats);
}

module.exports = router;