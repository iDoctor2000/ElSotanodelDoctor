
/* 
   SETLISTS.JS
   Gestión de repertorios, renderizado de tablas, 
   generación de PDFs y gestión de enlaces (Jukebox/PDF/MasterDocs).
*/

console.log("--- SETLISTS.JS CARGADO ---");

// Variables Globales de Setlists
window.globalItems1 = [];
window.globalItems2 = [];
window.globalItemsStar = [];
window.pdfLibrary = {};
window.masterDocs = { setlist1: {}, setlist2: {}, setlistStar: {} }; 

// Configuración por defecto (Usamos window.setlistConfig para acceso global seguro)
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

// Variables de estado para modales de gestión
let currentEditingPdfSong = null;
let currentMasterDocsSetlistKey = null;

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
        // Cargamos el documento sin asumir estructura
        const data = await window.withRetry(() => window.loadDoc("intranet","setlists", {}));
        
        console.log("Setlists Config Raw Data:", data);

        let source = {};
        
        // Detección inteligente de estructura (Migración)
        if (data && data.config && data.config.setlist1) {
            // Estructura Nueva (dentro de .config)
            source = data.config;
        } else if (data && data.setlist1) {
            // Estructura Antigua (en la raíz)
            console.log("Detectada estructura antigua de setlists. Usando datos raíz.");
            source = data;
        } else {
            // No hay datos válidos, usar default
            source = window.setlistConfig;
        }

        window.setlistConfig = {
            setlist1: source.setlist1 || window.setlistConfig.setlist1,
            setlist2: source.setlist2 || window.setlistConfig.setlist2,
            setlistStar: source.setlistStar || window.setlistConfig.setlistStar
        };
        
        updateDynamicSetlistTitles();
        
    } catch(e) {
        console.error("Error crítico al cargar configuración de setlists:", e);
        // Mantenemos defaults
        updateDynamicSetlistTitles();
    }
}

window.saveSetlistConfig = async function(){
    updateDynamicSetlistTitles();
    // Guardamos siempre en la estructura nueva 'config' para estandarizar a futuro
    return await window.withRetry(() => window.saveDoc("intranet", "setlists", { config: window.setlistConfig }, true));
}

// Listeners de Configuración UI
document.addEventListener("DOMContentLoaded", () => {
    // Configuración Setlists
    const menuSetlist = document.getElementById("menu-setlist-config");
    if(menuSetlist) {
        menuSetlist.onclick = e => { 
            e.preventDefault(); 
            if(window.openConfigScreen("setlist-config-screen")){
                document.getElementById("setlist1-name").value = window.setlistConfig.setlist1.name;
                document.getElementById("setlist1-url").value = window.setlistConfig.setlist1.url === "URL_POR_CONFIGURAR_1" ? "" : window.setlistConfig.setlist1.url;
                document.getElementById("setlist2-name").value = window.setlistConfig.setlist2.name;
                const setlist2Url = window.setlistConfig.setlist2.url.replace("https://www.bandhelper.com/feed/set_list/", "");
                document.getElementById("setlist2-url").value = setlist2Url === "URL_POR_CONFIGURAR_2" ? "" : setlist2Url;
                document.getElementById("setlistStar-name").value = window.setlistConfig.setlistStar.name;
                document.getElementById("setlistStar-url").value = window.setlistConfig.setlistStar.url === "URL_POR_CONFIGURAR_STAR" ? "" : window.setlistConfig.setlistStar.url;
            }
        };
    }

    const closeSetlistConfig = document.getElementById("close-setlist-config");
    if(closeSetlistConfig) {
        closeSetlistConfig.onclick = () => { 
            document.getElementById("setlist-config-screen").style.display = "none"; 
            document.getElementById("setlist-message").textContent = ""; 
        };
    }

    const saveSetlistBtn = document.getElementById("guardar-setlist-config");
    if(saveSetlistBtn) {
        saveSetlistBtn.onclick = async () => { 
            const msg = document.getElementById("setlist-message");
            msg.textContent = "";
            const n1 = document.getElementById("setlist1-name").value.trim();
            const u1 = document.getElementById("setlist1-url").value.trim();
            const n2 = document.getElementById("setlist2-name").value.trim();
            const raw2 = document.getElementById("setlist2-url").value.trim();
            const nStar = document.getElementById("setlistStar-name").value.trim();
            const uStar = document.getElementById("setlistStar-url").value.trim();
            
            if(!n1 || !u1 || !n2 || !raw2 || !nStar || !uStar){
                msg.className = "error-message";
                msg.textContent = "Completa todos los campos.";
                return; 
            } 
            
            try {
                window.setlistConfig.setlist1 = { name: n1, url: u1 };
                window.setlistConfig.setlist2 = { name: n2, url: raw2.startsWith("http") ? raw2 : `https://www.bandhelper.com/feed/set_list/${raw2}` };
                window.setlistConfig.setlistStar = { name: nStar, url: uStar };
                
                await window.saveSetlistConfig();
                await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
                document.getElementById("setlist-config-screen").style.display = "none";
            } catch(e) {
                msg.className = "error-message";
                msg.textContent = "Error al guardar: " + e.message;
            }
        };
    }

    // Botones de descarga PDF en la UI principal
    setupPdfButtons();
});

