
/* 
   JUKEBOX.JS
   Lógica separada para el reproductor de audio, YouTube API y Google Drive
*/

// Variables Globales del Jukebox
let jukeboxLibrary = {}; 
let ytPlayer = null;
let isJukeboxPlaying = false;
let jukeboxCheckInterval = null;
let currentJukeboxType = null; // 'youtube', 'html5', or 'drive-iframe'
let currentAudioObj = null; 

// Variables Bucle A-B
let jukeboxLoopA = null;
let jukeboxLoopB = null;

// Exponer funciones al objeto window para que funcionen los onclick del HTML
window.jukeboxLibrary = jukeboxLibrary;

/* --- 1. GESTIÓN DE LIBRERÍA (FIRESTORE) --- */

// Cargar librería
window.loadJukeboxLibrary = async function() {
    try {
        // Asume que 'loadDoc' y 'withRetry' están definidos en index.html o son globales
        // Si loadDoc no está disponible aún cuando carga esto, se llamará desde index.html
        if (typeof window.loadDoc === 'function') {
            const data = await window.withRetry(() => window.loadDoc("intranet", "jukebox_library", { mapping: {} }));
            window.jukeboxLibrary = data.mapping || {};
            console.log("Jukebox Library cargada:", Object.keys(window.jukeboxLibrary).length, "canciones.");
        }
    } catch (e) { console.error("Error cargando Jukebox Library:", e); }
};

// Guardar librería
window.saveJukeboxLibrary = async function() {
    try {
        if (typeof window.saveDoc === 'function') {
            await window.withRetry(() => window.saveDoc("intranet", "jukebox_library", { mapping: window.jukeboxLibrary }));
            return true;
        }
    } catch (e) { console.error("Error guardando Jukebox:", e); return false; }
};

/* --- 2. YOUTUBE API --- */

// Definir callback global para YouTube
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

// Convertir enlace de Drive a Directo
window.convertDriveToDirectLink = function(url) {
    // Intenta extraer el ID de varios formatos
    // Formato 1: /file/d/EL_ID/view
    // Formato 2: id=EL_ID
    let id = null;
    const parts = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (parts && parts[1]) {
        id = parts[1];
    } else {
        const parts2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (parts2 && parts2[1]) id = parts2[1];
    }
    
    if (id) {
        // Usamos la URL de exportación. 
        // NOTA: Esto puede fallar si el archivo es privado o muy grande (virus scan warning).
        return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    return null;
};

window.openJukeboxPlayer = function(title, rawUrl) {
    const playerBar = document.getElementById('jukebox-player-bar');
    const titleEl = document.getElementById('jukebox-current-title');
    const stdControls = document.getElementById('jukebox-std-controls');
    const stdProgress = document.getElementById('jukebox-std-progress');
    const iframeContainer = document.getElementById('jukebox-iframe-container');
    const loopControls = document.querySelector('.jukebox-loop-area');

    // Pausar música de fondo del sitio si suena
    const siteAudio = document.getElementById('site-audio');
    if(siteAudio && !siteAudio.paused) siteAudio.pause();

    // Reset previous
    window.stopJukebox();
    window.clearLoop(); 

    playerBar.classList.add('visible');
    titleEl.textContent = title;
    
    const url = rawUrl.trim();
    let driveDirectLink = window.convertDriveToDirectLink(url);

    // 1. Detect Google Drive (MODO HTML5 DIRECTO PARA LOOP)
    if (driveDirectLink) {
         console.log("Drive Link detectado. ID extraído. Intentando carga directa HTML5:", driveDirectLink);
         currentJukeboxType = 'html5';
         
         stdControls.style.display = 'flex';
         stdProgress.style.display = 'flex';
         iframeContainer.style.display = 'none';
         if(loopControls) loopControls.style.display = 'flex';

         window.setupHtml5Audio(driveDirectLink);

    // 2. Detect YouTube
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        currentJukeboxType = 'youtube';
        
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'none'; // No loops para YT iframe simple

        let videoId = "";
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length == 11) { videoId = match[2]; }
        else { alert("Link de YouTube no válido"); return; }

        if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById(videoId);
            ytPlayer.playVideo();
        } else {
            // Retry simple
            setTimeout(() => {
                if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                    ytPlayer.loadVideoById(videoId);
                    ytPlayer.playVideo();
                } else {
                    alert("YouTube API no lista. Espera un momento.");
                }
            }, 1000);
        }

    // 3. Detect Generic HTML5 (MP3, etc)
    } else {
        currentJukeboxType = 'html5';
        
        stdControls.style.display = 'flex';
        stdProgress.style.display = 'flex';
        iframeContainer.style.display = 'none';
        if(loopControls) loopControls.style.display = 'flex';

        window.setupHtml5Audio(url);
    }
};

