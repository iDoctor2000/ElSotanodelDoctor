
/* 
   METRONOME.JS
   Lógica básica para el metrónomo web usando AudioContext
   Soporta Sample (Click.mp3) y Oscilador (Fallback)
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
    activeTableBtn: null // Referencia al botón de la tabla activo actualmente
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
        const response = await fetch('assets/Click.mp3');
        if (!response.ok) {
            throw new Error(`No se pudo cargar el sonido Click.mp3: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        metronomeState.clickBuffer = await metronomeState.audioContext.decodeAudioData(arrayBuffer);
        console.log("Sonido de metrónomo cargado correctamente.");
    } catch (error) {
        console.warn("Fallo al cargar Click.mp3, se usará sonido sintético de respaldo.", error);
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
        source.connect(metronomeState.audioContext.destination);
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
    if (newBpm < 40) newBpm = 40;
    if (newBpm > 240) newBpm = 240;
    
    metronomeState.bpm = newBpm;
    
    // Actualizar UI Popup
    const valDisplay = document.getElementById('metro-bpm-val');
    const sliderDisplay = document.getElementById('metro-bpm-slider');
    if(valDisplay) valDisplay.textContent = newBpm;
    if(sliderDisplay) sliderDisplay.value = newBpm;
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

    // Si ya está sonando ESTE botón -> Parar
    if (metronomeState.isPlaying && metronomeState.activeTableBtn === btnElement) {
        toggleMetronome(); // Parar
        return;
    }

    // Si está sonando OTRO o estaba parado -> Poner BPM y Arrancar (o reiniciar)
    setBPM(targetBpm);

    // Gestión visual de botones anteriores
    if (metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove('active-metronome');
    }
    
    btnElement.classList.add('active-metronome');
    metronomeState.activeTableBtn = btnElement;

    // Si no estaba sonando, arrancar. Si ya sonaba, el scheduler coge el nuevo BPM automáticamente
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
            // Toggle visibilidad del popup
            if (popup.classList.contains('visible')) {
                popup.classList.remove('visible');
            } else {
                popup.classList.add('visible');
            }
        });
        
        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && !toggleBtn.contains(e.target)) {
                popup.classList.remove('visible');
            }
        });
    }

    // Controles internos del metrónomo
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
});
