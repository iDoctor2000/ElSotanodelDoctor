/* 
   JUKEBOX.JS
   Lógica separada para el reproductor de audio, YouTube API, Google Drive y Dropbox
   + Marcadores (Bookmarks)
   + Inyección UI: Velocidad, Minimizar, Start Offset
   + NUEVO: Pitch Shifter (Cambio de Tono)
   + NUEVO: Notas por Canción (Sticky Notes)
*/

// Variables Globales del Jukebox
let jukeboxLibrary = {}; 
let jukeboxMarkers = {}; 
let jukeboxOffsets = {}; 
let jukeboxNotes = {}; // NUEVO: Notas de texto
let jukeboxPitch = {}; // NUEVO: Ajuste de tono (semitonos)

let ytPlayer = null;
let isJukeboxPlaying = false;
let jukeboxCheckInterval = null;
let currentJukeboxType = null; 
let currentAudioObj = null; 
let currentSongKey = null; 

// Variables de Estado de Reproducción
let currentSpeed = 1.0;
let currentSemitones = 0; // Semitonos (+/-)
let isMinimized = false;

// Variables Bucle A-B
let jukeboxLoopA = null;
let jukeboxLoopB = null;

// Variable de estado para el modal de marcadores
let pendingMarkerState = null;

// Helper para sanitize
const sanitizeJukeboxKey = (str) => str.replace(/[.#$[\]/:\s,]/g, '_');

// Exponer funciones al objeto window
window.jukeboxLibrary = jukeboxLibrary;

/* --- 0. INYECCIÓN DE ESTILOS Y UI (NO TOCAR INDEX.HTML) --- */

window.injectJukeboxStyles = function() {
    const styleId = 'jukebox-extra-styles';
    if (document.getElementById(styleId)) return;

    const css = `
        /* Botones Extra Generales */
        .jukebox-extra-btn {
            font-size: 0.8em; font-weight: bold; color: #0cf; 
            border: 1px solid #0cf; background: rgba(0,0,0,0.3);
            border-radius: 4px; padding: 4px 6px; cursor: pointer;
            text-align: center; margin-left: 8px; min-width: 35px;
            display: flex; align-items: center; justify-content: center; gap: 4px;
        }
        .jukebox-extra-btn:hover { background: #0cf; color: #000; }
        .jukebox-extra-btn.active { background: #0cf; color: #000; box-shadow: 0 0 8px #0cf; }

        /* Botón Minimizar */
        .jukebox-minimize-btn {
            background: none; border: none; color: #aaa; cursor: pointer; 
            font-size: 1.2em; padding: 0 8px; line-height: 1; margin-right: 5px;
        }
        .jukebox-minimize-btn:hover { color: #fff; }

        /* PITCH CONTROLS (NUEVO) */
        .jukebox-pitch-wrapper {
            display: flex; align-items: center; margin-left: 10px;
            background: rgba(255,255,255,0.05); border-radius: 4px; padding: 2px;
            border: 1px solid #444;
        }
        .jb-pitch-btn {
            background: none; border: none; color: #aaa; cursor: pointer;
            font-size: 1em; padding: 2px 6px; font-weight: bold;
        }
        .jb-pitch-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .jb-pitch-display {
            font-family: monospace; font-size: 0.9em; color: #0cf; 
            min-width: 25px; text-align: center; margin: 0 2px;
        }
        .jb-pitch-label { font-size: 0.7em; color: #666; margin-right: 4px; margin-left: 4px; }

        /* NOTES AREA (NUEVO) */
        #jukebox-notes-panel {
            width: 100%; margin-top: 10px; display: none;
            border-top: 1px solid #333; padding-top: 10px;
            animation: slideDown 0.2s ease-out;
        }
        #jukebox-notes-panel textarea {
            width: 100%; min-height: 80px; background: #111; color: #ddd;
            border: 1px solid #333; border-radius: 4px; padding: 8px;
            font-family: sans-serif; font-size: 0.9em; resize: vertical;
        }
        #jukebox-notes-panel textarea:focus { border-color: #0cf; outline: none; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

        /* Estilos Modo Minimizado */
        #jukebox-player-bar.minimized {
            top: auto !important; bottom: 0 !important; left: 0 !important;
            transform: none !important;
            width: 100% !important; max-width: 100% !important;
            border-radius: 0 !important;
            border-top: 1px solid #0cf; border-bottom: none; border-left: none; border-right: none;
            padding: 10px 20px !important;
            flex-direction: row; flex-wrap: wrap; justify-content: space-between;
        }
        #jukebox-player-bar.minimized .jukebox-info { width: auto; margin-bottom: 0; flex: 1; margin-right: 10px; }
        #jukebox-player-bar.minimized .jukebox-loop-area,
        #jukebox-player-bar.minimized .jukebox-markers-area,
        #jukebox-player-bar.minimized .jukebox-progress-container,
        #jukebox-player-bar.minimized #jukebox-notes-panel, 
        #jukebox-player-bar.minimized .jukebox-pitch-wrapper {
            display: none !important; 
        }
        #jukebox-player-bar.minimized .jukebox-controls { gap: 10px; }
        
        @media(max-width: 768px) {
            #jukebox-player-bar.minimized { padding: 10px !important; }
            #jukebox-player-bar.minimized .jukebox-song-title { font-size: 0.9em; max-width: 150px; }
            .jukebox-pitch-wrapper { margin-left: 5px; }
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
    const controlsArea = document.getElementById('jukebox-std-controls');

    if (!playerBar || !infoArea || !controlsArea) return;

    // 1. Botón Minimizar (Header)
    if (!document.getElementById('jb-minimize-btn')) {
        const minBtn = document.createElement('button');
        minBtn.id = 'jb-minimize-btn';
        minBtn.className = 'jukebox-minimize-btn';
        minBtn.innerHTML = '&#95;'; 
        minBtn.title = "Minimizar / Restaurar";
        minBtn.onclick = window.toggleMinimize;
        infoArea.insertBefore(minBtn, closeBtn);
    }

    // 2. Botón Notas (Controls)
    if (!document.getElementById('jb-notes-btn')) {
        const notesBtn = document.createElement('button');
        notesBtn.id = 'jb-notes-btn';
        notesBtn.className = 'jukebox-extra-btn';
        notesBtn.innerHTML = '📝'; 
        notesBtn.title = "Notas de la canción";
        notesBtn.onclick = window.toggleNotesPanel;
        controlsArea.appendChild(notesBtn);
    }

    // 3. Botón Start Offset (Controls)
    if (!document.getElementById('jb-offset-btn')) {
        const offsetBtn = document.createElement('button');
        offsetBtn.id = 'jb-offset-btn';
        offsetBtn.className = 'jukebox-extra-btn';
        offsetBtn.innerHTML = '⏱'; 
        offsetBtn.title = "Fijar inicio aquí. Click largo o en 0:00 para borrar.";
        offsetBtn.onclick = window.setStartOffset;
        controlsArea.appendChild(offsetBtn);
    }

    // 4. Botón Velocidad (Controls)
    if (!document.getElementById('jb-speed-btn')) {
        const speedBtn = document.createElement('button');
        speedBtn.id = 'jb-speed-btn';
        speedBtn.className = 'jukebox-extra-btn';
        speedBtn.textContent = '1.0x';
        speedBtn.title = "Cambiar Velocidad";
        speedBtn.onclick = window.cycleSpeed;
        controlsArea.appendChild(speedBtn);
    }

    // 5. Controles de PITCH (Change Key)
    if (!document.getElementById('jb-pitch-controls')) {
        const wrapper = document.createElement('div');
        wrapper.id = 'jb-pitch-controls';
        wrapper.className = 'jukebox-pitch-wrapper';
        wrapper.title = "Cambiar Tono (Semitonos). Solo funciona con Dropbox/Drive (Audio HTML5).";
        
        wrapper.innerHTML = `
            <span class="jb-pitch-label">Key</span>
            <button class="jb-pitch-btn" onclick="window.changePitch(-1)">♭</button>
            <span id="jb-pitch-val" class="jb-pitch-display">0</span>
            <button class="jb-pitch-btn" onclick="window.changePitch(1)">♯</button>
        `;
        controlsArea.appendChild(wrapper);
    }

    // 6. Panel de Notas (Inyectado al final del player)
    if (!document.getElementById('jukebox-notes-panel')) {
        const notesPanel = document.createElement('div');
        notesPanel.id = 'jukebox-notes-panel';
        notesPanel.innerHTML = `
            <textarea id="jb-song-notes-input" placeholder="Escribe aquí notas sobre el audio (ej: Solo empieza en 2:30, versión diferente, etc)..."></textarea>
        `;
        // Insertar antes del contenedor de iframe
        const iframeContainer = document.getElementById('jukebox-iframe-container');
        playerBar.insertBefore(notesPanel, iframeContainer);

        // Auto-save listener
        const textarea = notesPanel.querySelector('textarea');
        textarea.addEventListener('input', () => {
            if(currentSongKey) {
                jukeboxNotes[currentSongKey] = textarea.value;
                // Debounce save? For simplicity, we save on blur or manually, 
                // but let's save on blur to avoid too many writes.
            }
        });
        textarea.addEventListener('blur', window.saveJukeboxLibrary);
    }
};

/* --- 1. GESTIÓN DE LIBRERÍA (FIRESTORE) --- */

window.loadJukeboxLibrary = async function() {
    try {
        if (typeof window.loadDoc === 'function') {
            // Cargar todos los campos nuevos
            const data = await window.withRetry(() => window.loadDoc("intranet", "jukebox_library", { mapping: {}, markers: {}, offsets: {}, notes: {}, pitch: {} }));
            window.jukeboxLibrary = data.mapping || {};
            jukeboxMarkers = data.markers || {};
            jukeboxOffsets = data.offsets || {};
            jukeboxNotes = data.notes || {};
            jukeboxPitch = data.pitch || {}; // Cargar tonos guardados
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
            'onError': onPlayerError
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
        if (event.data == YT.PlayerState.ENDED) window.stopJukeboxProgressLoop();
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
        return url.replace('dl=0', 'raw=1').replace('dl=1', 'raw=1');
    }
    return null;
};

window.openJukeboxPlayer = function(title, rawUrl) {
    currentSongKey = sanitizeJukeboxKey(title);

    const playerBar = document.getElementById('jukebox-player-bar');
    const titleEl = document.getElementById('jukebox-current-title');
    const stdControls = document.getElementById('jukebox-std-controls');
    const stdProgress = document.getElementById('jukebox-std-progress');
    const iframeContainer = document.getElementById('jukebox-iframe-container');
    const loopControls = document.querySelector('.jukebox-loop-area');
    const markersArea = document.getElementById('jukebox-markers-area');
    const notesPanel = document.getElementById('jukebox-notes-panel');
    const pitchControls = document.getElementById('jb-pitch-controls');
    
    // 1. Reset UI States
    currentSpeed = 1.0;
    const speedBtn = document.getElementById('jb-speed-btn');
    if(speedBtn) speedBtn.textContent = '1.0x';

    // 2. Load Saved Offset
    const savedOffset = jukeboxOffsets[currentSongKey] || 0;
    const offsetBtn = document.getElementById('jb-offset-btn');
    if(offsetBtn) {
        if(savedOffset > 0) {
            offsetBtn.classList.add('active');
            offsetBtn.innerHTML = '⏱ ' + Math.floor(savedOffset) + 's';
        } else {
            offsetBtn.classList.remove('active');
            offsetBtn.innerHTML = '⏱';
        }
    }

    // 3. Load Saved Notes
    const savedNote = jukeboxNotes[currentSongKey] || "";
    const notesInput = document.getElementById('jb-song-notes-input');
    if(notesInput) notesInput.value = savedNote;
    if(notesPanel) notesPanel.style.display = 'none'; // Start closed
    const notesBtn = document.getElementById('jb-notes-btn');
    if(notesBtn) {
        notesBtn.classList.remove('active');
        if(savedNote) notesBtn.style.color = '#FFD700'; // Gold if has notes
        else notesBtn.style.color = '#0cf';
    }

    // 4. Load Saved Pitch
    currentSemitones = jukeboxPitch[currentSongKey] || 0;
    window.updatePitchDisplay();

    // Pausar música de fondo
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

    // CONFIGURACIÓN DE VISTAS
    // Dropbox/Drive -> HTML5 -> Soporta Pitch
    // YouTube -> YT API -> NO Soporta Pitch (ocultar controles)

    // 1. DROPBOX
    if (dropboxLink) {
         currentJukeboxType = 'html5';
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';
         if(pitchControls) pitchControls.style.display = 'flex'; // Pitch ON
         window.setupHtml5Audio(dropboxLink, false, savedOffset);

    // 2. DRIVE
    } else if (driveDirectLink) {
         currentJukeboxType = 'html5';
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';
         if(pitchControls) pitchControls.style.display = 'flex'; // Pitch ON
         window.setupHtml5Audio(driveDirectLink, true, savedOffset); 

    // 3. YOUTUBE
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        currentJukeboxType = 'youtube';
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none'; 
        if(markersArea) markersArea.style.display = 'block';
        if(pitchControls) pitchControls.style.display = 'none'; // Pitch OFF for YT

        let videoId = "";
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length == 11) { videoId = match[2]; }
        else { alert("Link de YouTube no válido"); return; }

        const ytConfig = { videoId: videoId };
        if (savedOffset > 0) ytConfig.startSeconds = savedOffset;

        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById(ytConfig);
            ytPlayer.playVideo();
            ytPlayer.setPlaybackRate(1.0);
        } else {
            setTimeout(() => {
                if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                    ytPlayer.loadVideoById(ytConfig);
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
        if(pitchControls) pitchControls.style.display = 'flex'; // Pitch ON
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

    // CRITICAL: Allow pitch change by sacrificing speed accuracy
    currentAudioObj.preservesPitch = false; 
    currentAudioObj.mozPreservesPitch = false; 
    currentAudioObj.webkitPreservesPitch = false;

    currentAudioObj.src = srcUrl;
    
    // Aplicar Pitch inicial + Speed inicial
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
        console.error("Error cargando audio HTML5:", currentAudioObj.error);
        if (isDriveFallback) {
            console.warn("Fallo carga directa Drive. Cambiando a modo Iframe.");
            window.switchToDriveIframeMode();
        } else {
            alert("Error al cargar el audio. Verifica el enlace.");
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
    currentAudioObj.onended = () => { window.stopJukeboxProgressLoop(); };
};

window.switchToDriveIframeMode = function() {
    // Modo Iframe NO soporta Pitch ni Speed
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
        const pitchControls = document.getElementById('jb-pitch-controls');

        stdControls.style.display = 'none';
        stdProgress.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none';
        if(markersArea) markersArea.style.display = 'none'; 
        if(pitchControls) pitchControls.style.display = 'none';
        
        iframeContainer.style.display = 'block';
        iframeEl.src = previewUrl;
        
        const titleEl = document.getElementById('jukebox-current-title');
        titleEl.innerHTML += " <span style='color:orange; font-size:0.7em;'>(Modo Compatible - Sin Extras)</span>";
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

/* --- FUNCIONES EXTENDIDAS (Velocidad, Notas, Pitch, Offset) --- */

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

// 2. PITCH (HTML5 Only)
window.changePitch = function(delta) {
    if (currentJukeboxType !== 'html5') {
        alert("El cambio de tono solo funciona con archivos de Dropbox/Drive (HTML5).");
        return;
    }
    currentSemitones += delta;
    window.updatePitchDisplay();
    window.applyPlaybackRate();
    
    // Guardar preferencia
    if(currentSongKey) {
        jukeboxPitch[currentSongKey] = currentSemitones;
        window.saveJukeboxLibrary(); // Save pitch pref
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

// Lógica central de cálculo de velocidad
window.applyPlaybackRate = function() {
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        // FORMULA: Rate = Speed * 2^(semitones/12)
        // Si preservesPitch = false, cambiar Rate cambia Tono.
        const pitchMultiplier = Math.pow(2, currentSemitones / 12);
        const finalRate = currentSpeed * pitchMultiplier;
        
        currentAudioObj.preservesPitch = false; // CRUCIAL
        currentAudioObj.mozPreservesPitch = false;
        currentAudioObj.webkitPreservesPitch = false;
        
        currentAudioObj.playbackRate = finalRate;
    }
    
    if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
        // YouTube solo soporta Speed, no Pitch shift
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
        // Enfocar si está vacío
        const ta = document.getElementById('jb-song-notes-input');
        if(ta && ta.value === "") ta.focus();
    }
};

// 4. MINIMIZE
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

// 5. OFFSET
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
                btn.innerHTML = '⏱';
            }
        }
    } else {
        jukeboxOffsets[currentSongKey] = time;
        window.saveJukeboxLibrary();
        alert(`Inicio fijado en ${window.formatTime(time)}.`);
        if(btn) {
            btn.classList.add('active');
            btn.innerHTML = '⏱ ' + Math.floor(time) + 's';
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
