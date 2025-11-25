
/* 
   METRONOME.JS
   Lógica básica para el metrónomo web usando AudioContext
*/

const metronomeState = {
    isPlaying: false,
    bpm: 120,
    nextNoteTime: 0.0,
    timerID: null,
    audioContext: null,
    lookahead: 25.0, // ms
    scheduleAheadTime: 0.1 // s
};

function initAudioContext() {
    if (!metronomeState.audioContext) {
        metronomeState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function nextNote() {
    const secondsPerBeat = 60.0 / metronomeState.bpm;
    metronomeState.nextNoteTime += secondsPerBeat;
}

function scheduleNote(time) {
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

function setBPM(val) {
    let newBpm = parseInt(val, 10);
    if (newBpm < 40) newBpm = 40;
    if (newBpm > 240) newBpm = 240;
    
    metronomeState.bpm = newBpm;
    
    // Actualizar UI
    document.getElementById('metro-bpm-val').textContent = newBpm;
    document.getElementById('metro-bpm-slider').value = newBpm;
}

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
    document.getElementById('metro-play-btn').addEventListener('click', toggleMetronome);
    
    document.getElementById('metro-bpm-slider').addEventListener('input', (e) => {
        setBPM(e.target.value);
    });

    document.getElementById('metro-minus').addEventListener('click', () => {
        setBPM(metronomeState.bpm - 1);
    });

    document.getElementById('metro-plus').addEventListener('click', () => {
        setBPM(metronomeState.bpm + 1);
    });
});
