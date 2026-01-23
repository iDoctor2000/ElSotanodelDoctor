/* 
   JUKEBOX.JS
   Lógica separada para el reproductor de audio, YouTube API, Google Drive y Dropbox
   + Marcadores (Bookmarks)
   + Inyección UI: Nueva fila de herramientas (Velocidad, Pitch, Notas, Offset, VOLUMEN, MODOS REPRODUCCION, PLAYLIST, EXTRAS)
   + Playlist Automática vs Bucle de Canción
   + Archivos Relacionados (Extras - 7 Slots)
   + GESTIÓN INTEGRAL (Admin Panel)
*/

// Variables Globales del Jukebox - Sincronizadas con window
window.jukeboxLibrary = window.jukeboxLibrary || {}; 
let jukeboxMarkers = {}; 
let jukeboxOffsets = {}; 
let jukeboxNotes = {}; 
let jukeboxPitch = {}; 
let jukeboxRelated = {}; 

let ytPlayer = null;
let isJukeboxPlaying = false;
let jukeboxCheckInterval = null;
let currentJukeboxType = null; 
let currentAudioObj = null; 
let currentSongKey = null; 

// Variables de Estado de Reproducción
let currentSpeed = 1.0;
let currentSemitones = 0; 
let isMinimized = false;
let currentVolume = 100; // 0 a 100
let isMuted = false;
let preMuteVolume = 100;

// Variables Playlist / Modos de Reproducción
let jukeboxPlaylist = []; // Array de {title, url, key}
let currentPlaylistIndex = -1;

// MODOS EXCLUSIVOS
let isLoopingTrack = false;      // Repetir la canción actual (respetando offset)
let isAutoplayPlaylist = false;  // Reproducir la siguiente al terminar

// Variables Bucle Manual A-B (Se mantiene por si acaso)
let jukeboxLoopA = null;
let jukeboxLoopB = null;

// Variable de estado para el modal de marcadores
let pendingMarkerState = null;