function setupPdfButtons() {
    // Setlist 1
    const btn1 = document.getElementById("download-btn");
    if(btn1) btn1.onclick = () => { if (window.globalItems1 && window.globalItems1.length > 0) window.genPDF(window.globalItems1, window.setlistConfig.setlist1.name, window.setlistConfig.setlist1.name); else alert("Vacío."); };
    const btnBasic1 = document.getElementById("download-basic-btn");
    if(btnBasic1) btnBasic1.onclick = () => { if (window.globalItems1 && window.globalItems1.length > 0) window.genBasicPDF(window.globalItems1, window.setlistConfig.setlist1.name, window.setlistConfig.setlist1.name); else alert("Vacío."); };
    
    // Setlist 2
    const btn2 = document.getElementById("download-btn-2");
    if(btn2) btn2.onclick = () => { if (window.globalItems2 && window.globalItems2.length > 0) window.genPDF(window.globalItems2, window.setlistConfig.setlist2.name, window.setlistConfig.setlist2.name); else alert("Vacío."); };
    const btnBasic2 = document.getElementById("download-basic-btn-2");
    if(btnBasic2) btnBasic2.onclick = () => { if (window.globalItems2 && window.globalItems2.length > 0) window.genBasicPDF(window.globalItems2, window.setlistConfig.setlist2.name, window.setlistConfig.setlist2.name); else alert("Vacío."); };
    
    // Setlist Star
    const btnStar = document.getElementById("download-btn-star");
    if(btnStar) btnStar.onclick = () => { if (window.globalItemsStar && window.globalItemsStar.length > 0) window.genPDF(window.globalItemsStar, window.setlistConfig.setlistStar.name, window.setlistConfig.setlistStar.name); else alert("Vacío."); };
    const btnBasicStar = document.getElementById("download-basic-btn-star");
    if(btnBasicStar) btnBasicStar.onclick = () => { if (window.globalItemsStar && window.globalItemsStar.length > 0) window.genBasicPDF(window.globalItemsStar, window.setlistConfig.setlistStar.name, window.setlistConfig.setlistStar.name); else alert("Vacío."); };

    // Personal PDFs
    setupPersonalPdfBtn("download-personal-btn", () => window.globalItems1, () => window.setlistConfig.setlist1.name);
    setupPersonalPdfBtn("download-personal-btn-2", () => window.globalItems2, () => window.setlistConfig.setlist2.name);
    setupPersonalPdfBtn("download-personal-btn-star", () => window.globalItemsStar, () => window.setlistConfig.setlistStar.name);
}

function setupPersonalPdfBtn(btnId, getItems, getName) {
    const btn = document.getElementById(btnId);
    if(btn) btn.onclick = () => {
        const items = getItems();
        const name = getName();
        if (items && items.length > 0) {
            const fontSizeInput = prompt("PDF Personal - Tamaño letra títulos (ej: 14):", "14");
            if (fontSizeInput) {
                const fontSize = parseInt(fontSizeInput, 10);
                if (!isNaN(fontSize) && fontSize >= 8 && fontSize <= 30) window.genPersonalPDF(items, name, name, fontSize); 
                else alert("Inválido.");
            }
        } else alert("Vacío.");
    };
}

// --- 2. CARGA Y PARSEO DE DATOS (BANDHELPER) ---

