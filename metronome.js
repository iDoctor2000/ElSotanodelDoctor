/* 
   METRONOME.JS
   Lógica básica para el metrónomo web usando AudioContext
   Soporta Sample (Click.mp3) y Oscilador (Fallback)
   Incluye funcionalidad TAP Tempo
   + VISUALIZER (LEDs & Pulse)
*/

const metronomeState = {
    isPlaying: false,
    bpm: 120,
    nextNoteTime: 0.0,
    timerID: null,
    audioContext: null,
    clickBuffer: null, 
    lookahead: 25.0, 
    scheduleAheadTime: 0.1, 
    activeTableBtn: null, 
    
    // Tap Tempo
    tapTimes: [],
    tapTimeout: 2000,

    // Visualizer State
    beatCount: 0,
    beatsPerMeasure: 4
};

function initAudioContext() {
    if (!metronomeState.audioContext) {
        metronomeState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        loadClickSound();
    }
}

async function loadClickSound() {
    if (metronomeState.clickBuffer) return; 
    try {
        const response = await fetch('assets/Click.mp3');
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        metronomeState.clickBuffer = await metronomeState.audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.warn("Fallo al cargar Click.mp3. Se usará oscilador.", error);
    }
}

function nextNote() {
    const secondsPerBeat = 60.0 / metronomeState.bpm;
    metronomeState.nextNoteTime += secondsPerBeat;
    
    // Avanzar contador de beat visual (0 a 3)
    metronomeState.beatCount = (metronomeState.beatCount + 1) % metronomeState.beatsPerMeasure;
}

function scheduleNote(time) {
    // 1. AUDIO SCHEDULING
    if (metronomeState.clickBuffer) {
        const source = metronomeState.audioContext.createBufferSource();
        source.buffer = metronomeState.clickBuffer;
        // Pitch más alto en el primer beat
        if (metronomeState.beatCount === 0) {
            source.playbackRate.value = 1.5; 
        } else {
            source.playbackRate.value = 1.0;
        }
        
        const gainNode = metronomeState.audioContext.createGain();
        gainNode.gain.value = 1.0;
        source.connect(gainNode);
        gainNode.connect(metronomeState.audioContext.destination);
        source.start(time);
    } else {
        const osc = metronomeState.audioContext.createOscillator();
        const envelope = metronomeState.audioContext.createGain();
        
        // Frecuencia diferente para el primer beat
        osc.frequency.value = (metronomeState.beatCount === 0) ? 1500 : 1000; 
        envelope.gain.value = 1;
        
        envelope.gain.exponentialRampToValueAtTime(1, time + 0.001);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

        osc.connect(envelope);
        envelope.connect(metronomeState.audioContext.destination);

        osc.start(time);
        osc.stop(time + 0.03);
    }

    // 2. VISUAL SCHEDULING (Sincronizado)
    // El audio se programa con antelación (time). 
    // Usamos setTimeout para que la visual ocurra exactamente cuando suena el audio.
    const now = metronomeState.audioContext.currentTime;
    const timeDiff = time - now;
    
    // Capturar el beat actual para el closure
    const currentBeat = metronomeState.beatCount; 

    if (timeDiff >= 0) {
        setTimeout(() => {
            triggerVisualBeat(currentBeat);
        }, timeDiff * 1000);
    }
}

function triggerVisualBeat(beatIndex) {
    const popup = document.getElementById('metronome-popup');
    if (!popup) return;

    // 1. Efecto Flash en el borde
    popup.classList.add('beat-flash');
    setTimeout(() => popup.classList.remove('beat-flash'), 100);

    // 2. Efecto LEDs Secuenciales
    // Resetear todos
    for(let i=1; i<=4; i++) {
        const led = document.getElementById(`metro-led-${i}`);
        if(led) {
            led.className = 'metronome-led'; // Reset classes
        }
    }

    // Encender el actual (beatIndex va de 0 a 3, pero los IDs van de 1 a 4)
    // Si beatIndex es 0 (primer tiempo), usamos active-accent
    const currentLedId = `metro-led-${beatIndex + 1}`;
    const currentLed = document.getElementById(currentLedId);
    
    if(currentLed) {
        if(beatIndex === 0) {
            currentLed.classList.add('active-accent');
        } else {
            currentLed.classList.add('active');
        }
    }
}

