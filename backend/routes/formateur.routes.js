// stripe.routes.js — MIB PREVENTION / SSIAP Training

const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const crypto  = require('crypto');
const bcrypt  = require('bcrypt');      // ← natif v6 (pas bcryptjs)
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

function generatePin() {
  // PIN 6 chiffres via 4 octets → mod 1 000 000 → padding zéros
  const num = crypto.randomBytes(4).readUInt32BE(0) % 1000000;
  return String(num).padStart(6, '0');
}

// ─── MAILER Mailgun EU ─────────────────────────────────────────────────────
async function sendWelcomeEmail({ to, nomCentre, plan, licenceKey, pinFormateur, loginUrl }) {
  const isIndep = !!pinFormateur;

  console.log(`[sendWelcomeEmail] to=${to} | isIndep=${isIndep} | pin=${pinFormateur || 'N/A'} | url=${loginUrl}`);

  // Bloc PIN violet — affiché SEULEMENT pour INDÉPENDANT
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
        ⚠️ Code <strong>confidentiel</strong> — utilisez-le à chaque connexion.<br>
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

      <!-- Clé de licence -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
        <p style="margin:0 0 10px;font-size:14px;color:#1e1a17">
          <strong>🔑 Votre clé de licence :</strong>
        </p>
        <div style="background:#f1f5f9;padding:14px 18px;border-radius:6px;
                    text-align:center;border:1px solid #cbd5e1">
          <code style="font-family:'Courier New',monospace;font-size:18px;
                       font-weight:700;color:#1a3a5c;letter-spacing:2px">${licenceKey}</code>
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
                border-radius:8px;text-decoration:none;font-weight:bold;
                margin-top:16px;font-size:15px">
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

  const mgUrl = `https://api.eu.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`;
  const response = await fetch(mgUrl, {
    method:  'POST',
    headers: {
      Authorization:  'Basic ' + Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errTxt = await response.text();
    throw new Error(`Mailgun EU error: ${errTxt}`);
  }
  console.log(`[sendWelcomeEmail] ✅ Envoyé à ${to} [PIN: ${pinFormateur ? 'OUI (' + pinFormateur + ')' : 'N/A'}]`);
}

// ─── createLicenceInFirebase ────────────────────────────────────────────────
async function createLicenceInFirebase({ planKey, nomCentre, email, plan, source = 'stripe' }) {
  const db          = admin.database();
  const planKeyNorm = (planKey || '').toLowerCase().trim();

  console.log(`[createLicence] planKeyNorm="${planKeyNorm}" source=${source}`);

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
    expiresAt:     planKeyNorm === 'entreprise'
      ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
      : null,
  };

  let pinClear = null;

  if (planKeyNorm === 'independant') {
    pinClear = generatePin();
    console.log(`[createLicence] 🔐 PIN brut généré : ${pinClear}`);
    licenceData.pinHash       = await bcrypt.hash(pinClear, 10);
    licenceData.isIndependant = true;
    licenceData.pinGenerated  = true;
    console.log(`[createLicence] ✅ pinHash OK, longueur=${licenceData.pinHash.length}`);
  } else {
    console.log(`[createLicence] Plan "${planKeyNorm}" → pas de PIN`);
  }

  await db.ref(`licences/${licenceKey}`).set(licenceData);
  console.log(`[createLicence] 💾 Firebase: licences/${licenceKey} écrit`);

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
    console.error('Stripe checkout error:', err.message);
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
    res.json({
      status: session.payment_status,
      email:  session.customer_email,
      plan:   PLANS[planKeyNorm]?.label,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 4 : Activation manuelle ────────────────────────────────────────
// POST /api/stripe/activate-manual
// Body : { planKey, nomCentre, email, adminKey }
router.post('/activate-manual', async (req, res) => {
  try {
    const { nomCentre, email, adminKey } = req.body;
    const planKeyNorm = (req.body.planKey || '').toLowerCase().trim();

    console.log(`\n[activate-manual] planKey="${req.body.planKey}" → norm="${planKeyNorm}" | email=${email}`);

    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      console.warn('[activate-manual] ⛔ Clé admin incorrecte');
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const plan = PLANS[planKeyNorm];
    if (!plan) {
      console.error(`[activate-manual] ❌ Plan inconnu "${planKeyNorm}". Disponibles: ${Object.keys(PLANS).join(', ')}`);
      return res.status(400).json({ error: `Plan inconnu : ${planKeyNorm}` });
    }
    console.log(`[activate-manual] ✅ Plan=${plan.label}`);

    const { licenceKey, pinClear } = await createLicenceInFirebase({
      planKey: planKeyNorm, nomCentre, email, plan, source: 'virement',
    });

    const baseUrl  = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';
    const loginUrl = planKeyNorm === 'independant'
      ? `${baseUrl}/center/formateur-login.html`
      : `${baseUrl}/center/center-login.html`;

    console.log(`[activate-manual] loginUrl=${loginUrl} | pinClear=${pinClear || 'null'}`);

    await sendWelcomeEmail({ to: email, nomCentre, plan, licenceKey, pinFormateur: pinClear, loginUrl });

    const resp = { success: true, licenceKey };
    if (pinClear) resp.pinFormateur = pinClear;

    console.log(`[activate-manual] ✅ Terminé → ${licenceKey} | PIN=${pinClear ? 'OUI' : 'NON'}\n`);
    res.json(resp);

  } catch (err) {
    console.error('[activate-manual] ❌ ERREUR:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 5 : Vérifier une licence ────────────────────────────────────────
router.get('/licence/:key', async (req, res) => {
  try {
    const snap = await admin.database().ref(`licences/${req.params.key}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Licence non trouvée' });
    const { pinHash: _, ...safe } = snap.val();
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

    if (!plan) {
      console.error(`[webhook] Plan inconnu "${planKeyNorm}"`);
      return;
    }

    const { licenceKey, pinClear } = await createLicenceInFirebase({
      planKey: planKeyNorm, nomCentre, email, plan, source: 'stripe',
    });

    const baseUrl  = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';
    const loginUrl = planKeyNorm === 'independant'
      ? `${baseUrl}/center/formateur-login.html`
      : `${baseUrl}/center/center-login.html`;

    await sendWelcomeEmail({ to: email, nomCentre, plan, licenceKey, pinFormateur: pinClear, loginUrl });
    console.log(`[webhook] ✅ Licence ${licenceKey} activée (${plan.label})`);
  } catch (err) {
    console.error('[webhook] Erreur activateLicence:', err.message);
  }
}

async function deactivateLicence(licenceKey) {
  if (!licenceKey) return;
  try {
    await admin.database().ref(`licences/${licenceKey}/actif`).set(false);
  } catch (err) {
    console.error('[webhook] Erreur deactivateLicence:', err.message);
  }
}

module.exports = router;
