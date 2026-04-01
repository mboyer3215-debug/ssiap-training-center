// stripe.routes.js — MIB PREVENTION / SSIAP Training

const express  = require('express');
const router   = express.Router();
const Stripe   = require('stripe');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const admin    = require('firebase-admin');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  independant: {
    priceId: 'price_1TB190GBD0GNj9cdfwvGx3vb',
    label: 'INDÉPENDANT',
    prix: '99 €/mois',
    maxCentres: 1,
    maxFormateurs: 1,
    maxStagiaires: 20,
  },
  starter: {
    priceId: 'price_1TB16WGBD0GNj9cdCk1bfJ7N',
    label: 'STARTER',
    prix: '199 €/mois',
    maxCentres: 1,
    maxFormateurs: 10,
    maxStagiaires: 150,
  },
  pro: {
    priceId: 'price_1TB17SGBD0GNj9cdlHWwsjrL',
    label: 'PRO',
    prix: '299 €/mois',
    maxCentres: 10,
    maxFormateurs: 20,
    maxStagiaires: 300,
  },
  entreprise: {
    priceId: 'price_1TB18lGBD0GNj9cdDYmDGy8M',
    label: 'ENTREPRISE',
    prix: '3 999 €/an',
    maxCentres: 999,
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
  return String(parseInt(crypto.randomBytes(3).toString('hex'), 16) % 1_000_000)
    .padStart(6, '0');
}

// ─── MAILER Mailgun EU ─────────────────────────────────────────────────────
async function sendWelcomeEmail({ to, nomCentre, plan, licenceKey, pinFormateur, loginUrl }) {
  const isIndep = !!pinFormateur;

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
        ⚠️ Code <strong>confidentiel</strong> — utilisez-le à chaque connexion formateur.<br>
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
        <li>Entrez votre <strong>clé de licence</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px">${licenceKey}</code></li>
        <li>✅ Votre compte est activé !</li>
      </ol>
    </div>` : '';

  const limitesPlan = !isIndep ? `
    <p style="font-size:14px;color:#374151"><strong>Limites de votre plan :</strong></p>
    <ul style="font-size:14px;color:#374151">
      <li>Centres de formation : <strong>${plan.maxCentres}</strong></li>
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
      <div style="padding:32px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px">
        <h2 style="color:#1a3a5c;margin-top:0">Bienvenue, ${nomCentre} !</h2>
        <p style="color:#374151">Votre abonnement <strong>${plan.label} — ${plan.prix}</strong> est actif.</p>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 10px;font-size:14px;color:#1e1a17"><strong>🔑 Votre clé de licence :</strong></p>
          <div style="background:#f1f5f9;padding:14px 18px;border-radius:6px;text-align:center;border:1px solid #cbd5e1">
            <code style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#1a3a5c;letter-spacing:2px">${licenceKey}</code>
          </div>
          <p style="font-size:12px;color:#6b7280;margin:8px 0 0">
            ${isIndep ? 'Conservez cette clé — elle sera demandée lors de votre première connexion.' : 'Utilisez cette clé lors de votre inscription sur la plateforme.'}
          </p>
        </div>

        ${pinBlock}
        ${instructionsIndep}
        ${limitesPlan}

        <a href="${loginUrl}" style="display:inline-block;background:#1a3a5c;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;font-size:15px">
          ${ctaLabel}
        </a>

        <hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0">
        <p style="color:#6b7280;font-size:13px">
          Besoin d'aide ? <a href="mailto:contact@mib-prevention.fr" style="color:#c25a3a">contact@mib-prevention.fr</a><br>
          MIB PRÉVENTION — Plateforme SSIAP Training
        </p>
      </div>
    </div>`;

  const formData = new URLSearchParams();
  formData.append('from',    'MIB PRÉVENTION <contact@mib-prevention.fr>');
  formData.append('to',      to);
  formData.append('subject', `✅ Votre licence SSIAP Training ${plan.label} est active`);
  formData.append('html',    html);

  // ⚠️  EU endpoint — cohérent avec center.routes.js
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
  console.log(`📧 Email ${plan.label} envoyé à ${to} [PIN: ${pinFormateur ? 'OUI' : 'N/A'}]`);
}

// ─── createLicenceInFirebase ────────────────────────────────────────────────
async function createLicenceInFirebase({ planKey, nomCentre, email, plan, source = 'stripe' }) {
  const db         = admin.database();
  const licenceKey = generateLicenceKey(planKey);
  const now        = new Date().toISOString();

  const licenceData = {
    key:           licenceKey,
    type:          plan.label,
    plan:          planKey,
    nomCentre,
    email,
    source,
    actif:         true,
    used:          false,
    maxCentres:    plan.maxCentres,
    maxFormateurs: plan.maxFormateurs,
    maxStagiaires: plan.maxStagiaires,
    createdAt:     now,
    expiresAt:     planKey === 'entreprise'
      ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
      : null,
  };

  let pinClear = null;
  if (planKey === 'independant') {
    pinClear = generatePin();
    licenceData.pinHash       = await bcrypt.hash(pinClear, 10);
    licenceData.isIndependant = true;
    licenceData.pinGenerated  = true;
    console.log(`🔐 PIN généré pour licence INDÉPENDANT ${licenceKey}`);
  }

  await db.ref(`licences/${licenceKey}`).set(licenceData);
  return { licenceKey, pinClear };
}

// ─── ROUTE 1 : Checkout ────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const { planKey, nomCentre, email } = req.body;
    const plan = PLANS[planKey];
    if (!plan) return res.status(400).json({ error: 'Plan inconnu' });
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata: { planKey, nomCentre, email },
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL || 'https://formation.mib-prevention.fr'}/#pricing`,
      locale: 'fr',
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 2 : Webhook ─────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed')    await activateLicence(event.data.object);
  if (event.type === 'customer.subscription.deleted') await deactivateLicence(event.data.object.metadata?.licenceKey);
  res.json({ received: true });
});

