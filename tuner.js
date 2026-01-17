
/*
    TUNER.JS - Versión Robusta
    Afinador cromático con feedback visual inmediato.
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
    
    // Elemento para mensajes (creado dinámicamente o usando el <p> existente)
    let msgDisplay = popup ? popup.querySelector('p') : null;

    // Configuración Audio
    const buflen = 2048;
    const buf = new Float32Array(buflen);
    const MIN_VOLUME_THRESHOLD = 0.01; 

    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function initTuner() {
        if (toggleBtn) {
            toggleBtn.onclick = handleToggleClick;
        }
    }

    function handleToggleClick(e) {
        e.preventDefault();
        if (isTunerRunning) {
            stopTuner();
        } else {
            startTuner();
        }
    }

    async function startTuner() {
        if (!popup) return;

        // 1. Mostrar Popup Inmediatamente (Estado Cargando)
        isTunerRunning = true; // Pre-activar flag para UI
        popup.classList.add('visible');
        if(toggleBtn) {
            toggleBtn.style.backgroundColor = '#333';
            toggleBtn.style.transform = 'scale(1.1)';
        }
        
        if(msgDisplay) msgDisplay.textContent = "Iniciando micrófono...";
        if(noteDisplay) noteDisplay.textContent = "...";

        // Cerrar otros popups si existen
        const metroPopup = document.getElementById('metronome-popup');
        if(metroPopup) metroPopup.classList.remove('visible');

        try {
            // 2. Inicializar Audio Context
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            // 3. Pedir Micrófono
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Tu navegador no soporta acceso al micrófono.");
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

            if(msgDisplay) msgDisplay.textContent = "Escuchando...";
            
            // Iniciar Loop
            updatePitch();

        } catch (err) {
            console.error("Tuner Error:", err);
            if(msgDisplay) {
                msgDisplay.style.color = "#f55";
                msgDisplay.textContent = "Error: Acceso micro denegado.";
            }
            // No detenemos inmediatamente para que el usuario vea el error, 
            // pero el loop no arrancará bien sin analyser.
            setTimeout(stopTuner, 3000); 
        }
    }

    function stopTuner() {
        isTunerRunning = false;
        if(popup) popup.classList.remove('visible');
        
        if(toggleBtn) {
            toggleBtn.style.backgroundColor = '';
            toggleBtn.style.transform = '';
        }

        if (tunerInterval) {
            cancelAnimationFrame(tunerInterval);
            tunerInterval = null;
        }

        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }
        
        // Reset UI
        if(noteDisplay) noteDisplay.textContent = "--";
        if(freqDisplay) freqDisplay.textContent = "0.0 Hz";
        if(needle) needle.style.left = "50%";
        if(popup) popup.className = ""; // Limpiar clases de estado (perfect/flat/sharp) pero mantener id
        if(popup) popup.id = "tuner-popup"; // Restaurar ID por si acaso
        if(msgDisplay) {
            msgDisplay.style.color = "#666";
            msgDisplay.textContent = "Asegúrate de permitir el micrófono.";
        }
    }

    function updatePitch() {
        if (!isTunerRunning || !analyser) return;

        analyser.getFloatTimeDomainData(buf);
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac === -1) {
            // Silencio o ruido: No actualizar aguja drásticamente, o resetear suavemente
            // Opción: Dejar la aguja donde está o ir al centro lentamente
        } else {
            const pitch = ac;
            const note = noteFromPitch(pitch);
            const detune = centsOffFromPitch(pitch, note);
            updateUI(note, detune, pitch);
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
        if(!noteDisplay || !freqDisplay || !needle) return;

        const noteName = noteStrings[noteNum % 12];
        noteDisplay.textContent = noteName;
        freqDisplay.textContent = Math.round(freq) + " Hz";

        // Mapeo: -50 cents = 0% left, +50 cents = 100% left
        let percent = 50 + cents; 
        percent = Math.max(5, Math.min(95, percent)); // Margen de seguridad visual
        needle.style.left = percent + "%";

        // Gestión de colores
        popup.classList.remove('tuner-status-perfect', 'tuner-status-flat', 'tuner-status-sharp');
        
        if (Math.abs(cents) < 5) {
            popup.classList.add('tuner-status-perfect');
            if(msgDisplay) msgDisplay.textContent = "¡Afinado!";
        } else if (cents < 0) {
            popup.classList.add('tuner-status-flat');
            if(msgDisplay) msgDisplay.textContent = "Bajo (sube tono)";
        } else {
            popup.classList.add('tuner-status-sharp');
            if(msgDisplay) msgDisplay.textContent = "Alto (baja tono)";
        }
    }

    // Inicialización al cargar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTuner);
    } else {
        initTuner();
    }

    // Exponer stop globalmente
    window.closeTuner = stopTuner;

})();
