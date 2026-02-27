// dashboard.js - Logique Dashboard Formateur SSIAP

const API_URL = 'https://ssiap-training-center.onrender.com/api';

let currentData = {
    overview: null,
    stagiaires: null,
    questionsStats: null
};

// ========== INITIALISATION ==========

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initExport();
    initModal();
    
    loadOverviewData();
});

// ========== NAVIGATION ==========

function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            
            // Active nav button
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show page
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${page}`).classList.add('active');
            
            // Load data
            if (page === 'overview') loadOverviewData();
            if (page === 'stagiaires') loadStagiairesData();
            if (page === 'questions') loadQuestionsData();
        });
    });
}

// ========== LOADER ==========

function showLoader() {
    document.getElementById('loader').classList.add('active');
}

function hideLoader() {
    document.getElementById('loader').classList.remove('active');
}

// ========== VUE D'ENSEMBLE ==========

async function loadOverviewData() {
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/dashboard/overview`);
        const data = await response.json();
        
        if (data.success) {
            currentData.overview = data.stats;
            displayOverview(data.stats);
        }
    } catch (error) {
        console.error('Erreur chargement overview:', error);
        alert('Erreur chargement des données');
    } finally {
        hideLoader();
    }
}

function displayOverview(stats) {
    // KPIs
    document.getElementById('kpi-stagiaires').textContent = stats.totalStagiaires;
    document.getElementById('kpi-sessions').textContent = stats.totalSessions;
    document.getElementById('kpi-moyenne').textContent = `${stats.moyenneScore}%`;
    document.getElementById('kpi-reussite').textContent = `${stats.tauxReussite}%`;
    
    // Graphique sessions par niveau
    displayNiveauxChart(stats.sessionsByNiveau);
    
    // Graphique top performers
    displayTopPerformersChart(stats.topPerformers);
    
    // Sessions récentes
    displayRecentSessions(stats.recentSessions);
}