async function cargarSetlistGenerico(configEntry, tbodyId, totalTimeId, defaultErrorMessage) {
    const CACHE_KEY = `cache_setlist_${tbodyId}`;
    let rawData = null;
    let usedCache = false;

    try {
        if (!configEntry || !configEntry.url || configEntry.url.startsWith("URL_POR_CONFIGURAR")) { 
            console.warn(`URL no configurada para ${tbodyId}`);
            throw new Error("URL no configurada."); 
        }
        const response = await fetch(configEntry.url);
        if (!response.ok) throw new Error(`Error API (${response.status})`);
        rawData = await response.json();
        localStorage.setItem(CACHE_KEY, JSON.stringify(rawData));
    } catch (networkError) {
        console.warn(`[Offline Mode] Falló la descarga para ${tbodyId}. Intentando caché...`, networkError);
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
    const processedItems = dataToProcess.map(item => {
        if (!item || item.type !== "song" && item.type !== "set") { return null }
        let rawDurationValue = parseFloat(item.duration);
        let durationIsInvalidOrMissing = isNaN(rawDurationValue) || rawDurationValue === 0;
        if (isNaN(rawDurationValue)) { rawDurationValue = 0; durationIsInvalidOrMissing = true }
        let durationInSeconds;
        const itemName = item.name || item.title || (item.type === "song" ? "Canción sin título" : "Set sin nombre");
        const isBreakByName = /break|descanso|intermedio|pausa|intermission|beer time/i.test(itemName);
        item.isSong = false; item.isBreak = false; item.isSetHeader = false;
        if (item.type === "song") { durationInSeconds = rawDurationValue; item.isSong = true; } 
        else if (item.type === "set") {
            if (isBreakByName) { item.isBreak = true; if (durationIsInvalidOrMissing) { durationInSeconds = 3 * 60 } else { durationInSeconds = rawDurationValue * 60 } } 
            else { item.isSetHeader = true; durationInSeconds = rawDurationValue * 60 }
        } else { durationInSeconds = 0 }
        item.calculatedDurationSeconds = durationInSeconds;
        item.displayName = window.decodeHtmlEntities(item.title || item.name || (item.isSong ? "Canción sin título" : item.isBreak ? "Pausa" : "Set"));
        item.originalJSONDuration = item.duration;
        return item
    }).filter(item => item !== null);

    const tbody = document.getElementById(tbodyId);
    if(tbody) tbody.innerHTML = "";
    let songCount = 0;
    const setlistStructure = [];
    let currentSet = null;

    processedItems.forEach(item => {
        if (item.isSetHeader) {
            if (currentSet) { currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((sum, song) => sum + (song.calculatedDurationSeconds || 0), 0); setlistStructure.push(currentSet) }
            currentSet = { ...item, songs: [], calculatedBlockDurationSeconds: 0 }
        } else if (item.isBreak) {
            if (currentSet) { currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((sum, song) => sum + (song.calculatedDurationSeconds || 0), 0); setlistStructure.push(currentSet); currentSet = null }
            setlistStructure.push(item)
        } else if (item.isSong) {
            if (!currentSet) { currentSet = { isSetHeader: true, displayName: "Set General", calculatedDurationSeconds: 0, songs: [], calculatedBlockDurationSeconds: 0 } }
            currentSet.songs.push(item)
        }
    });
    if (currentSet) { currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((sum, song) => sum + (song.calculatedDurationSeconds || 0), 0); setlistStructure.push(currentSet) }

    let totalSecondsOverall = 0;
    
    // Helper for Jukebox Cell
    const createJukeboxCell = (songName) => {
        const cleanName = window.sanitizeFirebaseKey(songName);
        const url = window.jukeboxLibrary ? window.jukeboxLibrary[cleanName] : null;
        const hasLink = !!url;
        const statusClass = hasLink ? 'active' : 'inactive';
        const safeName = songName.replace(/'/g, "\\'");
        
        const clickAction = hasLink 
            ? `window.openJukeboxPlayer('${safeName}', '${url}')` 
            : `window.openJukeboxEditModal('${safeName}')`;

        return `<td class="jukebox-col"><button class="jukebox-btn ${statusClass}" onclick="${clickAction}"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/></svg></button></td>`;
    };
    
    // Helper for PDF Cell
    const createPdfCell = (songName) => {
        const cleanName = window.sanitizeFirebaseKey(songName);
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

    // Helper for Metronome Cell
    const createMetronomeCell = (tempo) => {
        const tempoStr = window.decodeHtmlEntities(tempo || "-");
        const match = String(tempoStr).match(/\d+/);
        
        const svgIcon = `<svg viewBox="0 0 24 24"><path d="M12 2L3 20h18L12 2zm0 3.8L17.6 18H6.4L12 5.8zM11 8v6h2V8h-2z"/></svg>`;

        if (!match) {
            return `<td class="metronome-col">
                <button class="metronome-table-btn" title="Sin tempo definido">
                    ${svgIcon}
                </button>
            </td>`;
        }
        
        const cleanTempo = match[0];
        return `<td class="metronome-col">
            <button class="metronome-table-btn has-tempo" title="Tempo: ${cleanTempo} BPM" onclick="window.toggleMetronomeFromTable('${cleanTempo}', this)">
                ${svgIcon}
            </button>
        </td>`;
    };

    if (tbody) {
        setlistStructure.forEach(blockOrItem => {
            if (blockOrItem.isSetHeader) {
                const setHeaderTime = window.toHHMM(blockOrItem.calculatedBlockDurationSeconds || 0);
                tbody.insertAdjacentHTML("beforeend", `<tr class="set-header-row"><td colspan="8">${blockOrItem.displayName} (${setHeaderTime})</td></tr>`);
                totalSecondsOverall += (blockOrItem.calculatedBlockDurationSeconds || 0);
                blockOrItem.songs.forEach(song => {
                    songCount++;
                    const songFormattedTime = window.toMMSS(song.calculatedDurationSeconds || 0);
                    const jukeboxCell = createJukeboxCell(song.displayName);
                    const pdfCell = createPdfCell(song.displayName);
                    const metronomeCell = createMetronomeCell(song.tempo);
                    tbody.insertAdjacentHTML("beforeend", `<tr><td>${songCount}</td><td>${song.displayName}</td>${jukeboxCell}${pdfCell}<td>${window.decodeHtmlEntities(song.key || "-")}</td><td>${window.decodeHtmlEntities(song.tempo || "-")}</td>${metronomeCell}<td>${songFormattedTime}</td></tr>`)
                })
            } else if (blockOrItem.isBreak) {
                const breakFormattedTime = window.toMMSS(blockOrItem.calculatedDurationSeconds || 0);
                totalSecondsOverall += (blockOrItem.calculatedDurationSeconds || 0);
                tbody.insertAdjacentHTML("beforeend", `<tr class="break-row"><td></td><td style="font-style:italic;">${blockOrItem.displayName}</td><td style="text-align:center;">-</td><td style="text-align:center;">-</td><td style="font-style:italic; text-align:center;">-</td><td style="font-style:italic; text-align:center;">-</td><td style="text-align:center;">-</td><td style="font-style:italic; text-align:center;">${breakFormattedTime}</td></tr>`)
            } else if (blockOrItem.isSong) {
                songCount++;
                const songFormattedTime = window.toMMSS(blockOrItem.calculatedDurationSeconds || 0);
                totalSecondsOverall += (blockOrItem.calculatedDurationSeconds || 0);
                const jukeboxCell = createJukeboxCell(blockOrItem.displayName);
                const pdfCell = createPdfCell(blockOrItem.displayName);
                const metronomeCell = createMetronomeCell(blockOrItem.tempo);
                tbody.insertAdjacentHTML("beforeend", `<tr><td>${songCount}</td><td>${blockOrItem.displayName}</td>${jukeboxCell}${pdfCell}<td>${window.decodeHtmlEntities(blockOrItem.key || "-")}</td><td>${window.decodeHtmlEntities(blockOrItem.tempo || "-")}</td>${metronomeCell}<td>${songFormattedTime}</td></tr>`)
            }
        });
    }
    
    let timeText = "Tiempo total del set: " + window.toHHMM(totalSecondsOverall);
    if(usedCache) timeText += " (Datos guardados)";
    
    const timeElem = document.getElementById(totalTimeId);
    if(timeElem) timeElem.textContent = timeText;
    return setlistStructure;
}

window.cargarPrimerSetlist = async () => { window.globalItems1 = await cargarSetlistGenerico(window.setlistConfig.setlist1, "setlist-body", "total-time", "Error cargando Setlist Próximo Ensayo"); return window.globalItems1; };
window.cargarSegundoSetlist = async () => { window.globalItems2 = await cargarSetlistGenerico(window.setlistConfig.setlist2, "second-body", "total-time-2", "Error cargando Setlist Próximo Concierto"); return window.globalItems2; };
window.cargarStarSetlist = async () => { window.globalItemsStar = await cargarSetlistGenerico(window.setlistConfig.setlistStar, "star-setlist-body", "total-time-star", "Error cargando Setlist Concierto Estrella"); return window.globalItemsStar; };

// --- 3. GENERACIÓN DE PDFS (CORE LOGIC) ---

async function loadFontAsBase64(fontPath) { 
    if(fontDataCache[fontPath]){return fontDataCache[fontPath]}
    try {
        const response = await fetch(fontPath);
        if(!response.ok){throw new Error(`No se pudo cargar la fuente: ${response.statusText} (URL: ${fontPath})`)} 
        const blob = await response.blob();
        return new Promise((resolve,reject)=>{
            const reader = new FileReader();
            reader.onloadend=()=>{fontDataCache[fontPath]=reader.result.split(',')[1];resolve(fontDataCache[fontPath])};
            reader.onerror=(error)=>reject(new Error("Error del FileReader al convertir fuente a Base64: "+error.message));
            reader.readAsDataURL(blob)
        });
    } catch(error){
        console.error(`Error crítico cargando la fuente ${fontPath}:`,error);
        fontDataCache[fontPath]=null;
        return null
    }
}

async function registerFontWithDoc(doc,fontPath,fontVFSAlias,fontNameInDoc){
    const fontBase64=await loadFontAsBase64(fontPath);
    if(fontBase64){
        try{
            doc.addFileToVFS(fontVFSAlias,fontBase64);
            doc.addFont(fontVFSAlias,fontNameInDoc,'normal');
            console.log(`Fuente ${fontNameInDoc} registrada en jsPDF desde ${fontPath}.`);
            return true;
        }catch(fontError){console.error(`Error al registrar la fuente ${fontNameInDoc} en jsPDF:`,fontError)}
    } else {
        console.warn(`No se pudo cargar la fuente ${fontPath} para registrarla.`);
    } 
    return false;
}

async function getBackgroundImageDataURL(){
    return new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>{
            const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
            const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror=(err)=>reject(new Error("Error al cargar la imagen de plantilla: "+(err.message||err.toString())));
        img.src=PDF_BACKGROUND_IMAGE_PATH;
        if(img.complete){
            if(img.naturalHeight!==0){
                const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
                const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);resolve(canvas.toDataURL('image/png'));
            } else if(img.src){reject(new Error("Imagen de plantilla en caché pero inválida."));}
        }
    });
}

// PDF COMPLEX (Original)
window.genPDF = async function(setlistStructure, setlistDynamicName, rawFileNameForPdf){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:"portrait", unit:"pt", format:"a4"});
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const cleanFileName = window.sanitizeFirebaseKey(rawFileNameForPdf) || "setlist"; 
    
    let bleedingCowboysRegistered = await registerFontWithDoc(doc, PDF_FONT_PATHS.bleedingCowboys, 'Bleeding_Cowboys.ttf', PDF_FONT_NAMES.bleedingCowboys);
    let carnevaleeRegistered = await registerFontWithDoc(doc, PDF_FONT_PATHS.carnevalee, 'Carnevalee_Freakshow.ttf', PDF_FONT_NAMES.carnevalee);
    let backgroundImageData = null;
    
    try {
        backgroundImageData = await getBackgroundImageDataURL();
        doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight);
    } catch(e) {
        console.error("No se pudo añadir la plantilla de fondo al PDF:", e);
        doc.rect(10, 10, pageWidth-20, pageHeight-20, 'S');
        doc.setFontSize(10);
        doc.setTextColor(150,0,0);
        doc.text("Advertencia: No se pudo cargar la plantilla de fondo.", pageWidth/2, pageHeight/2, {align:"center"});
    } 
    
    doc.setTextColor(0,0,0);
    const contentMarginTop = 120;
    const contentMarginSides = 60;
    const contentMarginBottom = 100;
    let currentY = contentMarginTop;
    
    doc.setFont(bleedingCowboysRegistered ? PDF_FONT_NAMES.bleedingCowboys : "times", 'normal');
    if(!bleedingCowboysRegistered) doc.setFontType("bold");
    doc.setFontSize(28);
    doc.text("SETLIST", pageWidth/2, currentY, {align:"center"});
    currentY += 28 + 10;
    
    doc.setFont(carnevaleeRegistered ? PDF_FONT_NAMES.carnevalee : "times", 'normal');
    if(!carnevaleeRegistered) doc.setFontType("bold");
    doc.setFontSize(22);
    doc.text(window.decodeHtmlEntities(setlistDynamicName), pageWidth/2, currentY, {align:"center"});
    currentY += 22 + 5;
    
    doc.setFont("times", "italic");
    doc.setFontSize(10); 
    
    let totalOverallSeconds = 0;
    let totalSongCount = 0;
    setlistStructure.forEach(blockOrItem => {
        if(blockOrItem.isSetHeader){
            totalOverallSeconds += blockOrItem.calculatedBlockDurationSeconds||0;
            totalSongCount += blockOrItem.songs ? blockOrItem.songs.length : 0;
        } else if(blockOrItem.isBreak){
            totalOverallSeconds += blockOrItem.calculatedDurationSeconds||0;
        } else if(blockOrItem.isSong){
            totalOverallSeconds += blockOrItem.calculatedDurationSeconds||0;
            totalSongCount++;
        }
    });
    
    const totalItemsText = `${totalSongCount} canciones`;
    doc.text(`${totalItemsText}  |  Tiempo total: ${window.toHHMM(totalOverallSeconds)}`, pageWidth/2, currentY, {align:"center"});
    currentY += 10 + 20; 
    
    const tableFont = "helvetica";
    const tableHeadFont = "helvetica";
    let pdfSongNumber = 0;
    const tableBody = [];
    
    setlistStructure.forEach(blockOrItem => {
        if(blockOrItem.isSetHeader){
            tableBody.push([{content:`${blockOrItem.displayName} (${window.toMMSS(blockOrItem.calculatedBlockDurationSeconds||0)})`, colSpan:5, styles:{halign:'center', fontStyle:'bold', fillColor:[230,230,230], textColor:[0,0,0], fontSize:10}}]);
            if(blockOrItem.songs){
                blockOrItem.songs.forEach(song => {
                    pdfSongNumber++;
                    tableBody.push([pdfSongNumber, song.displayName, window.decodeHtmlEntities(song.key||"-"), window.decodeHtmlEntities(song.tempo||"-"), window.toMMSS(song.calculatedDurationSeconds||0)]);
                });
            }
        } else if(blockOrItem.isBreak){
            tableBody.push([
                {content:"»", styles:{halign:'center', fontStyle:'italic', textColor:[100,100,100]}},
                {content:blockOrItem.displayName, styles:{fontStyle:'italic', textColor:[80,80,80]}},
                {content:"-", styles:{halign:'center', fontStyle:'italic', textColor:[150,150,150]}},
                {content:"-", styles:{halign:'center', fontStyle:'italic', textColor:[150,150,150]}},
                {content:window.toMMSS(blockOrItem.calculatedDurationSeconds||0), styles:{halign:'center', fontStyle:'italic', textColor:[80,80,80]}}
            ]);
        } else if(blockOrItem.isSong){
            pdfSongNumber++;
            tableBody.push([pdfSongNumber, blockOrItem.displayName, window.decodeHtmlEntities(blockOrItem.key||"-"), window.decodeHtmlEntities(blockOrItem.tempo||"-"), window.toMMSS(blockOrItem.calculatedDurationSeconds||0)]);
        }
    }); 
    
    doc.autoTable({
        startY: currentY,
        head: [["#", "Título", "Key", "Tempo", "Time"]],
        body: tableBody,
        theme: 'grid',
        headStyles: {fillColor:[200,200,200], textColor:[0,0,0], font:tableHeadFont, fontStyle:'bold', halign:'center', fontSize:10},
        styles: {font:tableFont, fontSize:9, cellPadding:{top:4, right:5, bottom:4, left:5}, lineColor:[80,80,80], lineWidth:.5, textColor:[0,0,0]},
        columnStyles: {
            0: {halign:'center', cellWidth:25, fontSize:9},
            1: {halign:'left', cellWidth:'auto', fontSize:10},
            2: {halign:'center', cellWidth:50, fontSize:9},
            3: {halign:'center', cellWidth:50, fontSize:9},
            4: {halign:'center', cellWidth:50, fontSize:9}
        },
        margin: {top:contentMarginTop, right:contentMarginSides, bottom:contentMarginBottom, left:contentMarginSides},
        pageBreak: 'auto',
        didDrawPage: function(data){
            if(data.pageNumber > 1 && backgroundImageData){
                doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight);
            }
        }
    });
    
    doc.save(`${cleanFileName}.pdf`);
}

