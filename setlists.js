/* 
   SETLISTS.JS
   Gestión de repertorios, renderizado de tablas, 
   generación de PDFs y gestión de enlaces (Jukebox/PDF/MasterDocs/Notas).
*/

console.log("--- SETLISTS.JS CARGADO ---");

// Variables Globales de Setlists
window.globalItems1 = [];
window.globalItems2 = [];
window.globalItemsStar = [];
window.pdfLibrary = {};
window.songNotesLibrary = {}; // NUEVO: Librería de notas
window.masterDocs = { setlist1: {}, setlist2: {}, setlistStar: {} }; 

// Configuración por defecto
window.setlistConfig = {
    setlist1: { name: "Setlist Predeterminado Ensayo", url: "URL_POR_CONFIGURAR_1" },
    setlist2: { name: "Setlist Predeterminado Próximo Concierto", url: "URL_POR_CONFIGURAR_2" },
    setlistStar: { name: "Setlist Predeterminado Concierto Estrella", url: "URL_POR_CONFIGURAR_STAR" }
};

// Referencias PDF
const fontDataCache = {}; 
const PDF_FONT_PATHS = { bleedingCowboys: 'assets/Bleeding_Cowboys.ttf', carnevalee: 'assets/Carnevalee_Freakshow.ttf' };
const PDF_FONT_NAMES = { bleedingCowboys: "BleedingCowboysCustom", carnevalee: "CarnevaleeCustom" }; 
const PDF_BACKGROUND_IMAGE_PATH = 'assets/Plantilla_pdf_ESDD_001.png';

// Variables de estado
let currentEditingPdfSong = null;
let currentEditingNoteSong = null; // NUEVO
let currentMasterDocsSetlistKey = null;

