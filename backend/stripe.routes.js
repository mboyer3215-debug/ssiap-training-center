// stripe.routes.js — MIB PREVENTION / SSIAP Training
// ⚠️  PAS de bcrypt ici — le PIN est stocké en clair dans licences/{key}
//     Il sera hashé par formateur.routes.js/activate-independant au premier login.
//     La licence est marquée used:true après activation → PIN rendu inutilisable.

const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const crypto  = require('crypto');   // module natif Node — pas de compilation requise
const admin   = require('firebase-admin');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ─── PLANS ─────────────────────────────────────────────────────────────────
const PLANS = {
  independant: {
    priceId:       'price_1TB190GBD0GNj9cdfwvGx3vb',
    label:         'INDÉPENDANT',
    prix:          '99 €/mois',
    maxCentres:    1,
    maxFormateurs: 1,
    maxStagiaires: 20,
  },
  starter: {
    priceId:       'price_1TB16WGBD0GNj9cdCk1bfJ7N',
    label:         'STARTER',
    prix:          '199 €/mois',
    maxCentres:    1,
    maxFormateurs: 10,
    maxStagiaires: 150,
  },
  pro: {
    priceId:       'price_1TB17SGBD0GNj9cdlHWwsjrL',
    label:         'PRO',
    prix:          '299 €/mois',
    maxCentres:    10,
    maxFormateurs: 20,
    maxStagiaires: 300,
  },
  entreprise: {
    priceId:       'price_1TB18lGBD0GNj9cdDYmDGy8M',
    label:         'ENTREPRISE',
    prix:          '3 999 €/an',
    maxCentres:    999,
    maxFormateurs: 999,
    maxStagiaires: 9999,
  },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
function generateLicenceKey(planKey) {
  const prefix = planKey.substring(0, 3).toUpperCase();
  const rand   = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `MIB-${prefix}-${rand}`;
}

/** PIN 6 chiffres via crypto natif — garanti sans dépendance externe */
function generatePin() {
  const num = crypto.randomBytes(4).readUInt32BE(0) % 1000000;
  return String(num).padStart(6, '0');
}

// ─── MAILER Mailgun EU ─────────────────────────────────────────────────────
async function sendWelcomeEmail({ to, nomCentre, plan, licenceKey, pinFormateur, loginUrl }) {
  const isIndep = !!pinFormateur;

  console.log(`[stripe] sendWelcomeEmail isIndep=${isIndep} pin=${pinFormateur || 'N/A'} to=${to}`);

  const pinBlock = isIndep ? `
    <div style="background:#f3effe;border:2px solid #c8b4f0;border-radius:10px;
                padding:20px;margin:20px 0;text-align:center">
      <p style="margin:0 0 12px;font-size:14px;color:#1e1a17;font-weight:bold">
        🔐 Votre code PIN formateur
      </p>
      <div style="background:#fff;border:1px solid #d8caf0;border-radius:8px;
                  padding:14px;display:inline-block;min-width:200px">
        <span style="font-family:'Courier New',monospace;font-size:38px;font-weight:900;
                     color:#7b5ea7;letter-spacing:10px;display:block">${pinFormateur}</span>
      </div>
      <p style="font-size:12px;color:#8c8078;margin:12px 0 0;line-height:1.6">
        ⚠️ Code <strong>confidentiel</strong> — à utiliser à chaque connexion formateur.<br>
        Conservez-le : il ne vous sera communiqué qu'une seule fois.
      </p>
    </div>` : '';

  const instructionsIndep = isIndep ? `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;
                padding:16px;margin:16px 0">
      <p style="margin:0 0 8px;font-size:14px;color:#1e40af;font-weight:bold">
        📋 Étapes pour activer votre compte :
      </p>
      <ol style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:2.2">
        <li>Cliquez sur <strong>"Accéder à mon espace formateur"</strong> ci-dessous</li>
        <li>Saisissez votre <strong>code PIN à 6 chiffres</strong></li>
        <li>Cliquez sur <em>"Première connexion ? Activez votre licence"</em></li>
        <li>Entrez votre clé :
          <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:11px">${licenceKey}</code>
        </li>
        <li>✅ Votre compte est activé !</li>
      </ol>
    </div>` : '';

  const limitesPlan = !isIndep ? `
    <p style="font-size:14px;color:#374151"><strong>Limites de votre plan :</strong></p>
    <ul style="font-size:14px;color:#374151;line-height:2">
      <li>Centres : <strong>${plan.maxCentres}</strong></li>
      <li>Formateurs : <strong>${plan.maxFormateurs}</strong></li>
      <li>Stagiaires actifs : <strong>${plan.maxStagiaires}</strong></li>
    </ul>` : '';

  const ctaLabel = isIndep ? 'Accéder à mon espace formateur →' : 'Accéder à ma plateforme →';

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
    <div style="background:#1a3a5c;padding:24px;text-align:center;border-radius:10px 10px 0 0">
      <h1 style="color:#fff;margin:0;font-size:22px">🔒 SSIAP Training</h1>
      <p style="color:#90cdf4;margin:8px 0 0;font-size:13px">MIB PRÉVENTION</p>
    </div>
    <div style="padding:32px;background:#f8fafc;border:1px solid #e2e8f0;
                border-top:none;border-radius:0 0 10px 10px">

      <h2 style="color:#1a3a5c;margin-top:0">Bienvenue, ${nomCentre} !</h2>
      <p style="color:#374151">
        Votre abonnement <strong>${plan.label} — ${plan.prix}</strong> est actif.
      </p>

      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
        <p style="margin:0 0 10px;font-size:14px;color:#1e1a17"><strong>🔑 Votre clé de licence :</strong></p>
        <div style="background:#f1f5f9;padding:14px 18px;border-radius:6px;text-align:center;border:1px solid #cbd5e1">
          <code style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#1a3a5c;letter-spacing:2px">${licenceKey}</code>
        </div>
        <p style="font-size:12px;color:#6b7280;margin:8px 0 0">
          ${isIndep
            ? 'Conservez cette clé — elle sera demandée lors de votre première connexion.'
            : 'Utilisez cette clé lors de votre inscription sur la plateforme.'}
        </p>
      </div>

      ${pinBlock}
      ${instructionsIndep}
      ${limitesPlan}

      <a href="${loginUrl}"
         style="display:inline-block;background:#1a3a5c;color:#fff;padding:14px 28px;
                border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;font-size:15px">
        ${ctaLabel}
      </a>

      <hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0">
      <p style="color:#6b7280;font-size:13px">
        Besoin d'aide ?
        <a href="mailto:contact@mib-prevention.fr" style="color:#c25a3a">contact@mib-prevention.fr</a><br>
        MIB PRÉVENTION — Plateforme SSIAP Training
      </p>
    </div>
  </div>`;

  const formData = new URLSearchParams();
  formData.append('from',    'MIB PRÉVENTION <contact@mib-prevention.fr>');
  formData.append('to',      to);
  formData.append('subject', `✅ Votre licence SSIAP Training ${plan.label} est active`);
  formData.append('html',    html);

  const response = await fetch(
    `https://api.eu.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    {
      method:  'POST',
      headers: {
        Authorization:  'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    }
  );

  if (!response.ok) {
    const errTxt = await response.text();
    throw new Error(`Mailgun EU error: ${errTxt}`);
  }
  console.log(`[stripe] ✅ Email envoyé à ${to} [PIN dans email: ${isIndep ? 'OUI' : 'NON'}]`);
}

// ─── createLicenceInFirebase ────────────────────────────────────────────────
async function createLicenceInFirebase({ planKey, nomCentre, email, plan, source = 'stripe' }) {
  const db          = admin.database();
  const planKeyNorm = (planKey || '').toLowerCase().trim();

  console.log(`[stripe] createLicence planKey="${planKeyNorm}" source=${source}`);

  const licenceKey = generateLicenceKey(planKeyNorm);
  const now        = new Date().toISOString();

  const licenceData = {
    key:           licenceKey,
    type:          plan.label,
    plan:          planKeyNorm,
    nomCentre,
    email,
    source,
    actif:         true,
    used:          false,
    maxCentres:    plan.maxCentres,
    maxFormateurs: plan.maxFormateurs,
    maxStagiaires: plan.maxStagiaires,
    createdAt:     now,
    expiresAt:     planKeyNorm === 'demo'
      ? new Date(Date.now() +   7 * 24 * 3600 * 1000).toISOString()   // 7 jours
      : planKeyNorm === 'independant'
        ? new Date(Date.now() +  30 * 24 * 3600 * 1000).toISOString() // 30 jours
        : planKeyNorm === 'entreprise'
          ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() // 1 an
          : null, // Stripe subscription (starter, pro) — géré par webhook
  };

  let pinClear = null;

  if (planKeyNorm === 'independant') {
    // PIN généré avec crypto natif — PAS de bcrypt ici
    // Le hash bcrypt sera fait par formateur.routes.js/activate-independant
    // lors de la première connexion du formateur.
    pinClear = generatePin();
    licenceData.pinClear      = pinClear;   // stocké temporairement en clair
    licenceData.isIndependant = true;
    licenceData.pinGenerated  = true;
    console.log(`[stripe] 🔐 PIN INDÉPENDANT généré : ${pinClear} → stocké dans licences/${licenceKey}/pinClear`);
  }

  await db.ref(`licences/${licenceKey}`).set(licenceData);
  console.log(`[stripe] 💾 Licence ${licenceKey} écrite dans Firebase (plan: ${planKeyNorm})`);

  return { licenceKey, pinClear };
}

// ─── ROUTE 1 : Checkout Stripe ─────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const planKeyNorm = (req.body.planKey || '').toLowerCase().trim();
    const { nomCentre, email } = req.body;
    const plan = PLANS[planKeyNorm];
    if (!plan) return res.status(400).json({ error: 'Plan inconnu' });

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      customer_email:       email,
      line_items:           [{ price: plan.priceId, quantity: 1 }],
      metadata:             { planKey: planKeyNorm, nomCentre, email },
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL || 'https://formation.mib-prevention.fr'}/#pricing`,
      locale: 'fr',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 2 : Webhook Stripe ──────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed')
    await activateLicence(event.data.object);
  if (event.type === 'customer.subscription.deleted')
    await deactivateLicence(event.data.object.metadata?.licenceKey);
  res.json({ received: true });
});