// PDF BASICO
window.genBasicPDF = async function(setlistStructure, setlistDynamicName, rawFileNameForPdf){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:"portrait", unit:"pt", format:"a4"});
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const cleanFileName = window.sanitizeFirebaseKey(rawFileNameForPdf) || "setlist";
    
    let carnevaleeRegistered = await registerFontWithDoc(doc, PDF_FONT_PATHS.carnevalee, 'Carnevalee_Freakshow.ttf', PDF_FONT_NAMES.carnevalee);
    let backgroundImageData = null;
    
    try {
        backgroundImageData = await getBackgroundImageDataURL();
        doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight);
    } catch(e) {} 
    
    doc.setTextColor(0,0,0);
    const contentMarginTop = 120;
    const contentMarginBottom = 100;
    let currentY = contentMarginTop;
    const setlistNameFontSize = 22;
    const itemTitleFontSize = 14;
    const setHeaderFontSize = 16;
    const itemLineHeight = itemTitleFontSize * 1.6;
    
    doc.setFont(carnevaleeRegistered ? PDF_FONT_NAMES.carnevalee : "times", 'normal');
    doc.setFontSize(setlistNameFontSize);
    doc.text(window.decodeHtmlEntities(setlistDynamicName), pageWidth/2, currentY, {align:"center"});
    currentY += setlistNameFontSize + 30; 
    
    setlistStructure.forEach((blockOrItem, idx) => {
        if(currentY + itemLineHeight * 2.5 > pageHeight - contentMarginBottom){
            doc.addPage();
            if(backgroundImageData){ doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight); } 
            currentY = contentMarginTop;
        } 
        
        if(blockOrItem.isSetHeader){
            if(idx > 0) currentY += itemLineHeight * .3;
            doc.setFont("helvetica", 'bold');
            doc.setFontSize(setHeaderFontSize);
            doc.text(`${blockOrItem.displayName} (${window.toMMSS(blockOrItem.calculatedBlockDurationSeconds||0)})`, pageWidth/2, currentY, {align:"center"});
            currentY += setHeaderFontSize * 1.6;
            if(blockOrItem.songs){
                blockOrItem.songs.forEach(song => {
                    if(currentY + itemLineHeight > pageHeight - contentMarginBottom){
                        doc.addPage();
                        if(backgroundImageData) doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight);
                        currentY = contentMarginTop;
                    } 
                    doc.setFont("helvetica", 'normal');
                    doc.setFontSize(itemTitleFontSize);
                    doc.text(song.displayName, pageWidth/2, currentY, {align:"center"});
                    currentY += itemLineHeight;
                });
            }
        } else if(blockOrItem.isBreak){
            if(idx > 0) currentY += itemLineHeight * .2;
            doc.setFont("helvetica", 'italic');
            doc.setFontSize(itemTitleFontSize - 1 > 8 ? itemTitleFontSize - 1 : 8);
            doc.text(`${blockOrItem.displayName} (${window.toMMSS(blockOrItem.calculatedDurationSeconds||0)})`, pageWidth/2, currentY, {align:"center"});
            currentY += (itemTitleFontSize - 1 > 8 ? itemTitleFontSize - 1 : 8) * 1.6;
            if(idx < setlistStructure.length - 1) currentY += itemLineHeight * .2;
        } else if(blockOrItem.isSong){
            doc.setFont("helvetica", 'normal');
            doc.setFontSize(itemTitleFontSize);
            doc.text(blockOrItem.displayName, pageWidth/2, currentY, {align:"center"});
            currentY += itemLineHeight;
        }
    });
    doc.save(`${cleanFileName}_Basico.pdf`);
}

