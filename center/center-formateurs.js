// center-formateurs.js
// Gestion des formateurs avec formulaire modal

let formateurs = [];
let editingFormateurId = null;

// ── Init ──
function initFormateurs() {
    injectFormateurModal();
    loadFormateurs();
}

// ── Inject modal HTML ──
function injectFormateurModal() {
    if (document.getElementById('modal-formateur')) return;

    const modal = document.createElement('div');
    modal.id = 'modal-formateur';
    modal.style.cssText = `
        display:none;position:fixed;inset:0;background:rgba(30,26,23,.55);
        backdrop-filter:blur(4px);z-index:200;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#fff;border-radius:20px;width:480px;max-width:95vw;
                    box-shadow:0 20px 60px rgba(0,0,0,.15);animation:slideUp .25s ease;">
            <div style="padding:28px 32px 0;display:flex;align-items:flex-start;justify-content:space-between;">
                <div>
                    <div id="modal-form-title" style="font-family:'Lora',serif;font-size:22px;font-weight:700;color:#1e1a17;margin-bottom:4px;">
                        👨‍🏫 Ajouter un formateur
                    </div>
                    <div style="font-size:12px;color:#8c8078;">Renseignez les informations du formateur</div>
                </div>
                <button onclick="closeFormateurModal()" style="background:#f0ece7;border:none;cursor:pointer;
                    width:32px;height:32px;border-radius:50%;font-size:16px;color:#8c8078;
                    display:flex;align-items:center;justify-content:center;transition:.15s;"
                    onmouseover="this.style.background='#e8e2db'" onmouseout="this.style.background='#f0ece7'">✕</button>
            </div>

            <div style="padding:24px 32px 32px;">
                <div id="form-alert" style="display:none;padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:16px;"></div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
                    <div>
                        <label style="display:block;font-size:11px;font-weight:700;color:#1e1a17;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
                            Nom <span style="color:#c25a3a">*</span>
                        </label>
                        <input id="f-nom" type="text" placeholder="Dupont"
                            style="width:100%;padding:11px 14px;border:1.5px solid #e8e2db;border-radius:9px;
                                   font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:.15s;"
                            onfocus="this.style.borderColor='#c25a3a';this.style.boxShadow='0 0 0 3px #fdf0eb'"
                            onblur="this.style.borderColor='#e8e2db';this.style.boxShadow='none'">
                    </div>
                    <div>
                        <label style="display:block;font-size:11px;font-weight:700;color:#1e1a17;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
                            Prénom <span style="color:#c25a3a">*</span>
                        </label>
                        <input id="f-prenom" type="text" placeholder="Alexandre"
                            style="width:100%;padding:11px 14px;border:1.5px solid #e8e2db;border-radius:9px;
                                   font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:.15s;"
                            onfocus="this.style.borderColor='#c25a3a';this.style.boxShadow='0 0 0 3px #fdf0eb'"
                            onblur="this.style.borderColor='#e8e2db';this.style.boxShadow='none'">
                    </div>
                </div>

                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:#1e1a17;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
                        Email <span style="color:#c25a3a">*</span>
                    </label>
                    <input id="f-email" type="email" placeholder="formateur@centre.fr"
                        style="width:100%;padding:11px 14px;border:1.5px solid #e8e2db;border-radius:9px;
                               font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:.15s;"
                        onfocus="this.style.borderColor='#c25a3a';this.style.boxShadow='0 0 0 3px #fdf0eb'"
                        onblur="this.style.borderColor='#e8e2db';this.style.boxShadow='none'">
                </div>

                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:#1e1a17;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
                        Téléphone <span style="font-weight:400;text-transform:none;color:#8c8078">(optionnel)</span>
                    </label>
                    <input id="f-tel" type="tel" placeholder="06 12 34 56 78"
                        style="width:100%;padding:11px 14px;border:1.5px solid #e8e2db;border-radius:9px;
                               font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:.15s;"
                        onfocus="this.style.borderColor='#c25a3a';this.style.boxShadow='0 0 0 3px #fdf0eb'"
                        onblur="this.style.borderColor='#e8e2db';this.style.boxShadow='none'">
                </div>

                <div id="password-section" style="margin-bottom:20px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:#1e1a17;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
                        Mot de passe <span id="pwd-required" style="color:#c25a3a">*</span>
                        <span id="pwd-optional" style="display:none;font-weight:400;text-transform:none;color:#8c8078">(laisser vide pour ne pas changer)</span>
                    </label>
                    <input id="f-password" type="password" placeholder="Minimum 8 caractères"
                        style="width:100%;padding:11px 14px;border:1.5px solid #e8e2db;border-radius:9px;
                               font-size:14px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;transition:.15s;"
                        onfocus="this.style.borderColor='#c25a3a';this.style.boxShadow='0 0 0 3px #fdf0eb'"
                        onblur="this.style.borderColor='#e8e2db';this.style.boxShadow='none'">
                    <div style="font-size:11px;color:#8c8078;margin-top:5px;">
                        Le formateur recevra aussi un code PIN généré automatiquement pour la connexion rapide
                    </div>
                </div>

                <div style="display:flex;gap:10px;">
                    <button onclick="closeFormateurModal()"
                        style="flex:1;padding:12px;border-radius:9px;border:1.5px solid #e8e2db;
                               background:#f0ece7;color:#4a4340;font-family:'Plus Jakarta Sans',sans-serif;
                               font-size:13px;font-weight:700;cursor:pointer;transition:.15s;"
                        onmouseover="this.style.background='#e8e2db'" onmouseout="this.style.background='#f0ece7'">
                        Annuler
                    </button>
                    <button id="btn-save-formateur" onclick="saveFormateur()"
                        style="flex:2;padding:12px;border-radius:9px;border:none;
                               background:#c25a3a;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;
                               font-size:13px;font-weight:700;cursor:pointer;transition:.15s;
                               box-shadow:0 2px 8px rgba(194,90,58,.3);"
                        onmouseover="this.style.background='#a34a2e'" onmouseout="this.style.background='#c25a3a'">
                        👨‍🏫 Enregistrer le formateur
                    </button>
                </div>
            </div>
        </div>

        <!-- Toast succès PIN -->
        <div id="pin-toast" style="display:none;position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
            background:#1e1a17;color:#fff;padding:16px 24px;border-radius:14px;font-size:13px;
            box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:300;min-width:300px;text-align:center;">
        </div>
    `;
    document.body.appendChild(modal);
}

