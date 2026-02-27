/**
 * IMPORT QUESTIONS SSIAP 1/2/3 DANS FIREBASE
 * Usage : node import_questions_firebase.js
 * Prérequis : npm install firebase-admin
 *
 * Placer ce fichier dans le même dossier que :
 *   - serviceAccountKey.json  (Firebase Console > Paramètres > Comptes de service)
 *   - ssiap1_FINAL_200.json
 *   - ssiap2_FINAL_200.json
 *   - ssiap3_FINAL_200.json
 */

const admin = require('firebase-admin');
const fs    = require('fs');

// ─── CONFIGURATION ─────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
const DATABASE_URL         = 'https://ssiap-training-center-default-rtdb.europe-west1.firebasedatabase.app';
const CENTER_ID            = 'center_default';

const FICHIERS = [
  { fichier: './ssiap1_FINAL_200.json', niveau: '1' },
  { fichier: './ssiap2_FINAL_200.json', niveau: '2' },
  { fichier: './ssiap3_FINAL_200.json', niveau: '3' },
];
// ───────────────────────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});
const db = admin.database();

async function importerNiveau(fichier, niveau) {
  console.log(`\n📂 Chargement ${fichier}...`);
  const raw = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const questions = Array.isArray(raw) ? raw : (raw.questions || []);

  if (!questions.length) {
    console.error(`  ❌ Aucune question trouvée dans ${fichier}`);
    return;
  }
  console.log(`  📋 ${questions.length} questions niveau ${niveau}...`);

  const ref = db.ref(`centers/${CENTER_ID}/questions/${niveau}`);
  console.log(`  🗑️  Suppression existant niveau ${niveau}...`);
  await ref.remove();

  const data = {};
  questions.forEach((q, i) => {
    data[i] = {
      id:             q.id !== undefined ? q.id : i,
      question:       q.question       || '',
      options:        q.options        || [],
      correctAnswers: q.correctAnswers || [0],
      explanation:    q.explanation    || { complete: '' },
      niveau:         String(niveau),
      partie:         q.partie         || 'partie1',
      partieLabel:    q.partieLabel    || '',
      sequence:       q.sequence       || 'seq1',
      sequenceLabel:  q.sequenceLabel  || '',
      theme:          q.theme          || 'theme1',
      themeLabel:     q.themeLabel     || '',
    };
  });

  // Écriture par batch de 50
  const BATCH = 50;
  const indices = Object.keys(data);
  for (let start = 0; start < indices.length; start += BATCH) {
    const batch = {};
    indices.slice(start, start + BATCH).forEach(k => { batch[k] = data[k]; });
    await ref.update(batch);
    process.stdout.write(`  ✅ ${Math.min(start + BATCH, indices.length)}/${indices.length}\r`);
  }
  console.log(`\n  🎉 Niveau ${niveau} : ${questions.length} questions importées`);
}

function verifierFichiers() {
  let ok = true;
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ MANQUANT : ${SERVICE_ACCOUNT_PATH}`);
    console.error('   → Firebase Console > Paramètres > Comptes de service > Générer clé privée');
    ok = false;
  }
  FICHIERS.forEach(({ fichier }) => {
    if (!fs.existsSync(fichier)) { console.error(`❌ MANQUANT : ${fichier}`); ok = false; }
  });
  return ok;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  IMPORT QUESTIONS SSIAP → FIREBASE');
  console.log('='.repeat(60));

  if (!verifierFichiers()) { process.exit(1); }

  try {
    for (const { fichier, niveau } of FICHIERS) {
      await importerNiveau(fichier, niveau);
    }

    console.log('\n📊 Vérification finale...');
    for (const { niveau } of FICHIERS) {
      const snap = await db.ref(`centers/${CENTER_ID}/questions/${niveau}`).once('value');
      console.log(`  Niveau ${niveau} : ${snap.numChildren()} questions en base ✅`);
    }

    console.log('\n✅ Import terminé !');
    console.log(`   Firebase : centers/${CENTER_ID}/questions/`);
  } catch (err) {
    console.error('\n❌ Erreur :', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();