// Helper para sanitize
const sanitizeJukeboxKey = (str) => str ? str.toString().trim().replace(/[.#$[\]/:\s,]/g, '_') : 'unknown';

// Exponer funciones al objeto window
window.sanitizeJukeboxKey = sanitizeJukeboxKey; // Exponer para uso en setlists.js

/* --- 0. INYECCIÓN DE ESTILOS Y UI (DISEÑO MEJORADO) --- */

window.injectJukeboxStyles = function() {
    const styleId = 'jukebox-extra-styles';
    if (document.getElementById(styleId)) return;

    const css = `
        /* NUEVA FILA DE HERRAMIENTAS (BAJO BARRA DE PROGRESO) */
        #jukebox-tools-row {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            width: 100%;
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.1);
            flex-wrap: wrap;
        }

        /* Estilo Base Botones Herramientas */
        .jukebox-tool-btn {
            background: transparent;
            border: 1px solid #444;
            color: #0cf;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 0.85em;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            background: rgba(0,0,0,0.2);
            white-space: nowrap; /* Evitar que el texto del botón se rompa feo */
        }
        .jukebox-tool-btn:hover { background: rgba(0, 204, 255, 0.15); border-color: #0cf; color: #fff; }
        .jukebox-tool-btn.active { background: #0cf; color: #000; border-color: #0cf; box-shadow: 0 0 8px rgba(0,204,255,0.4); }
        
        /* GRUPO DE PITCH */
        .jukebox-pitch-group {
            display: flex;
            align-items: center;
            border: 1px solid #444;
            border-radius: 6px;
            overflow: hidden;
            background: rgba(0,0,0,0.3);
        }
        .jb-pitch-btn {
            background: transparent; border: none; color: #aaa;
            cursor: pointer; font-size: 1em; padding: 6px 10px;
            transition: background 0.2s;
        }
        .jb-pitch-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .jb-pitch-display {
            font-family: monospace; font-size: 0.9em; color: #0cf; 
            min-width: 30px; text-align: center; 
            border-left: 1px solid #333; border-right: 1px solid #333;
            padding: 4px 0;
        }

        /* GRUPO VOLUMEN */
        .jukebox-volume-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 5px;
            background: rgba(0,0,0,0.3);
            border: 1px solid #444;
            border-radius: 6px;
            padding: 6px 10px;
        }
        .jb-mute-btn {
            background: none; border: none; color: #0cf; cursor: pointer; font-size: 1.1em; padding: 0; display:flex;
        }
        .jb-mute-btn:hover { color: #fff; }
        .jb-mute-btn.muted { color: #f55; }
        
        /* ESTILO SLIDER VOLUMEN MEJORADO PARA MÓVIL */
        .jb-volume-slider {
            -webkit-appearance: none;
            width: 100px; 
            height: 6px;
            background: #444;
            border-radius: 3px;
            outline: none;
            cursor: pointer;
            touch-action: none; 
        }
        .jb-volume-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            background: #0cf;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 0 8px rgba(0,204,255,0.6);
            transition: transform 0.1s;
            margin-top: -2px;
        }
        .jb-volume-slider::-webkit-slider-thumb:hover, .jb-volume-slider::-webkit-slider-thumb:active {
            transform: scale(1.2);
            background: #fff;
        }

        /* BOTÓN MINIMIZAR (HEADER) */
        .jukebox-minimize-btn {
            background: none; border: none; color: #aaa; cursor: pointer; 
            font-size: 1.2em; padding: 0 8px; line-height: 1; margin-right: 8px;
        }
        .jukebox-minimize-btn:hover { color: #fff; transform: scale(1.1); }

        /* PLAYLIST & RELATED PANEL */
        #jukebox-playlist-panel, #jukebox-related-panel {
            width: 100%; margin-top: 10px; display: none;
            max-height: 250px; overflow-y: auto;
            background: rgba(0,0,0,0.5); border: 1px solid #333; border-radius: 6px;
            padding: 5px;
        }
        .jb-playlist-item {
            padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.05);
            cursor: pointer; color: #aaa; font-size: 0.9em; display: flex; justify-content: space-between; align-items: center;
        }
        .jb-playlist-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .jb-playlist-item.active { color: #0cf; font-weight: bold; background: rgba(0, 204, 255, 0.1); border-left: 3px solid #0cf; }
        .jb-playlist-index { font-size: 0.8em; color: #555; margin-right: 8px; min-width: 20px; }
        
        /* RELATED SLOTS (7 FIXED SLOTS) */
        .jb-related-slot {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 12px; margin-bottom: 4px;
            border: 1px solid #333; border-radius: 4px;
            background: rgba(0,0,0,0.3);
            cursor: pointer; transition: all 0.2s;
        }
        .jb-related-slot:hover { background: rgba(255,255,255,0.05); }
        
        /* Estado Empty (Apagado) */
        .jb-related-slot.empty { opacity: 0.6; color: #666; border-color: #333; }
        .jb-related-slot.empty:hover { opacity: 1; border-color: #555; color: #aaa; }
        .jb-related-icon { font-size: 1.2em; margin-right: 10px; width: 20px; text-align: center; }
        
        /* Estado Filled (Encendido) */
        .jb-related-slot.filled { border-color: #0cf; background: rgba(0, 204, 255, 0.1); color: #fff; }
        .jb-related-slot.filled .jb-related-icon { color: #0cf; text-shadow: 0 0 5px #0cf; }
        .jb-related-slot.filled:hover { background: rgba(0, 204, 255, 0.2); }
        .jb-related-slot.active-playing { background: #0cf; color: #000; }
        .jb-related-slot.active-playing .jb-related-icon { color: #fff; text-shadow: none; }
        
        .jb-related-content { flex: 1; display: flex; align-items: center; }
        .jb-related-trash { 
            background: none; border: none; color: #666; cursor: pointer; 
            padding: 4px 8px; font-size: 1.1em; opacity: 0.7; transition: color 0.2s;
        }
        .jb-related-trash:hover { color: #f55; opacity: 1; }

        /* NOTES AREA */
        #jukebox-notes-panel {
            width: 100%; margin-top: 12px; display: none;
            animation: slideDown 0.2s ease-out;
        }
        #jukebox-notes-panel textarea {
            width: 100%; min-height: 90px; background: #161616; color: #ddd;
            border: 1px solid #333; border-radius: 6px; padding: 10px;
            font-family: sans-serif; font-size: 0.95em; resize: vertical;
            box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);
        }
        #jukebox-notes-panel textarea:focus { border-color: #0cf; outline: none; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

        /* Estilos Modo Minimizado */
        #jukebox-player-bar.minimized {
            top: auto !important; bottom: 0 !important; left: 0 !important;
            transform: none !important;
            width: 100% !important; max-width: 100% !important;
            border-radius: 0 !important;
            border-top: 2px solid #0cf; border-bottom: none; border-left: none; border-right: none;
            padding: 8px 15px !important;
            flex-direction: row; flex-wrap: nowrap; justify-content: space-between;
            background: #000 !important;
        }
        #jukebox-player-bar.minimized .jukebox-info { width: auto; margin-bottom: 0; flex: 1; margin-right: 15px; }
        
        #jukebox-player-bar.minimized .jukebox-loop-area,
        #jukebox-player-bar.minimized .jukebox-markers-area,
        #jukebox-player-bar.minimized .jukebox-progress-container,
        #jukebox-player-bar.minimized #jukebox-notes-panel, 
        #jukebox-player-bar.minimized #jukebox-playlist-panel,
        #jukebox-player-bar.minimized #jukebox-related-panel,
        #jukebox-player-bar.minimized #jukebox-tools-row {
            display: none !important; 
        }
        
        #jukebox-player-bar.minimized .jukebox-controls { gap: 15px; }
        #jukebox-player-bar.minimized .jukebox-control-btn svg { width: 24px; height: 24px; } 

        /* --- RESPONSIVE ADJUSTMENTS --- */
        @media(max-width: 480px) {
            /* Ajustes generales Jukebox en Móvil */
            #jukebox-player-bar { 
                padding: 10px; 
                width: 98%; 
                top: 55%; /* Un poco más abajo para dar espacio */
            }
            .jukebox-song-title { font-size: 1em; max-width: 75%; }
            
            /* Ajustes Controles Principales */
            .jukebox-controls { gap: 12px; }
            .jukebox-control-btn svg { width: 28px; height: 28px; }
            
            /* Ajustes Barra Herramientas */
            #jukebox-tools-row { 
                gap: 5px; 
                justify-content: space-evenly; 
            }
            .jukebox-tool-btn { 
                padding: 5px 8px; 
                font-size: 0.8em; 
                flex-grow: 1; /* Botones crecen para llenar huecos */
                justify-content: center;
            }
            
            /* Ajustes Loop */
            .jukebox-loop-area { gap: 5px; }
            .loop-btn { padding: 4px 8px; font-size: 0.8em; }
            .jukebox-loop-display { min-width: 50px; font-size: 0.8em; }
            
            /* Ajustes Volumen en Móvil */
            .jukebox-volume-group { margin-left: 0; flex-grow: 1; justify-content: center; }
            .jb-volume-slider { width: 70px; }
            
            /* Ajustes Minimizado en Móvil */
            #jukebox-player-bar.minimized { padding: 8px 10px !important; }
            #jukebox-player-bar.minimized .jukebox-song-title { font-size: 0.85em; max-width: 120px; }
            #jukebox-player-bar.minimized .jukebox-controls { gap: 10px; }
        }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = css;
    document.head.appendChild(style);
};

window.injectExtraControls = function() {
    const playerBar = document.getElementById('jukebox-player-bar');
    const infoArea = document.querySelector('#jukebox-player-bar .jukebox-info');
    const closeBtn = document.getElementById('jukebox-close-player');
    const stdControls = document.getElementById('jukebox-std-controls');
    
    if (!playerBar || !infoArea) return;

    // 1. Botón Minimizar (Header)
    if (!document.getElementById('jb-minimize-btn')) {
        const minBtn = document.createElement('button');
        minBtn.id = 'jb-minimize-btn';
        minBtn.className = 'jukebox-minimize-btn';
        minBtn.innerHTML = '&#95;'; 
        minBtn.title = "Minimizar";
        minBtn.onclick = window.toggleMinimize;
        infoArea.insertBefore(minBtn, closeBtn);
    }

    // 1.5. Botones Prev/Next en Controles Principales
    if (stdControls && !document.getElementById('jb-prev-track')) {
        const prevBtn = document.createElement('button');
        prevBtn.id = 'jb-prev-track';
        prevBtn.className = 'jukebox-control-btn';
        prevBtn.title = "Anterior Canción";
        prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>';
        prevBtn.onclick = window.playPrevTrack;
        stdControls.insertBefore(prevBtn, stdControls.firstElementChild);

        const nextBtn = document.createElement('button');
        nextBtn.id = 'jb-next-track';
        nextBtn.className = 'jukebox-control-btn';
        nextBtn.title = "Siguiente Canción";
        nextBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>';
        nextBtn.onclick = window.playNextTrack;
        stdControls.appendChild(nextBtn);
    }

    // 2. CREAR FILA DE HERRAMIENTAS
    let toolsRow = document.getElementById('jukebox-tools-row');
    if (!toolsRow) {
        toolsRow = document.createElement('div');
        toolsRow.id = 'jukebox-tools-row';
        
        const progressContainer = document.getElementById('jukebox-std-progress');
        if (progressContainer && progressContainer.nextSibling) {
            playerBar.insertBefore(toolsRow, progressContainer.nextSibling);
        } else {
            const markersArea = document.getElementById('jukebox-markers-area');
            playerBar.insertBefore(toolsRow, markersArea);
        }
    }

    // --- LLENAR LA FILA DE HERRAMIENTAS ---

    // A. Botón Velocidad
    if (!document.getElementById('jb-speed-btn')) {
        const speedBtn = document.createElement('button');
        speedBtn.id = 'jb-speed-btn';
        speedBtn.className = 'jukebox-tool-btn';
        speedBtn.textContent = '1.0x';
        speedBtn.title = "Cambiar Velocidad";
        speedBtn.onclick = window.cycleSpeed;
        toolsRow.appendChild(speedBtn);
    }

    // B. Botón Offset
    if (!document.getElementById('jb-offset-btn')) {
        const offsetBtn = document.createElement('button');
        offsetBtn.id = 'jb-offset-btn';
        offsetBtn.className = 'jukebox-tool-btn';
        offsetBtn.innerHTML = '<span>⏱</span> Inicio'; 
        offsetBtn.title = "Fijar inicio aquí. Click largo o en 0:00 para borrar.";
        offsetBtn.onclick = window.setStartOffset;
        toolsRow.appendChild(offsetBtn);
    }

    // C. Grupo Pitch
    if (!document.getElementById('jb-pitch-controls')) {
        const wrapper = document.createElement('div');
        wrapper.id = 'jb-pitch-controls';
        wrapper.className = 'jukebox-pitch-group';
        wrapper.title = "Cambiar Tono (Solo Dropbox/Drive)";
        
        wrapper.innerHTML = `
            <button class="jb-pitch-btn" onclick="window.changePitch(-1)">♭</button>
            <span id="jb-pitch-val" class="jb-pitch-display">0</span>
            <button class="jb-pitch-btn" onclick="window.changePitch(1)">♯</button>
        `;
        toolsRow.appendChild(wrapper);
    }

    // D. Botón Notas
    if (!document.getElementById('jb-notes-btn')) {
        const notesBtn = document.createElement('button');
        notesBtn.id = 'jb-notes-btn';
        notesBtn.className = 'jukebox-tool-btn';
        notesBtn.innerHTML = '<span>📝</span> Notas'; 
        notesBtn.title = "Notas de la canción";
        notesBtn.onclick = window.toggleNotesPanel;
        toolsRow.appendChild(notesBtn);
    }

    // E. Botones de MODO y PANELES
    if (!document.getElementById('jb-looptrack-btn')) {
        const loopTrackBtn = document.createElement('button');
        loopTrackBtn.id = 'jb-looptrack-btn';
        loopTrackBtn.className = 'jukebox-tool-btn';
        loopTrackBtn.innerHTML = '<span>🔂</span> Bucle';
        loopTrackBtn.title = "Repetir canción actual";
        loopTrackBtn.onclick = window.toggleLoopTrackMode;
        toolsRow.appendChild(loopTrackBtn);
    }

    if (!document.getElementById('jb-show-playlist-btn')) {
        const playlistBtn = document.createElement('button');
        playlistBtn.id = 'jb-show-playlist-btn';
        playlistBtn.className = 'jukebox-tool-btn';
        playlistBtn.innerHTML = '<span>≡</span> Lista';
        playlistBtn.title = "Ver/Ocultar lista de reproducción";
        playlistBtn.onclick = window.togglePlaylistPanel;
        toolsRow.appendChild(playlistBtn);
    }

    // NUEVO BOTÓN: DOWNLOAD / SOURCE ACCESS
    if (!document.getElementById('jb-download-btn')) {
        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'jb-download-btn';
        downloadBtn.className = 'jukebox-tool-btn';
        // Icono de descarga / enlace externo - SIN TEXTO
        downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        downloadBtn.title = "Descargar audio o abrir fuente original (Dropbox/Drive/YouTube)";
        downloadBtn.onclick = window.accessCurrentSource;
        toolsRow.appendChild(downloadBtn);
    }

    // NUEVO BOTÓN: EXTRAS (RELATED)
    // Aseguramos que se inserte correctamente si no existe
    if (!document.getElementById('jb-related-btn')) {
        const relatedBtn = document.createElement('button');
        relatedBtn.id = 'jb-related-btn';
        relatedBtn.className = 'jukebox-tool-btn';
        relatedBtn.innerHTML = '<span>🔗</span> Extras'; 
        relatedBtn.title = "Archivos de audio relacionados";
        relatedBtn.onclick = window.toggleRelatedPanel;
        
        // Insertar antes del grupo de volumen si existe
        const volGroup = document.getElementById('jb-volume-group');
        if (volGroup && volGroup.parentNode === toolsRow) {
            toolsRow.insertBefore(relatedBtn, volGroup);
        } else {
            toolsRow.appendChild(relatedBtn);
        }
    }

    // NUEVO BOTÓN: TUNER (AFINADOR)
    if (!document.getElementById('tuner-toggle-btn')) {
        const tunerBtn = document.createElement('button');
        tunerBtn.id = 'tuner-toggle-btn'; // ID específico para tuner.js
        tunerBtn.className = 'jukebox-tool-btn';
        tunerBtn.innerHTML = '<span>🎯</span> Tuner';
        tunerBtn.title = "Abrir Afinador (iDoctor Tuner Pro)";
        // No añadimos onclick aquí, tuner.js se encarga de escuchar este ID
        
        // Insertar antes del grupo de volumen si existe
        const volGroup = document.getElementById('jb-volume-group');
        if (volGroup && volGroup.parentNode === toolsRow) {
            toolsRow.insertBefore(tunerBtn, volGroup);
        } else {
            toolsRow.appendChild(tunerBtn);
        }
    }

    // F. Grupo VOLUMEN
    if (!document.getElementById('jb-volume-group')) {
        const volWrapper = document.createElement('div');
        volWrapper.id = 'jb-volume-group';
        volWrapper.className = 'jukebox-volume-group';
        
        // DETECCIÓN IOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
            volWrapper.style.display = 'none';
        }

        volWrapper.innerHTML = `
            <button class="jb-mute-btn" id="jb-mute-btn" title="Mute/Unmute">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            </button>
            <input type="range" class="jb-volume-slider" id="jb-volume-slider" min="0" max="100" value="100" step="1" title="Volumen">
        `;
        toolsRow.appendChild(volWrapper);
        
        setTimeout(() => {
            const slider = document.getElementById('jb-volume-slider');
            const muteBtn = document.getElementById('jb-mute-btn');
            
            if (slider) {
                slider.addEventListener('input', (e) => window.setJukeboxVolume(e.target.value));
                slider.addEventListener('change', (e) => window.setJukeboxVolume(e.target.value));
                slider.value = currentVolume;
            }
            if (muteBtn) {
                muteBtn.onclick = window.toggleJukeboxMute;
            }
            window.updateMuteIcon();
        }, 100);
    }

    // 3. Panel de Playlist (INSERCIÓN)
    if (!document.getElementById('jukebox-playlist-panel')) {
        const plPanel = document.createElement('div');
        plPanel.id = 'jukebox-playlist-panel';
        if(toolsRow && toolsRow.nextSibling) {
            playerBar.insertBefore(plPanel, toolsRow.nextSibling);
        } else {
            playerBar.appendChild(plPanel);
        }
    }

    // 3.5. Panel de Relacionados (EXTRAS)
    if (!document.getElementById('jukebox-related-panel')) {
        const relPanel = document.createElement('div');
        relPanel.id = 'jukebox-related-panel';
        // Insertar después del playlist o tools
        const plPanel = document.getElementById('jukebox-playlist-panel');
        if(plPanel && plPanel.nextSibling) {
            playerBar.insertBefore(relPanel, plPanel.nextSibling);
        } else if(toolsRow && toolsRow.nextSibling) {
            playerBar.insertBefore(relPanel, toolsRow.nextSibling);
        } else {
            playerBar.appendChild(relPanel);
        }
    }

    // 4. Panel de Notas
    if (!document.getElementById('jukebox-notes-panel')) {
        const notesPanel = document.createElement('div');
        notesPanel.id = 'jukebox-notes-panel';
        notesPanel.innerHTML = `
            <textarea id="jb-song-notes-input" placeholder="Escribe notas privadas sobre este audio (ej: El solo empieza en el 2:30)..."></textarea>
        `;
        const relPanel = document.getElementById('jukebox-related-panel');
        if(relPanel && relPanel.nextSibling) {
            playerBar.insertBefore(notesPanel, relPanel.nextSibling);
        } else {
            playerBar.appendChild(notesPanel);
        }

        const textarea = notesPanel.querySelector('textarea');
        textarea.addEventListener('blur', () => {
            if(currentSongKey) {
                jukeboxNotes[currentSongKey] = textarea.value;
                window.saveJukeboxLibrary();
            }
        });
    }
};

/* --- 1. GESTIÓN DE LIBRERÍA (FIRESTORE) --- */

window.loadJukeboxLibrary = async function() {
    try {
        if (typeof window.loadDoc === 'function') {
            const data = await window.withRetry(() => window.loadDoc("intranet", "jukebox_library", { mapping: {}, markers: {}, offsets: {}, notes: {}, pitch: {}, related: {} }));
            
            if (data.mapping) {
                window.jukeboxLibrary = data.mapping || {};
            } else {
                console.log("Detectada estructura antigua Jukebox. Migrando al vuelo...");
                window.jukeboxLibrary = data || {};
            }

            jukeboxMarkers = data.markers || {};
            jukeboxOffsets = data.offsets || {};
            jukeboxNotes = data.notes || {};
            jukeboxPitch = data.pitch || {}; 
            
            if(Array.isArray(data.related)) {
                 jukeboxRelated = {};
            } else {
                 jukeboxRelated = data.related || {};
            }
            console.log("Jukebox Library cargada completa.");
        }
    } catch (e) { console.error("Error cargando Jukebox Library:", e); }
};

// FIX CRÍTICO SENIOR: CAMBIAR MERGE TRUE A MERGE FALSE
window.saveJukeboxLibrary = async function() {
    try {
        if (typeof window.saveDoc === 'function') {
            // MERGE: FALSE para asegurar que los borrados sean efectivos
            await window.withRetry(() => window.saveDoc("intranet", "jukebox_library", { 
                mapping: window.jukeboxLibrary,
                markers: jukeboxMarkers,
                offsets: jukeboxOffsets,
                notes: jukeboxNotes,
                pitch: jukeboxPitch,
                related: jukeboxRelated 
            }, false)); 
            
            // Actualizar vista de gestión si está abierta
            if(document.getElementById('jukebox-mgmt-screen') && document.getElementById('jukebox-mgmt-screen').style.display === 'block') {
                if(window.renderJukeboxManagement) window.renderJukeboxManagement();
            }

            // Recargar datos en los setlists para que aparezcan/desaparezcan los iconos de audio
            if (typeof window.loadAllData === 'function') {
                window.loadAllData();
            }
            
            return true;
        }
    } catch (e) { console.error("Error guardando Jukebox:", e); return false; }
};

/* --- 2. YOUTUBE API --- */

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('youtube-player-placeholder', {
        height: '0', width: '0',
        playerVars: { 'playsinline': 1 },
        events: {
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError,
            'onReady': (e) => { e.target.setVolume(currentVolume); }
        }
    });
};

function onPlayerError(event) { 
    console.error("YouTube Player Error:", event.data); 
    window.stopJukebox(); 
    alert("Error reproduciendo video de YouTube."); 
}

function onPlayerStateChange(event) {
    const btnPlay = document.getElementById('icon-play');
    const btnPause = document.getElementById('icon-pause');
    
    if (event.data == YT.PlayerState.PLAYING) {
        isJukeboxPlaying = true;
        if(btnPlay) btnPlay.style.display = 'none'; 
        if(btnPause) btnPause.style.display = 'block';
        window.startJukeboxProgressLoop();
    } else {
        isJukeboxPlaying = false;
        if(btnPlay) btnPlay.style.display = 'block'; 
        if(btnPause) btnPause.style.display = 'none';
        
        if (event.data == YT.PlayerState.ENDED) {
            window.stopJukeboxProgressLoop();
            
            // LÓGICA DE MODOS DE REPRODUCCIÓN
            if(isLoopingTrack) {
                let savedOffset = 0;
                if(currentSongKey && jukeboxOffsets[currentSongKey]) savedOffset = jukeboxOffsets[currentSongKey];

                if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                    ytPlayer.seekTo(savedOffset);
                    ytPlayer.playVideo();
                }
            } else if (isAutoplayPlaylist) {
                window.playNextTrack();
            }
        }
    }
}

/* --- 3. LOGICA DEL REPRODUCTOR --- */

window.convertDriveToDirectLink = function(url) {
    let id = null;
    const parts = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (parts && parts[1]) id = parts[1];
    else {
        const parts2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (parts2 && parts2[1]) id = parts2[1];
    }
    if (id) return `https://docs.google.com/uc?export=download&id=${id}`;
    return null;
};

window.convertDropboxLink = function(url) {
    if (url.includes('dropbox.com')) {
        let newUrl = url;
        if (newUrl.match(/dl=[01]/)) {
            newUrl = newUrl.replace(/dl=[01]/g, 'raw=1');
        } else if (!newUrl.includes('raw=1')) {
            if (newUrl.includes('?')) newUrl += '&raw=1';
            else newUrl += '?raw=1';
        }
        return newUrl;
    }
    return null;
};

window.initializePlaylist = function(startTitle) {
    let itemsToScan = [];
    const compareNames = (a, b) => sanitizeJukeboxKey(a) === sanitizeJukeboxKey(b);

    const findSongInStructure = (structure, title) => {
        if(!structure) return false;
        return structure.some(block => {
            if(block.isSetHeader && block.songs) {
                return block.songs.some(s => compareNames(s.displayName, title));
            }
            return compareNames(block.displayName, title);
        });
    };

    if (findSongInStructure(window.globalItems1, startTitle)) itemsToScan = window.globalItems1;
    else if (findSongInStructure(window.globalItems2, startTitle)) itemsToScan = window.globalItems2;
    else if (findSongInStructure(window.globalItemsStar, startTitle)) itemsToScan = window.globalItemsStar;
    else {
        jukeboxPlaylist = [{ 
            title: startTitle, 
            key: sanitizeJukeboxKey(startTitle),
            url: window.jukeboxLibrary[sanitizeJukeboxKey(startTitle)]
        }];
        currentPlaylistIndex = 0;
        return;
    }

    let flatList = [];
    itemsToScan.forEach(item => {
        if (item.isSetHeader && item.songs) {
            flatList = flatList.concat(item.songs);
        } else if (item.isSong) {
            flatList.push(item);
        }
    });

    jukeboxPlaylist = flatList.filter(item => {
        const key = sanitizeJukeboxKey(item.displayName);
        return window.jukeboxLibrary && window.jukeboxLibrary[key];
    }).map(item => ({
        title: item.displayName,
        key: sanitizeJukeboxKey(item.displayName),
        url: window.jukeboxLibrary[sanitizeJukeboxKey(item.displayName)]
    }));

    currentPlaylistIndex = jukeboxPlaylist.findIndex(item => compareNames(item.title, startTitle));
    window.renderPlaylist();
};

window.renderPlaylist = function() {
    const panel = document.getElementById('jukebox-playlist-panel');
    if(!panel) return;
    
    panel.innerHTML = "";
    if(jukeboxPlaylist.length === 0) {
        panel.innerHTML = "<div style='color:#aaa; font-size:0.9em; padding:10px;'>Lista vacía</div>";
        return;
    }

    jukeboxPlaylist.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'jb-playlist-item';
        if(idx === currentPlaylistIndex) div.classList.add('active');
        
        div.innerHTML = `<span class="jb-playlist-index">${idx + 1}.</span> <span style="flex-grow:1;">${item.title}</span>`;
        div.onclick = () => {
            currentPlaylistIndex = idx;
            window.openJukeboxPlayer(item.title, item.url);
        };
        
        panel.appendChild(div);
    });
};