// --- UTILITIES LOCALES ---
// Aseguramos que esta sanitización sea idéntica a la de jukebox.js
const sanitizeKey = (str) => str ? str.toString().trim().replace(/[.#$[\]/:\s,]/g, '_') : 'unknown';

const decodeHtml = (text) => {
    if (typeof text !== 'string') return text;
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
};
const toMMSSLocal = (s) => {
    if (isNaN(s) || s === null || s === undefined) s = 0;
    const totalSeconds = Math.round(s);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};
const toHHMMLocal = (s) => {
    if (isNaN(s) || s === null || s === undefined) s = 0;
    const totalSeconds = Math.round(s);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

// --- 1. CONFIGURACIÓN Y CARGA INICIAL ---

function updateDynamicSetlistTitles(){
    const t1 = document.getElementById("setlist1-dynamic-name");
    const t2 = document.getElementById("second-setlist-dynamic-name");
    const t3 = document.getElementById("star-setlist-dynamic-name");
    if(t1) t1.textContent = window.setlistConfig.setlist1.name;
    if(t2) t2.textContent = window.setlistConfig.setlist2.name;
    if(t3) t3.textContent = window.setlistConfig.setlistStar.name;
}

window.loadSetlistConfig = async function(){
    try {
        if(!window.withRetry || !window.loadDoc) {
            console.error("Funciones de utilidad (withRetry, loadDoc) no disponibles.");
            return;
        }

        const data = await window.withRetry(() => window.loadDoc("intranet", "setlists", {}));
        
        let source = {};
        if (data && data.config && data.config.setlist1) {
            source = data.config;
        } else if (data && data.setlist1) {
            source = data;
        } else {
            source = window.setlistConfig;
        }

        window.setlistConfig = {
            setlist1: source.setlist1 || window.setlistConfig.setlist1,
            setlist2: source.setlist2 || window.setlistConfig.setlist2,
            setlistStar: source.setlistStar || window.setlistConfig.setlistStar
        };
        
        updateDynamicSetlistTitles();
        
    } catch(e) {
        console.error("Error cargando setlist config:", e);
        updateDynamicSetlistTitles();
    }
};

window.saveSetlistConfig = async function(){
    updateDynamicSetlistTitles();
    return await window.withRetry(() => window.saveDoc("intranet", "setlists", { config: window.setlistConfig }, true));
};

// --- 2. CARGA Y PARSEO DE DATOS (BANDHELPER) ---

async function cargarSetlistGenerico(configEntry, tbodyId, totalTimeId) {
    const CACHE_KEY = `cache_setlist_${tbodyId}`;
    let rawData = null;
    let usedCache = false;

    try {
        if (!configEntry || !configEntry.url || configEntry.url.startsWith("URL_POR_CONFIGURAR")) { 
            throw new Error("URL no configurada."); 
        }
        const response = await fetch(configEntry.url);
        if (!response.ok) throw new Error(`Error API (${response.status})`);
        rawData = await response.json();
        localStorage.setItem(CACHE_KEY, JSON.stringify(rawData));
    } catch (networkError) {
        console.warn(`[Offline Mode] ${tbodyId}`, networkError);
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            rawData = JSON.parse(cachedData);
            usedCache = true;
            const timeEl = document.getElementById(totalTimeId);
            if(timeEl && timeEl.previousElementSibling && timeEl.previousElementSibling.previousElementSibling) {
                 const titleEl = timeEl.previousElementSibling.previousElementSibling;
                 if(titleEl && !titleEl.innerHTML.includes("Offline")) titleEl.innerHTML += " <span style='color:orange; font-size:0.8em;'>(⚠️ Modo Offline)</span>";
            }
        } else {
            return [];
        }
    }

    if (!rawData) return [];

    const dataToProcess = Array.isArray(rawData) ? rawData : rawData.items || [];
    
    // Parseo de Items
    const processedItems = dataToProcess.map(item => {
        if (!item || (item.type !== "song" && item.type !== "set")) return null;
        
        let rawDurationValue = parseFloat(item.duration);
        let durationIsInvalidOrMissing = isNaN(rawDurationValue) || rawDurationValue === 0;
        if (isNaN(rawDurationValue)) { rawDurationValue = 0; durationIsInvalidOrMissing = true; }
        
        let durationInSeconds = 0;
        const itemName = item.name || item.title || (item.type === "song" ? "Canción sin título" : "Set sin nombre");
        const isBreakByName = /break|descanso|intermedio|pausa|intermission|beer time/i.test(itemName);
        
        item.isSong = false; item.isBreak = false; item.isSetHeader = false;
        
        if (item.type === "song") { 
            durationInSeconds = rawDurationValue; 
            item.isSong = true; 
        } else if (item.type === "set") {
            if (isBreakByName) { 
                item.isBreak = true; 
                durationInSeconds = durationIsInvalidOrMissing ? 3 * 60 : rawDurationValue * 60;
            } else { 
                item.isSetHeader = true; 
                durationInSeconds = rawDurationValue * 60;
            }
        }
        
        item.calculatedDurationSeconds = durationInSeconds;
        item.displayName = decodeHtml(item.title || item.name || itemName);
        return item;
    }).filter(item => item !== null);

    // Estructurar por Sets
    const tbody = document.getElementById(tbodyId);
    if(tbody) tbody.innerHTML = "";
    
    let songCount = 0;
    const setlistStructure = [];
    let currentSet = null;

    processedItems.forEach(item => {
        if (item.isSetHeader) {
            if (currentSet) {
                currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((sum, s) => sum + (s.calculatedDurationSeconds || 0), 0);
                setlistStructure.push(currentSet);
            }
            currentSet = { ...item, songs: [], calculatedBlockDurationSeconds: 0 };
        } else if (item.isBreak) {
            if (currentSet) {
                currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((sum, s) => sum + (s.calculatedDurationSeconds || 0), 0);
                setlistStructure.push(currentSet);
                currentSet = null;
            }
            setlistStructure.push(item);
        } else if (item.isSong) {
            if (!currentSet) {
                currentSet = { isSetHeader: true, displayName: "Set General", calculatedDurationSeconds: 0, songs: [], calculatedBlockDurationSeconds: 0 };
            }
            currentSet.songs.push(item);
        }
    });
    if (currentSet) {
        currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((sum, s) => sum + (s.calculatedDurationSeconds || 0), 0);
        setlistStructure.push(currentSet);
    }

    // Renderizar
    let totalSecondsOverall = 0;

    const createJukeboxCell = (songName) => {
        const cleanName = sanitizeKey(songName);
        // IMPORTANTE: Buscamos por la clave sanitizada, pero al modal de edición pasamos el nombre original
        // para que sea legible. La sanitización al guardar se hace en jukebox.js
        const url = window.jukeboxLibrary ? window.jukeboxLibrary[cleanName] : null;
        const hasLink = !!url;
        const statusClass = hasLink ? 'active' : 'inactive';
        const safeName = songName.replace(/'/g, "\\'");
        
        const clickAction = hasLink 
            ? `window.openJukeboxPlayer('${safeName}', '${url}')` 
            : `window.openJukeboxEditModal('${safeName}')`;
            
        return `<td class="jukebox-col"><button class="jukebox-btn ${statusClass}" onclick="${clickAction}"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/></svg></button></td>`;
    };
    
    const createPdfCell = (songName) => {
        const cleanName = sanitizeKey(songName);
        const url = window.pdfLibrary ? window.pdfLibrary[cleanName] : null;
        const hasLink = !!url;
        const statusClass = hasLink ? 'active' : 'inactive';
        const safeName = songName.replace(/'/g, "\\'");
        const clickAction = hasLink 
            ? `window.openPdfLink('${url}')` 
            : `window.openPdfEditModal('${safeName}')`;
        const iconSvg = `<svg viewBox="0 0 24 24"><path d="M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/><path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>`;
        return `<td class="pdf-col"><button class="pdf-btn ${statusClass}" onclick="${clickAction}">${iconSvg}</button></td>`;
    };

    const createNotesCell = (songName) => {
        const cleanName = sanitizeKey(songName);
        const note = window.songNotesLibrary ? window.songNotesLibrary[cleanName] : null;
        const hasNote = !!note;
        const statusClass = hasNote ? 'active' : 'inactive';
        const safeName = songName.replace(/'/g, "\\'");
        const clickAction = `window.openSongNotesModal('${safeName}')`;
        
        // Icono Hoja (Sticky Note style)
        const iconSvg = `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
        return `<td class="notes-col"><button class="notes-btn ${statusClass}" onclick="${clickAction}" title="Notas">${iconSvg}</button></td>`;
    };

    const createMetronomeCell = (tempo) => {
        const tempoStr = decodeHtml(tempo || "-");
        const match = String(tempoStr).match(/\d+/);
        const svgIcon = `<svg viewBox="0 0 24 24"><path d="M12 2L3 20h18L12 2zm0 3.8L17.6 18H6.4L12 5.8zM11 8v6h2V8h-2z"/></svg>`;
        if (!match) return `<td class="metronome-col"><button class="metronome-table-btn" title="Sin tempo">${svgIcon}</button></td>`;
        const cleanTempo = match[0];
        return `<td class="metronome-col"><button class="metronome-table-btn has-tempo" title="Tempo: ${cleanTempo} BPM" onclick="window.toggleMetronomeFromTable('${cleanTempo}', this)">${svgIcon}</button></td>`;
    };

    if (tbody) {
        setlistStructure.forEach(item => {
            if (item.isSetHeader) {
                const setHeaderTime = toHHMMLocal(item.calculatedBlockDurationSeconds || 0);
                tbody.insertAdjacentHTML("beforeend", `<tr class="set-header-row"><td colspan="10">${item.displayName} (${setHeaderTime})</td></tr>`);
                totalSecondsOverall += (item.calculatedBlockDurationSeconds || 0);
                item.songs.forEach(song => {
                    songCount++;
                    tbody.insertAdjacentHTML("beforeend", `<tr>
                        <td>${songCount}</td>
                        <td>${song.displayName}</td>
                        ${createJukeboxCell(song.displayName)}
                        ${createPdfCell(song.displayName)}
                        ${createNotesCell(song.displayName)}
                        <td>${decodeHtml(song.key || "-")}</td>
                        <td>${decodeHtml(song.tempo || "-")}</td>
                        ${createMetronomeCell(song.tempo)}
                        <td>${toMMSSLocal(song.calculatedDurationSeconds || 0)}</td>
                    </tr>`);
                });
            } else if (item.isBreak) {
                totalSecondsOverall += (item.calculatedDurationSeconds || 0);
                tbody.insertAdjacentHTML("beforeend", `<tr class="break-row"><td></td><td style="font-style:italic;">${item.displayName}</td><td style="text-align:center;">-</td><td style="text-align:center;">-</td><td style="text-align:center;">-</td><td style="font-style:italic; text-align:center;">-</td><td style="font-style:italic; text-align:center;">-</td><td style="text-align:center;">-</td><td style="font-style:italic; text-align:center;">${toMMSSLocal(item.calculatedDurationSeconds || 0)}</td></tr>`);
            } else if (item.isSong) {
                songCount++;
                totalSecondsOverall += (item.calculatedDurationSeconds || 0);
                tbody.insertAdjacentHTML("beforeend", `<tr>
                    <td>${songCount}</td>
                    <td>${item.displayName}</td>
                    ${createJukeboxCell(item.displayName)}
                    ${createPdfCell(item.displayName)}
                    ${createNotesCell(item.displayName)}
                    <td>${decodeHtml(item.key || "-")}</td>
                    <td>${decodeHtml(item.tempo || "-")}</td>
                    ${createMetronomeCell(item.tempo)}
                    <td>${toMMSSLocal(item.calculatedDurationSeconds || 0)}</td>
                </tr>`);
            }
        });
    }
    
    let timeText = "Tiempo total del set: " + toHHMMLocal(totalSecondsOverall);
    if(usedCache) timeText += " (Datos guardados)";
    const timeElem = document.getElementById(totalTimeId);
    if(timeElem) timeElem.textContent = timeText;
    return setlistStructure;
}

window.cargarPrimerSetlist = async () => { window.globalItems1 = await cargarSetlistGenerico(window.setlistConfig.setlist1, "setlist-body", "total-time"); return window.globalItems1; };
window.cargarSegundoSetlist = async () => { window.globalItems2 = await cargarSetlistGenerico(window.setlistConfig.setlist2, "second-body", "total-time-2"); return window.globalItems2; };
window.cargarStarSetlist = async () => { window.globalItemsStar = await cargarSetlistGenerico(window.setlistConfig.setlistStar, "star-setlist-body", "total-time-star"); return window.globalItemsStar; };

// --- 3. GENERACIÓN DE PDFS (CORE LOGIC) ---

async function loadFontAsBase64(fontPath) { 
    if(fontDataCache[fontPath]) return fontDataCache[fontPath];
    try {
        const response = await fetch(fontPath);
        if(!response.ok) throw new Error("Failed font load");
        const blob = await response.blob();
        return new Promise((resolve,reject)=>{
            const reader = new FileReader();
            reader.onloadend=()=>{fontDataCache[fontPath]=reader.result.split(',')[1];resolve(fontDataCache[fontPath])};
            reader.onerror=reject;
            reader.readAsDataURL(blob);
        });
    } catch(e){ console.error(e); return null; }
}

async function registerFontWithDoc(doc,fontPath,alias,name){
    const font64=await loadFontAsBase64(fontPath);
    if(font64){
        try{ doc.addFileToVFS(alias,font64); doc.addFont(alias,name,'normal'); return true; }
        catch(e){ console.error(e); }
    }
    return false;
}

async function getBackgroundImageDataURL(){
    return new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>{
            const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
            c.getContext('2d').drawImage(img,0,0); resolve(c.toDataURL('image/png'));
        };
        img.onerror=reject;
        img.src=PDF_BACKGROUND_IMAGE_PATH;
    });
}

// PDF Generation Wrapper
window.genPDF = async function(structure, name, fileName){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:"portrait", unit:"pt", format:"a4"});
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    
    await registerFontWithDoc(doc, PDF_FONT_PATHS.bleedingCowboys, 'Bleeding.ttf', PDF_FONT_NAMES.bleedingCowboys);
    await registerFontWithDoc(doc, PDF_FONT_PATHS.carnevalee, 'Carn.ttf', PDF_FONT_NAMES.carnevalee);
    
    try {
        const bg = await getBackgroundImageDataURL();
        doc.addImage(bg, 'PNG', 0, 0, w, h);
    } catch(e) { doc.rect(10,10,w-20,h-20,'S'); }
    
    doc.setTextColor(0,0,0);
    let y = 120;
    
    doc.setFont(PDF_FONT_NAMES.bleedingCowboys, 'normal');
    doc.setFontSize(28);
    doc.text("SETLIST", w/2, y, {align:"center"});
    y += 38;
    
    doc.setFont(PDF_FONT_NAMES.carnevalee, 'normal');
    doc.setFontSize(22);
    doc.text(decodeHtml(name), w/2, y, {align:"center"});
    y += 27;
    
    const body = [];
    let count = 0;
    
    structure.forEach(item => {
        if(item.isSetHeader){
            body.push([{content:`${item.displayName} (${toMMSSLocal(item.calculatedBlockDurationSeconds)})`, colSpan:5, styles:{halign:'center', fontStyle:'bold', fillColor:[220,220,220]}}]);
            item.songs.forEach(s => {
                count++;
                body.push([count, s.displayName, decodeHtml(s.key), decodeHtml(s.tempo), toMMSSLocal(s.calculatedDurationSeconds)]);
            });
        } else if(item.isBreak){
            body.push(['»', item.displayName, '-', '-', toMMSSLocal(item.calculatedDurationSeconds)]);
        } else if(item.isSong){
            count++;
            body.push([count, item.displayName, decodeHtml(item.key), decodeHtml(item.tempo), toMMSSLocal(item.calculatedDurationSeconds)]);
        }
    });
    
    doc.autoTable({
        startY: y,
        head: [["#", "Título", "Key", "Tempo", "Time"]],
        body: body,
        theme: 'grid',
        styles: {fontSize:9, cellPadding:4, lineColor:[80,80,80], textColor:[0,0,0]},
        headStyles: {fillColor:[200,200,200], textColor:[0,0,0], fontStyle:'bold'},
        columnStyles: {0:{halign:'center', cellWidth:25}, 1:{halign:'left'}, 2:{halign:'center'}, 3:{halign:'center'}, 4:{halign:'center'}}
    });
    
    doc.save(`${sanitizeKey(fileName)}.pdf`);
};

window.genBasicPDF = async function(structure, name, fileName){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(decodeHtml(name), 105, 20, {align:"center"});
    
    let y = 40;
    doc.setFontSize(12);
    
    structure.forEach(item => {
        if(y > 280) { doc.addPage(); y=20; }
        if(item.isSetHeader){
            doc.setFont(undefined, 'bold');
            doc.text(item.displayName, 105, y, {align:"center"});
            y+=7;
            doc.setFont(undefined, 'normal');
            item.songs.forEach(s => {
                if(y > 280) { doc.addPage(); y=20; }
                doc.text(s.displayName, 105, y, {align:"center"});
                y+=7;
            });
            y+=5;
        } else {
            doc.text(item.displayName, 105, y, {align:"center"});
            y+=7;
        }
    });
    doc.save(`${sanitizeKey(fileName)}_basic.pdf`);
};

window.genPersonalPDF = async function(structure, name, fileName, fontSize){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(decodeHtml(name), 105, 20, {align:"center"});
    
    let y = 40;
    doc.setFontSize(fontSize);
    
    structure.forEach(item => {
        if(y > 280) { doc.addPage(); y=20; }
        if(item.isSetHeader){
            doc.setFont(undefined, 'bold');
            doc.text(item.displayName, 105, y, {align:"center"});
            y += fontSize * 0.5;
            doc.setFont(undefined, 'normal');
            item.songs.forEach(s => {
                if(y > 280) { doc.addPage(); y=20; }
                doc.text(s.displayName, 105, y, {align:"center"});
                y += fontSize * 0.5;
            });
            y += 5;
        } else {
            doc.text(item.displayName, 105, y, {align:"center"});
            y += fontSize * 0.5;
        }
    });
    doc.save(`${sanitizeKey(fileName)}_personal.pdf`);
};

// --- 4. GESTIÓN DE PDF LIBRARY ---

window.loadPdfLibrary = async () => {
     try {
         const data = await window.withRetry(() => window.loadDoc("intranet", "pdf_library", { library: {} }));
         window.pdfLibrary = data.library || {};
     } catch (e) {
         console.error("Error loading PDF library:", e);
         window.pdfLibrary = {};
     }
}

window.savePdfLibrary = async () => {
     await window.withRetry(() => window.saveDoc("intranet", "pdf_library", { library: window.pdfLibrary }));
}

window.openPdfEditModal = function(songName) {
    currentEditingPdfSong = songName;
    const cleanName = sanitizeKey(songName);
    const currentLink = window.pdfLibrary ? window.pdfLibrary[cleanName] : "";
    
    const modal = document.getElementById('pdf-edit-modal');
    if(modal) {
        document.getElementById('pdf-modal-songname').textContent = songName;
        document.getElementById('pdf-modal-url-input').value = currentLink || "";
        modal.classList.add('show');
    }
}

window.openPdfLink = function(url) { window.open(url, '_blank'); }

// --- 5. GESTIÓN DE NOTAS DE CANCIÓN (NUEVO) ---

window.loadSongNotes = async () => {
    try {
        const data = await window.withRetry(() => window.loadDoc("intranet", "song_notes", { library: {} }));
        window.songNotesLibrary = data.library || {};
        console.log("Song notes loaded.");
    } catch (e) {
        console.error("Error loading song notes:", e);
        window.songNotesLibrary = {};
    }
}

window.saveSongNotes = async () => {
    await window.withRetry(() => window.saveDoc("intranet", "song_notes", { library: window.songNotesLibrary }));
}

window.openSongNotesModal = function(songName) {
    currentEditingNoteSong = songName;
    const cleanName = sanitizeKey(songName);
    const currentNote = window.songNotesLibrary ? window.songNotesLibrary[cleanName] : "";
    
    const modal = document.getElementById('song-notes-modal');
    if(modal) {
        document.getElementById('song-notes-title').textContent = songName;
        document.getElementById('song-notes-input').value = currentNote || "";
        modal.classList.add('show');
    }
}

// --- 6. GESTIÓN DE MASTER DOCS ---

window.loadMasterDocs = async () => {
    try {
        const data = await window.withRetry(() => window.loadDoc("intranet", "master_docs", { docs: { setlist1: {}, setlist2: {}, setlistStar: {} } }));
        window.masterDocs = data.docs || { setlist1: {}, setlist2: {}, setlistStar: {} };
        updateMasterDocsVisuals();
    } catch (e) { console.error("Error loading master docs:", e); }
}

window.saveMasterDocs = async () => {
    await window.withRetry(() => window.saveDoc("intranet", "master_docs", { docs: window.masterDocs }));
    updateMasterDocsVisuals();
}

function updateMasterDocsVisuals() {
    ['setlist1', 'setlist2', 'setlistStar'].forEach(key => {
        for(let i=1; i<=3; i++) {
            const btn = document.getElementById(`master-slot-${key}-${i}`);
            if(!btn) continue;
            const setDocs = window.masterDocs[key] || {};
            const slotData = setDocs['slot' + i];
            if (slotData && slotData.url) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

window.handleMasterDirectClick = (setlistKey, slotNum, displayName) => {
    const slotData = window.masterDocs[setlistKey]['slot' + slotNum];
    if (slotData && slotData.url) {
        window.open(slotData.url, '_blank');
    } else {
        window.openMasterDocsModal(setlistKey, displayName);
    }
};

window.openMasterDocsModal = function(setlistKey, displayName) {
    currentMasterDocsSetlistKey = setlistKey;
    document.getElementById('master-docs-setlist-name').textContent = displayName;
    
    const adminHint = document.getElementById('master-docs-admin-hint');
    const adminAreas = document.querySelectorAll('.admin-only');
    
    if (window.isAuthenticated) {
        adminHint.style.display = 'block';
        adminAreas.forEach(a => a.style.display = 'block');
    } else {
        adminHint.style.display = 'none';
        adminAreas.forEach(a => a.style.display = 'none');
    }

    const setDocs = window.masterDocs[setlistKey] || {};
    
    for(let i=1; i<=3; i++) {
        const slot = setDocs['slot' + i] || { name: "", url: "" };
        
        document.getElementById('master-name-' + i).value = slot.name || "";
        document.getElementById('master-url-' + i).value = slot.url || "";
        
        const displayEl = document.getElementById('master-display-' + i);
        const viewBtn = document.getElementById('master-btn-view-' + i);
        
        if (slot.url) {
            displayEl.textContent = slot.name || "Documento sin nombre";
            displayEl.style.fontStyle = 'normal';
            displayEl.style.color = '#fff';
            viewBtn.style.display = 'flex';
            viewBtn.onclick = () => window.open(slot.url, '_blank');
        } else {
            displayEl.textContent = "Vacío";
            displayEl.style.fontStyle = 'italic';
            displayEl.style.color = '#777';
            viewBtn.style.display = 'none';
        }

        const saveBtn = document.getElementById('master-save-' + i);
        // Replace to clear old listeners
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        newSaveBtn.onclick = async () => {
            const newName = document.getElementById('master-name-' + i).value.trim();
            const newUrl = document.getElementById('master-url-' + i).value.trim();
            
            if(!window.masterDocs[setlistKey]) window.masterDocs[setlistKey] = {};
            window.masterDocs[setlistKey]['slot' + i] = { name: newName, url: newUrl };
            
            await window.saveMasterDocs();
            alert("Ranura " + i + " guardada.");
            window.openMasterDocsModal(setlistKey, displayName); 
        };
    }

    document.getElementById('master-docs-modal').classList.add('show');
}

// --- 7. GESTIÓN DE ENLACES JUKEBOX (Parte de Gestión, no Player) ---

window.openJukeboxEditModal = function(songName) {
    // Esta función actúa de puente. Pasa el nombre original (para mostrar en el modal).
    // La sanitización para guardar se hará DENTRO de saveJukeboxFromModal en jukebox.js
    if(window.openJukeboxEditModalImpl) window.openJukeboxEditModalImpl(songName);
    else console.warn("Jukebox Edit Modal not ready");
}

// Eliminación desde la tabla de gestión general (jukebox.js se encarga de la lógica)
window.deleteJukeboxLink = async function(cleanKey) {
    if(confirm("¿Eliminar el enlace de esta canción?")) {
        delete window.jukeboxLibrary[cleanKey];
        await window.saveJukeboxLibrary();
        window.renderJukeboxMgmtTable(); 
        await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
    }
}

// --- LISTENERS GENERALES ---
document.addEventListener("DOMContentLoaded", () => {
    // Modal PDF Save
    const savePdfBtn = document.getElementById('pdf-modal-save-btn');
    if(savePdfBtn) {
        savePdfBtn.onclick = async () => {
            if(!currentEditingPdfSong) return;
            const url = document.getElementById('pdf-modal-url-input').value.trim();
            const cleanName = sanitizeKey(currentEditingPdfSong);
            if (url) window.pdfLibrary[cleanName] = url; else delete window.pdfLibrary[cleanName];
            await window.savePdfLibrary();
            await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
            document.getElementById('pdf-edit-modal').classList.remove('show');
        };
    }
    document.getElementById('pdf-modal-cancel-btn').onclick = () => document.getElementById('pdf-edit-modal').classList.remove('show');

    // Modal Song Notes Save (NUEVO)
    const saveNotesBtn = document.getElementById('song-notes-save-btn');
    if(saveNotesBtn) {
        saveNotesBtn.onclick = async () => {
            if(!currentEditingNoteSong) return;
            const noteText = document.getElementById('song-notes-input').value;
            const cleanName = sanitizeKey(currentEditingNoteSong);
            
            if (noteText.trim()) window.songNotesLibrary[cleanName] = noteText; 
            else delete window.songNotesLibrary[cleanName];
            
            await window.saveSongNotes();
            await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
            document.getElementById('song-notes-modal').classList.remove('show');
        };
    }
    
    // Fix: Verificar si existe el botón cancelar antes de asignar
    const cancelNotesBtn = document.getElementById('song-notes-cancel-btn');
    if(cancelNotesBtn) {
        cancelNotesBtn.onclick = () => document.getElementById('song-notes-modal').classList.remove('show');
    }

    // Master Docs
    document.getElementById('close-master-docs-modal').onclick = () => document.getElementById('master-docs-modal').classList.remove('show');
    
    // Config UI Listeners
    setupConfigUI();
    
    // --- 8. AUTO-INICIALIZACIÓN DE BOTONES PDF (Sin tocar HTML) ---
    console.log("Setlists.js: Inicializando botones de PDF...");

    // Función auxiliar para conectar botón con seguridad
    const bindBtn = (id, action) => {
        const btn = document.getElementById(id);
        if(btn) {
            // Eliminar listeners previos para evitar duplicados si se recarga
            const newBtn = btn.cloneNode(true);
            if(btn.parentNode) {
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.onclick = action;
            }
        }
    };

    // Setlist 1 (Ensayo)
    bindBtn('download-btn', () => window.genPDF(window.globalItems1, window.setlistConfig.setlist1.name, "Setlist_Ensayo"));
    bindBtn('download-basic-btn', () => window.genBasicPDF(window.globalItems1, window.setlistConfig.setlist1.name, "Setlist_Ensayo"));
    bindBtn('download-personal-btn', () => {
        const size = prompt("Tamaño de fuente (pt):", "12");
        if(size) window.genPersonalPDF(window.globalItems1, window.setlistConfig.setlist1.name, "Setlist_Ensayo", parseInt(size));
    });

    // Setlist 2 (Concierto)
    bindBtn('download-btn-2', () => window.genPDF(window.globalItems2, window.setlistConfig.setlist2.name, "Setlist_Concierto"));
    bindBtn('download-basic-btn-2', () => window.genBasicPDF(window.globalItems2, window.setlistConfig.setlist2.name, "Setlist_Concierto"));
    bindBtn('download-personal-btn-2', () => {
        const size = prompt("Tamaño de fuente (pt):", "12");
        if(size) window.genPersonalPDF(window.globalItems2, window.setlistConfig.setlist2.name, "Setlist_Concierto", parseInt(size));
    });

    // Setlist Star
    bindBtn('download-btn-star', () => window.genPDF(window.globalItemsStar, window.setlistConfig.setlistStar.name, "Setlist_Estrella"));
    bindBtn('download-basic-btn-star', () => window.genBasicPDF(window.globalItemsStar, window.setlistConfig.setlistStar.name, "Setlist_Estrella"));
    bindBtn('download-personal-btn-star', () => {
        const size = prompt("Tamaño de fuente (pt):", "12");
        if(size) window.genPersonalPDF(window.globalItemsStar, window.setlistConfig.setlistStar.name, "Setlist_Estrella", parseInt(size));
    });
});

function setupConfigUI() {
    // Listeners para pantallas de configuración
    // Setlist Config
    const menuSetlist = document.getElementById("menu-setlist-config");
    if(menuSetlist) menuSetlist.onclick = e => { e.preventDefault(); if(window.openConfigScreen("setlist-config-screen")) fillSetlistConfigUI(); };
    document.getElementById("close-setlist-config").onclick = () => document.getElementById("setlist-config-screen").style.display = "none";
    document.getElementById("guardar-setlist-config").onclick = saveSetlistConfigFromUI;

    // PDF Mgmt
    document.getElementById("menu-pdf-mgmt").onclick = e => { e.preventDefault(); if(window.openConfigScreen("pdf-mgmt-screen")) renderPdfMgmtTable(); };
    document.getElementById("close-pdf-mgmt").onclick = () => document.getElementById("pdf-mgmt-screen").style.display = "none";

    // Master Docs Mgmt
    document.getElementById("menu-master-docs-mgmt").onclick = e => { e.preventDefault(); if(window.openConfigScreen("master-docs-mgmt-screen")) renderMasterDocsMgmtTable(); };
    document.getElementById("close-master-docs-mgmt").onclick = () => document.getElementById("master-docs-mgmt-screen").style.display = "none";

    // Jukebox Mgmt
    document.getElementById("menu-jukebox-mgmt").onclick = e => { e.preventDefault(); if(window.openConfigScreen("jukebox-mgmt-screen")) window.renderJukeboxMgmtTable(); };
    document.getElementById("close-jukebox-mgmt").onclick = () => document.getElementById("jukebox-mgmt-screen").style.display = "none";
}

function fillSetlistConfigUI() {
    document.getElementById("setlist1-name").value = window.setlistConfig.setlist1.name;
    document.getElementById("setlist1-url").value = window.setlistConfig.setlist1.url === "URL_POR_CONFIGURAR_1" ? "" : window.setlistConfig.setlist1.url;
    document.getElementById("setlist2-name").value = window.setlistConfig.setlist2.name;
    document.getElementById("setlist2-url").value = window.setlistConfig.setlist2.url === "URL_POR_CONFIGURAR_2" ? "" : window.setlistConfig.setlist2.url.replace("https://www.bandhelper.com/feed/set_list/", "");
    document.getElementById("setlistStar-name").value = window.setlistConfig.setlistStar.name;
    document.getElementById("setlistStar-url").value = window.setlistConfig.setlistStar.url === "URL_POR_CONFIGURAR_STAR" ? "" : window.setlistConfig.setlistStar.url;
}

async function saveSetlistConfigFromUI() {
    const msg = document.getElementById("setlist-message");
    const n1 = document.getElementById("setlist1-name").value.trim();
    const u1 = document.getElementById("setlist1-url").value.trim();
    const n2 = document.getElementById("setlist2-name").value.trim();
    const raw2 = document.getElementById("setlist2-url").value.trim();
    const nStar = document.getElementById("setlistStar-name").value.trim();
    const uStar = document.getElementById("setlistStar-url").value.trim();
    
    if(!n1 || !u1 || !n2 || !raw2 || !nStar || !uStar){
        msg.className = "error-message"; msg.textContent = "Completa todos los campos."; return;
    }
    
    window.setlistConfig.setlist1 = { name: n1, url: u1 };
    window.setlistConfig.setlist2 = { name: n2, url: raw2.startsWith("http") ? raw2 : `https://www.bandhelper.com/feed/set_list/${raw2}` };
    window.setlistConfig.setlistStar = { name: nStar, url: uStar };
    
    await window.saveSetlistConfig();
    await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
    document.getElementById("setlist-config-screen").style.display = "none";
}

function renderPdfMgmtTable() {
    const tbody = document.getElementById('pdf-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    const keys = Object.keys(window.pdfLibrary).sort();
    if (keys.length === 0) { tbody.innerHTML = "<tr><td colspan='3'>Sin partituras.</td></tr>"; return; }
    keys.forEach(key => {
        const row = `<tr><td>${key.replace(/_/g, " ")}</td><td style="font-size:0.8em; overflow:hidden; text-overflow:ellipsis;">${window.pdfLibrary[key]}</td><td><button onclick="window.deletePdfLink('${key}')" style="background:#f55;">X</button></td></tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

function renderMasterDocsMgmtTable() {
    const tbody = document.getElementById('master-docs-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    ['setlist1', 'setlist2', 'setlistStar'].forEach(key => {
        const slots = window.masterDocs[key];
        const count = Object.values(slots).filter(s => s && s.url).length;
        tbody.insertAdjacentHTML('beforeend', `<tr><td>${key}</td><td>${count} archivos</td><td><button onclick="window.clearSetlistMasterDocs('${key}')" style="background:#f55;">Limpiar</button></td></tr>`);
    });
}

// Global exposure for Jukebox Mgmt (used in other files)
window.renderJukeboxMgmtTable = function() {
    const tbody = document.getElementById('jukebox-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    if(!window.jukeboxLibrary) return;
    const keys = Object.keys(window.jukeboxLibrary).sort();
    if (keys.length === 0) { tbody.innerHTML = "<tr><td colspan='3'>Sin canciones.</td></tr>"; return; }
    keys.forEach(key => {
        // En la tabla de gestión mostramos la CLAVE REAL (que debería estar sanitizada)
        // CORRECCIÓN: Usar window.deleteJukeboxLink (la función que existe) en lugar de deleteJukeboxTrack
        const row = `<tr><td>${key}</td><td style="font-size:0.8em;">${window.jukeboxLibrary[key]}</td><td><button onclick="window.deleteJukeboxLink('${key}')" style="background:#f55;">X</button></td></tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
};

window.clearSetlistMasterDocs = async function(key) {
    if(confirm("¿Limpiar todos los docs de este setlist?")) {
        window.masterDocs[key] = {};
        await window.saveMasterDocs();
        renderMasterDocsMgmtTable();
    }
};

window.deletePdfLink = async function(key) {
    if(confirm("¿Eliminar?")) {
        delete window.pdfLibrary[key];
        await window.savePdfLibrary();
        renderPdfMgmtTable();
        await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
    }
};