// ─── ROUTE 3 : Session Stripe ──────────────────────────────────────────────
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const planKeyNorm = (session.metadata?.planKey || '').toLowerCase();
    res.json({ status: session.payment_status, email: session.customer_email, plan: PLANS[planKeyNorm]?.label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 4 : Activation manuelle ────────────────────────────────────────
router.post('/activate-manual', async (req, res) => {
  try {
    const { nomCentre, email, adminKey } = req.body;
    const planKeyNorm = (req.body.planKey || '').toLowerCase().trim();

    console.log(`\n[stripe] activate-manual planKey="${planKeyNorm}" email=${email}`);

    if (adminKey !== process.env.ADMIN_SECRET_KEY)
      return res.status(403).json({ error: 'Non autorisé' });

    const plan = PLANS[planKeyNorm];
    if (!plan) {
      console.error(`[stripe] Plan inconnu "${planKeyNorm}". Disponibles: ${Object.keys(PLANS).join(', ')}`);
      return res.status(400).json({ error: `Plan inconnu : ${planKeyNorm}` });
    }

    const { licenceKey, pinClear } = await createLicenceInFirebase({
      planKey: planKeyNorm, nomCentre, email, plan, source: 'virement',
    });

    const baseUrl  = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';
    const loginUrl = planKeyNorm === 'independant'
      ? `${baseUrl}/center/formateur-login.html`
      : `${baseUrl}/center/center-login.html`;

    await sendWelcomeEmail({ to: email, nomCentre, plan, licenceKey, pinFormateur: pinClear, loginUrl });

    const resp = { success: true, licenceKey };
    if (pinClear) resp.pinFormateur = pinClear;

    console.log(`[stripe] ✅ activate-manual OK → ${licenceKey} | PIN email: ${pinClear ? 'OUI' : 'NON'}\n`);
    res.json(resp);

  } catch (err) {
    console.error('[stripe] ❌ activate-manual ERREUR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 5 : Vérifier une licence ────────────────────────────────────────
router.get('/licence/:key', async (req, res) => {
  try {
    const snap = await admin.database().ref(`licences/${req.params.key}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Licence non trouvée' });
    // Ne jamais exposer pinClear via l'API publique
    const { pinClear: _, ...safe } = snap.val();
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPERS WEBHOOK ───────────────────────────────────────────────────────
async function activateLicence(session) {
  try {
    const planKeyNorm = (session.metadata?.planKey || '').toLowerCase().trim();
    const nomCentre   = session.metadata?.nomCentre || 'Votre centre';
    const email       = session.metadata?.email || session.customer_email;
    const plan        = PLANS[planKeyNorm];
    if (!plan) { console.error(`[stripe] webhook plan inconnu "${planKeyNorm}"`); return; }

    const { licenceKey, pinClear } = await createLicenceInFirebase({ planKey: planKeyNorm, nomCentre, email, plan, source: 'stripe' });
    const baseUrl  = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';
    const loginUrl = planKeyNorm === 'independant'
      ? `${baseUrl}/center/formateur-login.html`
      : `${baseUrl}/center/center-login.html`;

    await sendWelcomeEmail({ to: email, nomCentre, plan, licenceKey, pinFormateur: pinClear, loginUrl });
    console.log(`[stripe] ✅ Webhook licence ${licenceKey} activée (${plan.label})`);
  } catch (err) {
    console.error('[stripe] webhook activateLicence error:', err.message);
  }
}

async function deactivateLicence(licenceKey) {
  if (!licenceKey) return;
  try {
    await admin.database().ref(`licences/${licenceKey}/actif`).set(false);
  } catch (err) {
    console.error('[stripe] deactivateLicence error:', err.message);
  }
}


// ══════════════════════════════════════════════════════════════
// ROUTE 6 : Job de rappel expiration licences INDÉPENDANT
// GET /api/stripe/check-expiring
// À appeler quotidiennement (cron externe, UptimeRobot, etc.)
// Envoie un email 7 jours ET 2 jours avant expiration
// ══════════════════════════════════════════════════════════════
router.get('/check-expiring', async (req, res) => {
  // Protection basique par clé secrète
  const key = req.query.key || req.headers['x-cron-key'];
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  try {
    const db  = admin.database();
    const now = Date.now();
    const J7  = now + 7  * 24 * 3600 * 1000;
    const J2  = now + 2  * 24 * 3600 * 1000;

    // Charger tous les centres actifs
    const snap = await db.ref('centers').once('value');
    if (!snap.exists()) return res.json({ success: true, checked: 0, sent: 0 });

    let checked = 0;
    let sent    = 0;
    const errors = [];
    const tasks  = [];

    snap.forEach(child => {
      const c   = child.val();
      const cid = child.key;

      // Filtre : seulement les licences INDEPENDANT avec expiresAt
      const lic  = c?.license || {};
      const type = (lic.type || '').toUpperCase().replace('INDÉPENDANT', 'INDEPENDANT');
      if (type !== 'INDEPENDANT') return;
      if (!lic.expiresAt) return;
      if (c?.status === 'inactive') return;

      checked++;

      const exp  = new Date(lic.expiresAt).getTime();
      if (exp < now) return; // Déjà expirée, ne pas spammer

      // Vérifier si on est dans la fenêtre J-7 ou J-2
      const inJ7 = exp <= J7 && exp > J2;
      const inJ2 = exp <= J2 && exp > now;
      if (!inJ7 && !inJ2) return;

      // Éviter le double envoi (vérifier lastReminderSent)
      const lastReminder = c?.license?.lastReminderSent;
      const reminderKey  = inJ2 ? 'J2' : 'J7';
      if (lastReminder === reminderKey) return; // Déjà envoyé pour cette fenêtre

      const email   = c?.info?.email || c?.auth?.email;
      const nom     = c?.info?.nom   || 'Formateur Indépendant';
      const expDate = new Date(exp).toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'});
      const joursRestants = Math.ceil((exp - now) / 86400000);

      if (!email) return;

      tasks.push((async () => {
        try {
          await sendReminderEmail({ to: email, nom, expDate, joursRestants, centerId: cid });
          // Marquer le rappel envoyé
          await db.ref(`centers/${cid}/license/lastReminderSent`).set(reminderKey);
          sent++;
          console.log(`📧 Rappel ${reminderKey} envoyé à ${email} (${nom}) — expire le ${expDate}`);
        } catch(e) {
          errors.push({ centerId: cid, email, error: e.message });
          console.error(`❌ Erreur rappel ${cid}:`, e.message);
        }
      })());
    });

    await Promise.all(tasks);

    res.json({
      success: true,
      checked,
      sent,
      errors: errors.length ? errors : undefined,
      timestamp: new Date().toISOString(),
    });

  } catch(err) {
    console.error('check-expiring error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helper : email de rappel expiration ──────────────────────
async function sendReminderEmail({ to, nom, expDate, joursRestants, centerId }) {
  const urgent   = joursRestants <= 2;
  const couleur  = urgent ? '#c0392b' : '#d4960a';
  const emoji    = urgent ? '🚨' : '⚠️';
  const renewUrl = process.env.STRIPE_PAYMENT_LINK_INDEP
    || 'https://formation.mib-prevention.fr/#pricing';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <div style="background:#1a3a5c;padding:24px;text-align:center;border-radius:10px 10px 0 0">
        <h1 style="color:#fff;margin:0;font-size:22px">🔥 SSIAP Training</h1>
        <p style="color:#90cdf4;margin:6px 0 0;font-size:13px">MIB PRÉVENTION</p>
      </div>
      <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
        <p style="font-size:16px;color:#1e1a17;margin-bottom:16px">Bonjour <strong>${nom}</strong>,</p>

        <div style="background:${urgent ? '#fdecea' : '#fef7e0'};border:2px solid ${couleur};border-radius:10px;padding:18px;margin-bottom:24px;text-align:center">
          <div style="font-size:28px;margin-bottom:8px">${emoji}</div>
          <div style="font-size:18px;font-weight:700;color:${couleur};margin-bottom:4px">
            ${urgent ? 'Votre licence expire dans ' + joursRestants + ' jour' + (joursRestants > 1 ? 's' : '') + ' !' : 'Votre licence expire bientôt'}
          </div>
          <div style="font-size:14px;color:#4a4340">
            Date d'expiration : <strong>${expDate}</strong>
          </div>
        </div>

        <p style="font-size:14px;color:#4a4340;line-height:1.7;margin-bottom:20px">
          ${urgent
            ? 'Votre accès à SSIAP Training sera suspendu très prochainement. Renouvelez maintenant pour continuer à accompagner vos stagiaires sans interruption.'
            : 'Dans ' + joursRestants + ' jours, votre accès à SSIAP Training sera suspendu. Renouvelez votre licence pour continuer à accompagner vos stagiaires.'
          }
        </p>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
          <p style="font-size:13px;color:#4a4340;margin:0 0 12px;font-weight:700">Comment renouveler :</p>
          <ol style="font-size:13px;color:#4a4340;margin:0;padding-left:20px;line-height:2">
            <li>Cliquez sur le bouton ci-dessous pour payer votre nouvelle licence</li>
            <li>Vous recevrez votre clé de licence par email</li>
            <li>Connectez-vous avec votre PIN habituel</li>
            <li>Entrez votre nouvelle clé → votre accès est immédiatement restauré</li>
          </ol>
        </div>

        <div style="text-align:center;margin-bottom:24px">
          <a href="${renewUrl}"
             style="display:inline-block;background:#c25a3a;color:#fff;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 12px rgba(194,90,58,.3)">
            🔄 Renouveler ma licence →
          </a>
        </div>

        <div style="background:#eef4fb;border-radius:8px;padding:12px 16px;font-size:12px;color:#2e5c8a;margin-bottom:20px">
          💡 <strong>Votre code PIN ne change pas.</strong> Vous gardez le même PIN qu'aujourd'hui — seule la clé de licence change.
        </div>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#8c8078;text-align:center">
          Besoin d'aide ? <a href="mailto:contact@mib-prevention.fr" style="color:#c25a3a">contact@mib-prevention.fr</a><br>
          MIB PRÉVENTION — Plateforme SSIAP Training
        </p>
      </div>
    </div>`;

  const formData = new URLSearchParams();
  formData.append('from',    'MIB PRÉVENTION <contact@mib-prevention.fr>');
  formData.append('to',      to);
  formData.append('subject', `${joursRestants <= 2 ? '🚨 URGENT' : '⚠️'} Votre licence SSIAP Training expire le ${expDate}`);
  formData.append('html',    html);

  const response = await fetch(
    `https://api.eu.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mailgun error: ${err}`);
  }
}

module.exports = router;
