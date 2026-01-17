
/* 
   JUKEBOX.JS
   Lógica separada para el reproductor de audio, YouTube API, Google Drive y Dropbox
   + Marcadores (Bookmarks)
   + Inyección UI: Nueva fila de herramientas (Velocidad, Pitch, Notas, Offset, VOLUMEN, MODOS REPRODUCCION, PLAYLIST)
   + Playlist Automática vs Bucle de Canción
*/

// Variables Globales del Jukebox
let jukeboxLibrary = {}; 
let jukeboxMarkers = {}; 
let jukeboxOffsets = {}; 
let jukeboxNotes = {}; 
let jukeboxPitch = {}; 

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
const sanitizeJukeboxKey = (str) => str.replace(/[.#$[\]/:\s,]/g, '_');

// Exponer funciones al objeto window
window.jukeboxLibrary = jukeboxLibrary;

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

        /* PLAYLIST PANEL (NUEVO) */
        #jukebox-playlist-panel {
            width: 100%; margin-top: 10px; display: none;
            max-height: 200px; overflow-y: auto;
            background: rgba(0,0,0,0.5); border: 1px solid #333; border-radius: 6px;
            padding: 5px;
        }
        .jb-playlist-item {
            padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.05);
            cursor: pointer; color: #aaa; font-size: 0.9em; display: flex; justify-content: space-between;
        }
        .jb-playlist-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .jb-playlist-item.active { color: #0cf; font-weight: bold; background: rgba(0, 204, 255, 0.1); border-left: 3px solid #0cf; }
        .jb-playlist-index { font-size: 0.8em; color: #555; margin-right: 8px; min-width: 20px; }

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
        #jukebox-player-bar.minimized #jukebox-tools-row {
            display: none !important; 
        }
        
        #jukebox-player-bar.minimized .jukebox-controls { gap: 15px; }
        #jukebox-player-bar.minimized .jukebox-control-btn svg { width: 24px; height: 24px; } 

        @media(max-width: 768px) {
            #jukebox-player-bar.minimized { padding: 10px !important; }
            #jukebox-player-bar.minimized .jukebox-song-title { font-size: 0.9em; max-width: 140px; }
            #jukebox-tools-row { gap: 6px; justify-content: space-around; }
            .jukebox-tool-btn { padding: 6px 8px; font-size: 0.8em; }
            .jb-volume-slider { width: 80px; }
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

    // E. Botones de MODO (LOOP TRACK vs PLAYLIST)
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
        // Se inserta antes de las notas o después de tools
        if(toolsRow && toolsRow.nextSibling) {
            playerBar.insertBefore(plPanel, toolsRow.nextSibling);
        } else {
            playerBar.appendChild(plPanel);
        }
    }

    // 4. Panel de Notas
    if (!document.getElementById('jukebox-notes-panel')) {
        const notesPanel = document.createElement('div');
        notesPanel.id = 'jukebox-notes-panel';
        notesPanel.innerHTML = `
            <textarea id="jb-song-notes-input" placeholder="Escribe notas privadas sobre este audio (ej: El solo empieza en el 2:30)..."></textarea>
        `;
        const plPanel = document.getElementById('jukebox-playlist-panel');
        if(plPanel && plPanel.nextSibling) {
            playerBar.insertBefore(notesPanel, plPanel.nextSibling);
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
            const data = await window.withRetry(() => window.loadDoc("intranet", "jukebox_library", { mapping: {}, markers: {}, offsets: {}, notes: {}, pitch: {} }));
            window.jukeboxLibrary = data.mapping || {};
            jukeboxMarkers = data.markers || {};
            jukeboxOffsets = data.offsets || {};
            jukeboxNotes = data.notes || {};
            jukeboxPitch = data.pitch || {}; 
            console.log("Jukebox Library cargada completa.");
        }
    } catch (e) { console.error("Error cargando Jukebox Library:", e); }
};