// ── Ouvrir modal ──
function showAddFormateurModal() {
    if (formateurs.length >= (centerData?.license?.maxFormateurs || 1)) {
        showFormAlert('error', `⚠️ Limite atteinte : ${centerData.license.maxFormateurs} formateur(s) maximum sur votre licence.`);
        return;
    }
    editingFormateurId = null;
    document.getElementById('modal-form-title').textContent = '👨‍🏫 Ajouter un formateur';
    document.getElementById('btn-save-formateur').textContent = '👨‍🏫 Enregistrer le formateur';
    document.getElementById('pwd-required').style.display = 'inline';
    document.getElementById('pwd-optional').style.display = 'none';
    clearFormateurForm();
    openFormateurModal();
}

function openFormateurModal() {
    const modal = document.getElementById('modal-formateur');
    modal.style.display = 'flex';
}

function closeFormateurModal() {
    document.getElementById('modal-formateur').style.display = 'none';
    clearFormateurForm();
}

function clearFormateurForm() {
    ['f-nom','f-prenom','f-email','f-tel','f-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const alert = document.getElementById('form-alert');
    if (alert) alert.style.display = 'none';
}

// ── Sauvegarder ──
async function saveFormateur() {
    const nom      = document.getElementById('f-nom').value.trim();
    const prenom   = document.getElementById('f-prenom').value.trim();
    const email    = document.getElementById('f-email').value.trim();
    const tel      = document.getElementById('f-tel').value.trim();
    const password = document.getElementById('f-password').value;

    // Validation
    if (!nom || !prenom) { showFormAlert('error', '⚠️ Nom et prénom requis'); return; }
    if (!email || !email.includes('@')) { showFormAlert('error', '⚠️ Email invalide'); return; }
    if (!editingFormateurId && password.length < 8) {
        showFormAlert('error', '⚠️ Mot de passe minimum 8 caractères'); return;
    }
    if (editingFormateurId && password && password.length < 8) {
        showFormAlert('error', '⚠️ Mot de passe minimum 8 caractères'); return;
    }

    const btn = document.getElementById('btn-save-formateur');
    btn.disabled = true;
    btn.textContent = '⏳ Enregistrement…';

    try {
        let response, result;

        if (editingFormateurId) {
            // Modification
            const updates = { centerId: centerData.centerId, nom, prenom, email };
            if (tel) updates.telephone = tel;
            if (password) updates.password = password;

            response = await fetch(`${API_URL}/formateur/update/${editingFormateurId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            result = await response.json();

            if (result.success) {
                closeFormateurModal();
                showPinToast(`✅ Formateur modifié avec succès !`);
                loadFormateurs();
            } else {
                showFormAlert('error', '❌ ' + (result.error || 'Erreur lors de la modification'));
            }
        } else {
            // Création
            response = await fetch(`${API_URL}/formateur/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    centerId: centerData.centerId,
                    nom, prenom, email, password,
                    telephone: tel
                })
            });
            result = await response.json();

            if (result.success || result.formateur) {
                const pin = result.formateur?.pin || result.pin || '—';
                closeFormateurModal();
                showPinToast(`✅ Formateur créé ! Code PIN : ${pin} — Conservez-le précieusement.`, 6000);
                loadFormateurs();
            } else {
                showFormAlert('error', '❌ ' + (result.error || result.message || 'Erreur lors de la création'));
            }
        }
    } catch (error) {
        console.error('Erreur formateur:', error);
        showFormAlert('error', '⚠️ Serveur inaccessible');
    } finally {
        btn.disabled = false;
        btn.textContent = editingFormateurId ? '💾 Enregistrer les modifications' : '👨‍🏫 Enregistrer le formateur';
    }
}

