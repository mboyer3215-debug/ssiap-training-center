#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
//  test-routes-avis.js — Testeur rapide des routes avis/demandes
//  Usage : node test-routes-avis.js [base_url]
//  Exemple : node test-routes-avis.js http://localhost:5000
// ═══════════════════════════════════════════════════════════

const BASE = process.argv[2] || 'http://localhost:5000';
const API  = `${BASE}/api`;

// ── Couleurs console ──
const OK  = '\x1b[32m✅\x1b[0m';
const ERR = '\x1b[31m❌\x1b[0m';
const INF = '\x1b[33m⏳\x1b[0m';
const HDR = '\x1b[36m──────────────────────────────\x1b[0m';

let passed = 0, failed = 0;
const log = (ok, route, msg) => {
  console.log(`${ok ? OK : ERR} ${route.padEnd(42)} ${msg}`);
  ok ? passed++ : failed++;
};

async function req(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

// ── IDs de test ──
const TEST_CENTER  = 'TEST_CENTER_001';
const TEST_NIVEAU  = '1';
let   createdAvisId   = null;
let   createdDemandeId = null;

console.log('\n' + HDR);
console.log('\x1b[1m  SSIAP Training — Test Routes Backend\x1b[0m');
console.log(`  Serveur : ${BASE}`);
console.log(HDR + '\n');

async function run() {

  // ─── 1. POST /api/avis/submit ───────────────────────────
  console.log('\x1b[1m1. Avis — Soumission\x1b[0m');
  try {
    const r = await req('POST', `${API}/avis/submit`, {
      centerId: TEST_CENTER,
      centreNom: 'Centre Test',
      role: 'formateur',
      prenom: 'Jean', nom: 'Test',
      noteGlobale: 4.5,
      ratings: { questions:5, explications:4, interface:4, progression:4, rolespecific:5 },
      positifs: ['Questions pertinentes', 'Interface intuitive'],
      negatifs: ['Plus de questions'],
      commentaire: 'Très bonne plateforme de test',
      nps: 9,
      niveau: '1',
      createdAt: Date.now()
    });
    if (r.status === 200 || r.status === 201) {
      createdAvisId = r.json?.avisId || r.json?.id;
      log(true, 'POST /avis/submit', `status ${r.status} | id: ${createdAvisId || '(non retourné)'}`);
    } else {
      log(false, 'POST /avis/submit', `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'POST /avis/submit', `Connexion impossible : ${e.message}`); }

  // ─── 2. GET /api/avis/centre/:centerId ─────────────────
  try {
    const r = await req('GET', `${API}/avis/centre/${TEST_CENTER}`);
    if (r.status === 200 && r.json?.avis) {
      const nb = r.json.avis.length;
      log(true, `GET /avis/centre/:centerId`, `status 200 | ${nb} avis trouvé(s)`);
      if (!createdAvisId && nb > 0) createdAvisId = r.json.avis[0].id;
    } else {
      log(false, `GET /avis/centre/:centerId`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'GET /avis/centre/:centerId', `Erreur : ${e.message}`); }

  // ─── 3. GET /api/avis/list ──────────────────────────────
  try {
    const r = await req('GET', `${API}/avis/list`);
    if (r.status === 200) {
      const nb = r.json?.avis?.length || r.json?.length || '?';
      log(true, 'GET /avis/list', `status 200 | ${nb} avis au total`);
    } else {
      log(false, 'GET /avis/list', `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'GET /avis/list', `Erreur : ${e.message}`); }

  // ─── 4. GET /api/avis/stats ─────────────────────────────
  try {
    const r = await req('GET', `${API}/avis/stats`);
    if (r.status === 200) {
      log(true, 'GET /avis/stats', `status 200 | noteMoyenne: ${r.json?.stats?.noteMoyenne ?? r.json?.noteMoyenne ?? '?'}`);
    } else {
      log(false, 'GET /avis/stats', `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'GET /avis/stats', `Erreur : ${e.message}`); }

  // ─── 5. POST /api/avis/reply/:avisId ───────────────────
  if (createdAvisId) {
    try {
      const r = await req('POST', `${API}/avis/reply/${createdAvisId}`, {
        texte: 'Merci pour votre retour positif ! Nous travaillons sur plus de questions.',
        adminId: 'admin_test'
      });
      if (r.status === 200 || r.status === 201) {
        log(true, `POST /avis/reply/:avisId`, `status ${r.status} — réponse admin enregistrée`);
      } else {
        log(false, `POST /avis/reply/:avisId`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
      }
    } catch(e) { log(false, 'POST /avis/reply/:avisId', `Erreur : ${e.message}`); }
  } else {
    console.log(`\x1b[33m⚠️  POST /avis/reply/:avisId${' '.repeat(14)} Skipped (pas d'avisId disponible)\x1b[0m`);
  }

  console.log('');
  console.log('\x1b[1m2. Demandes\x1b[0m');

  // ─── 6. POST /api/demandes/create ──────────────────────
  try {
    const r = await req('POST', `${API}/demandes/create`, {
      centerId: TEST_CENTER,
      centreNom: 'Centre Test',
      type: 'bug',
      priorite: 'haute',
      objet: 'Test connexion Firebase',
      description: 'Test automatique — merci de vérifier la connectivité Firebase.',
      email: 'test@centre.fr'
    });
    if (r.status === 200 || r.status === 201) {
      createdDemandeId = r.json?.demandeId || r.json?.id;
      log(true, 'POST /demandes/create', `status ${r.status} | id: ${createdDemandeId || '(non retourné)'}`);
    } else {
      log(false, 'POST /demandes/create', `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'POST /demandes/create', `Connexion impossible : ${e.message}`); }

  // ─── 7. GET /api/demandes/list/:centerId ───────────────
  try {
    const r = await req('GET', `${API}/demandes/list/${TEST_CENTER}`);
    if (r.status === 200) {
      const nb = r.json?.demandes?.length || '?';
      log(true, `GET /demandes/list/:centerId`, `status 200 | ${nb} demande(s)`);
      if (!createdDemandeId && nb > 0) createdDemandeId = r.json.demandes[0].id;
    } else {
      log(false, `GET /demandes/list/:centerId`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'GET /demandes/list/:centerId', `Erreur : ${e.message}`); }

  // ─── 8. GET /api/demandes/all ──────────────────────────
  try {
    const r = await req('GET', `${API}/demandes/all`);
    if (r.status === 200) {
      const nb = r.json?.demandes?.length || '?';
      log(true, 'GET /demandes/all', `status 200 | ${nb} demande(s) au total`);
    } else {
      log(false, 'GET /demandes/all', `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'GET /demandes/all', `Erreur : ${e.message}`); }

  // ─── 9. POST /api/demandes/reply/:demandeId ────────────
  if (createdDemandeId) {
    try {
      const r = await req('POST', `${API}/demandes/reply/${createdDemandeId}`, {
        texte: 'Test automatique — réponse admin enregistrée correctement.',
        adminId: 'admin_test'
      });
      if (r.status === 200 || r.status === 201) {
        log(true, `POST /demandes/reply/:demandeId`, `status ${r.status}`);
      } else {
        log(false, `POST /demandes/reply/:demandeId`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
      }
    } catch(e) { log(false, 'POST /demandes/reply/:demandeId', `Erreur : ${e.message}`); }
  } else {
    console.log(`\x1b[33m⚠️  POST /demandes/reply/:demandeId${' '.repeat(7)} Skipped (pas de demandeId)\x1b[0m`);
  }

  // ─── 10. PUT /api/demandes/status/:demandeId ───────────
  if (createdDemandeId) {
    try {
      const r = await req('PUT', `${API}/demandes/status/${createdDemandeId}`, { status: 'done' });
      if (r.status === 200) {
        log(true, `PUT /demandes/status/:demandeId`, `status 200 — marqué résolu`);
      } else {
        log(false, `PUT /demandes/status/:demandeId`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
      }
    } catch(e) { log(false, 'PUT /demandes/status/:demandeId', `Erreur : ${e.message}`); }
  }

  console.log('');
  console.log('\x1b[1m3. Notifications\x1b[0m');

  // ─── 11. GET /api/notifications/:centerId ──────────────
  try {
    const r = await req('GET', `${API}/notifications/${TEST_CENTER}`);
    if (r.status === 200) {
      const nb = r.json?.notifications?.length ?? '?';
      const unread = r.json?.notifications?.filter(n => !n.read).length ?? '?';
      log(true, `GET /notifications/:centerId`, `status 200 | ${nb} notif(s) — ${unread} non lue(s)`);
    } else {
      log(false, `GET /notifications/:centerId`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'GET /notifications/:centerId', `Erreur : ${e.message}`); }

  // ─── 12. PUT /api/notifications/:centerId/read ─────────
  try {
    const r = await req('PUT', `${API}/notifications/${TEST_CENTER}/read`);
    if (r.status === 200) {
      log(true, `PUT /notifications/:centerId/read`, `status 200 — marqué lu`);
    } else {
      log(false, `PUT /notifications/:centerId/read`, `status ${r.status} — ${r.json?.message || r.text?.slice(0,80)}`);
    }
  } catch(e) { log(false, 'PUT /notifications/:centerId/read', `Erreur : ${e.message}`); }

  // ─── RÉSUMÉ ─────────────────────────────────────────────
  console.log('');
  console.log(HDR);
  console.log(`  Résultat : ${OK} ${passed} OK  |  ${ERR} ${failed} ÉCHOUÉ(S)`);
  if (failed === 0) console.log('  \x1b[32m✨ Toutes les routes répondent correctement !\x1b[0m');
  else {
    console.log('  \x1b[33mVérifiez :');
    console.log('   1. server.js monte bien  app.use(\'/api\', demandesAvisRoutes)');
    console.log('   2. Firebase est connecté (firebase.json ou .env)');
    console.log('   3. La variable FIREBASE_SERVICE_ACCOUNT est définie\x1b[0m');
  }
  console.log(HDR + '\n');
}

run().catch(console.error);