window.saveJukeboxLibrary = async function() {
    try {
        if (typeof window.saveDoc === 'function') {
            await window.withRetry(() => window.saveDoc("intranet", "jukebox_library", { 
                mapping: window.jukeboxLibrary,
                markers: jukeboxMarkers,
                offsets: jukeboxOffsets,
                notes: jukeboxNotes,
                pitch: jukeboxPitch
            }));
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
        
        // TRACKING (Solo la primera vez que cambia a playing)
        if(window.logInteraction && currentSongKey) {
             // Para evitar loguear cada pausa/play, podríamos usar un flag, pero lo más simple es loguear al abrir.
             // Aquí lo dejamos como refuerzo.
        }
    } else {
        isJukeboxPlaying = false;
        if(btnPlay) btnPlay.style.display = 'block'; 
        if(btnPause) btnPause.style.display = 'none';
        
        if (event.data == YT.PlayerState.ENDED) {
            window.stopJukeboxProgressLoop();
            
            // LÓGICA DE MODOS DE REPRODUCCIÓN
            if(isLoopingTrack) {
                const savedOffset = jukeboxOffsets[currentSongKey] || 0;
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
        // Forzar raw=1 para streaming correcto en iOS/Mobile
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

// LÓGICA DE PLAYLIST REPARADA
window.initializePlaylist = function(startTitle) {
    let itemsToScan = [];
    const compareNames = (a, b) => sanitizeJukeboxKey(a) === sanitizeJukeboxKey(b);

    // Buscar en qué variable global está la canción (buscando DENTRO de los Sets)
    const findSongInStructure = (structure, title) => {
        if(!structure) return false;
        return structure.some(block => {
            // Si es un bloque con canciones
            if(block.isSetHeader && block.songs) {
                return block.songs.some(s => compareNames(s.displayName, title));
            }
            // Si es una canción suelta
            return compareNames(block.displayName, title);
        });
    };

    if (findSongInStructure(window.globalItems1, startTitle)) itemsToScan = window.globalItems1;
    else if (findSongInStructure(window.globalItems2, startTitle)) itemsToScan = window.globalItems2;
    else if (findSongInStructure(window.globalItemsStar, startTitle)) itemsToScan = window.globalItemsStar;
    else {
        // Fallback
        jukeboxPlaylist = [{ 
            title: startTitle, 
            key: sanitizeJukeboxKey(startTitle),
            url: window.jukeboxLibrary[sanitizeJukeboxKey(startTitle)]
        }];
        currentPlaylistIndex = 0;
        console.log("Playlist fallback: Canción única");
        return;
    }

    // Aplanar estructura (Sets -> Lista plana)
    let flatList = [];
    itemsToScan.forEach(item => {
        if (item.isSetHeader && item.songs) {
            flatList = flatList.concat(item.songs);
        } else if (item.isSong) {
            flatList.push(item);
        }
    });

    // Construir playlist SOLO con canciones que tengan audio linkeado
    jukeboxPlaylist = flatList.filter(item => {
        const key = sanitizeJukeboxKey(item.displayName);
        return window.jukeboxLibrary && window.jukeboxLibrary[key];
    }).map(item => ({
        title: item.displayName,
        key: sanitizeJukeboxKey(item.displayName),
        url: window.jukeboxLibrary[sanitizeJukeboxKey(item.displayName)]
    }));

    // Encontrar índice actual
    currentPlaylistIndex = jukeboxPlaylist.findIndex(item => compareNames(item.title, startTitle));
    
    console.log(`Playlist generada: ${jukeboxPlaylist.length} pistas. Actual: ${currentPlaylistIndex}`);
    
    // Actualizar visualizador si está abierto
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
            // Saltamos a esa canción
            currentPlaylistIndex = idx;
            window.openJukeboxPlayer(item.title, item.url);
        };
        
        panel.appendChild(div);
    });
};

window.togglePlaylistPanel = function() {
    const panel = document.getElementById('jukebox-playlist-panel');
    const btn = document.getElementById('jb-show-playlist-btn');
    
    if(!panel) return;
    
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        if(btn) btn.classList.remove('active');
    } else {
        // Asegurar que la lista está actualizada
        window.renderPlaylist();
        panel.style.display = 'block';
        if(btn) btn.classList.add('active');
        
        // Auto scroll al activo
        const active = panel.querySelector('.jb-playlist-item.active');
        if(active) active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
};

window.openJukeboxPlayer = function(title, rawUrl) {
    // TRACKING: Log play event
    if(window.logInteraction) window.logInteraction('JUKEBOX', 'Play: ' + title);

    const cleanTitle = sanitizeJukeboxKey(title);
    let foundInCurrent = -1;
    
    // Verificar si la canción ya está en la playlist cargada
    if (jukeboxPlaylist.length > 0) {
        foundInCurrent = jukeboxPlaylist.findIndex(item => item.key === cleanTitle);
    }

    if (foundInCurrent !== -1) {
        currentPlaylistIndex = foundInCurrent;
        // Si el panel está abierto, refrescar el resaltado
        window.renderPlaylist();
    } else {
        // Si no, regenerar playlist desde cero
        window.initializePlaylist(title);
    }

    // Por defecto activamos "Lista" si hay más de 1 canción
    if (jukeboxPlaylist.length > 1 && !isLoopingTrack) {
        isAutoplayPlaylist = true;
    } else {
        isAutoplayPlaylist = false;
    }

    // --- RESTO LÓGICA NORMAL ---
    currentSongKey = cleanTitle;

    const playerBar = document.getElementById('jukebox-player-bar');
    const titleEl = document.getElementById('jukebox-current-title');
    const stdControls = document.getElementById('jukebox-std-controls');
    const stdProgress = document.getElementById('jukebox-std-progress');
    const iframeContainer = document.getElementById('jukebox-iframe-container');
    const loopControls = document.querySelector('.jukebox-loop-area');
    const markersArea = document.getElementById('jukebox-markers-area');
    const notesPanel = document.getElementById('jukebox-notes-panel');
    const toolsRow = document.getElementById('jukebox-tools-row');
    const pitchControls = document.getElementById('jb-pitch-controls');
    
    // Reset UI States
    currentSpeed = 1.0;
    const speedBtn = document.getElementById('jb-speed-btn');
    if(speedBtn) speedBtn.textContent = '1.0x';

    // Load Saved Offset
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

    // Load Saved Notes
    const savedNote = jukeboxNotes[currentSongKey] || "";
    const notesInput = document.getElementById('jb-song-notes-input');
    if(notesInput) notesInput.value = savedNote;
    if(notesPanel) notesPanel.style.display = 'none'; 
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

    // Load Pitch
    currentSemitones = jukeboxPitch[currentSongKey] || 0;
    window.updatePitchDisplay();

    // Update Mode Buttons
    const loopBtn = document.getElementById('jb-looptrack-btn');
    // const playAllBtn = document.getElementById('jb-show-playlist-btn'); 
    
    if (loopBtn) loopBtn.classList.toggle('active', isLoopingTrack);

    const siteAudio = document.getElementById('site-audio');
    if(siteAudio && !siteAudio.paused) siteAudio.pause();

    window.stopJukebox();
    window.clearLoop(); 
    window.renderMarkers();

    playerBar.classList.add('visible');
    titleEl.textContent = title;
    
    const url = rawUrl.trim();
    let driveDirectLink = window.convertDriveToDirectLink(url);
    let dropboxLink = window.convertDropboxLink(url);

    if (toolsRow) toolsRow.style.display = 'flex';

    // 1. DROPBOX (HTML5)
    if (dropboxLink) {
         currentJukeboxType = 'html5';
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';
         if(pitchControls) pitchControls.style.display = 'flex'; 
         window.setupHtml5Audio(dropboxLink, false, savedOffset);

    // 2. DRIVE (HTML5 or Iframe)
    } else if (driveDirectLink) {
         currentJukeboxType = 'html5';
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';
         if(pitchControls) pitchControls.style.display = 'flex';
         window.setupHtml5Audio(driveDirectLink, true, savedOffset); 

    // 3. YOUTUBE
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
        if (savedOffset > 0) ytConfig.startSeconds = savedOffset;

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
                } else { alert("YouTube API no lista."); }
            }, 1000);
        }

    // 4. HTML5 GENERIC
    } else {
        currentJukeboxType = 'html5';
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'flex';
        if(markersArea) markersArea.style.display = 'block';
        if(pitchControls) pitchControls.style.display = 'flex';
        window.setupHtml5Audio(url, false, savedOffset);
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
        const err = currentAudioObj.error;
        console.error("Error cargando audio HTML5:", err);
        
        if (isDriveFallback) {
            console.warn("Fallo carga directa Drive. Cambiando a modo Iframe.");
            window.switchToDriveIframeMode();
        } else {
            let msg = "Error al reproducir el audio.";
            let codeInfo = "";
            if(err) {
                if(err.code === 3) msg = "Error de decodificación (MEDIA_ERR_DECODE).";
                if(err.code === 4) msg = "Formato no soportado (Posible archivo ALAC/Lossless).";
                codeInfo = ` (Código: ${err.code})`;
            }
            alert(`${msg}${codeInfo}\n\nEnlace:\n${srcUrl}`);
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
            const savedOffset = jukeboxOffsets[currentSongKey] || 0;
            currentAudioObj.currentTime = savedOffset;
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
        alert("El archivo de Drive no se puede reproducir.");
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

/* --- FUNCIONES HERRAMIENTAS (SPEED, PITCH, NOTES, OFFSET, VOLUMEN, MODOS) --- */

// GESTIÓN DE MODOS DE REPRODUCCIÓN (EXCLUSIVOS)
window.toggleLoopTrackMode = function() {
    isLoopingTrack = !isLoopingTrack;
    if (isLoopingTrack) {
        isAutoplayPlaylist = false; // Desactivar Playlist
    } else {
        isAutoplayPlaylist = true; // Por defecto volvemos a playlist
    }
    
    // Actualizar UI
    const loopBtn = document.getElementById('jb-looptrack-btn');
    if(loopBtn) loopBtn.classList.toggle('active', isLoopingTrack);
};

// CONTROL DE PLAYLIST
window.playNextTrack = function() {
    if (jukeboxPlaylist.length === 0) return;
    
    const nextIndex = currentPlaylistIndex + 1;
    if (nextIndex < jukeboxPlaylist.length) {
        currentPlaylistIndex = nextIndex;
        const nextSong = jukeboxPlaylist[currentPlaylistIndex];
        console.log("Reproduciendo siguiente:", nextSong.title);
        window.openJukeboxPlayer(nextSong.title, nextSong.url);
    } else {
        console.log("Fin de la lista de reproducción.");
    }
};

window.playPrevTrack = function() {
    if (jukeboxPlaylist.length === 0) return;
    
    const prevIndex = currentPlaylistIndex - 1;
    if (prevIndex >= 0) {
        currentPlaylistIndex = prevIndex;
        const prevSong = jukeboxPlaylist[currentPlaylistIndex];
        console.log("Reproduciendo anterior:", prevSong.title);
        window.openJukeboxPlayer(prevSong.title, prevSong.url);
    }
};

// 1. SPEED
window.cycleSpeed = function() {
    const speeds = [1.0, 0.75, 0.5, 1.25];
    const currentIndex = speeds.indexOf(currentSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    currentSpeed = speeds[nextIndex];

    window.applyPlaybackRate();

    const btn = document.getElementById('jb-speed-btn');
    if(btn) btn.textContent = currentSpeed + 'x';
};

// 2. PITCH
window.changePitch = function(delta) {
    if (currentJukeboxType !== 'html5') return;
    currentSemitones += delta;
    window.updatePitchDisplay();
    window.applyPlaybackRate();
    
    if(currentSongKey) {
        jukeboxPitch[currentSongKey] = currentSemitones;
        window.saveJukeboxLibrary(); 
    }
};

window.updatePitchDisplay = function() {
    const display = document.getElementById('jb-pitch-val');
    if(display) {
        let sign = currentSemitones > 0 ? '+' : '';
        display.textContent = sign + currentSemitones;
        display.style.color = currentSemitones !== 0 ? '#ff9800' : '#0cf';
    }
};

window.applyPlaybackRate = function() {
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        const pitchMultiplier = Math.pow(2, currentSemitones / 12);
        const finalRate = currentSpeed * pitchMultiplier;
        currentAudioObj.playbackRate = finalRate;
    }
    if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
        ytPlayer.setPlaybackRate(currentSpeed);
    }
};

// 3. NOTES
window.toggleNotesPanel = function() {
    const panel = document.getElementById('jukebox-notes-panel');
    const btn = document.getElementById('jb-notes-btn');
    if(!panel) return;

    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        if(btn) btn.classList.remove('active');
    } else {
        panel.style.display = 'block';
        if(btn) btn.classList.add('active');
        const ta = document.getElementById('jb-song-notes-input');
        if(ta && ta.value === "") ta.focus();
    }
};