// ── Charger liste ──
async function loadFormateurs() {
    if (!centerData) return;
    showLoader();
    try {
        const response = await fetch(`${API_URL}/formateur/list/${centerData.centerId}`);
        const data = await response.json();
        if (data.success) {
            formateurs = data.formateurs || [];
            displayFormateurs(formateurs);
        }
    } catch (error) {
        console.error('Erreur chargement formateurs:', error);
    } finally {
        hideLoader();
    }
}

// ── Afficher liste ──
function displayFormateurs(list) {
    const container = document.getElementById('formateurs-list');
    if (!list.length) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#8c8078;">
                <div style="font-size:52px;margin-bottom:16px;">👨‍🏫</div>
                <div style="font-size:15px;font-weight:700;color:#4a4340;margin-bottom:6px;">Aucun formateur</div>
                <div style="font-size:13px;">Cliquez sur "Ajouter un formateur" pour commencer</div>
            </div>`;
        return;
    }

    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f7f4f0;">
                    <th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8c8078;padding:10px 14px;border-bottom:1.5px solid #e8e2db;">Formateur</th>
                    <th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8c8078;padding:10px 14px;border-bottom:1.5px solid #e8e2db;">Email</th>
                    <th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8c8078;padding:10px 14px;border-bottom:1.5px solid #e8e2db;">Code PIN</th>
                    <th style="text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8c8078;padding:10px 14px;border-bottom:1.5px solid #e8e2db;">Statut</th>
                    <th style="text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8c8078;padding:10px 14px;border-bottom:1.5px solid #e8e2db;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${list.map(f => `
                <tr style="border-bottom:1px solid #f0ece7;transition:.12s;" onmouseover="this.style.background='#fdf9f7'" onmouseout="this.style.background=''">
                    <td style="padding:14px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:36px;height:36px;border-radius:50%;background:#fdf0eb;display:flex;align-items:center;justify-content:center;font-weight:700;color:#c25a3a;font-size:13px;flex-shrink:0;">
                                ${(f.prenom?.[0]||'?').toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight:700;font-size:13px;color:#1e1a17;">${f.nom} ${f.prenom}</div>
                                ${f.telephone ? `<div style="font-size:11px;color:#8c8078;">${f.telephone}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td style="padding:14px;font-size:13px;color:#4a4340;">${f.email}</td>
                    <td style="padding:14px;">
                        <span style="font-family:'DM Mono',monospace;background:#eff6ff;padding:5px 10px;border-radius:6px;color:#2563eb;font-weight:700;font-size:13px;letter-spacing:1px;">
                            ${f.pin || '——'}
                        </span>
                    </td>
                    <td style="padding:14px;">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#edf7f2;color:#2e7d52;">
                            ● Actif
                        </span>
                    </td>
                    <td style="padding:14px;text-align:right;">
                        <button onclick="editFormateur('${f.formateurId}')"
                            style="padding:6px 12px;border-radius:7px;border:1.5px solid #e8e2db;background:#fff;
                                   color:#4a4340;font-size:12px;font-weight:600;cursor:pointer;margin-right:6px;transition:.15s;"
                            onmouseover="this.style.borderColor='#c25a3a';this.style.color='#c25a3a'"
                            onmouseout="this.style.borderColor='#e8e2db';this.style.color='#4a4340'">
                            ✏️ Modifier
                        </button>
                        <button onclick="deleteFormateur('${f.formateurId}')"
                            style="padding:6px 12px;border-radius:7px;border:1.5px solid #fdecea;background:#fdecea;
                                   color:#c0392b;font-size:12px;font-weight:600;cursor:pointer;transition:.15s;"
                            onmouseover="this.style.background='#f5c6c1'" onmouseout="this.style.background='#fdecea'">
                            🗑️
                        </button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

// ── Modifier ──
function editFormateur(formateurId) {
    const f = formateurs.find(x => x.formateurId === formateurId);
    if (!f) return;
    editingFormateurId = formateurId;
    document.getElementById('modal-form-title').textContent = '✏️ Modifier le formateur';
    document.getElementById('btn-save-formateur').textContent = '💾 Enregistrer les modifications';
    document.getElementById('pwd-required').style.display = 'none';
    document.getElementById('pwd-optional').style.display = 'inline';
    document.getElementById('f-nom').value = f.nom || '';
    document.getElementById('f-prenom').value = f.prenom || '';
    document.getElementById('f-email').value = f.email || '';
    document.getElementById('f-tel').value = f.telephone || '';
    document.getElementById('f-password').value = '';
    openFormateurModal();
}

// ── Supprimer ──
async function deleteFormateur(formateurId) {
    const f = formateurs.find(x => x.formateurId === formateurId);
    if (!f) return;
    if (!confirm(`Supprimer ${f.nom} ${f.prenom} ?\n\nCette action est irréversible.`)) return;

    showLoader();
    try {
        const r = await fetch(`${API_URL}/formateur/delete/${formateurId}?centerId=${centerData.centerId}`, {
            method: 'DELETE'
        });
        const result = await r.json();
        if (result.success) {
            showPinToast('🗑️ Formateur supprimé');
            loadFormateurs();
        } else {
            alert('Erreur : ' + (result.error || 'Suppression impossible'));
        }
    } catch (e) {
        alert('Erreur serveur');
    } finally {
        hideLoader();
    }
}

// ── Helpers ──
function showFormAlert(type, msg) {
    const el = document.getElementById('form-alert');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = type === 'error' ? '#fdecea' : '#e8f5ee';
    el.style.color = type === 'error' ? '#c0392b' : '#2e7d52';
    el.style.border = type === 'error' ? '1px solid rgba(192,57,43,.2)' : '1px solid rgba(46,125,82,.2)';
}

function showPinToast(msg, duration = 4000) {
    const t = document.getElementById('pin-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, duration);
}

function showLoader() {
    const l = document.getElementById('loader');
    if (l) l.style.display = 'flex';
}

function hideLoader() {
    const l = document.getElementById('loader');
    if (l) l.style.display = 'none';
}