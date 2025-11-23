/* 
   JUKEBOX.JS
   Lógica separada para el reproductor de audio, YouTube API, Google Drive y Dropbox
   + Funcionalidad de Marcadores
*/

// Variables Globales del Jukebox
let jukeboxLibrary = {}; 
let jukeboxMarkers = {}; // NUEVA VARIABLE PARA MARCADORES
let ytPlayer = null;
let isJukeboxPlaying = false;
let jukeboxCheckInterval = null;
let currentJukeboxType = null; // 'youtube', 'html5', or 'drive-iframe'
let currentAudioObj = null; 
let currentSongKey = null; // Para saber a qué canción asociar el marcador

// Variables Bucle A-B
let jukeboxLoopA = null;
let jukeboxLoopB = null;

// Variable de estado para el nuevo marcador (modal)
let pendingMarkerState = null;

// Helper para sanitize (copiado aquí para evitar dependencias)
const sanitizeJukeboxKey = (str) => str.replace(/[.#$[\]/:\s,]/g, '_');

// Exponer funciones al objeto window para que funcionen los onclick del HTML
window.jukeboxLibrary = jukeboxLibrary;

/* --- 1. GESTIÓN DE LIBRERÍA (FIRESTORE) --- */

// Cargar librería
window.loadJukeboxLibrary = async function() {
    try {
        if (typeof window.loadDoc === 'function') {
            const data = await window.withRetry(() => window.loadDoc("intranet", "jukebox_library", { mapping: {}, markers: {} }));
            window.jukeboxLibrary = data.mapping || {};
            jukeboxMarkers = data.markers || {}; // Cargamos marcadores
            console.log("Jukebox Library cargada:", Object.keys(window.jukeboxLibrary).length, "canciones.");
        }
    } catch (e) { console.error("Error cargando Jukebox Library:", e); }
};

// Guardar librería
window.saveJukeboxLibrary = async function() {
    try {
        if (typeof window.saveDoc === 'function') {
            // Guardamos ambos objetos
            await window.withRetry(() => window.saveDoc("intranet", "jukebox_library", { 
                mapping: window.jukeboxLibrary,
                markers: jukeboxMarkers 
            }));
            return true;
        }
    } catch (e) { console.error("Error guardando Jukebox:", e); return false; }
};

/* --- 2. YOUTUBE API --- */

window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube API Ready");
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

// Helper: Convertir enlace de Drive a Directo (Intento)
window.convertDriveToDirectLink = function(url) {
    let id = null;
    const parts = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (parts && parts[1]) {
        id = parts[1];
    } else {
        const parts2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (parts2 && parts2[1]) id = parts2[1];
    }
    
    if (id) {
        // Usamos un proxy de google docs que suele ir mejor para streaming que drive.google.com
        return `https://docs.google.com/uc?export=download&id=${id}`;
    }
    return null;
};

// Helper: Convertir enlace de Dropbox a Directo (NUEVO)
window.convertDropboxLink = function(url) {
    // Reemplaza dl=0 por raw=1 para streaming directo
    if (url.includes('dropbox.com')) {
        return url.replace('dl=0', 'raw=1').replace('dl=1', 'raw=1');
    }
    return null;
};

window.openJukeboxPlayer = function(title, rawUrl) {
    currentSongKey = sanitizeJukeboxKey(title); // Guardar referencia para marcadores

    const playerBar = document.getElementById('jukebox-player-bar');
    const titleEl = document.getElementById('jukebox-current-title');
    const stdControls = document.getElementById('jukebox-std-controls');
    const stdProgress = document.getElementById('jukebox-std-progress');
    const iframeContainer = document.getElementById('jukebox-iframe-container');
    const loopControls = document.querySelector('.jukebox-loop-area');
    const markersArea = document.getElementById('jukebox-markers-area');
    const iframeEl = document.getElementById('jb-iframe');

    // Pausar música de fondo del sitio si suena
    const siteAudio = document.getElementById('site-audio');
    if(siteAudio && !siteAudio.paused) siteAudio.pause();

    // Reset previous
    window.stopJukebox();
    window.clearLoop(); 
    
    // Renderizar marcadores de la canción actual
    window.renderMarkers();

    playerBar.classList.add('visible');
    titleEl.textContent = title;
    
    const url = rawUrl.trim();
    let driveDirectLink = window.convertDriveToDirectLink(url);
    let dropboxLink = window.convertDropboxLink(url);

    // 1. Detect DROPBOX (LA MEJOR OPCIÓN PARA LOOP)
    if (dropboxLink) {
         console.log("Dropbox Link detectado:", dropboxLink);
         currentJukeboxType = 'html5';
         
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';

         window.setupHtml5Audio(dropboxLink);

    // 2. Detect Google Drive
    } else if (driveDirectLink) {
         console.log("Drive Link detectado. Intentando modo híbrido.");
         // Intentamos cargar en HTML5 primero para que funcione el Loop.
         // Si falla, el 'onerror' del audio cambiará al modo Iframe.
         currentJukeboxType = 'html5';
         
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';
         if(markersArea) markersArea.style.display = 'block';

         window.setupHtml5Audio(driveDirectLink, true); // 'true' activa el fallback a iframe

    // 3. Detect YouTube
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        currentJukeboxType = 'youtube';
        
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none'; // No loops para YT
        if(markersArea) markersArea.style.display = 'block'; // Marcadores sí en YT

        let videoId = "";
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length == 11) { videoId = match[2]; }
        else { alert("Link de YouTube no válido"); return; }

        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById(videoId);
            ytPlayer.playVideo();
        } else {
            setTimeout(() => {
                if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                    ytPlayer.loadVideoById(videoId);
                    ytPlayer.playVideo();
                } else { alert("YouTube API no lista."); }
            }, 1000);
        }

    // 4. Detect Generic HTML5 (MP3 hosting propio)
    } else {
        currentJukeboxType = 'html5';
        
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'flex';
        if(markersArea) markersArea.style.display = 'block';

        window.setupHtml5Audio(url);
    }
};