// 4. VOLUMEN
window.setJukeboxVolume = function(val) {
    currentVolume = parseInt(val, 10);
    
    const slider = document.getElementById('jb-volume-slider');
    if(slider && parseInt(slider.value, 10) !== currentVolume) {
        slider.value = currentVolume;
    }

    if(currentVolume > 0 && isMuted) {
        isMuted = false;
        window.updateMuteIcon();
    }
    if(currentVolume === 0 && !isMuted) {
        isMuted = true;
        window.updateMuteIcon();
    }

    if (currentJukeboxType === 'html5' && currentAudioObj) {
        try {
            const vol = Math.max(0, Math.min(1, currentVolume / 100));
            if (isFinite(vol)) currentAudioObj.volume = vol;
        } catch(e) {}
    }
    
    if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        try { ytPlayer.setVolume(currentVolume); } catch(e) {}
    }
};

window.toggleJukeboxMute = function() {
    isMuted = !isMuted;
    if(isMuted) {
        preMuteVolume = currentVolume > 0 ? currentVolume : 100;
        currentVolume = 0;
    } else {
        currentVolume = preMuteVolume;
    }
    window.setJukeboxVolume(currentVolume);
};

window.updateMuteIcon = function() {
    const btn = document.getElementById('jb-mute-btn');
    if(!btn) return;
    
    if(isMuted || currentVolume === 0) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
        btn.classList.add('muted');
    } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
        btn.classList.remove('muted');
    }
};