// PDF PERSONAL (Ajustable)
window.genPersonalPDF = async function(setlistStructure, setlistDynamicName, rawFileNameForPdf, songTitleFontSizeParam){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:"portrait", unit:"pt", format:"a4"});
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const songTitleFontSize = parseInt(songTitleFontSizeParam, 10) || 14;
    const cleanFileName = window.sanitizeFirebaseKey(rawFileNameForPdf) || "setlist";
    
    let carnevaleeRegistered = await registerFontWithDoc(doc, PDF_FONT_PATHS.carnevalee, 'Carnevalee_Freakshow.ttf', PDF_FONT_NAMES.carnevalee);
    let backgroundImageData = null;
    
    try {
        backgroundImageData = await getBackgroundImageDataURL();
        doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight);
    } catch(e) {
        console.error("No se pudo añadir la plantilla de fondo al PDF Personal:", e);
        doc.rect(10, 10, pageWidth-20, pageHeight-20, 'S');
    } 
    
    doc.setTextColor(0,0,0);
    const contentMarginTop = 120;
    const contentMarginBottom = 100;
    let currentY = contentMarginTop;
    const setlistNameFontSize = 22;
    const setHeaderFontSize = 16;
    const breakTextFontSize = Math.max(8, songTitleFontSize - 2);
    const songTitleLineHeight = songTitleFontSize * 1.5;
    const setHeaderLineHeight = setHeaderFontSize * 1.5;
    const breakTextLineHeight = breakTextFontSize * 1.5;
    
    doc.setFont(carnevaleeRegistered ? PDF_FONT_NAMES.carnevalee : "times", 'normal');
    doc.setFontSize(setlistNameFontSize);
    doc.text(window.decodeHtmlEntities(setlistDynamicName), pageWidth/2, currentY, {align:"center"});
    currentY += setlistNameFontSize + 30; 
    
    setlistStructure.forEach((blockOrItem, idx) => {
        let estimatedBlockHeight = songTitleLineHeight;
        if(blockOrItem.isSetHeader) estimatedBlockHeight = setHeaderLineHeight + (blockOrItem.songs ? blockOrItem.songs.length : 0);
        else if(blockOrItem.isBreak) estimatedBlockHeight = breakTextLineHeight;
        
        if(currentY + estimatedBlockHeight > pageHeight - contentMarginBottom && idx > 0){
            doc.addPage();
            if(backgroundImageData){ doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight); } 
            currentY = contentMarginTop;
        } 
        
        if(blockOrItem.isSetHeader){
            if(idx > 0) currentY += songTitleLineHeight * .3;
            doc.setFont("helvetica", 'bold');
            doc.setFontSize(setHeaderFontSize);
            doc.text(`${blockOrItem.displayName} (${window.toMMSS(blockOrItem.calculatedBlockDurationSeconds||0)})`, pageWidth/2, currentY, {align:"center"});
            currentY += setHeaderLineHeight;
            if(blockOrItem.songs){
                blockOrItem.songs.forEach(song => {
                    if(currentY + songTitleLineHeight > pageHeight - contentMarginBottom){
                        doc.addPage();
                        if(backgroundImageData) doc.addImage(backgroundImageData, 'PNG', 0, 0, pageWidth, pageHeight);
                        currentY = contentMarginTop;
                    } 
                    doc.setFont("helvetica", 'normal');
                    doc.setFontSize(songTitleFontSize);
                    doc.text(song.displayName, pageWidth/2, currentY, {align:"center"});
                    currentY += songTitleLineHeight;
                });
            }
        } else if(blockOrItem.isBreak){
            if(idx > 0) currentY += songTitleLineHeight * .2;
            doc.setFont("helvetica", 'italic');
            doc.setFontSize(breakTextFontSize);
            doc.text(`${blockOrItem.displayName} (${window.toMMSS(blockOrItem.calculatedDurationSeconds||0)})`, pageWidth/2, currentY, {align:"center"});
            currentY += breakTextLineHeight;
            if(idx < setlistStructure.length - 1) currentY += songTitleLineHeight * .2;
        } else if(blockOrItem.isSong){
            doc.setFont("helvetica", 'normal');
            doc.setFontSize(songTitleFontSize);
            doc.text(blockOrItem.displayName, pageWidth/2, currentY, {align:"center"});
            currentY += songTitleLineHeight;
        }
    });
    doc.save(`${cleanFileName}_Personal_${songTitleFontSize}pt.pdf`);
}

