// app.js - Interface Stagiaire ENTRAÎNEMENT SSIAP

const API_URL = 'https://ssiap-training-center.onrender.com/api';

let currentUser        = null;
let currentSession     = null;
let questions          = [];
let currentQuestionIndex = 0;
let userAnswers        = {};
let niveauSelected     = null;
let partieSelected     = 'toutes';
let nbQuestionsSelected = null;
let partiesConfig      = [];
let sessionStartTime   = null;

// ── Pages ──
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
function showLoader() { document.getElementById('loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }

// ══════════════════════════════════════
//  PAGE CONNEXION
// ══════════════════════════════════════

const btnsNiveau = document.querySelectorAll('.btn-niveau');
btnsNiveau.forEach(btn => {
    btn.addEventListener('click', async function() {
        btnsNiveau.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        niveauSelected = parseInt(this.dataset.niveau);
        await loadNiveauConfig(niveauSelected);
        document.getElementById('groupe-partie').style.display = 'block';
        document.getElementById('groupe-nombre').style.display = 'block';
        checkFormValidity();
    });
});

async function loadNiveauConfig(niveau) {
    try {
        const r = await fetch(`${API_URL}/entrainement/config/${niveau}`);
        const d = await r.json();
        if (!d.success) return;
        partiesConfig = d.config.parties;
        const list = document.getElementById('parties-list');
        list.innerHTML = '';
        partiesConfig.forEach((partie, i) => {
            const lbl = document.createElement('label');
            lbl.className = 'partie-option';
            lbl.innerHTML = `<input type="radio" name="partie" value="${partie.id}">
                             <span>${i + 1}. ${partie.label}</span>`;
            list.appendChild(lbl);
        });
        document.querySelectorAll('input[name="partie"]').forEach(radio => {
            radio.addEventListener('change', function() {
                partieSelected = this.value;
                checkFormValidity();
            });
        });
    } catch(e) { console.error('Config niveau:', e); }
}

const btnsNombre = document.querySelectorAll('.btn-nombre');
btnsNombre.forEach(btn => {
    btn.addEventListener('click', function() {
        btnsNombre.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        nbQuestionsSelected = parseInt(this.dataset.nombre);
        checkFormValidity();
    });
});

function checkFormValidity() {
    const nom    = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();
    const valid  = nom && prenom && niveauSelected && nbQuestionsSelected;
    document.getElementById('btn-demarrer').disabled = !valid;
}

document.getElementById('nom').addEventListener('input', checkFormValidity);
document.getElementById('prenom').addEventListener('input', checkFormValidity);

// ── SUBMIT ──
document.getElementById('form-connexion').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nom    = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();
    const email  = document.getElementById('email').value.trim();

    if (!niveauSelected || !nbQuestionsSelected) {
        alert('Veuillez sélectionner un niveau et un nombre de questions');
        return;
    }

    showLoader();

    try {
        // ── Cas 1 : stagiaire connecté via centre (localStorage) ──
        const stagConnecte = window.STAGIAIRE_CONNECTE || null;

        if (stagConnecte && stagConnecte.stagiaireId) {
            // Utiliser directement les données du stagiaire connecté
            currentUser = {
                userId:     stagConnecte.stagiaireId,
                stagiaireId:stagConnecte.stagiaireId,
                nom:        stagConnecte.nom    || nom,
                prenom:     stagConnecte.prenom || prenom,
                email:      stagConnecte.email  || email,
                centerId:   stagConnecte.centerId  || '',
                sessionId:  stagConnecte.sessionId || '',
            };
        } else {
            // ── Cas 2 : utilisateur libre (sans session centre) ──
            // Créer un utilisateur temporaire local sans appel API
            currentUser = {
                userId: 'local_' + Date.now(),
                nom, prenom, email,
                centerId: '', sessionId: '',
            };
        }

        // ── Démarrer l'entraînement QCM ──
        const body = {
            userId:      currentUser.userId,
            niveau:      niveauSelected,
            partieId:    partieSelected,
            nbQuestions: nbQuestionsSelected,
        };
        // Enrichir avec les données centre si disponibles
        if (currentUser.centerId) body.centerId  = currentUser.centerId;
        if (currentUser.sessionId) body.sessionId = currentUser.sessionId;

        const r = await fetch(`${API_URL}/entrainement/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Erreur démarrage entraînement');

        currentSession = {
            sessionId: d.sessionId,
            niveau:    niveauSelected,
            partieId:  partieSelected
        };
        questions            = d.questions;
        currentQuestionIndex = 0;
        userAnswers          = {};
        sessionStartTime     = Date.now();

        initEntrainement();
        showPage('page-entrainement');

    } catch(err) {
        console.error('Erreur démarrage:', err);
        alert('Erreur : ' + err.message + '\nVérifiez votre connexion et réessayez.');
    } finally {
        hideLoader();
    }
});

// ══════════════════════════════════════
//  PAGE ENTRAÎNEMENT
// ══════════════════════════════════════

function initEntrainement() {
    document.getElementById('entrainement-stagiaire').textContent =
        `${currentUser.prenom} ${currentUser.nom}`;
    document.getElementById('entrainement-niveau').textContent = currentSession.niveau;

    let partieLabel = 'Toutes les parties';
    if (currentSession.partieId !== 'toutes') {
        const p = partiesConfig.find(p => p.id === currentSession.partieId);
        if (p) partieLabel = p.label;
    }
    document.getElementById('entrainement-partie').textContent = partieLabel;
    document.getElementById('question-total').textContent = questions.length;
    displayQuestion();
}

function displayQuestion() {
    const q   = questions[currentQuestionIndex];
    const num = currentQuestionIndex + 1;

    document.getElementById('question-numero').textContent     = num;
    document.getElementById('current-question-num').textContent = num;
    document.getElementById('progress-fill').style.width = `${(num / questions.length) * 100}%`;
    document.getElementById('question-text').textContent = q.question;

    const container = document.getElementById('options-container');
    container.innerHTML = '';
    q.options.forEach((opt, i) => {
        const div = document.createElement('div');
        div.className = 'option';
        div.dataset.index = i;
        const saved = userAnswers[q.id] || [];
        if (saved.includes(i)) div.classList.add('selected');
        div.innerHTML = `<div class="option-checkbox"></div><div class="option-text">${opt}</div>`;
        div.addEventListener('click', () => toggleOption(q.id, i));
        container.appendChild(div);
    });

    document.getElementById('btn-precedent').style.visibility =
        currentQuestionIndex === 0 ? 'hidden' : 'visible';
    const last = currentQuestionIndex === questions.length - 1;
    document.getElementById('btn-suivant').style.display  = last ? 'none'  : 'block';
    document.getElementById('btn-terminer').style.display = last ? 'block' : 'none';
}

function toggleOption(questionId, optionIndex) {
    const div = document.querySelector(`.option[data-index="${optionIndex}"]`);
    if (!userAnswers[questionId]) userAnswers[questionId] = [];
    const idx = userAnswers[questionId].indexOf(optionIndex);
    if (idx > -1) {
        userAnswers[questionId].splice(idx, 1);
        div.classList.remove('selected');
    } else {
        userAnswers[questionId].push(optionIndex);
        div.classList.add('selected');
    }
    saveAnswer(questionId, userAnswers[questionId]);
}

async function saveAnswer(questionId, answers) {
    if (!currentSession?.sessionId) return;
    try {
        await fetch(`${API_URL}/entrainement/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession.sessionId, questionId, answers })
        });
    } catch(e) { console.error('Sauvegarde réponse:', e); }
}