// 5. MINIMIZE
window.toggleMinimize = function() {
    const bar = document.getElementById('jukebox-player-bar');
    const btn = document.getElementById('jb-minimize-btn');
    if(!bar) return;

    isMinimized = !isMinimized;
    if(isMinimized) {
        bar.classList.add('minimized');
        if(btn) btn.innerHTML = '&#9633;'; 
    } else {
        bar.classList.remove('minimized');
        if(btn) btn.innerHTML = '&#95;'; 
    }
};

// 6. OFFSET
window.setStartOffset = function() {
    if(!currentSongKey) return;
    const time = window.getCurrentTime();
    const btn = document.getElementById('jb-offset-btn');

    if (time < 1.0) {
        if (jukeboxOffsets[currentSongKey]) {
            delete jukeboxOffsets[currentSongKey];
            window.saveJukeboxLibrary();
            alert("Inicio restablecido a 0:00");
            if(btn) {
                btn.classList.remove('active');
                btn.innerHTML = '<span>⏱</span> Inicio';
            }
        }
    } else {
        jukeboxOffsets[currentSongKey] = time;
        window.saveJukeboxLibrary();
        alert(`Inicio fijado en ${window.formatTime(time)}.`);
        if(btn) {
            btn.classList.add('active');
            btn.innerHTML = '<span>⏱</span> ' + Math.floor(time) + 's';
        }
    }
};