// ─── ROUTE 3 : Session ─────────────────────────────────────────────────────
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({ status: session.payment_status, email: session.customer_email, plan: PLANS[session.metadata?.planKey]?.label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 4 : Activation manuelle ────────────────────────────────────────
router.post('/activate-manual', async (req, res) => {
  try {
    const { planKey, nomCentre, email, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_SECRET_KEY)
      return res.status(403).json({ error: 'Non autorisé' });
    const plan = PLANS[planKey];
    if (!plan) return res.status(400).json({ error: 'Plan inconnu' });

    const { licenceKey, pinClear } = await createLicenceInFirebase({ planKey, nomCentre, email, plan, source: 'virement' });

    const baseUrl  = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';
    const loginUrl = planKey === 'independant'
      ? `${baseUrl}/center/formateur-login.html`   // ← INDÉPENDANT → page formateur
      : `${baseUrl}/center/center-login.html`;     // ← autres → page centre

    await sendWelcomeEmail({ to: email, nomCentre, plan, licenceKey, pinFormateur: pinClear, loginUrl });

    const resp = { success: true, licenceKey };
    if (pinClear) resp.pinFormateur = pinClear;
    res.json(resp);
  } catch (err) {
    console.error('activate-manual error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 5 : Vérifier licence ────────────────────────────────────────────
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

// ─── HELPERS INTERNES ──────────────────────────────────────────────────────
async function activateLicence(session) {
  try {
    const { planKey, nomCentre, email } = session.metadata || {};
    const plan = PLANS[planKey];
    if (!plan) return;
    const { licenceKey, pinClear } = await createLicenceInFirebase({ planKey, nomCentre, email, plan, source: 'stripe' });
    const baseUrl  = process.env.APP_URL || 'https://ssiap-training-center.onrender.com';
    const loginUrl = planKey === 'independant'
      ? `${baseUrl}/center/formateur-login.html`
      : `${baseUrl}/center/center-login.html`;
    await sendWelcomeEmail({ to: email || session.customer_email, nomCentre: nomCentre || 'Votre centre', plan, licenceKey, pinFormateur: pinClear, loginUrl });
    console.log(`✅ Stripe: licence ${licenceKey} activée (${plan.label})`);
  } catch (err) {
    console.error('activateLicence error:', err.message);
  }
}

async function deactivateLicence(licenceKey) {
  if (!licenceKey) return;
  try {
    await admin.database().ref(`licences/${licenceKey}/actif`).set(false);
  } catch (err) {
    console.error('deactivateLicence error:', err.message);
  }
}

module.exports = router;