window.togglePlaylistPanel = function() {
    const panel = document.getElementById('jukebox-playlist-panel');
    const btn = document.getElementById('jb-show-playlist-btn');
    const relatedPanel = document.getElementById('jukebox-related-panel');
    const notesPanel = document.getElementById('jukebox-notes-panel');
    if(relatedPanel) relatedPanel.style.display = 'none';
    if(notesPanel) notesPanel.style.display = 'none';
    const relatedBtn = document.getElementById('jb-related-btn');
    if(relatedBtn) relatedBtn.classList.remove('active');
    const notesBtn = document.getElementById('jb-notes-btn');
    if(notesBtn) notesBtn.classList.remove('active');
    
    if(!panel) return;
    
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        if(btn) btn.classList.remove('active');
    } else {
        window.renderPlaylist();
        panel.style.display = 'block';
        if(btn) btn.classList.add('active');
        
        const active = panel.querySelector('.jb-playlist-item.active');
        if(active) active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
};

window.openJukeboxPlayer = function(title, rawUrl, isRelated = false) {
    if(!isRelated) {
        if(window.logInteraction) window.logInteraction('JUKEBOX', 'Play: ' + title);
    }

    const cleanTitle = sanitizeJukeboxKey(title);
    
    if (!isRelated) {
        let foundInCurrent = -1;
        if (jukeboxPlaylist.length > 0) {
            foundInCurrent = jukeboxPlaylist.findIndex(item => item.key === cleanTitle);
        }

        if (foundInCurrent !== -1) {
            currentPlaylistIndex = foundInCurrent;
            window.renderPlaylist();
        } else {
            window.initializePlaylist(title);
        }

        if (jukeboxPlaylist.length > 1 && !isLoopingTrack) {
            isAutoplayPlaylist = true;
        } else {
            isAutoplayPlaylist = false;
        }
        
        currentSongKey = cleanTitle;

        const auxPanels = ['jukebox-playlist-panel', 'jukebox-related-panel', 'jukebox-notes-panel'];
        const auxBtns = ['jb-show-playlist-btn', 'jb-related-btn', 'jb-notes-btn'];
        
        auxPanels.forEach(pid => {
            const p = document.getElementById(pid);
            if(p) {
                p.style.display = 'none';
                if(pid === 'jukebox-related-panel') p.innerHTML = "";
            }
        });
        auxBtns.forEach(bid => {
            const b = document.getElementById(bid);
            if(b) b.classList.remove('active');
        });
    }

    const playerBar = document.getElementById('jukebox-player-bar');
    const titleEl = document.getElementById('jukebox-current-title');
    const stdControls = document.getElementById('jukebox-std-controls');
    const stdProgress = document.getElementById('jukebox-std-progress');
    const iframeContainer = document.getElementById('jukebox-iframe-container');
    const loopControls = document.querySelector('.jukebox-loop-area');
    const markersArea = document.getElementById('jukebox-markers-area');
    const toolsRow = document.getElementById('jukebox-tools-row');
    const pitchControls = document.getElementById('jb-pitch-controls');
    
    currentSpeed = 1.0;
    const speedBtn = document.getElementById('jb-speed-btn');
    if(speedBtn) speedBtn.textContent = '1.0x';

    if(!isRelated) {
        const savedOffset = jukeboxOffsets[currentSongKey] || 0;
        const offsetBtn = document.getElementById('jb-offset-btn');
        if(offsetBtn) {
            if(savedOffset > 0) {
                offsetBtn.classList.add('active');
                offsetBtn.innerHTML = '<span>⏱</span> ' + Math.floor(savedOffset) + 's';
            } else {
                offsetBtn.classList.remove('active');
                offsetBtn.innerHTML = '<span>⏱</span> Inicio';
            }
        }

        const savedNote = jukeboxNotes[currentSongKey] || "";
        const notesInput = document.getElementById('jb-song-notes-input');
        if(notesInput) notesInput.value = savedNote;
        const notesBtn = document.getElementById('jb-notes-btn');
        if(notesBtn) {
            if(savedNote) {
                notesBtn.classList.add('active');
                notesBtn.style.borderColor = '#FFD700'; 
                notesBtn.style.color = '#FFD700';
            } else {
                notesBtn.classList.remove('active');
                notesBtn.style.borderColor = '#444';
                notesBtn.style.color = '#0cf';
            }
        }
        
        currentSemitones = jukeboxPitch[currentSongKey] || 0;
        titleEl.textContent = title;
        window.renderMarkers(); 
    } else {
        titleEl.innerHTML = `${title} <span style="color:#0cf; font-size:0.8em; margin-left:5px;">(Extra)</span>`;
        currentSemitones = 0;
        const slots = document.querySelectorAll('.jb-related-slot');
        slots.forEach(s => s.classList.remove('active-playing'));
    }

    window.updatePitchDisplay();

    const loopBtn = document.getElementById('jb-looptrack-btn');
    if (loopBtn) loopBtn.classList.toggle('active', isLoopingTrack);

    const siteAudio = document.getElementById('site-audio');
    if(siteAudio && !siteAudio.paused) siteAudio.pause();

    window.stopJukebox();
    window.clearLoop(); 
    
    playerBar.classList.add('visible');
    
    const url = rawUrl.trim();
    let driveDirectLink = window.convertDriveToDirectLink(url);
    let dropboxLink = window.convertDropboxLink(url);
    
    let startOffset = 0;
    if(!isRelated && jukeboxOffsets[currentSongKey]) startOffset = jukeboxOffsets[currentSongKey];

    if (toolsRow) toolsRow.style.display = 'flex';

    if (dropboxLink) {
         currentJukeboxType = 'html5';
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';
         if(pitchControls) pitchControls.style.display = 'flex'; 
         window.setupHtml5Audio(dropboxLink, false, startOffset);
    } else if (driveDirectLink) {
         currentJukeboxType = 'html5';
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';
         if(pitchControls) pitchControls.style.display = 'flex';
         window.setupHtml5Audio(driveDirectLink, true, startOffset); 
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        currentJukeboxType = 'youtube';
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none'; 
        if(markersArea) markersArea.style.display = 'block';
        if(pitchControls) pitchControls.style.display = 'none';

        let videoId = "";
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length == 11) { videoId = match[2]; }
        else { alert("Link de YouTube no válido"); return; }

        const ytConfig = { videoId: videoId };
        if (startOffset > 0) ytConfig.startSeconds = startOffset;

        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById(ytConfig);
            ytPlayer.setVolume(currentVolume); 
            ytPlayer.playVideo();
            ytPlayer.setPlaybackRate(1.0);
        } else {
            setTimeout(() => {
                if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                    ytPlayer.loadVideoById(ytConfig);
                    ytPlayer.setVolume(currentVolume); 
                    ytPlayer.playVideo();
                    ytPlayer.setPlaybackRate(1.0);
                }
            }, 1000);
        }
    } else {
        currentJukeboxType = 'html5';
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'flex';
        if(markersArea) markersArea.style.display = 'block';
        if(pitchControls) pitchControls.style.display = 'flex';
        window.setupHtml5Audio(url, false, startOffset);
    }
};

