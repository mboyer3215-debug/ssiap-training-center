// formateur/formateur-sessions.js - VERSION AVEC QUIZ EN SALLE + LIEN CENTERID

(function () {
    let mesSessions = [];
    let sessionOuverte = null;

    function showLoader() { document.getElementById('loader').style.display = 'flex'; }
    function hideLoader() { document.getElementById('loader').style.display = 'none'; }

    window.loadMesSessions = async function () {
        if (!formateurData || !centerData) return;
        showLoader();
        try {
            const r = await fetch(`${API_URL}/session/list/${centerData.centerId}`);
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            mesSessions = d.sessions.filter(s =>
                (s.formateurIds || []).includes(formateurData.formateurId)
            );
            updateKPIs(mesSessions);
            displaySessionsList(mesSessions);
        } catch (e) {
            document.getElementById('sessions-container').innerHTML =
                `<p style="text-align:center;padding:40px;color:#dc2626;">⚠️ Erreur : ${e.message}</p>`;
        } finally { hideLoader(); }
    };

    window.ouvrirSession = function (sessionId) { sessionOuverte = sessionId; chargerStagiairesSession(sessionId); };
    window.retourSessions = function () { sessionOuverte = null; displaySessionsList(mesSessions); };
    window.afficherQRFormateur = function (stagiaireId) {
        const s = (window._stagiairesCourants || []).find(x => x.stagiaireId === stagiaireId);
        if (s) afficherQR(s);
    };

    // QUIZ EN SALLE
    window.lancerQuizSalle = function (sessionId, titre, niveau) {
        const url = `quiz-salle-formateur.html`
            + `?centerId=${centerData.centerId}`
            + `&sessionId=${sessionId}`
            + `&titre=${encodeURIComponent(titre)}`
            + `&niveau=${niveau}`
            + `&api=${encodeURIComponent(API_URL)}`;
        window.open(url, '_blank', 'width=1200,height=800');
    };

    window.copierLien = function (centerId) {
        const base = window.location.href.replace(/\/formateur\/.*$/, '');
        const lien = `${base}/stagiaire/stagiaire-login.html?centerId=${centerId}`;
        navigator.clipboard.writeText(lien).then(() => {
            alert('✅ Lien copié !\n\n' + lien);
        }).catch(() => { prompt('Copiez ce lien :', lien); });
    };

    function updateKPIs(sessions) {
        document.getElementById('kpi-sessions').textContent = sessions.length;
        document.getElementById('kpi-en-cours').textContent = sessions.filter(s => s.status === 'en cours').length;
        document.getElementById('kpi-terminees').textContent = sessions.filter(s => s.status === 'terminée').length;
        document.getElementById('kpi-stagiaires').textContent = sessions.reduce((sum, s) => sum + (s.nbStagiaires || 0), 0);
    }

    function displaySessionsList(sessions) {
        const container = document.getElementById('sessions-container');
        if (sessions.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#6b7280;"><div style="font-size:56px;margin-bottom:20px;">📅</div><h3>Aucune session assignée</h3></div>`;
            return;
        }
        const statusColor = { 'à venir': '#2563eb', 'en cours': '#16a34a', 'terminée': '#6b7280' };
        const niveauLabel = { SSIAP1: 'SSIAP 1', SSIAP2: 'SSIAP 2', SSIAP3: 'SSIAP 3', RECYCLAGE: 'Recyclage', MAC: 'MAC' };
        let html = '<div style="display:grid;gap:16px;">';
        sessions.forEach(session => {
            const color = statusColor[session.status] || '#6b7280';
            const dateDebut = new Date(session.dateDebut).toLocaleDateString('fr-FR');
            const dateFin = new Date(session.dateFin).toLocaleDateString('fr-FR');
            const autresFormateurs = (session.formateurs || [])
                .filter(f => f.formateurId !== formateurData.formateurId)
                .map(f => `${f.nom} ${f.prenom}`);
            html += `
                <div onclick="ouvrirSession('${session.sessionId}')"
                    style="background:white;border:1px solid #e5e7eb;border-left:5px solid ${color};border-radius:10px;padding:22px;cursor:pointer;transition:box-shadow 0.2s;"
                    onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
                        <div>
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                                <span style="background:${color}20;color:${color};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${session.status.toUpperCase()}</span>
                                <span style="background:#f3f4f6;color:#374151;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${niveauLabel[session.niveau] || session.niveau}</span>
                            </div>
                            <h3 style="margin:0 0 10px;color:#1f2937;font-size:19px;">${session.titre}</h3>
                            <div style="color:#6b7280;font-size:14px;display:grid;gap:5px;">
                                <span>📅 Du ${dateDebut} au ${dateFin}</span>
                                <span>👥 ${session.nbStagiaires || 0} stagiaire(s)</span>
                                ${autresFormateurs.length > 0 ? `<span>👨‍🏫 Avec : ${autresFormateurs.join(', ')}</span>` : ''}
                            </div>
                        </div>
                        <span style="color:#2563eb;font-weight:600;font-size:14px;">Voir →</span>
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async function chargerStagiairesSession(sessionId) {
        const session = mesSessions.find(s => s.sessionId === sessionId);
        if (!session) return;
        showLoader();
        try {
            const r = await fetch(`${API_URL}/stagiaire/list/${centerData.centerId}?sessionId=${sessionId}`);
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            window._stagiairesCourants = d.stagiaires;
            afficherDetailSession(session, d.stagiaires);
        } catch (e) { console.error(e); } finally { hideLoader(); }
    }

    function afficherDetailSession(session, stagiaires) {
        const container = document.getElementById('sessions-container');
        const niveauLabel = { SSIAP1: 'SSIAP 1', SSIAP2: 'SSIAP 2', SSIAP3: 'SSIAP 3', RECYCLAGE: 'Recyclage', MAC: 'MAC' };
        const statusColor = { 'à venir': '#2563eb', 'en cours': '#16a34a', 'terminée': '#6b7280' };
        const color = statusColor[session.status] || '#6b7280';
        const dateDebut = new Date(session.dateDebut).toLocaleDateString('fr-FR');
        const dateFin = new Date(session.dateFin).toLocaleDateString('fr-FR');
        const titreSafe = session.titre.replace(/'/g, "\\'");

        const stagiairesHtml = (!stagiaires || stagiaires.length === 0)
            ? `<div style="text-align:center;padding:50px 20px;color:#6b7280;"><div style="font-size:44px;">👥</div><p>Aucun stagiaire inscrit.</p></div>`
            : `
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <h3 style="margin:0;color:#1f2937;">Stagiaires (${stagiaires.length})</h3>
                    <input type="text" placeholder="🔍 Rechercher..." id="search-stag"
                        style="padding:8px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;width:220px;"
                        oninput="filtrerStagiaires(this.value)">
                </div>
                <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                        <th style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">NOM</th>
                        <th style="padding:12px 16px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">CONTACT</th>
                        <th style="padding:12px 16px;text-align:center;font-size:13px;color:#6b7280;font-weight:600;">PIN</th>
                        <th style="padding:12px 16px;text-align:center;font-size:13px;color:#6b7280;font-weight:600;">STATUT</th>
                        <th style="padding:12px 16px;text-align:right;font-size:13px;color:#6b7280;font-weight:600;">ACTIONS</th>
                    </tr></thead>
                    <tbody id="tbody-stagiaires">${renderLignesStagiaires(stagiaires)}</tbody>
                </table>
                </div>`;

        container.innerHTML = `
            <div>
                <button onclick="retourSessions()" style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:15px;font-weight:600;margin-bottom:20px;padding:0;">← Retour</button>
                <div style="background:white;border:1px solid #e5e7eb;border-left:5px solid ${color};border-radius:10px;padding:24px;margin-bottom:24px;">
                    <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                        <span style="background:${color}20;color:${color};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${session.status.toUpperCase()}</span>
                        <span style="background:#f3f4f6;color:#374151;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${niveauLabel[session.niveau] || session.niveau}</span>
                    </div>
                    <h2 style="margin:0 0 14px;color:#1f2937;">${session.titre}</h2>
                    <div style="color:#6b7280;font-size:14px;margin-bottom:18px;">
                        📅 Du ${dateDebut} au ${dateFin} &nbsp;|&nbsp; 👥 ${stagiaires.length} stagiaire(s)
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;font-size:13px;color:#166534;flex:1;min-width:220px;">
                            🔗 <strong>Lien connexion stagiaires :</strong><br>
                            <code style="font-size:11px;word-break:break-all;">stagiaire-login.html?centerId=${centerData.centerId}</code><br>
                            <button onclick="copierLien('${centerData.centerId}')"
                                style="margin-top:8px;padding:6px 14px;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">
                                📋 Copier le lien complet
                            </button>
                        </div>
                        <button onclick="lancerQuizSalle('${session.sessionId}', '${titreSafe}', '${session.niveau}')"
                            style="padding:14px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
                            🎮 Quiz en salle
                        </button>
                    </div>
                </div>
                <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                    ${stagiairesHtml}
                </div>
            </div>`;
    }

    function renderLignesStagiaires(stagiaires) {
        return stagiaires.map(s => {
            const badge = s.status === 'actif'
                ? '<span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">Actif</span>'
                : '<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">Expiré</span>';
            return `<tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:14px 16px;"><strong>${s.nom} ${s.prenom}</strong></td>
                <td style="padding:14px 16px;color:#6b7280;font-size:14px;">${s.email || '-'}</td>
                <td style="padding:14px 16px;text-align:center;">
                    <span style="font-family:monospace;background:#ecfdf5;padding:5px 12px;border-radius:6px;color:#16a34a;font-weight:bold;font-size:16px;">${s.pin}</span>
                </td>
                <td style="padding:14px 16px;text-align:center;">${badge}</td>
                <td style="padding:14px 16px;text-align:right;">
                    <button onclick="afficherQRFormateur('${s.stagiaireId}')"
                        style="padding:7px 14px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
                        📱 QR Code
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    window.filtrerStagiaires = function (q) {
        const all = window._stagiairesCourants || [];
        const filtered = q ? all.filter(s => `${s.nom} ${s.prenom}`.toLowerCase().includes(q.toLowerCase()) || s.pin.includes(q)) : all;
        const tbody = document.getElementById('tbody-stagiaires');
        if (tbody) tbody.innerHTML = renderLignesStagiaires(filtered);
    };

    function afficherQR(s) {
        const base = window.location.href.replace(/\/formateur\/.*$/, '');
        const loginUrl = `${base}/stagiaire/stagiaire-login.html?centerId=${centerData.centerId}`;
        const qrWindow = window.open('', 'QR', 'width=420,height=640');
        qrWindow.document.write(`<!DOCTYPE html><html><head><title>QR - ${s.nom}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
            <style>body{font-family:Arial;text-align:center;padding:20px;background:#f9fafb;}
            .card{background:white;border-radius:12px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
            .pin{font-size:36px;font-weight:bold;color:#16a34a;font-family:monospace;margin:10px 0;}
            .info{color:#6b7280;font-size:14px;margin:6px 0;}
            .url{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;font-size:11px;color:#166534;word-break:break-all;margin:10px 0;text-align:left;}
            #qrcode{margin:16px auto;display:inline-block;}
            button{padding:12px 24px;background:#16a34a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;margin-top:16px;}</style>
            </head><body><div class="card">
            <h2 style="color:#16a34a;">QR Code Stagiaire</h2>
            <div class="pin">${s.pin}</div>
            <strong>${s.nom} ${s.prenom}</strong>
            <div class="info">Valide jusqu'au ${new Date(s.dateFin).toLocaleDateString('fr-FR')}</div>
            <div class="url">🔗 <strong>Connexion PIN :</strong><br>${loginUrl}</div>
            <div id="qrcode"></div>
            <button onclick="window.print()">🖨️ Imprimer</button>
            </div></body></html>`);
        qrWindow.document.close();
        qrWindow.onload = () => {
            new qrWindow.QRCode(qrWindow.document.getElementById('qrcode'), { text: s.qrCodeData, width: 220, height: 220 });
        };
    }

    console.log('✅ formateur-sessions.js chargé');
})();