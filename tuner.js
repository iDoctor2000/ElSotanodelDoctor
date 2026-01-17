
/*
    TUNER.JS - PRO VERSION
    Características:
    - Detección de Pitch (Auto-correlación mejorada)
    - Selector de Instrumentos (Guitarra, Bajo 4/5, Ukelele)
    - Modo Manual: Generador de Tonos (Oscilador)
    - Feedback Visual: Gradación de colores HSL
*/

console.log("--- TUNER.JS PRO CARGADO ---");

(function() {
    let audioContext = null;
    let analyser = null;
    let microphoneStream = null;
    let tunerInterval = null;
    let isTunerRunning = false;
    let activeOscillator = null; // Para el tono de referencia

    // Configuración Audio
    const buflen = 2048;
    const buf = new Float32Array(buflen);
    const MIN_VOLUME_THRESHOLD = 0.012; // Un poco más alto para filtrar ruido
    
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Datos de Instrumentos
    const instruments = {
        guitar: {
            name: "Guitarra (E Std)",
            strings: [
                { note: "E2", freq: 82.41 },
                { note: "A2", freq: 110.00 },
                { note: "D3", freq: 146.83 },
                { note: "G3", freq: 196.00 },
                { note: "B3", freq: 246.94 },
                { note: "E4", freq: 329.63 }
            ]
        },
        bass: {
            name: "Bajo (4 Cuerdas)",
            strings: [
                { note: "E1", freq: 41.20 },
                { note: "A1", freq: 55.00 },
                { note: "D2", freq: 73.42 },
                { note: "G2", freq: 98.00 }
            ]
        },
        bass5: {
            name: "Bajo (5 Cuerdas)",
            strings: [
                { note: "B0", freq: 30.87 },
                { note: "E1", freq: 41.20 },
                { note: "A1", freq: 55.00 },
                { note: "D2", freq: 73.42 },
                { note: "G2", freq: 98.00 }
            ]
        },
        ukulele: {
            name: "Ukelele (GCEA)",
            strings: [
                { note: "G4", freq: 392.00 },
                { note: "C4", freq: 261.63 },
                { note: "E4", freq: 329.63 },
                { note: "A4", freq: 440.00 }
            ]
        }
    };

    let currentInstrument = 'guitar';

    // Función principal de inicialización
    function initTuner() {
        const toggleBtn = document.getElementById('tuner-toggle-btn');
        if (toggleBtn) {
            toggleBtn.removeEventListener('click', handleToggleClick); 
            toggleBtn.addEventListener('click', handleToggleClick);
            injectTunerHTML(); // Inyectar estructura HTML avanzada
        } else {
            setTimeout(initTuner, 1000);
        }
    }

    function injectTunerHTML() {
        const popup = document.getElementById('tuner-popup');
        if(!popup) return;

        // Limpiar contenido previo simple
        popup.innerHTML = `
            <div class="tuner-controls-top">
                <select id="tuner-instrument-select" class="tuner-select">
                    <option value="guitar">🎸 Guitarra</option>
                    <option value="bass">🎸 Bajo (4)</option>
                    <option value="bass5">🎸 Bajo (5)</option>
                    <option value="ukulele">🏝️ Ukelele</option>
                </select>
                <!-- Modo manual implícito en los botones -->
            </div>

            <div class="tuner-display-area">
                <div class="tuner-gradient-bar"></div>
                <div class="tuner-center-marker"></div>
                <div class="tuner-needle" id="tuner-needle"></div>
                
                <div class="tuner-freq-info">
                    <span id="tuner-cents">0c</span>
                    <span id="tuner-freq">0.0 Hz</span>
                </div>
                
                <div class="tuner-note" id="tuner-note">--</div>
            </div>

            <div id="tuner-strings-area" class="tuner-strings-container">
                <!-- Se llenará dinámicamente según instrumento -->
            </div>

            <p class="tuner-msg" id="tuner-msg">Pulsa una cuerda para oír tono referencia.</p>
        `;

        // Event listener para cambio de instrumento
        document.getElementById('tuner-instrument-select').addEventListener('change', (e) => {
            currentInstrument = e.target.value;
            renderStringButtons();
        });

        renderStringButtons();
    }

    function renderStringButtons() {
        const container = document.getElementById('tuner-strings-area');
        if(!container) return;
        container.innerHTML = "";

        const data = instruments[currentInstrument];
        data.strings.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'tuner-string-btn';
            btn.textContent = s.note.replace(/[0-9]/g, ''); // Mostrar solo la letra (E, A, etc)
            btn.title = `Tocar nota ${s.note} (${s.freq} Hz)`;
            
            // Acción: Reproducir tono
            btn.onclick = () => playReferenceTone(s.freq, btn);
            
            container.appendChild(btn);
        });
    }

    function playReferenceTone(freq, btnElement) {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Parar anterior si existe
        if (activeOscillator) {
            activeOscillator.stop();
            activeOscillator = null;
        }

        // Feedback visual en el botón
        const allBtns = document.querySelectorAll('.tuner-string-btn');
        allBtns.forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');

        // Crear oscilador
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = 'sine'; // Onda suave
        osc.frequency.value = freq;
        
        // Envolvente de volumen (Fade in - Fade out)
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 2.0);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start();
        osc.stop(audioContext.currentTime + 2.0);
        
        activeOscillator = osc;
        
        // Quitar clase activa después de un rato
        setTimeout(() => {
            if(btnElement) btnElement.classList.remove('active');
        }, 2000);
    }

    function handleToggleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (isTunerRunning) stopTuner(); else startTuner();
    }

    async function startTuner() {
        const popup = document.getElementById('tuner-popup');
        const toggleBtn = document.getElementById('tuner-toggle-btn');
        const msgDisplay = document.getElementById('tuner-msg');

        if (!popup) return;

        isTunerRunning = true;
        popup.classList.add('visible');
        
        if(toggleBtn) {
            toggleBtn.style.backgroundColor = '#0cf';
            toggleBtn.style.color = '#000';
            toggleBtn.style.boxShadow = '0 0 10px #0cf';
        }

        if(msgDisplay) msgDisplay.textContent = "Iniciando micrófono...";

        // Cerrar metrónomo si está abierto
        const metroPopup = document.getElementById('metronome-popup');
        if(metroPopup) metroPopup.classList.remove('visible');

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Sin soporte de micrófono.");
            }

            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();

            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
            
            const source = audioContext.createMediaStreamSource(microphoneStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 4096; // Mayor resolución para graves
            source.connect(analyser);

            if(msgDisplay) msgDisplay.textContent = "Toca una cuerda...";
            updatePitch();

        } catch (err) {
            console.error("Error Tuner:", err);
            if(msgDisplay) msgDisplay.textContent = "Error: Acceso micro denegado.";
            setTimeout(stopTuner, 3000); 
        }
    }

    function stopTuner() {
        isTunerRunning = false;
        
        const popup = document.getElementById('tuner-popup');
        const toggleBtn = document.getElementById('tuner-toggle-btn');
        
        if(popup) popup.classList.remove('visible');
        
        if(toggleBtn) {
            toggleBtn.style.backgroundColor = '';
            toggleBtn.style.color = '';
            toggleBtn.style.boxShadow = '';
        }

        if (tunerInterval) {
            cancelAnimationFrame(tunerInterval);
            tunerInterval = null;
        }

        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
        
        // Parar oscilador si estaba sonando
        if (activeOscillator) {
            activeOscillator.stop();
            activeOscillator = null;
        }
    }

    function updatePitch() {
        if (!isTunerRunning || !analyser) return;

        analyser.getFloatTimeDomainData(buf);
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac !== -1) {
            const pitch = ac;
            const note = noteFromPitch(pitch);
            const detune = centsOffFromPitch(pitch, note);
            updateUI(note, detune, pitch);
        } else {
            // Decaimiento suave si no hay señal
            // Opcional: mover aguja lentamente al centro o dejarla
        }

        tunerInterval = requestAnimationFrame(updatePitch);
    }

    function autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            const val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);

        if (rms < MIN_VOLUME_THRESHOLD) return -1;

        let r1 = 0, r2 = size - 1, thres = 0.2;
        for (let i = 0; i < size / 2; i++) {
            if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        }
        for (let i = 1; i < size / 2; i++) {
            if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
        }

        buf = buf.slice(r1, r2);
        size = buf.length;

        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size - i; j++) {
                c[i] = c[i] + buf[j] * buf[j + i];
            }
        }

        let d = 0;
        while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < size; i++) {
            if (c[i] > maxval) {
                maxval = c[i];
                maxpos = i;
            }
        }
        let T0 = maxpos;

        const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
        const a = (x1 + x3 - 2 * x2) / 2;
        const b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);

        return sampleRate / T0;
    }

    function noteFromPitch(frequency) {
        const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
        return Math.round(noteNum) + 69;
    }

    function frequencyFromNoteNumber(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    function centsOffFromPitch(frequency, note) {
        return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
    }

    function updateUI(noteNum, cents, freq) {
        const noteDisplay = document.getElementById('tuner-note');
        const freqDisplay = document.getElementById('tuner-freq');
        const centsDisplay = document.getElementById('tuner-cents');
        const needle = document.getElementById('tuner-needle');
        
        if(!noteDisplay || !needle) return;

        const noteName = noteStrings[noteNum % 12];
        noteDisplay.textContent = noteName;
        
        if(freqDisplay) freqDisplay.textContent = Math.round(freq * 10) / 10 + " Hz";
        if(centsDisplay) centsDisplay.textContent = (cents > 0 ? "+" : "") + cents + "c";

        // Mapeo visual: -50c = 0%, 0c = 50%, +50c = 100%
        // Añadimos smoothing
        let percent = 50 + (cents); 
        percent = Math.max(5, Math.min(95, percent)); 
        needle.style.left = percent + "%";

        // LÓGICA DE COLOR (HSL)
        // 0 cents (afinado) -> Verde (120 de Hue)
        // 50 cents (desafinado) -> Rojo (0 de Hue)
        // Usamos valor absoluto de cents para calcular
        const absCents = Math.abs(cents);
        let hue = 120 - (absCents * 2.4); // 50 * 2.4 = 120, así que a 50 cents el hue llega a 0 (rojo)
        if (hue < 0) hue = 0;
        
        const color = `hsl(${hue}, 100%, 50%)`;
        
        // Aplicar color a elementos
        needle.style.backgroundColor = color;
        needle.style.boxShadow = `0 0 15px ${color}`;
        noteDisplay.style.color = color;
        noteDisplay.style.textShadow = `0 0 20px ${color}`;
    }

    // Inicialización
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTuner);
    } else {
        initTuner();
    }
    
    // Fallback de carga
    setTimeout(initTuner, 1000);

    window.closeTuner = stopTuner;

})();