window.setupHtml5Audio = function(srcUrl, isDriveFallback = false, startTime = 0) {
    currentAudioObj = document.getElementById('jukebox-audio-element');
    if(!currentAudioObj) return;

    currentAudioObj.pause();
    currentAudioObj.removeAttribute('src');
    const newAudio = currentAudioObj.cloneNode(true);
    currentAudioObj.parentNode.replaceChild(newAudio, currentAudioObj);
    currentAudioObj = newAudio;

    currentAudioObj.preservesPitch = false; 
    currentAudioObj.mozPreservesPitch = false; 
    currentAudioObj.webkitPreservesPitch = false;

    currentAudioObj.src = srcUrl;
    window.setJukeboxVolume(currentVolume);
    window.applyPlaybackRate();

    if(startTime > 0) {
        currentAudioObj.currentTime = startTime;
    }
    
    currentAudioObj.load(); 
    
    const playPromise = currentAudioObj.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => { console.warn("Auto-play HTML5 falló:", error); });
    }

    currentAudioObj.onloadedmetadata = function() {
        if(startTime > 0 && currentAudioObj.currentTime < startTime) {
            currentAudioObj.currentTime = startTime;
        }
    };

    currentAudioObj.onerror = function() {
        if (isDriveFallback) {
            window.switchToDriveIframeMode();
        } else {
            window.stopJukebox();
        }
    };

    currentAudioObj.onplay = () => { 
            const p = document.getElementById('icon-play');
            const pa = document.getElementById('icon-pause');
            if(p) p.style.display = 'none'; 
            if(pa) pa.style.display = 'block';
            window.startJukeboxProgressLoop();
    };
    currentAudioObj.onpause = () => {
            const p = document.getElementById('icon-play');
            const pa = document.getElementById('icon-pause');
            if(p) p.style.display = 'block'; 
            if(pa) pa.style.display = 'none';
    };
    currentAudioObj.onended = () => { 
        window.stopJukeboxProgressLoop(); 
        if(isLoopingTrack) {
            let loopStart = 0;
            if (currentSongKey && jukeboxOffsets[currentSongKey]) loopStart = jukeboxOffsets[currentSongKey];
            currentAudioObj.currentTime = loopStart;
            currentAudioObj.play();
        } else if (isAutoplayPlaylist) {
            window.playNextTrack();
        }
    };
};