/* --- 4. LÓGICA DE BUCLE (LOOP A-B) --- */

window.setLoopA = function() {
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        jukeboxLoopA = currentAudioObj.currentTime;
        const btnA = document.getElementById('jb-loop-a');
        const btnB = document.getElementById('jb-loop-b');
        if(btnA) btnA.classList.add('active');
        if(btnB) btnB.disabled = false;
        if (jukeboxLoopB !== null && jukeboxLoopB <= jukeboxLoopA) {
            jukeboxLoopB = null;
            if(btnB) btnB.classList.remove('active');
        }
        window.updateLoopDisplay();
    }
};

window.setLoopB = function() {
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        if (jukeboxLoopA === null) return;
        if (currentAudioObj.currentTime > jukeboxLoopA) {
            jukeboxLoopB = currentAudioObj.currentTime;
            const btnB = document.getElementById('jb-loop-b');
            const btnClear = document.getElementById('jb-loop-clear');
            if(btnB) btnB.classList.add('active');
            if(btnClear) btnClear.style.display = 'inline-block';
            window.updateLoopDisplay();
            currentAudioObj.currentTime = jukeboxLoopA;
            if(currentAudioObj.paused) currentAudioObj.play();
        } else {
            alert("El punto B debe ser posterior al punto A");
        }
    }
};