window.setupHtml5Audio = function(srcUrl) {
    currentAudioObj = document.getElementById('jukebox-audio-element');
    if(!currentAudioObj) return;

    // Reset total
    currentAudioObj.pause();
    currentAudioObj.removeAttribute('src');
    currentAudioObj.load(); 
    
    currentAudioObj.src = srcUrl;
    currentAudioObj.load(); 
    
    const playPromise = currentAudioObj.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Auto-play falló o fue bloqueado:", error);
            // Si falla, suele ser por bloqueo de navegador o enlace roto (403)
        });
    }

    // Manejo de errores de carga (común en Drive si el archivo es privado)
    currentAudioObj.onerror = function() {
        console.error("Error cargando audio HTML5:", currentAudioObj.error);
        alert("Error al cargar el archivo de audio. \n\nPosibles causas:\n1. El archivo de Drive es privado.\n2. El archivo es muy grande (virus scan).\n3. El enlace está roto.");
        window.stopJukebox();
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

window.stopJukebox = function() {
    if (currentJukeboxType === 'youtube' && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo();
    }
    if (currentJukeboxType === 'html5' && currentAudioObj) {
        currentAudioObj.pause();
        currentAudioObj.currentTime = 0;
        // Remove src to stop downloading
        currentAudioObj.removeAttribute('src');
    }
    
    window.stopJukeboxProgressLoop();
    window.clearLoop(); // Resetear loop
    
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
        
        // Reset B si es anterior a A o si ya existía
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
            
            // Saltar inmediatamente al inicio (A) para confirmar visualmente que el loop funciona
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

    // Función interna segura para formatear
    const fmt = (s) => {
        if (isNaN(s) || s === null) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, "0")}`;
    };

    if (jukeboxLoopA !== null && jukeboxLoopB !== null) {
        display.textContent = `${fmt(jukeboxLoopA)} <-> ${fmt(jukeboxLoopB)}`;
    } else if (jukeboxLoopA !== null) {
        display.textContent = `${fmt(jukeboxLoopA)} -> ...`;
    } else {
        display.textContent = "";
    }
};

/* --- 5. LOOP DE PROGRESO --- */

window.startJukeboxProgressLoop = function() {
    if (jukeboxCheckInterval) clearInterval(jukeboxCheckInterval);
    
    // Intervalo más rápido para precisión en el loop (100ms)
    jukeboxCheckInterval = setInterval(() => {
        let curr = 0, total = 0;
        
        if (currentJukeboxType === 'youtube' && ytPlayer && ytPlayer.getCurrentTime) {
            try {
                curr = ytPlayer.getCurrentTime();
                total = ytPlayer.getDuration();
            } catch(e) { /* ignore */ }
        } else if (currentJukeboxType === 'html5' && currentAudioObj) {
            curr = currentAudioObj.currentTime;
            total = currentAudioObj.duration;

            // CHEQUEO DE BUCLE A-B
            if (jukeboxLoopA !== null && jukeboxLoopB !== null) {
                // Si nos pasamos de B, volvemos a A
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
            
            // Actualizar UI solo si existe
            // Función toMMSS duplicada aquí por seguridad si no es global
            const toTime = (s) => {
                 const ts = Math.round(s); 
                 return `${Math.floor(ts / 60)}:${String(ts % 60).padStart(2, "0")}`;
            };

            if(prog) prog.value = pct;
            if(curT) curT.textContent = toTime(curr);
            if(totT) totT.textContent = toTime(total);
        }
    }, 100); 
};

window.stopJukeboxProgressLoop = function() {
    if (jukeboxCheckInterval) clearInterval(jukeboxCheckInterval);
};

// Event Listeners Iniciales (cuando carga el script)
document.addEventListener("DOMContentLoaded", () => {
    // Asignar eventos a los botones estáticos del HTML
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

    // Loop Listeners
    const btnLoopA = document.getElementById('jb-loop-a');
    if(btnLoopA) btnLoopA.onclick = window.setLoopA;

    const btnLoopB = document.getElementById('jb-loop-b');
    if(btnLoopB) btnLoopB.onclick = window.setLoopB;

    const btnLoopClear = document.getElementById('jb-loop-clear');
    if(btnLoopClear) btnLoopClear.onclick = window.clearLoop;
});