window.switchToDriveIframeMode = function() {
    const failedUrl = currentAudioObj.src;
    let id = null;
    if (failedUrl.includes('id=')) {
        id = failedUrl.split('id=')[1];
    }

    if (id) {
        currentJukeboxType = 'drive-iframe';
        const previewUrl = `https://drive.google.com/file/d/${id}/preview`;
        
        const stdControls = document.getElementById('jukebox-std-controls');
        const stdProgress = document.getElementById('jukebox-std-progress');
        const iframeContainer = document.getElementById('jukebox-iframe-container');
        const loopControls = document.querySelector('.jukebox-loop-area');
        const markersArea = document.getElementById('jukebox-markers-area');
        const iframeEl = document.getElementById('jb-iframe');
        const toolsRow = document.getElementById('jukebox-tools-row');

        stdControls.style.display = 'none';
        stdProgress.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none';
        if(markersArea) markersArea.style.display = 'none'; 
        if(toolsRow) toolsRow.style.display = 'none'; 
        
        iframeContainer.style.display = 'block';
        iframeEl.src = previewUrl;
        
        const titleEl = document.getElementById('jukebox-current-title');
        titleEl.innerHTML += " <span style='color:orange; font-size:0.7em;'>(Modo Iframe)</span>";
    } else {
        window.stopJukebox();
    }
};