window.clearLoop = function() {
    jukeboxLoopA = null;
    jukeboxLoopB = null;
    const btnA = document.getElementById('jb-loop-a');
    const btnB = document.getElementById('jb-loop-b');
    const btnClear = document.getElementById('jb-loop-clear');
    if(btnA) btnA.classList.remove('active');
    if(btnB) {
        btnB.classList.remove('active');
        btnB.disabled = true;
    }
    if(btnClear) btnClear.style.display = 'none';
    window.updateLoopDisplay();
};

window.updateLoopDisplay = function() {
    const display = document.getElementById('jb-loop-status');
    if(!display) return;
    const fmt = (s) => {
        if (isNaN(s) || s === null) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, "0")}`;
    };
    if (jukeboxLoopA !== null && jukeboxLoopB !== null) {
        display.textContent = `${fmt(jukeboxLoopA)} <-> ${fmt(jukeboxLoopB)}`;
        display.style.display = 'inline-block';
    } else if (jukeboxLoopA !== null) {
        display.textContent = `${fmt(jukeboxLoopA)} -> ...`;
        display.style.display = 'inline-block';
    } else {
        display.textContent = "";
        display.style.display = 'none';
    }
};

/* --- 5. LOGICA DE MARCADORES (BOOKMARKS) --- */

window.getCurrentTime = function() {
    if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        return ytPlayer.getCurrentTime();
    }
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        return currentAudioObj.currentTime;
    }
    return 0;
};

window.addMarker = function() {
    if (!currentSongKey) return;
    const wasPlaying = isJukeboxPlaying || (currentAudioObj && !currentAudioObj.paused);
    if (wasPlaying) window.togglePlayPauseJukebox();

    const time = window.getCurrentTime();
    pendingMarkerState = { time: time, wasPlaying: wasPlaying };

    const modal = document.getElementById('marker-input-modal');
    const input = document.getElementById('marker-name-input');
    if (modal && input) {
        input.value = `Marcador en ${window.formatTime(time)}`;
        modal.classList.add('show');
        input.focus();
        input.select();
    }
};

window.closeMarkerModal = function() {
    const modal = document.getElementById('marker-input-modal');
    if (modal) modal.classList.remove('show');
    if (pendingMarkerState && pendingMarkerState.wasPlaying) {
        window.togglePlayPauseJukebox();
    }
    pendingMarkerState = null;
};

window.confirmAddMarker = function() {
    const input = document.getElementById('marker-name-input');
    const label = input ? input.value.trim() : "Marcador";
    if (pendingMarkerState && currentSongKey) {
        if (!jukeboxMarkers[currentSongKey]) jukeboxMarkers[currentSongKey] = [];
        jukeboxMarkers[currentSongKey].push({ time: pendingMarkerState.time, label: label });
        jukeboxMarkers[currentSongKey].sort((a, b) => a.time - b.time);
        window.saveJukeboxLibrary(); 
        window.renderMarkers();
    }
    const wasPlaying = pendingMarkerState ? pendingMarkerState.wasPlaying : false;
    const modal = document.getElementById('marker-input-modal');
    if (modal) modal.classList.remove('show');
    if (wasPlaying) window.togglePlayPauseJukebox();
    pendingMarkerState = null;
};

window.deleteMarker = function(index) {
    if (!currentSongKey || !jukeboxMarkers[currentSongKey]) return;
    if (confirm("¿Borrar marcador?")) {
        jukeboxMarkers[currentSongKey].splice(index, 1);
        window.saveJukeboxLibrary();
        window.renderMarkers();
    }
};

window.jumpToMarker = function(time) {
    if (currentJukeboxType === 'youtube' && ytPlayer) {
        ytPlayer.seekTo(time, true);
    } else if (currentJukeboxType === 'html5' && currentAudioObj) {
        currentAudioObj.currentTime = time;
    }
};

window.renderMarkers = function() {
    const list = document.getElementById('jb-markers-list');
    if (!list) return;
    list.innerHTML = "";
    
    if (!currentSongKey || !jukeboxMarkers[currentSongKey] || jukeboxMarkers[currentSongKey].length === 0) {
        list.innerHTML = "<div style='color:#666; font-size:0.8em; text-align:center; padding:5px;'>Sin marcadores</div>";
        return;
    }

    jukeboxMarkers[currentSongKey].forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'marker-item';
        
        const info = document.createElement('div');
        info.className = 'marker-info';
        info.onclick = () => window.jumpToMarker(m.time);
        
        info.innerHTML = `
            <span class="marker-time">${window.formatTime(m.time)}</span>
            <span class="marker-label" title="${m.label}">${m.label}</span>
        `;

        const delBtn = document.createElement('button');
        delBtn.className = 'marker-del-btn';
        delBtn.innerHTML = '×';
        delBtn.title = "Borrar";
        delBtn.onclick = (e) => { e.stopPropagation(); window.deleteMarker(idx); };

        item.appendChild(info);
        item.appendChild(delBtn);
        list.appendChild(item);
    });
};

window.formatTime = function(s) {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
};

/* --- 6. LOOP DE PROGRESO --- */

window.startJukeboxProgressLoop = function() {
    if (jukeboxCheckInterval) clearInterval(jukeboxCheckInterval);
    jukeboxCheckInterval = setInterval(() => {
        let curr = 0, total = 0;
        if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            try { curr = ytPlayer.getCurrentTime(); total = ytPlayer.getDuration(); } catch(e) {}
        } else if (currentJukeboxType === 'html5' && currentAudioObj) {
            curr = currentAudioObj.currentTime;
            total = currentAudioObj.duration;
            if (jukeboxLoopA !== null && jukeboxLoopB !== null) {
                if (curr >= jukeboxLoopB) {
                    currentAudioObj.currentTime = jukeboxLoopA;
                    curr = jukeboxLoopA; 
                    if(currentAudioObj.paused) currentAudioObj.play();
                }
            }
        }
        if (total > 0) {
            const pct = (curr / total) * 100;
            const prog = document.getElementById('jb-progress');
            const curT = document.getElementById('jb-current-time');
            const totT = document.getElementById('jb-total-time');
            if(prog) prog.value = pct;
            if(curT) curT.textContent = window.formatTime(curr);
            if(totT) totT.textContent = window.formatTime(total);
        }
    }, 100); 
};

window.stopJukeboxProgressLoop = function() {
    if (jukeboxCheckInterval) clearInterval(jukeboxCheckInterval);
};

document.addEventListener("DOMContentLoaded", () => {
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
    const rewindBtn = document.getElementById('jb-rewind');
    if(rewindBtn) rewindBtn.onclick = () => { 
        const val = parseFloat(document.getElementById('jb-progress').value) || 0;
        window.seekJukebox(val - 5); 
    };
    const fwdBtn = document.getElementById('jb-forward');
    if(fwdBtn) fwdBtn.onclick = () => { 
        const val = parseFloat(document.getElementById('jb-progress').value) || 0;
        window.seekJukebox(val + 5); 
    };
    const btnLoopA = document.getElementById('jb-loop-a');
    if(btnLoopA) btnLoopA.onclick = window.setLoopA;
    const btnLoopB = document.getElementById('jb-loop-b');
    if(btnLoopB) btnLoopB.onclick = window.setLoopB;
    const btnLoopClear = document.getElementById('jb-loop-clear');
    if(btnLoopClear) btnLoopClear.onclick = window.clearLoop;
    const btnAddMarker = document.getElementById('jb-add-marker');
    if(btnAddMarker) btnAddMarker.onclick = window.addMarker;
    const btnCancelMarker = document.getElementById('cancel-marker-btn');
    if(btnCancelMarker) btnCancelMarker.onclick = window.closeMarkerModal;
    const btnConfirmMarker = document.getElementById('confirm-marker-btn');
    if(btnConfirmMarker) btnConfirmMarker.onclick = window.confirmAddMarker;
});