document.getElementById('btn-suivant').addEventListener('click', () => {
    if (currentQuestionIndex < questions.length - 1) { currentQuestionIndex++; displayQuestion(); }
});
document.getElementById('btn-precedent').addEventListener('click', () => {
    if (currentQuestionIndex > 0) { currentQuestionIndex--; displayQuestion(); }
});

document.getElementById('btn-terminer').addEventListener('click', async () => {
    if (!confirm('Terminer cet entraînement ?')) return;
    showLoader();
    try {
        const r = await fetch(`${API_URL}/entrainement/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession.sessionId })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Erreur calcul score');

        const t   = Date.now() - sessionStartTime;
        const min = Math.floor(t / 60000);
        const sec = Math.floor((t % 60000) / 1000);
        d.results.tempsAffiche = min > 0 ? `${min} min ${sec}s` : `${sec}s`;

        // Sauvegarder le résultat dans l'historique stagiaire (centre)
        if (currentUser.centerId && currentUser.sessionId && currentUser.stagiaireId) {
            try {
                await fetch(`${API_URL}/stagiaire/save-result`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        centerId:    currentUser.centerId,
                        sessionId:   currentUser.sessionId,
                        stagiaireId: currentUser.stagiaireId,
                        score:       d.results.score,
                        total:       d.results.total,
                        pct:         d.results.percentage,
                        niveau:      currentSession.niveau,
                        partieId:    currentSession.partieId,
                    })
                });
            } catch(e) { console.warn('Historique non sauvegardé:', e); }
        }

        displayResults(d.results);
        showPage('page-resultats');
    } catch(err) {
        console.error('Erreur finish:', err);
        alert('Erreur lors du calcul du score : ' + err.message);
    } finally {
        hideLoader();
    }
});

// ══════════════════════════════════════
//  PAGE RÉSULTATS
// ══════════════════════════════════════

function displayResults(results) {
    const { score, total, percentage, details, tempsAffiche } = results;

    document.getElementById('score-value').textContent      = score;
    document.getElementById('score-total').textContent      = total;
    document.getElementById('score-percentage').textContent = `${percentage}%`;

    const circumference = 565;
    document.getElementById('score-svg').style.strokeDashoffset =
        circumference - (percentage / 100) * circumference;
    document.getElementById('score-circle').classList.toggle('fail', parseFloat(percentage) < 50);

    const passed = parseFloat(percentage) >= 50;
    document.getElementById('results-title').textContent   = passed ? '🎉 Excellent travail !' : '📚 Continuez vos révisions';
    document.getElementById('results-title').style.color   = passed ? 'var(--vert-evacuation)' : 'var(--rouge-incendie)';
    document.getElementById('results-message').textContent = passed
        ? `Vous avez obtenu ${percentage}% de bonnes réponses. Continuez ainsi !`
        : `Score : ${percentage}%. Identifiez vos axes d'amélioration ci-dessous.`;

    document.getElementById('stat-correct').textContent   = score;
    document.getElementById('stat-incorrect').textContent = total - score;
    document.getElementById('stat-time').textContent      = tempsAffiche || '0s';

    const container = document.getElementById('results-details');
    container.innerHTML = '<h3 style="margin-bottom:20px">Correction détaillée</h3>';

    (details || []).forEach((detail, i) => {
        const div = document.createElement('div');
        div.className = `detail-question ${detail.isCorrect ? 'correct' : 'incorrect'}`;
        let rep = '';
        if (detail.userAnswerLabels?.length)
            rep += `<div style="margin-top:10px;font-size:14px"><strong>Votre réponse :</strong> ${detail.userAnswerLabels.join(', ')}</div>`;
        if (detail.correctAnswerLabels?.length)
            rep += `<div style="margin-top:5px;font-size:14px;color:var(--vert-evacuation)"><strong>Bonne(s) réponse(s) :</strong> ${detail.correctAnswerLabels.join(', ')}</div>`;
        div.innerHTML = `
            <div class="detail-header">
                <span>Question ${i + 1}</span>
                <span class="detail-badge ${detail.isCorrect ? 'correct' : 'incorrect'}">${detail.isCorrect ? '✓ Correct' : '✗ Incorrect'}</span>
            </div>
            <div class="detail-question-text">${detail.question}</div>
            ${rep}
            ${detail.explanation ? `<div class="detail-explanation"><strong>💡 Explication :</strong> ${detail.explanation}</div>` : ''}`;
        container.appendChild(div);
    });
}

document.getElementById('btn-nouvel-entrainement').addEventListener('click', () => location.reload());
document.getElementById('btn-voir-historique').addEventListener('click', () => {
    alert('Fonctionnalité "Historique" disponible prochainement !');
});

console.log('🔥 SSIAP Entraînement — API:', API_URL);