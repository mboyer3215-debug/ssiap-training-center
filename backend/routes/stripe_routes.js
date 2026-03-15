// stripe.routes.js — MIB PREVENTION / SSIAP Training
// Intégrer dans server.js : app.use('/api/stripe', require('./stripe.routes'));

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const admin = require('firebase-admin'); // déjà initialisé dans server.js

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ─── PRICE IDs (mode test) ─────────────────────────────────────────────────
const PLANS = {
  independant: {
    priceId: 'price_1TB190GBD0GNj9cdfwvGx3vb',
    label: 'INDÉPENDANT',
    prix: '99 €/mois',
    maxCentres: 1,
    maxFormateurs: 2,
    maxStagiaires: 30,
  },
  starter: {
    priceId: 'price_1TB16WGBD0GNj9cdCk1bfJ7N',
    label: 'STARTER',
    prix: '199 €/mois',
    maxCentres: 3,
    maxFormateurs: 10,
    maxStagiaires: 150,
  },
  pro: {
    priceId: 'price_1TB17SGBD0GNj9cdlHWwsjrL',
    label: 'PRO',
    prix: '299 €/mois',
    maxCentres: 10,
    maxFormateurs: 30,
    maxStagiaires: 500,
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

// ─── MAILER via Mailgun API (mêmes variables que gestion_ets) ──────────────
async function sendWelcomeEmail({ to, nomCentre, plan, licenceKey, loginUrl }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
      <div style="background:#1a3a5c;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0">🔒 SSIAP Training</h1>
        <p style="color:#90cdf4;margin:8px 0 0">MIB PRÉVENTION</p>
      </div>
      <div style="padding:32px;background:#f8fafc">
        <h2 style="color:#1a3a5c">Bienvenue, ${nomCentre} !</h2>
        <p>Votre abonnement <strong>${plan.label} — ${plan.prix}</strong> est actif.</p>
        
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>🔑 Votre clé de licence :</strong></p>
          <code style="background:#f1f5f9;padding:12px 16px;border-radius:6px;font-size:18px;display:block;text-align:center;letter-spacing:2px;color:#1a3a5c">
            ${licenceKey}
          </code>
        </div>

        <p><strong>Limites de votre plan :</strong></p>
        <ul>
          <li>Centres de formation : <strong>${plan.maxCentres}</strong></li>
          <li>Formateurs : <strong>${plan.maxFormateurs}</strong></li>
          <li>Stagiaires actifs : <strong>${plan.maxStagiaires}</strong></li>
        </ul>

        <a href="${loginUrl}" style="display:inline-block;background:#1a3a5c;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">
          Accéder à ma plateforme →
        </a>

        <hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0">
        <p style="color:#64748b;font-size:14px">
          Besoin d'aide ? Contactez-nous à <a href="mailto:contact@mib-prevention.fr">contact@mib-prevention.fr</a><br>
          MIB PRÉVENTION — Plateforme SSIAP Training
        </p>
      </div>
    </div>
  `;

  const formData = new URLSearchParams();
  formData.append('from', 'MIB PRÉVENTION <contact@mib-prevention.fr>');
  formData.append('to', to);
  formData.append('subject', `✅ Votre licence SSIAP Training ${plan.label} est active`);
  formData.append('html', html);

  const response = await fetch(
    `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
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

  console.log(`📧 Email envoyé à ${to} via Mailgun`);
}

// ─── ROUTE 1 : Créer une session Stripe Checkout ───────────────────────────
// POST /api/stripe/checkout
// Body : { planKey: 'starter', nomCentre: '...', email: '...' }
router.post('/checkout', async (req, res) => {
  try {
    const { planKey, nomCentre, email } = req.body;
    const plan = PLANS[planKey];
    if (!plan) return res.status(400).json({ error: 'Plan inconnu' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata: { planKey, nomCentre, email },
      success_url: `${process.env.APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'https://formation.mib-prevention.fr'}/#pricing`,
      locale: 'fr',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 2 : Webhook Stripe ──────────────────────────────────────────────
// POST /api/stripe/webhook
// Header : stripe-signature
// ⚠️  Nécessite express.raw() AVANT express.json() dans server.js
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await activateLicence(session);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    await deactivateLicence(sub.metadata?.licenceKey);
  }

  res.json({ received: true });
});

// ─── ROUTE 3 : Vérifier une session après paiement ─────────────────────────
// GET /api/stripe/session/:sessionId
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({
      status: session.payment_status,
      email: session.customer_email,
      plan: PLANS[session.metadata?.planKey]?.label,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 4 : Activation manuelle (virement / admin) ─────────────────────
// POST /api/stripe/activate-manual
// Body : { planKey, nomCentre, email, adminKey }
router.post('/activate-manual', async (req, res) => {
  try {
    const { planKey, nomCentre, email, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    const plan = PLANS[planKey];
    if (!plan) return res.status(400).json({ error: 'Plan inconnu' });

    const licenceKey = await createLicenceInFirebase({ planKey, nomCentre, email, plan, source: 'virement' });
    await sendWelcomeEmail({ to: email, nomCentre, plan, licenceKey, loginUrl: process.env.APP_URL });
    res.json({ success: true, licenceKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROUTE 5 : Vérifier une licence ────────────────────────────────────────
// GET /api/stripe/licence/:key
router.get('/licence/:key', async (req, res) => {
  try {
    const db = admin.database();
    const snap = await db.ref(`licences/${req.params.key}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Licence non trouvée' });
    res.json(snap.val());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPERS ───────────────────────────────────────────────────────────────
function generateLicenceKey(planKey) {
  const prefix = planKey.substring(0, 3).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `MIB-${prefix}-${rand}`;
}

async function createLicenceInFirebase({ planKey, nomCentre, email, plan, source = 'stripe' }) {
  const db = admin.database();
  const licenceKey = generateLicenceKey(planKey);
  const now = new Date().toISOString();

  await db.ref(`licences/${licenceKey}`).set({
    key: licenceKey,
    plan: planKey,
    nomCentre,
    email,
    source,
    actif: true,
    maxCentres: plan.maxCentres,
    maxFormateurs: plan.maxFormateurs,
    maxStagiaires: plan.maxStagiaires,
    createdAt: now,
    expiresAt: planKey === 'entreprise'
      ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
      : null, // null = géré par Stripe subscription
  });

  return licenceKey;
}

async function activateLicence(session) {
  try {
    const { planKey, nomCentre, email } = session.metadata || {};
    const plan = PLANS[planKey];
    if (!plan) return;

    const licenceKey = await createLicenceInFirebase({
      planKey, nomCentre, email, plan, source: 'stripe',
    });

    // Mettre à jour la metadata Stripe avec la licence
    await stripe.checkout.sessions.update?.(session.id, {}).catch(() => {});

    await sendWelcomeEmail({
      to: email || session.customer_email,
      nomCentre: nomCentre || 'Votre centre',
      plan,
      licenceKey,
      loginUrl: process.env.APP_URL || 'https://ssiap-training-center.onrender.com',
    });

    console.log(`✅ Licence activée : ${licenceKey} pour ${email} (${plan.label})`);
  } catch (err) {
    console.error('Erreur activation licence:', err.message);
  }
}

async function deactivateLicence(licenceKey) {
  if (!licenceKey) return;
  try {
    const db = admin.database();
    await db.ref(`licences/${licenceKey}/actif`).set(false);
    console.log(`⛔ Licence désactivée : ${licenceKey}`);
  } catch (err) {
    console.error('Erreur désactivation licence:', err.message);
  }
}

module.exports = router;
