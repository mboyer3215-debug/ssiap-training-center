console.log("VERSION SAAS ACTIVE");

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 Initialisation Firebase Admin (clé serveur)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();

// ✅ Route test
app.get('/', (req, res) => {
  res.send('SSI Training PRO API running ✅');
});

// ✅ Route création QCM
app.post('/generate-qcm', async (req, res) => {
  const { level, numberOfQuestions } = req.body;

  const snapshot = await db.ref('questions/' + level).once('value');
  const questions = Object.values(snapshot.val() || []);

  const shuffled = questions.sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, numberOfQuestions);

  res.json(selected);
});

// ✅ Route correction
app.post('/submit-qcm', async (req, res) => {
  const { centerId, userId, level, answers } = req.body;

  if (!centerId || !userId || !level) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // 🔐 Simulation correction (à remplacer plus tard)
  const score = Math.floor(Math.random() * 40) + 60;

  const resultRef = db.ref(`centers/${centerId}/results/${userId}`).push();

  await resultRef.set({
    score,
    level,
    completedAt: Date.now()
  });

  res.json({
    success: true,
    score
  });
});
// ✅ Création d'un centre
app.post('/create-center', async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Center name is required' });
  }

  const newCenterRef = db.ref('centers').push();

  await newCenterRef.set({
    name,
    createdAt: Date.now()
  });

  res.json({
    success: true,
    centerId: newCenterRef.key
  });
});

// ✅ Création d'une session
app.post('/create-session', async (req, res) => {
  const { centerId, name, level } = req.body;

  if (!centerId || !name || !level) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const sessionRef = db.ref(`centers/${centerId}/sessions`).push();

  await sessionRef.set({
    name,
    level,
    startDate: Date.now()
  });

  res.json({
    success: true,
    sessionId: sessionRef.key
  });
});

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});