window.setupHtml5Audio = function(srcUrl, isDriveFallback = false) {
    currentAudioObj = document.getElementById('jukebox-audio-element');
    if(!currentAudioObj) return;

    currentAudioObj.pause();
    currentAudioObj.removeAttribute('src');
    currentAudioObj.load(); 
    
    currentAudioObj.src = srcUrl;
    currentAudioObj.load(); 
    
    const playPromise = currentAudioObj.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Auto-play HTML5 falló:", error);
        });
    }

    // Manejo de errores de carga (Crucial para Drive)
    currentAudioObj.onerror = function() {
        console.error("Error cargando audio HTML5:", currentAudioObj.error);
        
        if (isDriveFallback) {
            console.warn("Fallo carga directa Drive. Cambiando a modo Iframe (seguro).");
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

// Fallback para Drive: Si falla el audio directo, usamos el iframe visual
window.switchToDriveIframeMode = function() {
    // Vamos a intentar extraer el ID de la URL fallida (src)
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

        stdControls.style.display = 'none';
        stdProgress.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none';
        if(markersArea) markersArea.style.display = 'none'; // Iframe no soporta tiempo exacto
        
        iframeContainer.style.display = 'block';
        iframeEl.src = previewUrl;
        
        // Aviso visual
        const titleEl = document.getElementById('jukebox-current-title');
        titleEl.innerHTML += " <span style='color:orange; font-size:0.7em;'>(Modo Compatible - Sin Extras)</span>";
    } else {
        alert("El archivo de Drive no se puede reproducir. Intenta usar Dropbox.");
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
            
            // Feedback: Saltar al inicio del bucle
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

// --- NUEVA FUNCIÓN CON MODAL ---
window.addMarker = function() {
    if (!currentSongKey) return;
    
    // Pausar automáticamente para mejorar UX
    const wasPlaying = isJukeboxPlaying || (currentAudioObj && !currentAudioObj.paused);
    if (wasPlaying) window.togglePlayPauseJukebox();

    const time = window.getCurrentTime();
    
    // Guardamos el estado en una variable para usarla al confirmar el modal
    pendingMarkerState = {
        time: time,
        wasPlaying: wasPlaying
    };

    // Mostrar el modal
    const modal = document.getElementById('marker-input-modal');
    const input = document.getElementById('marker-name-input');
    
    if (modal && input) {
        input.value = `Marcador en ${window.formatTime(time)}`;
        modal.classList.add('show');
        input.focus();
        // Intentar seleccionar todo el texto para fácil edición
        input.select();
    }
};

// Función interna para cerrar modal y limpiar
window.closeMarkerModal = function() {
    const modal = document.getElementById('marker-input-modal');
    if (modal) modal.classList.remove('show');
    
    // Si estaba reproduciendo, reanudar
    if (pendingMarkerState && pendingMarkerState.wasPlaying) {
        window.togglePlayPauseJukebox();
    }
    pendingMarkerState = null;
};

// Función para guardar (llamada desde el botón del modal)
window.confirmAddMarker = function() {
    const input = document.getElementById('marker-name-input');
    const label = input ? input.value.trim() : "Marcador";
    
    if (pendingMarkerState && currentSongKey) {
        if (!jukeboxMarkers[currentSongKey]) jukeboxMarkers[currentSongKey] = [];
        jukeboxMarkers[currentSongKey].push({ time: pendingMarkerState.time, label: label });
        // Ordenar por tiempo
        jukeboxMarkers[currentSongKey].sort((a, b) => a.time - b.time);
        
        window.saveJukeboxLibrary(); // Guardar en DB
        window.renderMarkers();
    }
    
    // Cerramos el modal PERO modificamos el estado pendiente para que closeMarkerModal
    // sepa que debe reanudar la reproducción (si estaba activa).
    const wasPlaying = pendingMarkerState ? pendingMarkerState.wasPlaying : false;
    
    const modal = document.getElementById('marker-input-modal');
    if (modal) modal.classList.remove('show');
    
    if (wasPlaying) {
        window.togglePlayPauseJukebox();
    }
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
        delBtn.onclick = (e) => {
            e.stopPropagation();
            window.deleteMarker(idx);
        };

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
    
    // Intervalo rápido para bucle preciso
    jukeboxCheckInterval = setInterval(() => {
        let curr = 0, total = 0;
        
        if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
            try { curr = ytPlayer.getCurrentTime(); total = ytPlayer.getDuration(); } catch(e) {}
        } else if (currentJukeboxType === 'html5' && currentAudioObj) {
            curr = currentAudioObj.currentTime;
            total = currentAudioObj.duration;

            // CHEQUEO DE BUCLE A-B
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

    // Marcadores Botón +
    const btnAddMarker = document.getElementById('jb-add-marker');
    if(btnAddMarker) btnAddMarker.onclick = window.addMarker;

    // Listeners del Modal de Marcadores
    const btnCancelMarker = document.getElementById('cancel-marker-btn');
    if(btnCancelMarker) btnCancelMarker.onclick = window.closeMarkerModal;

    const btnConfirmMarker = document.getElementById('confirm-marker-btn');
    if(btnConfirmMarker) btnConfirmMarker.onclick = window.confirmAddMarker;
});
