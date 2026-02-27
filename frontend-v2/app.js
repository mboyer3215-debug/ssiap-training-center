// app.js - Interface Stagiaire ENTRAÎNEMENT SSIAP

const API_URL = 'http://localhost:5000/api';

let currentUser = null;
let currentSession = null;
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let niveauSelected = null;
let partieSelected = 'toutes';
let nbQuestionsSelected = null;
let partiesConfig = [];
let sessionStartTime = null;

// ========== GESTION DES PAGES ==========

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function showLoader() { document.getElementById('loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }

// ========== PAGE CONNEXION ==========

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
        const response = await fetch(`${API_URL}/entrainement/config/${niveau}`);
        const data = await response.json();
        if (data.success) {
            partiesConfig = data.config.parties;
            const partiesList = document.getElementById('parties-list');
            partiesList.innerHTML = '';
            partiesConfig.forEach((partie, index) => {
                const label = document.createElement('label');
                label.className = 'partie-option';
                label.innerHTML = `
                    <input type="radio" name="partie" value="${partie.id}">
                    <span>${index + 1}. ${partie.label}</span>
                `;
                partiesList.appendChild(label);
            });
            document.querySelectorAll('input[name="partie"]').forEach(radio => {
                radio.addEventListener('change', function() {
                    partieSelected = this.value;
                    checkFormValidity();
                });
            });
        }
    } catch (error) {
        console.error('Erreur chargement config:', error);
    }
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
    const nom = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();
    const btnDemarrer = document.getElementById('btn-demarrer');
    const isValid = nom && prenom && niveauSelected && nbQuestionsSelected;
    btnDemarrer.disabled = !isValid;
}

document.getElementById('nom').addEventListener('input', checkFormValidity);
document.getElementById('prenom').addEventListener('input', checkFormValidity);

