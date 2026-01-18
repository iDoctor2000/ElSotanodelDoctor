/* 
   ANALISIS.JS (MEJORADO)
   Gestión de debriefing, notas de conciertos y enlace de audios grabados.
*/

console.log("--- ANALISIS.JS CARGADO ---");

// Variables globales análisis
let analysisData = {}; 
// Estructura: { id_unico: { title, date, notes, audioUrl, ... } }

window.loadAnalysisData = async function() {
    try {
        const data = await window.withRetry(() => window.loadDoc("intranet", "analysis", { items: {} }));
        analysisData = data.items || {};
        console.log(`Datos de Análisis cargados: ${Object.keys(analysisData).length}`);
        renderAnalysisTable();
    } catch (e) {
        console.error("Error loading Analysis data:", e);
    }
};

window.saveAnalysisData = async function() {
    try {
        await window.withRetry(() => window.saveDoc("intranet", "analysis", { items: analysisData }, true));
        renderAnalysisTable();
    } catch (e) {
        console.error("Error saving Analysis data:", e);
        alert("Error al guardar: " + e.message);
    }
};

// UI & Render
function renderAnalysisTable() {
    const tbody = document.getElementById('analisis-body');
    if(!tbody) return;
    tbody.innerHTML = "";

    const keys = Object.keys(analysisData).sort((a,b) => {
        // Ordenar por fecha decreciente (si existe) o nombre
        const itemA = analysisData[a];
        const itemB = analysisData[b];
        return (itemB.date || "").localeCompare(itemA.date || "") || (itemB.created || "").localeCompare(itemA.created || "");
    });

    if (keys.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:#888;'>No hay análisis registrados.</td></tr>";
        return;
    }

    keys.forEach(key => {
        const item = analysisData[key];
        const hasAudio = !!item.audioUrl;
        const hasNotes = !!item.notes;
        
        // Iconos estado
        const audioIcon = hasAudio 
            ? `<button onclick="window.playAnalysisAudio('${key}')" class="jukebox-btn active" title="Reproducir"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>` 
            : `<span style="color:#444;">-</span>`;
            
        const notesIcon = `<button onclick="window.openAnalysisNotes('${key}')" class="jukebox-btn ${hasNotes ? 'active' : ''}" style="border-radius:4px; width:auto; padding:0 10px;" title="Ver/Editar Notas">${hasNotes ? '📝 Ver' : '➕ Añadir'}</button>`;
        
        const configBtn = `<button onclick="window.openAnalysisConfig('${key}')" class="jukebox-btn" title="Configurar"><svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg></button>`;

        const row = `
            <tr>
                <td><strong>${item.title}</strong><br><span style="font-size:0.8em; color:#aaa;">${item.date || ""}</span></td>
                <td style="text-align:center;">${audioIcon}</td>
                <td style="text-align:center;">${notesIcon}</td>
                <td style="text-align:center;">${configBtn}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

// --- ACCIONES ---

// 1. Crear Nuevo
document.addEventListener("DOMContentLoaded", () => {
    const btnNew = document.getElementById('add-analysis-btn');
    if(btnNew) {
        btnNew.onclick = () => {
            const title = prompt("Título del Análisis (ej: Concierto Sala X):");
            if(title) {
                const id = "an_" + Date.now();
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0];
                
                analysisData[id] = {
                    title: title,
                    date: dateStr,
                    created: now.toISOString(),
                    audioUrl: "",
                    notes: ""
                };
                window.saveAnalysisData();
            }
        };
    }
});

// 2. Configurar (Editar titulo, url, borrar)
let currentConfigId = null;
window.openAnalysisConfig = function(id) {
    currentConfigId = id;
    const item = analysisData[id];
    const modal = document.getElementById('analisis-config-modal');
    if(!modal) return;

    document.getElementById('analisis-config-title').value = item.title || "";
    document.getElementById('analisis-config-url').value = item.audioUrl || "";
    
    // Configurar botones del modal dinámicamente para no acumular listeners
    const saveBtn = document.getElementById('analisis-config-save');
    const delBtn = document.getElementById('analisis-delete-btn');
    
    // Clonar para limpiar listeners previos
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    
    const newDel = delBtn.cloneNode(true);
    delBtn.parentNode.replaceChild(newDel, delBtn);

    newSave.onclick = () => {
        if(analysisData[currentConfigId]) {
            analysisData[currentConfigId].title = document.getElementById('analisis-config-title').value.trim();
            analysisData[currentConfigId].audioUrl = document.getElementById('analisis-config-url').value.trim();
            window.saveAnalysisData();
            modal.classList.remove('show');
        }
    };

    newDel.onclick = () => {
        if(confirm("¿Eliminar este análisis y sus notas?")) {
            delete analysisData[currentConfigId];
            window.saveAnalysisData();
            modal.classList.remove('show');
        }
    };

    modal.classList.add('show');
};

document.addEventListener("DOMContentLoaded", () => {
    const closeConf = document.getElementById('analisis-config-close');
    if(closeConf) closeConf.onclick = () => document.getElementById('analisis-config-modal').classList.remove('show');
});


// 3. Notas
let currentNotesId = null;
window.openAnalysisNotes = function(id) {
    currentNotesId = id;
    const item = analysisData[id];
    const modal = document.getElementById('analisis-notes-modal');
    if(!modal) return;

    document.getElementById('analisis-notes-display-title').textContent = item.title;
    document.getElementById('analisis-notes-textarea').value = item.notes || "";
    
    modal.classList.add('show');
};

document.addEventListener("DOMContentLoaded", () => {
    const saveNotes = document.getElementById('analisis-notes-save');
    const closeNotes = document.getElementById('analisis-notes-close');
    
    if(saveNotes) {
        saveNotes.onclick = () => {
            if(currentNotesId && analysisData[currentNotesId]) {
                analysisData[currentNotesId].notes = document.getElementById('analisis-notes-textarea').value;
                window.saveAnalysisData();
                document.getElementById('analisis-notes-modal').classList.remove('show');
            }
        };
    }
    if(closeNotes) closeNotes.onclick = () => document.getElementById('analisis-notes-modal').classList.remove('show');
});


// 4. Reproducir Audio (Usando el Jukebox Engine)
window.playAnalysisAudio = function(id) {
    const item = analysisData[id];
    if(item && item.audioUrl) {
        // Usamos el Jukebox global para reproducir
        // Pasamos isRelated=true para que no intente buscar en la playlist principal y no rompa el contexto
        // Pero queremos que muestre el título del análisis
        
        // Truco: Abrimos el player como si fuera un "Extra" para aprovechar la UI flotante
        if(typeof window.openJukeboxPlayer === 'function') {
            window.openJukeboxPlayer(item.title, item.audioUrl, true);
        } else {
            window.open(item.audioUrl, '_blank');
        }
    } else {
        alert("No hay audio configurado.");
    }
};