window.stopJukebox = function() {
    if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo();
    }
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        currentAudioObj.pause();
        currentAudioObj.currentTime = 0;
        currentAudioObj.removeAttribute('src');
    }
    if (currentJukeboxType === 'drive-iframe') {
        document.getElementById('jb-iframe').src = "";
    }
    
    window.stopJukeboxProgressLoop();
    window.clearLoop(); 
    
    const prog = document.getElementById('jb-progress');
    if(prog) prog.value = 0;
    
    const currTime = document.getElementById('jb-current-time');
    if(currTime) currTime.textContent = "0:00";

    const p = document.getElementById('icon-play');
    const pa = document.getElementById('icon-pause');
    if(p) p.style.display = 'block';
    if(pa) pa.style.display = 'none';
};

window.togglePlayPauseJukebox = function() {
    if (currentJukeboxType === 'youtube' && ytPlayer) {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
        else ytPlayer.playVideo();
    } else if (currentJukeboxType === 'html5' && currentAudioObj) {
        if (currentAudioObj.paused) currentAudioObj.play();
        else currentAudioObj.pause();
    }
};

window.seekJukebox = function(percent) {
    if (currentJukeboxType === 'youtube' && ytPlayer) {
        const duration = ytPlayer.getDuration();
        const seekTo = duration * (percent / 100);
        ytPlayer.seekTo(seekTo, true);
    } else if (currentJukeboxType === 'html5' && currentAudioObj) {
        const duration = currentAudioObj.duration;
        if(duration) currentAudioObj.currentTime = duration * (percent / 100);
    }
};