function displayNiveauxChart(data) {
    const ctx = document.getElementById('chart-niveaux').getContext('2d');
    
    // Détruire graphique existant
    if (window.niveauxChart) window.niveauxChart.destroy();
    
    window.niveauxChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['SSIAP 1', 'SSIAP 2', 'SSIAP 3'],
            datasets: [{
                data: [data[1] || 0, data[2] || 0, data[3] || 0],
                backgroundColor: ['#dc2626', '#f59e0b', '#16a34a']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function displayTopPerformersChart(performers) {
    const ctx = document.getElementById('chart-top').getContext('2d');
    
    if (window.topChart) window.topChart.destroy();
    
    const labels = performers.map(p => p.userId.replace('_', ' '));
    const scores = performers.map(p => parseFloat(p.moyenne));
    
    window.topChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Moyenne (%)',
                data: scores,
                backgroundColor: '#2563eb'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function displayRecentSessions(sessions) {
    const container = document.getElementById('recent-sessions');
    
    if (sessions.length === 0) {
        container.innerHTML = '<p>Aucune session récente</p>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Stagiaire</th>
                    <th>Niveau</th>
                    <th>Partie</th>
                    <th>Questions</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sessions.forEach(session => {
        const date = new Date(session.startedAt).toLocaleString('fr-FR');
        html += `
            <tr>
                <td>${session.userId.replace('_', ' ')}</td>
                <td><span class="badge badge-warning">SSIAP ${session.niveau}</span></td>
                <td>${session.partieId}</td>
                <td>${session.questions.length}</td>
                <td>${date}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ========== STAGIAIRES ==========

async function loadStagiairesData() {
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/dashboard/stagiaires`);
        const data = await response.json();
        
        if (data.success) {
            currentData.stagiaires = data.stagiaires;
            displayStagiaires(data.stagiaires);
        }
    } catch (error) {
        console.error('Erreur chargement stagiaires:', error);
        alert('Erreur chargement des stagiaires');
    } finally {
        hideLoader();
    }
}

function displayStagiaires(stagiaires) {
    const container = document.getElementById('stagiaires-list');
    
    if (stagiaires.length === 0) {
        container.innerHTML = '<p>Aucun stagiaire enregistré</p>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Sessions</th>
                    <th>Moyenne</th>
                    <th>Niveaux</th>
                    <th>Progression</th>
                    <th>Dernière session</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    stagiaires.forEach(stagiaire => {
        const badgeClass = parseFloat(stagiaire.moyenneScore) >= 50 ? 'badge-success' : 'badge-danger';
        const progressClass = parseFloat(stagiaire.progression) >= 0 ? 'badge-success' : 'badge-danger';
        
        html += `
            <tr>
                <td><strong>${stagiaire.nom} ${stagiaire.prenom}</strong></td>
                <td>${stagiaire.nombreSessions}</td>
                <td><span class="badge ${badgeClass}">${stagiaire.moyenneScore}%</span></td>
                <td>${stagiaire.niveauxPratiques.join(', ')}</td>
                <td><span class="badge ${progressClass}">${stagiaire.progression > 0 ? '+' : ''}${stagiaire.progression}%</span></td>
                <td>${stagiaire.dernierEntrainement || 'N/A'}</td>
                <td>
                    <button class="btn-details" onclick="showStagiaireDetails('${stagiaire.userId}')">
                        Détails
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Recherche
    document.getElementById('search-stagiaire').addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const filtered = stagiaires.filter(s => 
            `${s.nom} ${s.prenom}`.toLowerCase().includes(search)
        );
        displayStagiaires(filtered);
    });
}

async function showStagiaireDetails(userId) {
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/dashboard/stagiaire/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            displayStagiaireModal(data.stagiaire);
        }
    } catch (error) {
        console.error('Erreur détails stagiaire:', error);
        alert('Erreur chargement des détails');
    } finally {
        hideLoader();
    }
}

function displayStagiaireModal(stagiaire) {
    const modal = document.getElementById('modal-stagiaire');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.textContent = `${stagiaire.nom} ${stagiaire.prenom}`;
    
    let html = `
        <div style="margin-bottom: 30px;">
            <h3>Statistiques générales</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${stagiaire.statistiques.nombreSessions}</div>
                    <div style="font-size: 13px; color: #6b7280;">Sessions</div>
                </div>
                <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${stagiaire.statistiques.moyenneScore}%</div>
                    <div style="font-size: 13px; color: #6b7280;">Moyenne</div>
                </div>
                <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                    <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${stagiaire.statistiques.tauxReussite}%</div>
                    <div style="font-size: 13px; color: #6b7280;">Réussite</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h3>Performance par niveau</h3>
            <div style="margin-top: 15px;">
    `;
    
    Object.entries(stagiaire.performanceParNiveau).forEach(([niveau, score]) => {
        html += `
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>SSIAP ${niveau}</span>
                    <span><strong>${score}%</strong></span>
                </div>
                <div style="background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden;">
                    <div style="background: #dc2626; height: 100%; width: ${score}%;"></div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
        
        <div>
            <h3>Historique (10 dernières sessions)</h3>
            <table style="margin-top: 15px; width: 100%;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Niveau</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    stagiaire.historique.slice(0, 10).forEach(session => {
        const badgeClass = parseFloat(session.percentage) >= 50 ? 'badge-success' : 'badge-danger';
        html += `
            <tr>
                <td>${session.date}</td>
                <td>SSIAP ${session.niveau}</td>
                <td><span class="badge ${badgeClass}">${session.score}/${session.total} (${session.percentage}%)</span></td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    
    body.innerHTML = html;
    modal.classList.add('active');
}

// ========== QUESTIONS ==========

async function loadQuestionsData() {
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/dashboard/questions-stats`);
        const data = await response.json();
        
        if (data.success) {
            currentData.questionsStats = data;
            displayQuestions(data.difficiles, 'difficiles');
            initQuestionsTabs(data);
        }
    } catch (error) {
        console.error('Erreur chargement questions:', error);
        alert('Erreur chargement des questions');
    } finally {
        hideLoader();
    }
}

function initQuestionsTabs(data) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.tab;
            if (tab === 'difficiles') displayQuestions(data.difficiles, 'difficiles');
            if (tab === 'faciles') displayQuestions(data.faciles, 'faciles');
            if (tab === 'toutes') displayQuestions(data.questions, 'toutes');
        });
    });
}

function displayQuestions(questions, type) {
    const container = document.getElementById('questions-stats');
    
    if (questions.length === 0) {
        container.innerHTML = '<p>Aucune donnée disponible</p>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th style="width: 60%;">Question</th>
                    <th>Réponses</th>
                    <th>Bonnes</th>
                    <th>Taux réussite</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    questions.forEach(q => {
        const taux = parseFloat(q.tauxReussite);
        const badgeClass = taux >= 70 ? 'badge-success' : taux >= 50 ? 'badge-warning' : 'badge-danger';
        
        html += `
            <tr>
                <td>${q.question || q.questionId}</td>
                <td>${q.totalReponses}</td>
                <td>${q.bonnesReponses}</td>
                <td><span class="badge ${badgeClass}">${q.tauxReussite}%</span></td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ========== MODAL ==========

function initModal() {
    const modal = document.getElementById('modal-stagiaire');
    const closeBtn = document.querySelector('.modal-close');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

// ========== EXPORT ==========

function initExport() {
    document.getElementById('btn-export').addEventListener('click', async () => {
        try {
            window.location.href = `${API_URL}/dashboard/export`;
        } catch (error) {
            console.error('Erreur export:', error);
            alert('Erreur lors de l\'export');
        }
    });
}

console.log('🔥 Dashboard Formateur SSIAP - Chargé');
