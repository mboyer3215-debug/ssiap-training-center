// center-formateurs.js
// Script pour gérer les formateurs depuis le dashboard centre

// IMPORTANT : API_URL et centerData sont déjà déclarés dans center-dashboard.html
// Ne pas les redéclarer ici pour éviter les erreurs "already declared"

let formateurs = [];

// Charger données centre
function initFormateurs() {
    // centerData est déjà chargé dans center-dashboard.html
    // Pas besoin de le recharger ici
    
    loadFormateurs();
}

// Charger liste formateurs
async function loadFormateurs() {
    if (!centerData) return;
    
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/formateur/list/${centerData.centerId}`);
        const data = await response.json();
        
        if (data.success) {
            formateurs = data.formateurs;
            displayFormateurs(formateurs);
        }
    } catch (error) {
        console.error('Erreur chargement formateurs:', error);
        alert('Erreur lors du chargement des formateurs');
    } finally {
        hideLoader();
    }
}

// Afficher liste formateurs
function displayFormateurs(formateursList) {
    const container = document.getElementById('formateurs-list');
    
    if (formateursList.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #6b7280;">
                <div style="font-size: 48px; margin-bottom: 20px;">👨‍🏫</div>
                <h3 style="color: #374151; margin-bottom: 10px;">Aucun formateur</h3>
                <p>Cliquez sur "Ajouter un formateur" pour commencer</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Nom</th>
                    <th>Email</th>
                    <th>Code PIN</th>
                    <th>Stagiaires</th>
                    <th>Statut</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    formateursList.forEach(formateur => {
        html += `
            <tr>
                <td><strong>${formateur.nom} ${formateur.prenom}</strong></td>
                <td>${formateur.email}</td>
                <td><span style="font-family: monospace; background: #eff6ff; padding: 4px 8px; border-radius: 4px; color: #2563eb; font-weight: bold;">${formateur.pin}</span></td>
                <td>${formateur.nbStagiaires || 0}</td>
                <td><span class="badge badge-success">Actif</span></td>
                <td>
                    <button class="btn-details" onclick="editFormateur('${formateur.formateurId}')" style="background: #f59e0b; margin-right: 5px;">
                        ✏️ Modifier
                    </button>
                    <button class="btn-details" onclick="deleteFormateur('${formateur.formateurId}')" style="background: #dc2626;">
                        🗑️ Supprimer
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Afficher modal ajout formateur
function showAddFormateurModal() {
    // Vérifier limite
    if (formateurs.length >= centerData.license.maxFormateurs) {
        alert(`Limite atteinte : ${centerData.license.maxFormateurs} formateurs maximum.\nAméliorez votre licence pour ajouter plus de formateurs.`);
        return;
    }
    
    const nom = prompt('Nom du formateur :');
    if (!nom) return;
    
    const prenom = prompt('Prénom du formateur :');
    if (!prenom) return;
    
    const email = prompt('Email du formateur :');
    if (!email) return;
    
    const password = prompt('Mot de passe (min. 8 caractères) :');
    if (!password || password.length < 8) {
        alert('Le mot de passe doit contenir au moins 8 caractères');
        return;
    }
    
    createFormateur({ nom, prenom, email, password });
}

// Créer formateur
async function createFormateur(data) {
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/formateur/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                centerId: centerData.centerId,
                ...data
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`✅ Formateur créé avec succès !\n\nCode PIN : ${result.formateur.pin}\n\nLe formateur peut se connecter avec :\n- Email : ${result.formateur.email}\n- PIN : ${result.formateur.pin}`);
            loadFormateurs();
        } else {
            alert(`Erreur : ${result.error}`);
        }
    } catch (error) {
        console.error('Erreur création formateur:', error);
        alert('Erreur lors de la création du formateur');
    } finally {
        hideLoader();
    }
}

// Modifier formateur
async function editFormateur(formateurId) {
    const formateur = formateurs.find(f => f.formateurId === formateurId);
    if (!formateur) return;
    
    const nom = prompt('Nouveau nom (laisser vide pour ne pas changer) :', formateur.nom);
    const prenom = prompt('Nouveau prénom (laisser vide pour ne pas changer) :', formateur.prenom);
    const email = prompt('Nouvel email (laisser vide pour ne pas changer) :', formateur.email);
    const password = prompt('Nouveau mot de passe (laisser vide pour ne pas changer) :');
    
    const updates = {};
    if (nom && nom !== formateur.nom) updates.nom = nom;
    if (prenom && prenom !== formateur.prenom) updates.prenom = prenom;
    if (email && email !== formateur.email) updates.email = email;
    if (password) {
        if (password.length < 8) {
            alert('Le mot de passe doit contenir au moins 8 caractères');
            return;
        }
        updates.password = password;
    }
    
    if (Object.keys(updates).length === 0) {
        return;
    }
    
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/formateur/update/${formateurId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                centerId: centerData.centerId,
                ...updates
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Formateur modifié avec succès !');
            loadFormateurs();
        } else {
            alert(`Erreur : ${result.error}`);
        }
    } catch (error) {
        console.error('Erreur modification formateur:', error);
        alert('Erreur lors de la modification');
    } finally {
        hideLoader();
    }
}

// Supprimer formateur
async function deleteFormateur(formateurId) {
    const formateur = formateurs.find(f => f.formateurId === formateurId);
    if (!formateur) return;
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${formateur.nom} ${formateur.prenom} ?\n\nCette action est irréversible.`)) {
        return;
    }
    
    showLoader();
    
    try {
        const response = await fetch(`${API_URL}/formateur/delete/${formateurId}?centerId=${centerData.centerId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Formateur supprimé');
            loadFormateurs();
        } else {
            alert(`Erreur : ${result.error}`);
        }
    } catch (error) {
        console.error('Erreur suppression formateur:', error);
        alert('Erreur lors de la suppression');
    } finally {
        hideLoader();
    }
}

function showLoader() {
    document.getElementById('loader').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
}

// Initialiser au chargement
if (document.getElementById('page-formateurs')) {
    initFormateurs();
}