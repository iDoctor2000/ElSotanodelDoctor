
/*
    TUNER.JS
    Afinador cromático simple basado en Web Audio API y autocorrelación.
    Se integra con la UI definida en index.html (#tuner-popup, #tuner-toggle-btn).
*/

(function() {
    let audioContext = null;
    let analyser = null;
    let microphoneStream = null;
    let tunerInterval = null;
    let isTunerRunning = false;

    // Elementos DOM
    const popup = document.getElementById('tuner-popup');
    const toggleBtn = document.getElementById('tuner-toggle-btn');
    const noteDisplay = document.getElementById('tuner-note');
    const freqDisplay = document.getElementById('tuner-freq');
    const needle = document.getElementById('tuner-needle');
    const statusContainer = document.getElementById('tuner-popup'); // Para clases CSS

    // Configuración Audio
    const buflen = 2048;
    const buf = new Float32Array(buflen);
    const MIN_VOLUME_THRESHOLD = 0.01; // Ruido de fondo

    // Notas
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function initTuner() {
        if (toggleBtn) {
            toggleBtn.onclick = toggleTuner;
        }
    }

    async function startTuner() {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            microphoneStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false
                } 
            });

            const source = audioContext.createMediaStreamSource(microphoneStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);

            isTunerRunning = true;
            popup.classList.add('visible');
            toggleBtn.style.backgroundColor = '#333'; // Estado activo visual
            toggleBtn.style.borderColor = '#fff';

            // Cerrar metrónomo si está abierto para evitar solapamiento visual
            const metronomePopup = document.getElementById('metronome-popup');
            if (metronomePopup && metronomePopup.classList.contains('visible')) {
                metronomePopup.classList.remove('visible');
                // Asumiendo que metronome.js tiene lógica para apagar botón, 
                // aquí solo ocultamos visualmente el popup por seguridad.
            }

            updatePitch();

        } catch (err) {
            console.error("Error al iniciar el afinador:", err);
            alert("No se pudo acceder al micrófono. Asegúrate de dar permisos.");
            stopTuner();
        }
    }

    function stopTuner() {
        isTunerRunning = false;
        popup.classList.remove('visible');
        toggleBtn.style.backgroundColor = ''; 
        toggleBtn.style.borderColor = '';

        if (tunerInterval) {
            cancelAnimationFrame(tunerInterval);
            tunerInterval = null;
        }

        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
        
        // Reset UI
        noteDisplay.textContent = "--";
        freqDisplay.textContent = "0.0";
        needle.style.left = "50%";
        statusContainer.className = ""; // Limpiar clases de estado
    }

    function toggleTuner() {
        if (isTunerRunning) {
            stopTuner();
        } else {
            startTuner();
        }
    }

    /* --- LÓGICA DE DETECCIÓN DE PITCH (AUTOCORRELACIÓN) --- */
    function updatePitch() {
        if (!isTunerRunning) return;

        analyser.getFloatTimeDomainData(buf);
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac === -1) {
            // No hay señal clara o suficiente volumen
            // Mantenemos la última lectura o reseteamos suavemente si pasa mucho tiempo
            // Por ahora, solo visualmente indicamos inactividad si es prolongada
        } else {
            const pitch = ac;
            const note = noteFromPitch(pitch);
            const detune = centsOffFromPitch(pitch, note);
            
            updateUI(note, detune, pitch);
        }

        tunerInterval = requestAnimationFrame(updatePitch);
    }

    function autoCorrelate(buf, sampleRate) {
        // RMS (Root Mean Square) para volumen
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            const val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);

        if (rms < MIN_VOLUME_THRESHOLD) return -1;

        // Algoritmo simple de autocorrelación
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

        // Interpolación parabólica para mayor precisión
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
        const noteName = noteStrings[noteNum % 12];
        
        noteDisplay.textContent = noteName;
        freqDisplay.textContent = Math.round(freq) + " Hz";

        // Mover la aguja
        // Cents van de -50 a +50 aprox para el rango de la nota
        // Mapeamos -50..50 a 0%..100% left
        let percent = 50 + cents; // Simple mapping: 0 cents = 50%
        percent = Math.max(0, Math.min(100, percent));
        needle.style.left = percent + "%";

        // Clases de color
        statusContainer.classList.remove('tuner-status-perfect', 'tuner-status-flat', 'tuner-status-sharp');
        
        if (Math.abs(cents) < 5) {
            statusContainer.classList.add('tuner-status-perfect');
        } else if (cents < 0) {
            statusContainer.classList.add('tuner-status-flat');
        } else {
            statusContainer.classList.add('tuner-status-sharp');
        }
    }

    // Inicializar al cargar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTuner);
    } else {
        initTuner();
    }

    // Exponer stop globalmente por si cerramos menús
    window.closeTuner = stopTuner;

})();
