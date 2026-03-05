// app.js - Interface Stagiaire ENTRAÎNEMENT SSIAP

const API_URL = 'https://ssiap-training-center.onrender.com/api';

let currentUser          = null;
let currentSession       = null;
let questions            = [];
let currentQuestionIndex = 0;
let userAnswers          = {};
let niveauSelected       = null;
let partieSelected       = 'toutes';
let nbQuestionsSelected  = null;
let partiesConfig        = [];
let sessionStartTime     = null;

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
        const stagConnecte = window.STAGIAIRE_CONNECTE || null;
        if (stagConnecte && stagConnecte.stagiaireId) {
            currentUser = {
                userId:      stagConnecte.stagiaireId,
                stagiaireId: stagConnecte.stagiaireId,
                nom:         stagConnecte.nom    || nom,
                prenom:      stagConnecte.prenom || prenom,
                email:       stagConnecte.email  || email,
                centerId:    stagConnecte.centerId  || '',
                sessionId:   stagConnecte.sessionId || '',
            };
        } else {
            currentUser = { userId: 'local_' + Date.now(), nom, prenom, email, centerId: '', sessionId: '' };
        }
        const body = {
            userId:      currentUser.userId,
            niveau:      niveauSelected,
            partieId:    partieSelected,
            nbQuestions: nbQuestionsSelected,
        };
        if (currentUser.centerId)  body.centerId  = currentUser.centerId;
        if (currentUser.sessionId) body.sessionId = currentUser.sessionId;

        const r = await fetch(`${API_URL}/entrainement/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Erreur démarrage entraînement');
        const qs = d.questions || d.Questions || d.data?.questions || [];
        if (!Array.isArray(qs) || qs.length === 0)
            throw new Error(`Aucune question disponible pour le niveau SSIAP ${niveauSelected}.`);
        currentSession = { sessionId: d.sessionId || 'local_' + Date.now(), niveau: niveauSelected, partieId: partieSelected };
        questions = qs; currentQuestionIndex = 0; userAnswers = {}; sessionStartTime = Date.now();
        initEntrainement();
        showPage('page-entrainement');
    } catch(err) {
        alert('Erreur : ' + err.message + '\nVérifiez votre connexion et réessayez.');
    } finally { hideLoader(); }
});

// ══════════════════════════════════════
//  PAGE ENTRAÎNEMENT
// ══════════════════════════════════════
function initEntrainement() {
    document.getElementById('entrainement-stagiaire').textContent = `${currentUser.prenom} ${currentUser.nom}`;
    document.getElementById('entrainement-niveau').textContent    = currentSession.niveau;
    let partieLabel = 'Toutes les parties';
    if (currentSession.partieId !== 'toutes') {
        const p = partiesConfig.find(p => p.id === currentSession.partieId);
        if (p) partieLabel = p.label;
    }
    document.getElementById('entrainement-partie').textContent = partieLabel;
    document.getElementById('question-total').textContent      = questions.length;
    displayQuestion();
}

function displayQuestion() {
    const q   = questions[currentQuestionIndex];
    const num = currentQuestionIndex + 1;
    document.getElementById('question-numero').textContent      = num;
    document.getElementById('current-question-num').textContent = num;
    document.getElementById('progress-fill').style.width        = `${(num / questions.length) * 100}%`;
    document.getElementById('question-text').textContent        = q.question;
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
    document.getElementById('btn-precedent').style.visibility = currentQuestionIndex === 0 ? 'hidden' : 'visible';
    const last = currentQuestionIndex === questions.length - 1;
    document.getElementById('btn-suivant').style.display  = last ? 'none'  : 'block';
    document.getElementById('btn-terminer').style.display = last ? 'block' : 'none';
}

function toggleOption(questionId, optionIndex) {
    const div = document.querySelector(`.option[data-index="${optionIndex}"]`);
    if (!userAnswers[questionId]) userAnswers[questionId] = [];
    const idx = userAnswers[questionId].indexOf(optionIndex);
    if (idx > -1) { userAnswers[questionId].splice(idx, 1); div.classList.remove('selected'); }
    else          { userAnswers[questionId].push(optionIndex); div.classList.add('selected'); }
    saveAnswer(questionId, userAnswers[questionId]);
}

async function saveAnswer(questionId, answers) {
    if (!currentSession?.sessionId) return;
    try {
        await fetch(`${API_URL}/entrainement/answer`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession.sessionId, questionId, answers })
        });
    } catch(e) {}
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSession.sessionId })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Erreur calcul score');
        const t   = Date.now() - sessionStartTime;
        const min = Math.floor(t / 60000), sec = Math.floor((t % 60000) / 1000);
        d.results.tempsAffiche = min > 0 ? `${min} min ${sec}s` : `${sec}s`;

        if (currentUser.centerId && currentUser.stagiaireId) {
            try {
                // Breakdown thématique
                const themesBreakdown = {};
                (d.results.details || []).forEach(function(detail) {
                    const theme = detail.partie || detail.partieId || detail.category || detail.theme || null;
                    if (!theme) return;
                    if (!themesBreakdown[theme]) themesBreakdown[theme] = { label: detail.partieLabel || detail.partieNom || theme, score: 0, total: 0 };
                    themesBreakdown[theme].total++;
                    if (detail.isCorrect) themesBreakdown[theme].score++;
                });

                // Questions échouées (pour révision dans l'historique)
                const detailsEchecs = (d.results.details || [])
                    .filter(function(det) { return !det.isCorrect; })
                    .map(function(det) {
                        return {
                            question:            det.question || '',
                            userAnswerLabels:    det.userAnswerLabels    || [],
                            correctAnswerLabels: det.correctAnswerLabels || [],
                            explanation:         det.explanation         || '',
                        };
                    });

                await fetch(`${API_URL}/stagiaire/save-result`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        centerId:        currentUser.centerId,
                        sessionId:       currentUser.sessionId || '',
                        stagiaireId:     currentUser.stagiaireId,
                        score:           d.results.score,
                        total:           d.results.total,
                        pct:             d.results.percentage,
                        niveau:          currentSession.niveau,
                        partieId:        currentSession.partieId,
                        temps:           t,
                        themesBreakdown: Object.keys(themesBreakdown).length ? themesBreakdown : null,
                        detailsEchecs:   detailsEchecs.length ? detailsEchecs : null,
                    })
                });
            } catch(e) { console.warn('Historique non sauvegardé:', e); }
        } else {
            saveResultLocal({
                score:    d.results.score,
                total:    d.results.total,
                pct:      d.results.percentage,
                niveau:   currentSession.niveau,
                partieId: currentSession.partieId,
                temps:    t,
                date:     Date.now(),
                detailsEchecs: (d.results.details || [])
                    .filter(det => !det.isCorrect)
                    .map(det => ({
                        question:            det.question || '',
                        userAnswerLabels:    det.userAnswerLabels    || [],
                        correctAnswerLabels: det.correctAnswerLabels || [],
                        explanation:         det.explanation         || '',
                    })),
            });
        }
        displayResults(d.results);
        showPage('page-resultats');
    } catch(err) {
        alert('Erreur lors du calcul du score : ' + err.message);
    } finally { hideLoader(); }
});

function saveResultLocal(result) {
    try {
        const key  = 'ssiap_historique_local';
        const hist = JSON.parse(localStorage.getItem(key) || '[]');
        hist.unshift(result);
        localStorage.setItem(key, JSON.stringify(hist.slice(0, 50)));
    } catch(e) {}
}

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

    displayAnalyse(details || []);

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

// ══════════════════════════════════════
//  ANALYSE POINTS FORTS / À AMÉLIORER
// ══════════════════════════════════════
function displayAnalyse(details) {
    if (!details || details.length === 0) return;
    let bloc = document.getElementById('bloc-analyse');
    if (!bloc) {
        bloc = document.createElement('div');
        bloc.id = 'bloc-analyse';
        bloc.style.cssText = 'margin-bottom:24px';
        const detailsEl = document.getElementById('results-details');
        if (!detailsEl) return;
        detailsEl.parentNode.insertBefore(bloc, detailsEl);
    }
    const parGroupe = {};
    details.forEach(d => {
        const cle = d.partie || d.partieId || d.category || d.theme || null;
        if (!cle) return;
        if (!parGroupe[cle]) parGroupe[cle] = { label: d.partieLabel || d.partieNom || cle, total: 0, correct: 0 };
        parGroupe[cle].total++;
        if (d.isCorrect) parGroupe[cle].correct++;
    });
    const groupes = Object.values(parGroupe);

    if (groupes.length === 0) {
        const total   = details.length;
        const correct = details.filter(d => d.isCorrect).length;
        const pct     = Math.round((correct / total) * 100);
        const forts   = details.filter(d => d.isCorrect);
        const faibles = details.filter(d => !d.isCorrect);
        if (faibles.length === 0) {
            bloc.innerHTML = `<div style="background:linear-gradient(135deg,#edf7f2,#d4eddf);border:1.5px solid rgba(46,125,82,.3);border-radius:14px;padding:18px 20px;">
                <div style="font-weight:800;font-size:15px;color:#2e7d52;margin-bottom:6px">🏆 Performance parfaite !</div>
                <p style="font-size:13px;color:#1e4a30;line-height:1.5">Toutes les réponses sont correctes. Essayez un niveau ou une thématique plus difficile !</p>
            </div>`;
            return;
        }
        const couleurPct = pct >= 70 ? '#2e7d52' : pct >= 50 ? '#d4960a' : '#c25a3a';
        bloc.innerHTML = `
            <div style="background:#f7f5f2;border:1.5px solid #e2ddd8;border-radius:14px;padding:18px 20px;">
                <div style="font-weight:800;font-size:14px;color:#1e1a17;margin-bottom:16px">📊 Bilan de votre entraînement</div>
                <div style="margin-bottom:18px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px">
                        <span style="color:#4a4340">Score global</span>
                        <span style="color:${couleurPct}">${correct}/${total} · ${pct}%</span>
                    </div>
                    <div style="height:10px;background:#e8e2db;border-radius:5px;overflow:hidden">
                        <div style="height:100%;width:${pct}%;background:${couleurPct};border-radius:5px;transition:.6s"></div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                    ${forts.length ? `<div>
                        <div style="font-size:11px;font-weight:800;color:#2e7d52;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
                            ✅ Maîtrisé <span style="background:#edf7f2;color:#2e7d52;padding:1px 7px;border-radius:10px;">${forts.length}</span>
                        </div>
                        ${forts.slice(0,4).map(d=>`<div style="background:#edf7f2;border-radius:8px;padding:7px 10px;margin-bottom:5px;font-size:11px;color:#1e1a17;line-height:1.4">✓ ${d.question?d.question.slice(0,65)+(d.question.length>65?'…':''):'Question correcte'}</div>`).join('')}
                        ${forts.length>4?`<div style="font-size:11px;color:#2e7d52;padding:4px 10px">+ ${forts.length-4} autre${forts.length-4>1?'s':''}</div>`:''}
                    </div>` : '<div></div>'}
                    ${faibles.length ? `<div>
                        <div style="font-size:11px;font-weight:800;color:#c25a3a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
                            ⚠️ À retravailler <span style="background:#fdf2ee;color:#c25a3a;padding:1px 7px;border-radius:10px;">${faibles.length}</span>
                        </div>
                        ${faibles.slice(0,4).map(d=>`<div style="background:#fdf2ee;border-radius:8px;padding:7px 10px;margin-bottom:5px;font-size:11px;color:#1e1a17;line-height:1.4">✗ ${d.question?d.question.slice(0,65)+(d.question.length>65?'…':''):'Question incorrecte'}</div>`).join('')}
                        ${faibles.length>4?`<div style="font-size:11px;color:#c25a3a;padding:4px 10px">+ ${faibles.length-4} autre${faibles.length-4>1?'s':''}</div>`:''}
                    </div>` : ''}
                </div>
                <div style="margin-top:14px;border-radius:9px;padding:10px 14px;font-size:12px;font-weight:600;
                    background:${pct<50?'#fdf2ee':pct<70?'#fef7e0':'#edf7f2'};
                    color:${pct<50?'#c25a3a':pct<70?'#d4960a':'#2e7d52'}">
                    ${pct<50?`💡 Concentrez-vous sur les ${faibles.length} question${faibles.length>1?'s':''} incorrectes avant de refaire un entraînement.`:pct<70?`📈 Bon travail ! Revoyez les ${faibles.length} erreur${faibles.length>1?'s':''} pour dépasser les 70%.`:`🎯 Excellent score ! Continuez ainsi pour être prêt pour l'examen.`}
                </div>
            </div>`;
        return;
    }
    const forts   = groupes.filter(g => (g.correct/g.total)>=0.7).sort((a,b)=>(b.correct/b.total)-(a.correct/a.total));
    const moyens  = groupes.filter(g => (g.correct/g.total)>=0.5 && (g.correct/g.total)<0.7);
    const faibles = groupes.filter(g => (g.correct/g.total)<0.5).sort((a,b)=>(a.correct/a.total)-(b.correct/b.total));
    const barreHtml = (g) => {
        const pct=Math.round((g.correct/g.total)*100),color=pct>=70?'#2e7d52':pct>=50?'#d4960a':'#c25a3a',bg=pct>=70?'#edf7f2':pct>=50?'#fef7e0':'#fdf2ee';
        return `<div style="background:${bg};border-radius:9px;padding:10px 12px;margin-bottom:6px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
                <span style="font-size:12px;font-weight:700;color:#1e1a17">${g.label}</span>
                <span style="font-size:12px;font-weight:800;color:${color}">${g.correct}/${g.total} · ${pct}%</span>
            </div>
            <div style="height:6px;background:rgba(0,0,0,.08);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:.5s"></div>
            </div>
        </div>`;
    };
    bloc.innerHTML = `
        <div style="background:#f7f5f2;border:1.5px solid #e2ddd8;border-radius:14px;padding:18px 20px;">
            <div style="font-weight:800;font-size:14px;color:#1e1a17;margin-bottom:16px">📊 Analyse par thématique</div>
            <div style="display:grid;grid-template-columns:${forts.length&&(faibles.length||moyens.length)?'1fr 1fr':'1fr'};gap:14px">
                ${forts.length?`<div><div style="font-size:11px;font-weight:800;color:#2e7d52;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">✅ Points forts</div>${forts.map(barreHtml).join('')}</div>`:''}
                ${faibles.length||moyens.length?`<div>
                    ${faibles.length?`<div style="font-size:11px;font-weight:800;color:#c25a3a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⚠️ À améliorer</div>${faibles.map(barreHtml).join('')}`:''}
                    ${moyens.length?`<div style="font-size:11px;font-weight:800;color:#d4960a;text-transform:uppercase;letter-spacing:.5px;margin:${faibles.length?'10px':'0'} 0 8px">📈 À consolider</div>${moyens.map(barreHtml).join('')}`:''}
                </div>`:''}
            </div>
            ${forts.length===groupes.length?`<p style="font-size:12px;color:#2e7d52;font-weight:700;margin-top:12px;text-align:center;background:#edf7f2;padding:8px;border-radius:8px">🏆 Toutes les thématiques maîtrisées — prêt pour l'examen !</p>`:''}
        </div>`;
}

// ══════════════════════════════════════
//  HISTORIQUE
// ══════════════════════════════════════
// Bouton historique — robuste même si pas encore dans le DOM
(function attachHistoriqueBtn() {
    var el = document.getElementById('btn-voir-historique');
    if (el) {
        el.addEventListener('click', () => openHistoriqueModal());
    } else {
        // Créer le bouton dynamiquement sous le formulaire
        var form = document.getElementById('form-connexion') || document.querySelector('form') || document.body;
        var wrap = document.createElement('div');
        wrap.style.cssText = 'text-align:center;margin-top:14px';
        var btn = document.createElement('button');
        btn.id   = 'btn-voir-historique';
        btn.type = 'button';
        btn.textContent = '📊 Voir mon historique';
        btn.style.cssText = [
            'width:100%',
            'padding:13px 20px',
            'border-radius:10px',
            'border:2px solid rgba(255,255,255,.22)',
            'background:rgba(255,255,255,.09)',
            'color:rgba(255,255,255,.88)',
            'font-family:"Plus Jakarta Sans",sans-serif',
            'font-size:14px',
            'font-weight:700',
            'cursor:pointer',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'gap:8px',
            'transition:.15s',
            'letter-spacing:.2px',
        ].join(';');
        btn.onmouseover = function(){ this.style.background='rgba(255,255,255,.17)'; this.style.color='#fff'; };
        btn.onmouseout  = function(){ this.style.background='rgba(255,255,255,.09)'; this.style.color='rgba(255,255,255,.88)'; };
        btn.addEventListener('click', () => openHistoriqueModal());
        wrap.appendChild(btn);
        // Insérer après le bouton demarrer
        var btnDem = document.getElementById('btn-demarrer');
        if (btnDem && btnDem.parentNode) {
            btnDem.parentNode.insertBefore(wrap, btnDem.nextSibling);
        } else {
            form.appendChild(wrap);
        }
    }
})();

async function openHistoriqueModal() {
    const existing = document.getElementById('modal-historique');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-historique';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e8e2db;flex-shrink:0;">
                <h3 style="font-size:17px;font-weight:700;margin:0;color:#1e1a17;">📊 Mon historique</h3>
                <button onclick="document.getElementById('modal-historique').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#8c8078;">✕</button>
            </div>
            <div id="historique-content" style="overflow-y:auto;padding:18px;flex:1;">
                <div style="text-align:center;padding:40px;color:#8c8078;"><div style="font-size:32px;margin-bottom:10px">⏳</div><p>Chargement…</p></div>
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

    const content = document.getElementById('historique-content');
    let historique = [];
    try {
        const stagConnecte = window.STAGIAIRE_CONNECTE;
        if (stagConnecte?.stagiaireId && stagConnecte?.centerId) {
            const r = await fetch(`${API_URL}/stagiaire/historique/${stagConnecte.stagiaireId}?centerId=${stagConnecte.centerId}`);
            const d = await r.json();
            if (d.success) historique = d.historique || [];
        } else {
            historique = JSON.parse(localStorage.getItem('ssiap_historique_local') || '[]');
        }
    } catch(e) {
        content.innerHTML = `<div style="text-align:center;padding:40px;color:#c0392b;"><div style="font-size:32px;margin-bottom:10px">⚠️</div><p>Impossible de charger l'historique.</p></div>`;
        return;
    }

    if (!historique.length) {
        content.innerHTML = `<div style="text-align:center;padding:40px;color:#8c8078;">
            <div style="font-size:40px;margin-bottom:12px">📭</div>
            <p style="font-size:14px;font-weight:600;color:#4a4340">Aucun entraînement enregistré</p>
            <p style="font-size:12px;margin-top:6px">Terminez un entraînement pour voir votre historique.</p>
        </div>`;
        return;
    }

    const totalE = historique.length;
    const moyPct = Math.round(historique.reduce((s,h) => s + parseFloat(h.pct||0), 0) / totalE);
    const nbOk   = historique.filter(h => parseFloat(h.pct||0) >= 50).length;
    const niveauLabel = { 1:'SSIAP 1', 2:'SSIAP 2', 3:'SSIAP 3' };

    // Stocker l'historique dans une variable globale pour y accéder depuis les boutons
    window._historiqueData = historique;

    content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
            <div style="background:#f7f5f2;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#c25a3a">${totalE}</div><div style="font-size:11px;color:#8c8078;margin-top:2px">Entraînements</div></div>
            <div style="background:#f7f5f2;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;color:${moyPct>=50?'#2e7d52':'#c25a3a'}">${moyPct}%</div><div style="font-size:11px;color:#8c8078;margin-top:2px">Moyenne</div></div>
            <div style="background:#f7f5f2;border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;color:#2e7d52">${nbOk}</div><div style="font-size:11px;color:#8c8078;margin-top:2px">Réussis</div></div>
        </div>
        <div style="font-size:11px;color:#8c8078;margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Derniers entraînements</div>` +
        historique.map((h, idx) => {
            const pct = parseFloat(h.pct || 0);
            const ok  = pct >= 50;
            const col = ok ? '#2e7d52' : '#c25a3a';
            const bg  = ok ? '#edf7f2' : '#fdf2ee';
            const date = (h.date||h.completedAt)
                ? new Date(h.date||h.completedAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                : '—';
            const temps = h.temps
                ? (Math.floor(h.temps/60000)>0?`${Math.floor(h.temps/60000)} min ${Math.floor((h.temps%60000)/1000)}s`:`${Math.floor(h.temps/1000)}s`)
                : null;
            const hasEchecs = h.detailsEchecs && h.detailsEchecs.length > 0;
            return `
                <div style="background:${bg};border:1.5px solid ${col}25;border-radius:10px;padding:12px 14px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="text-align:center;min-width:48px;flex-shrink:0;">
                            <div style="font-size:20px;font-weight:800;color:${col};line-height:1.1">${pct}%</div>
                            <div style="font-size:10px;color:${col};font-weight:700;margin-top:1px">${ok?'✓ OK':'✗ KO'}</div>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:700;color:#1e1a17;margin-bottom:2px">
                                ${niveauLabel[h.niveau]||'SSIAP '+(h.niveau||'?')}
                                ${h.partieId&&h.partieId!=='toutes'?`<span style="color:#8c8078;font-weight:500"> · ${h.partieId}</span>`:''}
                            </div>
                            <div style="font-size:12px;color:#4a4340">${h.score}/${h.total} bonne${h.score>1?'s':''} réponse${h.score>1?'s':''}${temps?` · ${temps}`:''}</div>
                            <div style="font-size:11px;color:#8c8078;margin-top:2px">${date}</div>
                        </div>
                    </div>
                    ${hasEchecs ? `
                    <div style="margin-top:10px;border-top:1px solid ${col}20;padding-top:10px">
                        <button onclick="openEchecsModal(${idx})"
                            style="background:#fff;border:1.5px solid ${col};color:${col};border-radius:7px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;display:flex;align-items:center;gap:5px">
                            ⚠️ Revoir les ${h.detailsEchecs.length} erreur${h.detailsEchecs.length>1?'s':''} →
                        </button>
                    </div>` : (pct < 100 ? `
                    <div style="margin-top:8px;border-top:1px solid ${col}20;padding-top:8px;font-size:11px;color:#8c8078;font-style:italic;display:flex;align-items:center;gap:5px">
                        📋 Détail des erreurs enregistré à partir des prochains entraînements
                    </div>` : `
                    <div style="margin-top:8px;border-top:1px solid #2e7d5220;padding-top:8px;font-size:11px;color:#2e7d52;font-weight:700">
                        🏆 Score parfait — aucune erreur !
                    </div>`)}
                </div>`;
        }).join('');
}

// ── Modal détail erreurs (côté stagiaire) ──
function openEchecsModal(histIdx) {
    const h = (window._historiqueData || [])[histIdx];
    if (!h || !h.detailsEchecs || !h.detailsEchecs.length) return;

    const existing = document.getElementById('modal-echecs');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-echecs';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';

    const pct = parseFloat(h.pct||0);
    const niveauLabel = {1:'SSIAP 1',2:'SSIAP 2',3:'SSIAP 3'};

    const questionsHtml = h.detailsEchecs.map((q, i) => `
        <div style="background:#fdf2ee;border:1.5px solid #c25a3a30;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
            <div style="font-size:11px;font-weight:700;color:#c25a3a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Question ${i+1}</div>
            <div style="font-size:13px;font-weight:600;color:#1e1a17;margin-bottom:10px;line-height:1.5">${q.question}</div>
            ${q.userAnswerLabels && q.userAnswerLabels.length ? `
            <div style="background:#fff;border-radius:7px;padding:8px 10px;margin-bottom:6px;border-left:3px solid #c25a3a">
                <div style="font-size:10px;font-weight:700;color:#c25a3a;text-transform:uppercase;margin-bottom:3px">Votre réponse</div>
                <div style="font-size:12px;color:#4a4340">${q.userAnswerLabels.join(', ') || 'Aucune réponse'}</div>
            </div>` : ''}
            <div style="background:#edf7f2;border-radius:7px;padding:8px 10px;margin-bottom:6px;border-left:3px solid #2e7d52">
                <div style="font-size:10px;font-weight:700;color:#2e7d52;text-transform:uppercase;margin-bottom:3px">Bonne réponse</div>
                <div style="font-size:12px;color:#1e4a30;font-weight:600">${q.correctAnswerLabels ? q.correctAnswerLabels.join(', ') : '—'}</div>
            </div>
            ${q.explanation ? `
            <div style="background:#fef7e0;border-radius:7px;padding:8px 10px;border-left:3px solid #d4960a">
                <div style="font-size:10px;font-weight:700;color:#d4960a;text-transform:uppercase;margin-bottom:3px">💡 Explication</div>
                <div style="font-size:12px;color:#4a4340;line-height:1.5">${q.explanation}</div>
            </div>` : ''}
        </div>`).join('');

    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.35);overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e8e2db;flex-shrink:0;background:linear-gradient(135deg,#fdf2ee,#f9e8e0);">
                <div>
                    <div style="font-size:16px;font-weight:800;color:#1e1a17">⚠️ Questions à retravailler</div>
                    <div style="font-size:12px;color:#8c8078;margin-top:2px">${niveauLabel[h.niveau]||'SSIAP '+(h.niveau||'?')} · ${pct}% · ${h.detailsEchecs.length} erreur${h.detailsEchecs.length>1?'s':''}</div>
                </div>
                <button onclick="document.getElementById('modal-echecs').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#8c8078;">✕</button>
            </div>
            <div style="overflow-y:auto;padding:18px;flex:1;">
                <p style="font-size:12px;color:#8c8078;margin-bottom:14px;padding:10px 12px;background:#f7f5f2;border-radius:8px">
                    📖 Prenez le temps de bien comprendre les bonnes réponses avant de refaire un entraînement sur ces questions.
                </p>
                ${questionsHtml}
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

console.log('🔥 SSIAP Entraînement — API:', API_URL);