function scheduler() {
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
        // Reset LEDs
        for(let i=1; i<=4; i++) {
            const led = document.getElementById(`metro-led-${i}`);
            if(led) led.className = 'metronome-led';
        }
    } else {
        if (metronomeState.audioContext.state === 'suspended') {
            metronomeState.audioContext.resume();
        }
        metronomeState.beatCount = 0; // Resetear contador al empezar
        metronomeState.nextNoteTime = metronomeState.audioContext.currentTime + 0.05;
        metronomeState.isPlaying = true;
        scheduler();
        updateMetronomeUI(true);
        
        if(window.logInteraction) window.logInteraction('METRONOME', 'Start: ' + metronomeState.bpm + ' BPM');
    }
}

function updateMetronomeUI(isPlaying) {
    const btn = document.getElementById('metro-play-btn');
    const iconPlay = document.getElementById('metro-icon-play');
    const iconStop = document.getElementById('metro-icon-stop');
    
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

    if (!isPlaying && metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove('active-metronome');
        metronomeState.activeTableBtn = null;
    }
}

function setBPM(val) {
    let newBpm = parseInt(val, 10);
    if (isNaN(newBpm)) return;
    if (newBpm < 30) newBpm = 30;
    if (newBpm > 300) newBpm = 300;
    
    metronomeState.bpm = newBpm;
    
    const valDisplay = document.getElementById('metro-bpm-val');
    const sliderDisplay = document.getElementById('metro-bpm-slider');
    if(valDisplay) valDisplay.textContent = newBpm;
    if(sliderDisplay) sliderDisplay.value = newBpm;
}

function handleTapTempo(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const tapBtn = document.getElementById('metro-tap-btn');
    if(tapBtn) {
        tapBtn.style.backgroundColor = "#fff";
        setTimeout(() => { tapBtn.style.backgroundColor = "#0cf"; }, 100);
    }

    const now = Date.now();
    if (metronomeState.tapTimes.length > 0 && now - metronomeState.tapTimes[metronomeState.tapTimes.length - 1] > metronomeState.tapTimeout) {
        metronomeState.tapTimes = [];
    }
    metronomeState.tapTimes.push(now);
    if (metronomeState.tapTimes.length > 5) metronomeState.tapTimes.shift();

    if (metronomeState.tapTimes.length > 1) {
        let intervals = [];
        for (let i = 1; i < metronomeState.tapTimes.length; i++) {
            intervals.push(metronomeState.tapTimes[i] - metronomeState.tapTimes[i-1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const calculatedBpm = Math.round(60000 / avgInterval);
        setBPM(calculatedBpm);
    }
}

window.toggleMetronomeFromTable = function(bpmRaw, btnElement) {
    const match = String(bpmRaw).match(/\d+/);
    if (!match) { alert("No se encontró un tempo válido."); return; }
    const targetBpm = parseInt(match[0], 10);

    initAudioContext();

    if (metronomeState.isPlaying && metronomeState.activeTableBtn === btnElement) {
        toggleMetronome(); 
        return;
    }

    setBPM(targetBpm);

    if (metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove('active-metronome');
    }
    
    btnElement.classList.add('active-metronome');
    metronomeState.activeTableBtn = btnElement;

    if (!metronomeState.isPlaying) {
        toggleMetronome();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById('metronome-toggle-btn');
    const popup = document.getElementById('metronome-popup');
    
    if (toggleBtn && popup) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (popup.classList.contains('visible')) {
                popup.classList.remove('visible');
                // Opcional: Parar al cerrar
                if (metronomeState.isPlaying) toggleMetronome();
            } else {
                popup.classList.add('visible');
                initAudioContext();
            }
        });
        
        document.addEventListener('click', (e) => {
            if (popup.classList.contains('visible') && !popup.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
                popup.classList.remove('visible');
            }
        });
    }

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
    
    const tapBtn = document.getElementById('metro-tap-btn');
    if(tapBtn) {
        tapBtn.addEventListener('mousedown', handleTapTempo);
        tapBtn.addEventListener('touchstart', handleTapTempo);
    }
});