document.getElementById('form-connexion').addEventListener('submit', async (e) => {
    e.preventDefault();

    const nom = document.getElementById('nom').value.trim();
    const prenom = document.getElementById('prenom').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!niveauSelected || !nbQuestionsSelected) {
        alert('Veuillez sélectionner un niveau et un nombre de questions');
        return;
    }

    showLoader();

    try {
        // ── Utiliser le stagiaire connecté via login si disponible ──
        const stagConnect = window.STAGIAIRE_CONNECTE;

        if (stagConnect && stagConnect.stagiaireId) {
            // Stagiaire authentifié : on utilise son ID existant
            currentUser = {
                userId: stagConnect.stagiaireId,   // compatibilité champ userId
                stagiaireId: stagConnect.stagiaireId,
                nom: stagConnect.nom,
                prenom: stagConnect.prenom,
                centerId: stagConnect.centerId,
                sessionId: stagConnect.sessionId
            };
        } else {
            // Mode anonyme : créer un utilisateur temporaire
            const responseStagiaire = await fetch(`${API_URL}/stagiaires`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nom, prenom, email })
            });
            const dataStagiaire = await responseStagiaire.json();
            if (!dataStagiaire.success) throw new Error('Erreur création stagiaire');
            currentUser = dataStagiaire.stagiaire;
        }

        // ── Démarrer l'entraînement ──
        const responseEntrainement = await fetch(`${API_URL}/entrainement/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.userId || currentUser.stagiaireId,
                niveau: niveauSelected,
                partieId: partieSelected,
                nbQuestions: nbQuestionsSelected
            })
        });

        const dataEntrainement = await responseEntrainement.json();
        if (!dataEntrainement.success) throw new Error('Erreur démarrage entraînement');

        currentSession = {
            sessionId: dataEntrainement.sessionId,
            niveau: niveauSelected,
            partieId: partieSelected
        };

        questions = dataEntrainement.questions;
        currentQuestionIndex = 0;
        userAnswers = {};
        sessionStartTime = Date.now();

        initEntrainement();
        showPage('page-entrainement');

    } catch (error) {
        console.error('Erreur:', error);
        alert('Une erreur est survenue. Veuillez réessayer.');
    } finally {
        hideLoader();
    }
});

// ========== PAGE ENTRAÎNEMENT ==========

function initEntrainement() {
    document.getElementById('entrainement-stagiaire').textContent =
        `${currentUser.nom} ${currentUser.prenom}`;
    document.getElementById('entrainement-niveau').textContent = currentSession.niveau;

    let partieLabel = 'Toutes les parties';
    if (currentSession.partieId !== 'toutes') {
        const partie = partiesConfig.find(p => p.id === currentSession.partieId);
        if (partie) partieLabel = partie.label;
    }
    document.getElementById('entrainement-partie').textContent = partieLabel;
    document.getElementById('question-total').textContent = questions.length;

    displayQuestion();
}

function displayQuestion() {
    const question = questions[currentQuestionIndex];
    const questionNum = currentQuestionIndex + 1;

    document.getElementById('question-numero').textContent = questionNum;
    document.getElementById('current-question-num').textContent = questionNum;

    const progress = (questionNum / questions.length) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('question-text').textContent = question.question || '';

    // Nombre de bonnes réponses attendues
    const nbBonnes = (question.correctAnswers || []).length;
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    // Indicateur si plusieurs réponses attendues
    if (nbBonnes > 1) {
        const hint = document.createElement('p');
        hint.style.cssText = 'color:#2563eb;font-size:13px;margin-bottom:10px;font-weight:600;';
        hint.textContent = `⚠️ ${nbBonnes} réponses attendues pour cette question`;
        optionsContainer.appendChild(hint);
    }

    const options = question.options || [];
    options.forEach((option, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option';
        optionDiv.dataset.index = index;

        const savedAnswer = userAnswers[question.id] || [];
        if (savedAnswer.includes(index)) optionDiv.classList.add('selected');

        optionDiv.innerHTML = `
            <div class="option-checkbox"></div>
            <div class="option-text">${option}</div>
        `;
        optionDiv.addEventListener('click', () => toggleOption(question.id, index, nbBonnes));
        optionsContainer.appendChild(optionDiv);
    });

    document.getElementById('btn-precedent').style.visibility =
        currentQuestionIndex === 0 ? 'hidden' : 'visible';

    const isLastQuestion = currentQuestionIndex === questions.length - 1;
    document.getElementById('btn-suivant').style.display = isLastQuestion ? 'none' : 'block';
    document.getElementById('btn-terminer').style.display = isLastQuestion ? 'block' : 'none';
}

function toggleOption(questionId, optionIndex, nbBonnes) {
    const optionDiv = document.querySelector(`.option[data-index="${optionIndex}"]`);
    if (!userAnswers[questionId]) userAnswers[questionId] = [];

    const answerIndex = userAnswers[questionId].indexOf(optionIndex);

    if (answerIndex > -1) {
        // Désélectionner
        userAnswers[questionId].splice(answerIndex, 1);
        optionDiv.classList.remove('selected');
    } else {
        // Sélectionner — limiter au nombre de bonnes réponses attendues
        if (nbBonnes && userAnswers[questionId].length >= nbBonnes) {
            // Retirer le plus ancien pour rester dans la limite (si réponse unique)
            if (nbBonnes === 1) {
                document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
                userAnswers[questionId] = [];
            } else {
                return; // Pour multi, on ne force pas (l'utilisateur doit décocher)
            }
        }
        userAnswers[questionId].push(optionIndex);
        optionDiv.classList.add('selected');
    }

    saveAnswer(questionId, userAnswers[questionId]);
}

async function saveAnswer(questionId, answers) {
    try {
        await fetch(`${API_URL}/entrainement/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: currentSession.sessionId,
                questionId,
                answers
            })
        });
    } catch (error) {
        console.error('Erreur sauvegarde réponse:', error);
    }
}

document.getElementById('btn-suivant').addEventListener('click', () => {
    if (currentQuestionIndex < questions.length - 1) {
        currentQuestionIndex++;
        displayQuestion();
    }
});

document.getElementById('btn-precedent').addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayQuestion();
    }
});