/* --- 7. GESTIÓN INTEGRAL (ADMIN PANEL) --- */

window.renderJukeboxManagement = function() {
    const tbody = document.getElementById('jukebox-mgmt-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    const songs = Object.keys(window.jukeboxLibrary).sort();
    
    if(songs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#aaa;'>No hay canciones con audio asignado.</td></tr>";
        return;
    }

    songs.forEach(key => {
        const url = window.jukeboxLibrary[key];
        const tr = document.createElement('tr');
        
        const tdName = document.createElement('td');
        tdName.style.fontSize = '0.9em';
        tdName.style.color = '#0cf';
        tdName.textContent = key;
        
        const tdUrl = document.createElement('td');
        tdUrl.style.fontSize = '0.8em';
        tdUrl.style.wordBreak = 'break-all';
        tdUrl.textContent = url;
        
        const tdActions = document.createElement('td');
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'edit-rehearsal';
        btnEdit.textContent = 'Editar';
        btnEdit.onclick = function() { window.openJukeboxEditModal(key); };
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'delete-rehearsal';
        btnDelete.textContent = 'Borrar';
        btnDelete.onclick = function() { window.deleteJukeboxTrack(key); };
        
        tdActions.appendChild(btnEdit);
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdName);
        tr.appendChild(tdUrl);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
};

// FIX SENIOR: Borrado integral y persistencia merge:false
window.deleteJukeboxTrack = async function(key) {
    if(confirm(`¿Seguro que quieres borrar el audio de "${key}"?`)) {
        try {
            // Eliminar de todas las estructuras
            delete window.jukeboxLibrary[key];
            if(jukeboxMarkers[key]) delete jukeboxMarkers[key];
            if(jukeboxOffsets[key]) delete jukeboxOffsets[key];
            if(jukeboxNotes[key]) delete jukeboxNotes[key];
            if(jukeboxPitch[key]) delete jukeboxPitch[key];
            if(jukeboxRelated[key]) delete jukeboxRelated[key];
            
            // Guardar con merge=false para limpiar Firestore
            await window.saveJukeboxLibrary();
            window.renderJukeboxManagement();
            alert("Audio eliminado correctamente.");
        } catch (e) {
            console.error("Error al borrar:", e);
            alert("Error al borrar: " + e.message);
        }
    }
};

window.openJukeboxEditModal = function(key) {
    const modal = document.getElementById('jukebox-edit-modal');
    if(!modal) return;
    
    document.getElementById('jb-modal-songname').textContent = key;
    document.getElementById('jb-modal-url-input').value = window.jukeboxLibrary[key] || "";
    
    const saveBtn = document.getElementById('jb-modal-save-btn');
    saveBtn.onclick = function() { window.saveJukeboxFromModal(key); };
    
    modal.classList.add('show');
};

window.saveJukeboxFromModal = async function(key) {
    const url = document.getElementById('jb-modal-url-input').value.trim();
    if(!url) {
        alert("La URL no puede estar vacía.");
        return;
    }
    
    window.jukeboxLibrary[key] = url;
    await window.saveJukeboxLibrary();
    
    document.getElementById('jukebox-edit-modal').classList.remove('show');
    if(document.getElementById('jukebox-mgmt-screen').style.display === 'block') {
        window.renderJukeboxManagement();
    }
    alert("Audio guardado.");
};

window.updateJukeboxTrack = async function(songName, url) {
    const key = sanitizeJukeboxKey(songName);
    window.jukeboxLibrary[key] = url;
    return await window.saveJukeboxLibrary();
};


// FUNCIÓN DE INICIALIZACIÓN CONSOLIDADA
function initJukebox() {
    window.injectJukeboxStyles();
    window.injectExtraControls();

    const closeBtn = document.getElementById('jukebox-close-player');
    if(closeBtn) closeBtn.onclick = () => {
        window.stopJukebox();
        document.getElementById('jukebox-player-bar').classList.remove('visible');
    };
    const playBtn = document.getElementById('jb-play-pause');
    if(playBtn) playBtn.onclick = window.togglePlayPauseJukebox;
    const stopBtn = document.getElementById('jb-stop');
    if(stopBtn) stopBtn.onclick = window.stopJukebox;
    const progBar = document.getElementById('jb-progress');
    if(progBar) progBar.oninput = (e) => window.seekJukebox(e.target.value);
    
    const btnCancelModal = document.getElementById('jb-modal-cancel-btn');
    if(btnCancelModal) btnCancelModal.onclick = () => {
        document.getElementById('jukebox-edit-modal').classList.remove('show');
    };
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initJukebox);
} else {
    initJukebox();
}
