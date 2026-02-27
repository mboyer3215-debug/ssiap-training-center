// center/center-sessions.js
// Gestion des sessions de formation depuis le dashboard centre

(function () {
    let sessions = [];
    let formateurs = [];
    let currentSessionId = null; // Session ouverte pour voir les stagiaires

    function _showLoader() { document.getElementById('loader').style.display = 'flex'; }
    function _hideLoader() { document.getElementById('loader').style.display = 'none'; }

    // =============================================
    // FONCTIONS EXPOSÉES GLOBALEMENT
    // =============================================

    window.initSessions = function () {
        loadFormateurs();
        loadSessions();
    };

    window.showAddSessionModal = function () { openSessionModal(null); };
    window.editSession = function (sessionId) { openSessionModal(sessionId); };
    window.deleteSession = function (sessionId) { confirmDeleteSession(sessionId); };
    window.openSession = function (sessionId) { showSessionDetail(sessionId); };
    window.showAddStagiaireToSession = function (sessionId) { openAddStagiaireModal(sessionId); };
    window.deleteStagiaire = function (stagiaireId) { confirmDeleteStagiaire(stagiaireId); };
    window.showQRCode = function (stagiaireId) { displayQRCode(stagiaireId); };
    window.backToSessions = function () { loadSessions(); currentSessionId = null; };

    // =============================================
    // CHARGEMENT DONNÉES
    // =============================================

    async function loadFormateurs() {
        if (!centerData) return;
        try {
            const r = await fetch(`${API_URL}/formateur/list/${centerData.centerId}`);
            const d = await r.json();
            if (d.success) formateurs = d.formateurs;
        } catch (e) { console.error('Erreur chargement formateurs:', e); }
    }

    async function loadSessions() {
        if (!centerData) return;
        _showLoader();
        try {
            const r = await fetch(`${API_URL}/session/list/${centerData.centerId}`);
            const d = await r.json();
            if (d.success) {
                sessions = d.sessions;
                displaySessions(sessions);
            }
        } catch (e) {
            console.error('Erreur chargement sessions:', e);
        } finally {
            _hideLoader();
        }
    }

    // =============================================
    // AFFICHAGE LISTE SESSIONS
    // =============================================

    function displaySessions(sessionsList) {
        const container = document.getElementById('sessions-container');
        if (!container) return;

        if (sessionsList.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
                    <div style="font-size: 56px; margin-bottom: 20px;">📅</div>
                    <h3 style="color: #374151; margin-bottom: 10px;">Aucune session créée</h3>
                    <p>Cliquez sur "Nouvelle session" pour créer votre première session de formation</p>
                </div>
            `;
            return;
        }

        const statusColor = { 'à venir': '#2563eb', 'en cours': '#16a34a', 'terminée': '#6b7280' };
        const niveauLabel = { 'SSIAP1': 'SSIAP 1', 'SSIAP2': 'SSIAP 2', 'SSIAP3': 'SSIAP 3', 'RECYCLAGE': 'Recyclage', 'MAC': 'MAC' };

        let html = '<div style="display: grid; gap: 16px;">';

        sessionsList.forEach(session => {
            const color = statusColor[session.status] || '#6b7280';
            const dateDebut = new Date(session.dateDebut).toLocaleDateString('fr-FR');
            const dateFin = new Date(session.dateFin).toLocaleDateString('fr-FR');
            const formateursNoms = (session.formateurs || []).map(f => `${f.nom} ${f.prenom}`).join(', ') || 'Aucun formateur';

            html += `
                <div style="background: white; border: 1px solid #e5e7eb; border-left: 5px solid ${color}; border-radius: 10px; padding: 20px; cursor: pointer; transition: box-shadow 0.2s;"
                     onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
                     onmouseout="this.style.boxShadow='none'">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                        <div onclick="openSession('${session.sessionId}')" style="flex: 1; min-width: 200px;">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                <span style="background: ${color}20; color: ${color}; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;">${session.status.toUpperCase()}</span>
                                <span style="background: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">${niveauLabel[session.niveau] || session.niveau}</span>
                            </div>
                            <h3 style="margin: 0 0 8px; color: #1f2937; font-size: 18px;">${session.titre}</h3>
                            <div style="color: #6b7280; font-size: 14px; display: grid; gap: 4px;">
                                <span>📅 Du ${dateDebut} au ${dateFin}</span>
                                <span>👨‍🏫 ${formateursNoms}</span>
                                <span>👥 ${session.nbStagiaires || 0} stagiaire(s)</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button onclick="editSession('${session.sessionId}')" 
                                style="padding: 8px 14px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
                                ✏️ Modifier
                            </button>
                            <button onclick="deleteSession('${session.sessionId}')" 
                                style="padding: 8px 14px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // =============================================
    // DÉTAIL SESSION + STAGIAIRES
    // =============================================

    async function showSessionDetail(sessionId) {
        currentSessionId = sessionId;
        _showLoader();
        try {
            const r = await fetch(`${API_URL}/session/detail/${centerData.centerId}/${sessionId}`);
            const d = await r.json();
            if (!d.success) { alert('Erreur : ' + d.error); return; }

            const session = d.session;
            const container = document.getElementById('sessions-container');
            const niveauLabel = { 'SSIAP1': 'SSIAP 1', 'SSIAP2': 'SSIAP 2', 'SSIAP3': 'SSIAP 3', 'RECYCLAGE': 'Recyclage', 'MAC': 'MAC' };
            const dateDebut = new Date(session.dateDebut).toLocaleDateString('fr-FR');
            const dateFin = new Date(session.dateFin).toLocaleDateString('fr-FR');
            const formateursNoms = (session.formateurs || []).map(f => `${f.nom} ${f.prenom}`).join(', ') || 'Aucun';

            let stagiairesHtml = '';
            if (!session.stagiaires || session.stagiaires.length === 0) {
                stagiairesHtml = `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        <div style="font-size: 40px; margin-bottom: 12px;">👥</div>
                        <p>Aucun stagiaire dans cette session</p>
                    </div>
                `;
            } else {
                stagiairesHtml = `
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                                <th style="padding: 12px 16px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">NOM</th>
                                <th style="padding: 12px 16px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600;">CONTACT</th>
                                <th style="padding: 12px 16px; text-align: center; font-size: 13px; color: #6b7280; font-weight: 600;">CODE PIN</th>
                                <th style="padding: 12px 16px; text-align: center; font-size: 13px; color: #6b7280; font-weight: 600;">STATUT</th>
                                <th style="padding: 12px 16px; text-align: right; font-size: 13px; color: #6b7280; font-weight: 600;">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                session.stagiaires.forEach(s => {
                    const statusBadge = s.status === 'actif'
                        ? '<span style="background: #dcfce7; color: #16a34a; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;">Actif</span>'
                        : '<span style="background: #fee2e2; color: #dc2626; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;">Expiré</span>';

                    stagiairesHtml += `
                        <tr style="border-bottom: 1px solid #f3f4f6;">
                            <td style="padding: 14px 16px;"><strong>${s.nom} ${s.prenom}</strong></td>
                            <td style="padding: 14px 16px; color: #6b7280; font-size: 14px;">${s.email || '-'}<br>${s.telephone || ''}</td>
                            <td style="padding: 14px 16px; text-align: center;">
                                <span style="font-family: monospace; background: #ecfdf5; padding: 5px 12px; border-radius: 6px; color: #16a34a; font-weight: bold; font-size: 16px;">${s.pin}</span>
                            </td>
                            <td style="padding: 14px 16px; text-align: center;">${statusBadge}</td>
                            <td style="padding: 14px 16px; text-align: right;">
                                <button onclick="showQRCode('${s.stagiaireId}')" style="padding: 6px 12px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 6px;">📱 QR</button>
                                <button onclick="deleteStagiaire('${s.stagiaireId}')" style="padding: 6px 12px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">🗑️</button>
                            </td>
                        </tr>
                    `;
                });
                stagiairesHtml += '</tbody></table>';
            }

            container.innerHTML = `
                <div>
                    <!-- Bouton retour -->
                    <button onclick="backToSessions()" style="display: flex; align-items: center; gap: 8px; background: none; border: none; color: #2563eb; cursor: pointer; font-size: 15px; font-weight: 600; margin-bottom: 20px; padding: 0;">
                        ← Retour aux sessions
                    </button>

                    <!-- Infos session -->
                    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; margin-bottom: 24px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
                            <div>
                                <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                                    <span style="background: #f3f4f6; color: #374151; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">${niveauLabel[session.niveau] || session.niveau}</span>
                                </div>
                                <h2 style="margin: 0 0 12px; color: #1f2937;">${session.titre}</h2>
                                <div style="color: #6b7280; font-size: 14px; display: grid; gap: 6px;">
                                    <span>📅 Du ${dateDebut} au ${dateFin}</span>
                                    <span>👨‍🏫 Formateurs : ${formateursNoms}</span>
                                    <span>👥 ${session.nbStagiaires || 0} stagiaire(s) inscrit(s)</span>
                                </div>
                            </div>
                            <button onclick="showAddStagiaireToSession('${session.sessionId}')"
                                style="padding: 10px 20px; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600;">
                                ➕ Ajouter un stagiaire
                            </button>
                        </div>
                    </div>

                    <!-- Liste stagiaires -->
                    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                            <h3 style="margin: 0; color: #1f2937;">Stagiaires inscrits</h3>
                        </div>
                        ${stagiairesHtml}
                    </div>
                </div>
            `;

            // Stocker les stagiaires pour showQRCode
            window._currentStagiaires = session.stagiaires || [];

        } catch (e) {
            console.error('Erreur détail session:', e);
        } finally {
            _hideLoader();
        }
    }

    // =============================================
    // MODAL CRÉER / MODIFIER SESSION
    // =============================================

    function openSessionModal(sessionId) {
        const existing = document.getElementById('modal-session');
        if (existing) existing.remove();

        const session = sessionId ? sessions.find(s => s.sessionId === sessionId) : null;
        const isEdit = !!session;

        const today = new Date().toISOString().split('T')[0];
        const oneMonth = new Date();
        oneMonth.setMonth(oneMonth.getMonth() + 1);
        const defaultEnd = oneMonth.toISOString().split('T')[0];

        const formateurCheckboxes = formateurs.map(f => {
            const checked = session && (session.formateurIds || []).includes(f.formateurId) ? 'checked' : '';
            return `
                <label style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; background: white;">
                    <input type="checkbox" value="${f.formateurId}" ${checked} style="width: 16px; height: 16px; accent-color: #dc2626;">
                    <span style="font-weight: 500;">${f.nom} ${f.prenom}</span>
                </label>
            `;
        }).join('');

        const niveaux = ['SSIAP1', 'SSIAP2', 'SSIAP3', 'RECYCLAGE', 'MAC'];
        const niveauOptions = niveaux.map(n => {
            const sel = session && session.niveau === n ? 'selected' : '';
            const label = { SSIAP1: 'SSIAP 1', SSIAP2: 'SSIAP 2', SSIAP3: 'SSIAP 3', RECYCLAGE: 'Recyclage', MAC: 'MAC' }[n];
            return `<option value="${n}" ${sel}>${label}</option>`;
        }).join('');

        const modal = document.createElement('div');
        modal.id = 'modal-session';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; overflow-y: auto; padding: 20px;';

        const dateDebutVal = session ? new Date(session.dateDebut).toISOString().split('T')[0] : today;
        const dateFinVal = session ? new Date(session.dateFin).toISOString().split('T')[0] : defaultEnd;

        modal.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 30px; width: 560px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <h3 style="margin: 0 0 24px; color: #1f2937; font-size: 20px;">
                    ${isEdit ? '✏️ Modifier la session' : '📅 Nouvelle session de formation'}
                </h3>

                <div style="display: grid; gap: 18px;">
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Titre de la session *</label>
                        <input id="modal-session-titre" type="text" value="${session ? session.titre : ''}" 
                            placeholder="Ex: SSIAP 1 - Mars 2026"
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Niveau *</label>
                        <select id="modal-session-niveau" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px;">
                            ${niveauOptions}
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Date de début *</label>
                            <input id="modal-session-debut" type="date" value="${dateDebutVal}"
                                style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Date de fin *</label>
                            <input id="modal-session-fin" type="date" value="${dateFinVal}"
                                style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                        </div>
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 10px; color: #374151;">Formateurs assignés</label>
                        ${formateurs.length === 0
                            ? '<p style="color: #6b7280; font-size: 14px;">Aucun formateur disponible - créez des formateurs d\'abord</p>'
                            : `<div style="display: grid; gap: 8px;">${formateurCheckboxes}</div>`
                        }
                    </div>
                </div>

                <div id="modal-session-error" style="display: none; background: #fef2f2; color: #dc2626; padding: 10px; border-radius: 8px; margin-top: 15px; font-size: 14px;"></div>

                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 28px;">
                    <button id="modal-session-cancel" style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600;">
                        Annuler
                    </button>
                    <button id="modal-session-submit" style="padding: 10px 24px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600;">
                        ${isEdit ? '✅ Enregistrer' : '✅ Créer la session'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('modal-session-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('modal-session-submit').addEventListener('click', async () => {
            const titre = document.getElementById('modal-session-titre').value.trim();
            const niveau = document.getElementById('modal-session-niveau').value;
            const dateDebut = document.getElementById('modal-session-debut').value;
            const dateFin = document.getElementById('modal-session-fin').value;
            const formateurIds = [...document.querySelectorAll('#modal-session .formateur-cb:checked, #modal-session input[type="checkbox"]:checked')]
                .map(cb => cb.value);

            const errorDiv = document.getElementById('modal-session-error');

            if (!titre) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = '⚠️ Le titre est obligatoire.';
                return;
            }
            if (!dateDebut || !dateFin || dateFin <= dateDebut) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = '⚠️ Les dates sont invalides (la fin doit être après le début).';
                return;
            }

            errorDiv.style.display = 'none';
            modal.remove();

            if (isEdit) {
                await updateSession(sessionId, { titre, niveau, dateDebut, dateFin, formateurIds });
            } else {
                await createSession({ titre, niveau, dateDebut, dateFin, formateurIds });
            }
        });
    }

    async function createSession(data) {
        _showLoader();
        try {
            const r = await fetch(`${API_URL}/session/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ centerId: centerData.centerId, ...data })
            });
            const result = await r.json();
            if (result.success) {
                await loadSessions();
            } else {
                alert('Erreur : ' + result.error);
            }
        } catch (e) {
            alert('Erreur lors de la création de la session');
        } finally {
            _hideLoader();
        }
    }

    async function updateSession(sessionId, data) {
        _showLoader();
        try {
            const r = await fetch(`${API_URL}/session/update/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ centerId: centerData.centerId, ...data })
            });
            const result = await r.json();
            if (result.success) {
                await loadSessions();
            } else {
                alert('Erreur : ' + result.error);
            }
        } catch (e) {
            alert('Erreur lors de la mise à jour');
        } finally {
            _hideLoader();
        }
    }

    async function confirmDeleteSession(sessionId) {
        const session = sessions.find(s => s.sessionId === sessionId);
        if (!session) return;

        if (!confirm(`Supprimer la session "${session.titre}" ?\n\nLes stagiaires seront désassociés mais pas supprimés.\nCette action est irréversible.`)) return;

        _showLoader();
        try {
            const r = await fetch(`${API_URL}/session/delete/${sessionId}?centerId=${centerData.centerId}`, {
                method: 'DELETE'
            });
            const result = await r.json();
            if (result.success) {
                await loadSessions();
            } else {
                alert('Erreur : ' + result.error);
            }
        } catch (e) {
            alert('Erreur lors de la suppression');
        } finally {
            _hideLoader();
        }
    }

    // =============================================
    // MODAL AJOUTER STAGIAIRE À UNE SESSION
    // =============================================

    function openAddStagiaireModal(sessionId) {
        const existing = document.getElementById('modal-add-stagiaire');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'modal-add-stagiaire';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;';

        modal.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 30px; width: 500px; max-width: 95vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <h3 style="margin: 0 0 20px; color: #1f2937; font-size: 20px;">➕ Ajouter un stagiaire</h3>

                <div style="display: grid; gap: 15px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Nom *</label>
                            <input id="stg-nom" type="text" placeholder="DUPONT"
                                style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Prénom *</label>
                            <input id="stg-prenom" type="text" placeholder="Jean"
                                style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                        </div>
                    </div>
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Email</label>
                        <input id="stg-email" type="email" placeholder="jean.dupont@email.com"
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                    </div>
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 6px; color: #374151;">Téléphone</label>
                        <input id="stg-tel" type="tel" placeholder="0612345678"
                            style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px; box-sizing: border-box;">
                    </div>
                </div>

                <div id="stg-error" style="display: none; background: #fef2f2; color: #dc2626; padding: 10px; border-radius: 8px; margin-top: 15px; font-size: 14px;"></div>

                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 25px;">
                    <button id="stg-cancel" style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600;">
                        Annuler
                    </button>
                    <button id="stg-submit" style="padding: 10px 24px; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600;">
                        ✅ Créer le stagiaire
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('stg-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('stg-submit').addEventListener('click', async () => {
            const nom = document.getElementById('stg-nom').value.trim().toUpperCase();
            const prenom = document.getElementById('stg-prenom').value.trim();
            const email = document.getElementById('stg-email').value.trim();
            const telephone = document.getElementById('stg-tel').value.trim();
            const errorDiv = document.getElementById('stg-error');

            if (!nom || !prenom) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = '⚠️ Le nom et le prénom sont obligatoires.';
                return;
            }

            modal.remove();
            await createStagiaire(sessionId, { nom, prenom, email, telephone });
        });
    }

    async function createStagiaire(sessionId, data) {
        _showLoader();
        try {
            const r = await fetch(`${API_URL}/stagiaire/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ centerId: centerData.centerId, sessionId, ...data })
            });
            const result = await r.json();
            if (result.success) {
                const s = result.stagiaire;
                alert(`✅ Stagiaire créé !\n\n${s.nom} ${s.prenom}\nPIN : ${s.pin}\n\nLe stagiaire peut se connecter avec ce code PIN.`);
                await showSessionDetail(sessionId);
            } else {
                alert('Erreur : ' + result.error);
            }
        } catch (e) {
            alert('Erreur lors de la création');
        } finally {
            _hideLoader();
        }
    }

    async function confirmDeleteStagiaire(stagiaireId) {
        const stagiaire = (window._currentStagiaires || []).find(s => s.stagiaireId === stagiaireId);
        const nom = stagiaire ? `${stagiaire.nom} ${stagiaire.prenom}` : 'ce stagiaire';

        if (!confirm(`Supprimer ${nom} ?\n\nCette action est irréversible.`)) return;

        _showLoader();
        try {
            const r = await fetch(`${API_URL}/stagiaire/delete/${stagiaireId}?centerId=${centerData.centerId}`, {
                method: 'DELETE'
            });
            const result = await r.json();
            if (result.success) {
                await showSessionDetail(currentSessionId);
            } else {
                alert('Erreur : ' + result.error);
            }
        } catch (e) {
            alert('Erreur lors de la suppression');
        } finally {
            _hideLoader();
        }
    }

    // =============================================
    // QR CODE
    // =============================================

    function displayQRCode(stagiaireId) {
        const stagiaire = (window._currentStagiaires || []).find(s => s.stagiaireId === stagiaireId);
        if (!stagiaire) return;

        const qrWindow = window.open('', 'QR Code', 'width=420,height=550');
        qrWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>QR Code - ${stagiaire.nom} ${stagiaire.prenom}</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
                <style>
                    body { font-family: Arial; text-align: center; padding: 20px; background: #f9fafb; }
                    .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    h2 { color: #16a34a; margin-bottom: 4px; }
                    .pin { font-size: 36px; font-weight: bold; color: #16a34a; font-family: monospace; margin: 10px 0; }
                    .info { color: #6b7280; font-size: 14px; margin: 8px 0; }
                    #qrcode { margin: 16px auto; display: inline-block; }
                    button { padding: 12px 24px; background: #16a34a; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 16px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>QR Code Stagiaire</h2>
                    <div class="pin">${stagiaire.pin}</div>
                    <strong>${stagiaire.nom} ${stagiaire.prenom}</strong>
                    <div class="info">Valide jusqu'au ${new Date(stagiaire.dateFin).toLocaleDateString('fr-FR')}</div>
                    <div id="qrcode"></div>
                    <button onclick="window.print()">🖨️ Imprimer</button>
                </div>
            </body>
            </html>
        `);
        qrWindow.document.close();
        qrWindow.onload = () => {
            new qrWindow.QRCode(qrWindow.document.getElementById('qrcode'), {
                text: stagiaire.qrCodeData,
                width: 220,
                height: 220
            });
        };
    }

    console.log('✅ center-sessions.js chargé');

})();