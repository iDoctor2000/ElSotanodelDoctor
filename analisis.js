/* 
   analisis.js
   Gestión de la sección Análisis / Debriefing
   Requiere: Funciones globales de index.html (saveDoc, loadDoc, sanitizeFirebaseKey, openJukeboxPlayer)
*/

let analysisEntries = [];
let editingAnalysisIndex = null;

// Referencias a elementos del DOM (se inicializan al cargar)
const analysisTableBody = document.getElementById('analisis-body');
const analysisConfigModal = document.getElementById('analisis-config-modal');
const analysisNotesModal = document.getElementById('analisis-notes-modal');

// --- CARGA Y GUARDADO DE DATOS ---

async function loadAnalysisData() {
    try {
        const data = await window.withRetry(() => window.loadDoc("intranet", "analysis", { entries: [] }));
        analysisEntries = Array.isArray(data.entries) ? data.entries : [];
        renderAnalysisTable();
        console.log("Datos de Análisis cargados:", analysisEntries.length);
    } catch (e) {
        console.error("Error al cargar Análisis:", e);
    }
}

async function saveAnalysisData() {
    try {
        await window.withRetry(() => window.saveDoc("intranet", "analysis", { entries: analysisEntries }));
        renderAnalysisTable();
        return true;
    } catch (e) {
        console.error("Error al guardar Análisis:", e);
        throw e;
    }
}

// --- RENDERIZADO ---

function renderAnalysisTable() {
    if (!analysisTableBody) return;
    analysisTableBody.innerHTML = "";

    if (analysisEntries.length === 0) {
        analysisTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No hay análisis registrados. Pulsa "+" para añadir.</td></tr>';
        return;
    }

    // Ordenar por fecha de creación descendente (los nuevos primero) si tienen fecha, si no al final
    // Aquí asumimos orden de array tal cual se guardan, o podríamos ordenar.
    
    analysisEntries.forEach((entry, index) => {
        const title = entry.title || "Sin Título";
        const hasUrl = !!entry.audioUrl;
        const hasNotes = !!(entry.notes && entry.notes.trim().length > 0);
        
        // Icono Altavoz (Jukebox)
        const jukeboxClass = hasUrl ? 'active' : 'inactive';
        // Escapamos comillas simples para el onclick
        const safeTitle = title.replace(/'/g, "\\'");
        const safeUrl = (entry.audioUrl || "").replace(/'/g, "\\'");
        
        const playAction = hasUrl 
            ? `window.openJukeboxPlayer('${safeTitle}', '${safeUrl}')` 
            : `alert('No hay audio configurado para este análisis.')`;

        const speakerBtn = `
            <button class="jukebox-btn ${jukeboxClass}" onclick="${playAction}" title="Reproducir Audio">
                <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/></svg>
            </button>
        `;

        // Icono Notas (Bloc de notas)
        const notesColor = hasNotes ? '#0cf' : '#555';
        const notesBtn = `
            <button class="header-icon-btn" style="border:none; color:${notesColor}; margin:0 auto;" onclick="openAnalysisNotes(${index})" title="Ver/Editar Notas">
                <svg viewBox="0 0 24 24" fill="currentColor">
                   <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
            </button>
        `;

        // Icono Configuración (Rueda dentada)
        const configBtn = `
            <button class="header-icon-btn" style="border:none; color:#aaa; margin:0 auto;" onclick="openAnalysisConfig(${index})" title="Configurar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
            </button>
        `;

        const row = `
            <tr>
                <td style="font-weight:bold;">${title}</td>
                <td style="text-align:center;">${speakerBtn}</td>
                <td style="text-align:center;">${notesBtn}</td>
                <td style="text-align:center;">${configBtn}</td>
            </tr>
        `;
        analysisTableBody.insertAdjacentHTML('beforeend', row);
    });
}

// --- GESTIÓN DE MODALES Y ACCIONES ---

// 1. Añadir nuevo
document.getElementById('add-analysis-btn').onclick = () => {
    // Creamos una entrada vacía y abrimos su configuración
    const newEntry = {
        title: "Nuevo Análisis " + new Date().toLocaleDateString(),
        audioUrl: "",
        notes: "",
        createdAt: new Date().toISOString()
    };
    analysisEntries.unshift(newEntry); // Añadir al principio
    editingAnalysisIndex = 0;
    saveAnalysisData().then(() => {
        openAnalysisConfig(0);
    });
};

// 2. Configuración (Título y URL)
window.openAnalysisConfig = function(index) {
    editingAnalysisIndex = index;
    const entry = analysisEntries[index];
    if (!entry) return;

    document.getElementById('analisis-config-title').value = entry.title || "";
    document.getElementById('analisis-config-url').value = entry.audioUrl || "";
    
    // Configurar botón eliminar
    const deleteBtn = document.getElementById('analisis-delete-btn');
    deleteBtn.onclick = () => {
        if (confirm("¿Seguro que quieres eliminar este análisis completo?")) {
            analysisEntries.splice(index, 1);
            saveAnalysisData().then(() => {
                analysisConfigModal.classList.remove('show');
            });
        }
    };

    analysisConfigModal.classList.add('show');
};

document.getElementById('analisis-config-save').onclick = async () => {
    if (editingAnalysisIndex === null) return;
    
    const title = document.getElementById('analisis-config-title').value.trim();
    const url = document.getElementById('analisis-config-url').value.trim();
    
    if (!title) {
        alert("El título es obligatorio");
        return;
    }

    analysisEntries[editingAnalysisIndex].title = title;
    analysisEntries[editingAnalysisIndex].audioUrl = url;

    try {
        await saveAnalysisData();
        analysisConfigModal.classList.remove('show');
    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
};

document.getElementById('analisis-config-close').onclick = () => {
    analysisConfigModal.classList.remove('show');
};


// 3. Notas
window.openAnalysisNotes = function(index) {
    editingAnalysisIndex = index;
    const entry = analysisEntries[index];
    if (!entry) return;

    document.getElementById('analisis-notes-display-title').textContent = entry.title;
    document.getElementById('analisis-notes-textarea').value = entry.notes || "";
    
    analysisNotesModal.classList.add('show');
};

document.getElementById('analisis-notes-save').onclick = async () => {
    if (editingAnalysisIndex === null) return;
    
    const notes = document.getElementById('analisis-notes-textarea').value;
    analysisEntries[editingAnalysisIndex].notes = notes;

    try {
        await saveAnalysisData();
        analysisNotesModal.classList.remove('show');
    } catch (e) {
        alert("Error al guardar notas: " + e.message);
    }
};

document.getElementById('analisis-notes-close').onclick = () => {
    analysisNotesModal.classList.remove('show');
};

// Exponer la función de carga globalmente para que index.html la llame
window.loadAnalysisData = loadAnalysisData;
