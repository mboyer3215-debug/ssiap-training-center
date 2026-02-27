/**
 * Copie les questions de center_default vers le centre actif
 * Usage : node copier_questions_vers_centre.js
 */

const admin = require('firebase-admin');
const fs    = require('fs');

const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
const DATABASE_URL = 'https://ssiap-training-center-default-rtdb.europe-west1.firebasedatabase.app';

const SOURCE_CENTER = 'center_default';
const CIBLE_CENTER  = 'center_1772137870869_2a4e918c'; // ton centre actif

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});
const db = admin.database();

async function main() {
  console.log('='.repeat(55));
  console.log('  COPIE QUESTIONS → CENTRE ACTIF');
  console.log('='.repeat(55));

  for (const niveau of ['1', '2', '3']) {
    process.stdout.write(`\nNiveau ${niveau} : lecture...`);

    const snap = await db.ref(`centers/${SOURCE_CENTER}/questions/${niveau}`).once('value');
    const data = snap.val();

    if (!data) {
      console.log(` ❌ Vide dans ${SOURCE_CENTER}`);
      continue;
    }

    const count = Object.keys(data).length;
    process.stdout.write(` ${count} questions trouvées, copie...`);

    await db.ref(`centers/${CIBLE_CENTER}/questions/${niveau}`).set(data);
    console.log(` ✅ OK`);
  }

  // Vérification
  console.log('\n📊 Vérification dans le centre cible :');
  for (const niveau of ['1', '2', '3']) {
    const snap = await db.ref(`centers/${CIBLE_CENTER}/questions/${niveau}`).once('value');
    console.log(`  Niveau ${niveau} : ${snap.numChildren()} questions ✅`);
  }

  console.log(`\n✅ Questions disponibles dans : centers/${CIBLE_CENTER}/questions/`);
  process.exit(0);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });