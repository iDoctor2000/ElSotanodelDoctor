
/* 
   METRONOME.JS
   Lógica básica para el metrónomo web usando AudioContext
   Soporta Sample (Click.mp3) y Oscilador (Fallback)
   Incluye funcionalidad TAP Tempo
*/

const metronomeState = {
    isPlaying: false,
    bpm: 120,
    nextNoteTime: 0.0,
    timerID: null,
    audioContext: null,
    clickBuffer: null, // Buffer para el sonido MP3
    lookahead: 25.0, // ms
    scheduleAheadTime: 0.1, // s
    activeTableBtn: null, // Referencia al botón de la tabla activo actualmente
    
    // Variables para TAP Tempo
    tapTimes: [],
    tapTimeout: 2000 // 2 segundos para resetear el TAP
};

function initAudioContext() {
    if (!metronomeState.audioContext) {
        metronomeState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Cargar el sonido del Click al iniciar el contexto
        loadClickSound();
    }
}

// Cargar el archivo de audio assets/Click.mp3
async function loadClickSound() {
    if (metronomeState.clickBuffer) return; // Ya cargado

    try {
        // Intentamos cargar con ruta relativa.
        const response = await fetch('assets/Click.mp3');
        if (!response.ok) {
            throw new Error(`Error HTTP al cargar Click.mp3: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        metronomeState.clickBuffer = await metronomeState.audioContext.decodeAudioData(arrayBuffer);
        console.log("¡Sonido Click.mp3 cargado y decodificado correctamente!");
    } catch (error) {
        console.warn("Fallo al cargar Click.mp3 (verifique ruta 'assets/Click.mp3'). Se usará sonido sintético.", error);
    }
}

function nextNote() {
    const secondsPerBeat = 60.0 / metronomeState.bpm;
    metronomeState.nextNoteTime += secondsPerBeat;
}

function scheduleNote(time) {
    // INTENTO 1: Reproducir Sample (Click.mp3)
    if (metronomeState.clickBuffer) {
        const source = metronomeState.audioContext.createBufferSource();
        source.buffer = metronomeState.clickBuffer;
        
        // Crear nodo de ganancia para asegurar volumen
        const gainNode = metronomeState.audioContext.createGain();
        gainNode.gain.value = 1.0; // Volumen al 100%
        
        source.connect(gainNode);
        gainNode.connect(metronomeState.audioContext.destination);
        
        source.start(time);
    } 
    // INTENTO 2: Fallback a Oscilador (si el MP3 falla o no ha cargado)
    else {
        const osc = metronomeState.audioContext.createOscillator();
        const envelope = metronomeState.audioContext.createGain();

        osc.frequency.value = 1000; // Tono (Hz)
        envelope.gain.value = 1;
        
        // Envolvente simple para un "click" corto
        envelope.gain.exponentialRampToValueAtTime(1, time + 0.001);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

        osc.connect(envelope);
        envelope.connect(metronomeState.audioContext.destination);

        osc.start(time);
        osc.stop(time + 0.03);
    }
}

function scheduler() {
    // Mientras haya notas que deban sonar antes del próximo intervalo
    while (metronomeState.nextNoteTime < metronomeState.audioContext.currentTime + metronomeState.scheduleAheadTime) {
        scheduleNote(metronomeState.nextNoteTime);
        nextNote();
    }
    metronomeState.timerID = window.setTimeout(scheduler, metronomeState.lookahead);
}

function toggleMetronome() {
    initAudioContext();
    
    if (metronomeState.isPlaying) {
        window.clearTimeout(metronomeState.timerID);
        metronomeState.isPlaying = false;
        updateMetronomeUI(false);
    } else {
        if (metronomeState.audioContext.state === 'suspended') {
            metronomeState.audioContext.resume();
        }
        metronomeState.nextNoteTime = metronomeState.audioContext.currentTime + 0.05;
        metronomeState.isPlaying = true;
        scheduler();
        updateMetronomeUI(true);
        
        // TRACKING
        if(window.logInteraction) window.logInteraction('METRONOME', 'Start: ' + metronomeState.bpm + ' BPM');
    }
}

function updateMetronomeUI(isPlaying) {
    const btn = document.getElementById('metro-play-btn');
    const iconPlay = document.getElementById('metro-icon-play');
    const iconStop = document.getElementById('metro-icon-stop');
    
    // Actualizar Popup
    if (btn && iconPlay && iconStop) {
        if (isPlaying) {
            btn.classList.add('playing');
            iconPlay.style.display = 'none';
            iconStop.style.display = 'block';
        } else {
            btn.classList.remove('playing');
            iconPlay.style.display = 'block';
            iconStop.style.display = 'none';
        }
    }

    // Actualizar Botones de la Tabla (si se paró globalmente)
    if (!isPlaying && metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove('active-metronome');
        metronomeState.activeTableBtn = null;
    }
}

function setBPM(val) {
    let newBpm = parseInt(val, 10);
    if (isNaN(newBpm)) return;
    // Límites razonables
    if (newBpm < 30) newBpm = 30;
    if (newBpm > 300) newBpm = 300;
    
    metronomeState.bpm = newBpm;
    
    // Actualizar UI Popup
    const valDisplay = document.getElementById('metro-bpm-val');
    const sliderDisplay = document.getElementById('metro-bpm-slider');
    if(valDisplay) valDisplay.textContent = newBpm;
    if(sliderDisplay) sliderDisplay.value = newBpm;
}

// --- LÓGICA TAP TEMPO OPTIMIZADA ---
function handleTapTempo(e) {
    // Evitar doble disparo en móviles (touch + click)
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Feedback visual instantáneo
    const tapBtn = document.getElementById('metro-tap-btn');
    if(tapBtn) {
        tapBtn.style.backgroundColor = "#fff";
        setTimeout(() => { tapBtn.style.backgroundColor = "#0cf"; }, 100);
    }

    const now = Date.now();
    
    // Reset si ha pasado mucho tiempo (> 2 seg)
    if (metronomeState.tapTimes.length > 0 && now - metronomeState.tapTimes[metronomeState.tapTimes.length - 1] > metronomeState.tapTimeout) {
        metronomeState.tapTimes = [];
        console.log("TAP Reset");
    }
    
    metronomeState.tapTimes.push(now);
    
    // Mantenemos solo los últimos 5 taps para precisión
    if (metronomeState.tapTimes.length > 5) {
        metronomeState.tapTimes.shift();
    }
    
    // Necesitamos al menos 2 taps
    if (metronomeState.tapTimes.length > 1) {
        let intervals = [];
        for (let i = 1; i < metronomeState.tapTimes.length; i++) {
            intervals.push(metronomeState.tapTimes[i] - metronomeState.tapTimes[i-1]);
        }
        
        // Calcular promedio
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        
        // BPM = 60000ms / intervalo promedio
        const calculatedBpm = Math.round(60000 / avgInterval);
        
        console.log("TAP detectado. Intervalo:", avgInterval, "BPM:", calculatedBpm);
        setBPM(calculatedBpm);
    }
}

// --- FUNCIÓN GLOBAL PARA LLAMAR DESDE LA TABLA ---
window.toggleMetronomeFromTable = function(bpmRaw, btnElement) {
    // Extraer número del string (ej: "120 bpm" -> 120, "144, 150" -> 144)
    const match = String(bpmRaw).match(/\d+/);
    if (!match) {
        alert("No se encontró un tempo válido.");
        return;
    }
    const targetBpm = parseInt(match[0], 10);

    // Inicializar AudioContext si es la primera vez
    initAudioContext();

    // Si ya está sonando ESTE botón -> Parar
    if (metronomeState.isPlaying && metronomeState.activeTableBtn === btnElement) {
        toggleMetronome(); // Parar
        return;
    }

    // Si está sonando OTRO o estaba parado -> Poner BPM y Arrancar
    setBPM(targetBpm);

    // Gestión visual
    if (metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove('active-metronome');
    }
    
    btnElement.classList.add('active-metronome');
    metronomeState.activeTableBtn = btnElement;

    if (!metronomeState.isPlaying) {
        toggleMetronome();
    }
};


// Inicialización de eventos DOM
document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById('metronome-toggle-btn');
    const popup = document.getElementById('metronome-popup');
    
    if (toggleBtn && popup) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (popup.classList.contains('visible')) {
                popup.classList.remove('visible');
            } else {
                popup.classList.add('visible');
                initAudioContext();
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && !toggleBtn.contains(e.target)) {
                popup.classList.remove('visible');
            }
        });
    }

    // Controles internos
    const playBtn = document.getElementById('metro-play-btn');
    if(playBtn) playBtn.addEventListener('click', toggleMetronome);
    
    const bpmSlider = document.getElementById('metro-bpm-slider');
    if(bpmSlider) bpmSlider.addEventListener('input', (e) => {
        setBPM(e.target.value);
    });

    const minusBtn = document.getElementById('metro-minus');
    if(minusBtn) minusBtn.addEventListener('click', () => {
        setBPM(metronomeState.bpm - 1);
    });

    const plusBtn = document.getElementById('metro-plus');
    if(plusBtn) plusBtn.addEventListener('click', () => {
        setBPM(metronomeState.bpm + 1);
    });
    
    // Botón TAP - Usamos mousedown y touchstart para respuesta inmediata
    const tapBtn = document.getElementById('metro-tap-btn');
    if(tapBtn) {
        tapBtn.addEventListener('mousedown', handleTapTempo);
        tapBtn.addEventListener('touchstart', handleTapTempo);
    }
});
