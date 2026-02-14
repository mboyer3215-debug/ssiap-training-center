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
  const { answers, qcmId, userId, sessionId } = req.body;

  // 🔐 Ici tu mets la vraie logique de correction serveur
  // Pour l’instant on simule
  const score = Math.floor(Math.random() * 40) + 60;

  const result = {
    score,
    completedAt: Date.now()
  };

  await db.ref(`sessions/${sessionId}/trainees/${userId}/results`).push(result);

  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