document.getElementById('btn-terminer').addEventListener('click', async () => {
    if (!confirm('Êtes-vous sûr de vouloir terminer cet entraînement ?')) return;

    showLoader();

    try {
        const response = await fetch(`${API_URL}/entrainement/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession.sessionId })
        });

        const data = await response.json();
        if (!data.success) throw new Error('Erreur calcul score');

        // ── Vérification stricte réponses multiples côté client ──
        // (sécurité si le backend ne gère pas encore le strict)
        if (data.results && data.results.details) {
            data.results.details = data.results.details.map(detail => {
                const question = questions.find(q => q.id === detail.questionId);
                if (!question) return detail;
                const bonnes = (question.correctAnswers || []).map(Number).sort().join(',');
                const donnees = (userAnswers[question.id] || []).map(Number).sort().join(',');
                // Strictement égaux : toutes les bonnes et rien de plus
                detail.isCorrect = bonnes === donnees;
                return detail;
            });
            // Recalculer le score
            const nbCorrects = data.results.details.filter(d => d.isCorrect).length;
            data.results.score = nbCorrects;
            data.results.percentage = Math.round((nbCorrects / data.results.total) * 100);
        }

        const tempsTotal = Date.now() - sessionStartTime;
        const minutes = Math.floor(tempsTotal / 60000);
        const secondes = Math.floor((tempsTotal % 60000) / 1000);
        data.results.tempsAffiche = minutes > 0 ? `${minutes} min ${secondes}s` : `${secondes}s`;

        displayResults(data.results);
        showPage('page-resultats');

    } catch (error) {
        console.error('Erreur:', error);
        alert('Une erreur est survenue lors du calcul du score.');
    } finally {
        hideLoader();
    }
});

// ========== PAGE RÉSULTATS ==========

function displayResults(results) {
    const { score, total, percentage, details, tempsAffiche } = results;

    document.getElementById('score-value').textContent = score;
    document.getElementById('score-total').textContent = total;
    document.getElementById('score-percentage').textContent = `${percentage}%`;

    const circle = document.getElementById('score-circle');
    const svg = document.getElementById('score-svg');
    const circumference = 565;
    svg.style.strokeDashoffset = circumference - (percentage / 100) * circumference;
    circle.classList.toggle('fail', parseFloat(percentage) < 50);

    const isPassed = parseFloat(percentage) >= 50;
    const titleEl = document.getElementById('results-title');
    const messageEl = document.getElementById('results-message');

    if (isPassed) {
        titleEl.textContent = '🎉 Excellent travail !';
        titleEl.style.color = 'var(--vert-evacuation)';
        messageEl.textContent = `Vous avez obtenu ${percentage}% de bonnes réponses. Continuez ainsi !`;
    } else {
        titleEl.textContent = '📚 Continuez vos révisions';
        titleEl.style.color = 'var(--rouge-incendie)';
        messageEl.textContent = `Score : ${percentage}%. Identifiez vos axes d'amélioration ci-dessous.`;
    }

    document.getElementById('stat-correct').textContent = score;
    document.getElementById('stat-incorrect').textContent = total - score;
    document.getElementById('stat-time').textContent = tempsAffiche || '0s';

    const detailsContainer = document.getElementById('results-details');
    detailsContainer.innerHTML = '<h3 style="margin-bottom: 20px;">Correction détaillée</h3>';

    details.forEach((detail, index) => {
        const isCorrect = detail.isCorrect;
        const detailDiv = document.createElement('div');
        detailDiv.className = `detail-question ${isCorrect ? 'correct' : 'incorrect'}`;

        let html = `
            <div class="detail-header">
                <span>Question ${index + 1}</span>
                <span class="detail-badge ${isCorrect ? 'correct' : 'incorrect'}">
                    ${isCorrect ? '✓ Correct' : '✗ Incorrect'}
                </span>
            </div>
            <div class="detail-question-text">${detail.question || ''}</div>
        `;

        if (detail.userAnswerLabels && detail.userAnswerLabels.length > 0) {
            html += `
                <div style="margin-top:12px;padding:10px;background:#f8f9fa;border-left:3px solid #6c757d;border-radius:4px;">
                    <strong style="color:#495057;">Votre réponse :</strong>
                    <div style="color:#212529;margin-top:4px;">${detail.userAnswerLabels.join(', ')}</div>
                </div>
            `;
        } else {
            html += `
                <div style="margin-top:12px;padding:10px;background:#fff3cd;border-left:3px solid #ffc107;border-radius:4px;">
                    <strong style="color:#856404;">Votre réponse :</strong>
                    <div style="color:#856404;margin-top:4px;">Aucune réponse sélectionnée</div>
                </div>
            `;
        }

        if (detail.correctAnswerLabels && detail.correctAnswerLabels.length > 0) {
            html += `
                <div style="margin-top:8px;padding:10px;background:#d4edda;border-left:3px solid var(--vert-evacuation);border-radius:4px;">
                    <strong style="color:#155724;">Bonne(s) réponse(s) :</strong>
                    <div style="color:#155724;margin-top:4px;">${detail.correctAnswerLabels.join(', ')}</div>
                </div>
            `;
        }

        if (detail.explanation && detail.explanation.trim()) {
            html += `
                <div class="detail-explanation">
                    <strong>💡 Explication :</strong> ${detail.explanation}
                </div>
            `;
        }

        detailDiv.innerHTML = html;
        detailsContainer.appendChild(detailDiv);
    });
}

document.getElementById('btn-nouvel-entrainement').addEventListener('click', () => location.reload());
document.getElementById('btn-voir-historique').addEventListener('click', () => {
    alert('Fonctionnalité "Historique" disponible prochainement !');
});

console.log('🔥 app.js SSIAP chargé');