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

// ✅ Route correction avec vraie correction
app.post('/submit-qcm', async (req, res) => {
  const { centerId, userId, level, answers } = req.body;

  if (!centerId || !userId || !level || !answers) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    // 1️⃣ Récupérer les questions du niveau
    const questionsSnapshot = await db.ref(`questions/${level}`).once('value');
    const allQuestions = questionsSnapshot.val();

    if (!allQuestions) {
      return res.status(404).json({ error: "Questions not found for this level" });
    }

    // 2️⃣ Créer un map des questions par ID pour comparaison rapide
    const questionsMap = {};
    Object.values(allQuestions).forEach(q => {
      questionsMap[q.id] = q;
    });

    // 3️⃣ Calculer le score
    let correctCount = 0;
    const detailedResults = [];

    answers.forEach(answer => {
      const question = questionsMap[answer.questionId];
      
      if (question) {
        const isCorrect = answer.selectedAnswer === question.correctAnswer;
        
        if (isCorrect) {
          correctCount++;
        }

        detailedResults.push({
          questionId: answer.questionId,
          selectedAnswer: answer.selectedAnswer,
          correctAnswer: question.correctAnswer,
          isCorrect
        });
      }
    });

    const totalQuestions = answers.length;
    const scorePercentage = Math.round((correctCount / totalQuestions) * 100);

    // 4️⃣ Enregistrer dans Firebase
    const resultRef = db.ref(`centers/${centerId}/results/${userId}`).push();

    await resultRef.set({
      score: scorePercentage,
      correctCount,
      totalQuestions,
      level,
      detailedResults,
      completedAt: Date.now()
    });

    // 5️⃣ Réponse
    res.json({
      success: true,
      score: scorePercentage,
      correctCount,
      totalQuestions,
      passed: scorePercentage >= 60, // SSIAP = 60% minimum
      resultId: resultRef.key
    });

  } catch (error) {
    console.error("Error in submit-qcm:", error);
    res.status(500).json({ error: "Internal server error" });
  }
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

const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});