// --- 4. GESTIÓN DE PDF LIBRARY (ENLACES) ---

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
     try {
         await window.withRetry(() => window.saveDoc("intranet", "pdf_library", { library: window.pdfLibrary }));
     } catch (e) {
         console.error("Error saving PDF library:", e);
         throw e;
     }
}

// Eventos de Gestión Masiva PDF
document.addEventListener("DOMContentLoaded", () => {
    const menuPdf = document.getElementById("menu-pdf-mgmt");
    if(menuPdf) {
        menuPdf.onclick = e => { 
            e.preventDefault(); 
            if(window.openConfigScreen) window.openConfigScreen("pdf-mgmt-screen");
            renderPdfMgmtTable();
        };
    }
    const closePdf = document.getElementById("close-pdf-mgmt");
    if(closePdf) closePdf.onclick = () => document.getElementById("pdf-mgmt-screen").style.display = "none";
});

function renderPdfMgmtTable() {
    const tbody = document.getElementById('pdf-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    if(!window.pdfLibrary) return;
    const keys = Object.keys(window.pdfLibrary).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (keys.length === 0) { tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#888;'>No hay partituras enlazadas.</td></tr>"; return; }
    keys.forEach(key => {
        const url = window.pdfLibrary[key];
        const displayName = key.replace(/_/g, " "); 
        const row = `<tr><td>${displayName}</td><td style="font-size:0.8em; color:#aaa; max-width: 200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${url}</td><td><button onclick="window.deletePdfLink('${key}')" style="background:#ff3333; color:#fff; padding:5px 10px; font-size:0.8em;">Eliminar</button></td></tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

window.deletePdfLink = async function(cleanKey) {
    if(confirm("¿Eliminar el enlace de esta partitura?")) {
        delete window.pdfLibrary[cleanKey];
        await window.savePdfLibrary();
        renderPdfMgmtTable(); 
        await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
    }
}

window.openPdfLink = function(url) {
    window.open(url, '_blank');
}

window.openPdfEditModal = function(songName) {
    currentEditingPdfSong = songName;
    const cleanName = window.sanitizeFirebaseKey(songName);
    const currentLink = window.pdfLibrary ? window.pdfLibrary[cleanName] : "";
    const modal = document.getElementById('pdf-edit-modal');
    if(modal) {
        document.getElementById('pdf-modal-songname').textContent = songName;
        document.getElementById('pdf-modal-url-input').value = currentLink || "";
        modal.classList.add('show');
    }
}

// Modal Listeners PDF
document.addEventListener("DOMContentLoaded", () => {
    const saveBtn = document.getElementById('pdf-modal-save-btn');
    if(saveBtn) {
        saveBtn.onclick = async () => {
            if(!currentEditingPdfSong) return;
            const url = document.getElementById('pdf-modal-url-input').value.trim();
            const cleanName = window.sanitizeFirebaseKey(currentEditingPdfSong);
            
            if (window.pdfLibrary) {
                if (url) {
                    window.pdfLibrary[cleanName] = url;
                } else {
                    delete window.pdfLibrary[cleanName];
                }
                
                await window.savePdfLibrary();
                await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
            }
            document.getElementById('pdf-edit-modal').classList.remove('show');
        };
    }
    const cancelBtn = document.getElementById('pdf-modal-cancel-btn');
    if(cancelBtn) cancelBtn.onclick = () => document.getElementById('pdf-edit-modal').classList.remove('show');
});

// --- 5. GESTIÓN DE MASTER DOCS ---

window.loadMasterDocs = async () => {
    try {
        const data = await window.withRetry(() => window.loadDoc("intranet", "master_docs", { docs: { setlist1: {}, setlist2: {}, setlistStar: {} } }));
        window.masterDocs = data.docs || { setlist1: {}, setlist2: {}, setlistStar: {} };
        updateMasterDocsVisuals();
    } catch (e) {
        console.error("Error loading master docs:", e);
    }
}

window.saveMasterDocs = async () => {
    try {
        await window.withRetry(() => window.saveDoc("intranet", "master_docs", { docs: window.masterDocs }));
        updateMasterDocsVisuals();
    } catch (e) {
        console.error("Error saving master docs:", e);
        throw e;
    }
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
        // Remove old listeners to avoid stacking
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        newSaveBtn.onclick = async () => {
            const newName = document.getElementById('master-name-' + i).value.trim();
            const newUrl = document.getElementById('master-url-' + i).value.trim();
            
            if(!window.masterDocs[setlistKey]) window.masterDocs[setlistKey] = {};
            window.masterDocs[setlistKey]['slot' + i] = { name: newName, url: newUrl };
            
            try {
                await window.saveMasterDocs();
                alert("Ranura " + i + " guardada.");
                window.openMasterDocsModal(setlistKey, displayName); 
            } catch(e) { alert("Error al guardar: " + e.message); }
        };
    }

    document.getElementById('master-docs-modal').classList.add('show');
}

// Modal Master Docs Listeners
document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById('close-master-docs-modal');
    if(closeBtn) closeBtn.onclick = () => document.getElementById('master-docs-modal').classList.remove('show');
    
    const menuMaster = document.getElementById("menu-master-docs-mgmt");
    if(menuMaster) {
        menuMaster.onclick = e => { 
            e.preventDefault(); 
            if(window.openConfigScreen) window.openConfigScreen("master-docs-mgmt-screen");
            renderMasterDocsMgmtTable();
        };
    }
    const closeMasterMgmt = document.getElementById("close-master-docs-mgmt");
    if(closeMasterMgmt) closeMasterMgmt.onclick = () => document.getElementById("master-docs-mgmt-screen").style.display = "none";
});

function renderMasterDocsMgmtTable() {
    const tbody = document.getElementById('master-docs-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    const setlistLabels = { setlist1: "Setlist Ensayo", setlist2: "Setlist Concierto", setlistStar: "Setlist Estrella" };
    
    ['setlist1', 'setlist2', 'setlistStar'].forEach(key => {
        const setDocs = window.masterDocs[key] || {};
        const slotsWithFiles = Object.entries(setDocs).filter(([slotId, data]) => data && data.url);
        
        let filesHtml = slotsWithFiles.length > 0 
            ? slotsWithFiles.map(([slotId, data]) => `<div style="font-size:0.8em; color:#aaa;">- ${data.name || slotId}</div>`).join('')
            : '<span style="color:#666; font-style:italic;">Sin archivos</span>';
        
        const row = `
            <tr>
                <td>${setlistLabels[key]}</td>
                <td>${filesHtml}</td>
                <td>
                    <button onclick="window.clearSetlistMasterDocs('${key}')" style="background:#ff3333; color:#fff; padding:5px 10px; font-size:0.8em;" ${slotsWithFiles.length === 0 ? 'disabled' : ''}>Limpiar Todo</button>
                </td>
            </tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

window.clearSetlistMasterDocs = async function(setlistKey) {
    if(confirm("¿Estás seguro de que deseas eliminar TODOS los archivos maestros de este setlist?")) {
        window.masterDocs[setlistKey] = {};
        await window.saveMasterDocs();
        renderMasterDocsMgmtTable();
    }
}

// --- 6. GESTIÓN DE ENLACES JUKEBOX (Parte de Gestión, no Player) ---

// Gestión Masiva Jukebox
document.addEventListener("DOMContentLoaded", () => {
    const menuJb = document.getElementById("menu-jukebox-mgmt");
    if(menuJb) {
        menuJb.onclick = e => { 
            e.preventDefault(); 
            if(window.openConfigScreen) window.openConfigScreen("jukebox-mgmt-screen");
            renderJukeboxMgmtTable();
        };
    }
    const closeJb = document.getElementById("close-jukebox-mgmt");
    if(closeJb) closeJb.onclick = () => document.getElementById("jukebox-mgmt-screen").style.display = "none";
});

function renderJukeboxMgmtTable() {
    const tbody = document.getElementById('jukebox-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    if(!window.jukeboxLibrary) return;
    const keys = Object.keys(window.jukeboxLibrary).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (keys.length === 0) { tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#888;'>No hay canciones con enlace.</td></tr>"; return; }
    keys.forEach(key => {
        const url = window.jukeboxLibrary[key];
        const displayName = key.replace(/_/g, " "); 
        const row = `<tr><td>${displayName}</td><td style="font-size:0.8em; color:#aaa; max-width: 200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${url}</td><td><button onclick="window.deleteJukeboxLink('${key}')" style="background:#ff3333; color:#fff; padding:5px 10px; font-size:0.8em;">Eliminar</button></td></tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

window.deleteJukeboxLink = async function(cleanKey) {
    if(confirm("¿Eliminar el enlace de esta canción?")) {
        delete window.jukeboxLibrary[cleanKey];
        await window.saveJukeboxLibrary();
        renderJukeboxMgmtTable(); 
        await Promise.all([window.cargarPrimerSetlist(), window.cargarSegundoSetlist(), window.cargarStarSetlist()]);
    }
}
