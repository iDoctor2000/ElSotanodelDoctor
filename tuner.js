/*
  TUNER.JS
  Afinador Cromático Integrado usando Web Audio API y Autocorrelación.
  Estilo "Pedal" visual.
*/

(function() {
    let audioContext = null;
    let analyser = null;
    let mediaStreamSource = null;
    let isTuning = false;
    let rafID = null;
    let buflen = 2048;
    let buf = new Float32Array(buflen);
    
    // Elementos UI
    let tunerModal = null;
    let noteElem = null;
    let freqElem = null;
    let needleElem = null;
    let statusText = null;
    let gaugeElem = null;

    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function initTunerUI() {
        tunerModal = document.getElementById('tuner-modal');
        noteElem = document.getElementById('tuner-note');
        freqElem = document.getElementById('tuner-freq');
        needleElem = document.getElementById('tuner-needle');
        statusText = document.getElementById('tuner-status-text');
        gaugeElem = document.querySelector('.tuner-gauge');

        // Listener botón cerrar del modal
        const closeBtn = document.getElementById('close-tuner-btn');
        if(closeBtn) {
            closeBtn.onclick = stopTuner;
        }

        // Listener botón header (si existe en el DOM al cargar este script)
        const openBtn = document.getElementById('header-tuner-btn');
        if(openBtn) {
            openBtn.onclick = startTuner;
        }
    }

    async function startTuner() {
        if(isTuning) return;
        
        // Abrir modal
        if(tunerModal) tunerModal.classList.add('show');
        
        // Pausar audio de fondo si suena
        const siteAudio = document.getElementById('site-audio');
        if(siteAudio && !siteAudio.paused) siteAudio.pause();

        // Inicializar Audio
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false 
            }});

            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            mediaStreamSource.connect(analyser);
            
            isTuning = true;
            if(statusText) statusText.textContent = "Escuchando...";
            updatePitch();

        } catch (err) {
            console.error("Error accediendo al micrófono:", err);
            if(statusText) statusText.textContent = "Error: No hay acceso al micrófono.";
            alert("No se pudo acceder al micrófono. Verifica los permisos.");
        }
    }

    function stopTuner() {
        isTuning = false;
        if (rafID) window.cancelAnimationFrame(rafID);
        
        // Cerrar AudioContext y Stream para ahorrar batería
        if (mediaStreamSource) {
            mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop());
            mediaStreamSource.disconnect();
        }
        if (audioContext) {
            audioContext.close();
        }
        
        audioContext = null;
        mediaStreamSource = null;
        analyser = null;

        // Cerrar Modal
        if(tunerModal) tunerModal.classList.remove('show');
    }

    function updatePitch() {
        if(!isTuning) return;
        
        analyser.getFloatTimeDomainData(buf);
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac === -1) {
            // No hay señal clara (ruido o silencio)
            // Mantener visualización anterior o resetear suavemente
            // needleElem.style.transform = "translateX(-50%) rotate(0deg)"; 
        } else {
            const pitch = ac;
            const note = noteFromPitch(pitch);
            const noteName = noteStrings[note % 12];
            const detune = centsOffFromPitch(pitch, note);

            if(noteElem) noteElem.textContent = noteName;
            if(freqElem) freqElem.textContent = Math.round(pitch) + " Hz";

            // Actualizar Aguja (-50 cents a +50 cents mapeado a -45deg a +45deg)
            // Clamp detune
            let visualDetune = detune;
            if (visualDetune < -50) visualDetune = -50;
            if (visualDetune > 50) visualDetune = 50;
            
            const angle = (visualDetune * 0.9); // Escalar a grados visuales
            
            if(needleElem) {
                needleElem.style.transform = `translateX(-50%) rotate(${angle}deg)`;
            }

            // Cambio de color si está afinado (margen +/- 5 cents)
            if (Math.abs(detune) < 5) {
                if(noteElem) noteElem.style.color = "#0f0"; // Verde
                if(gaugeElem) gaugeElem.style.boxShadow = "0 0 15px #0f0";
                if(statusText) statusText.textContent = "¡Afinado!";
                if(statusText) statusText.style.color = "#0f0";
            } else {
                if(noteElem) noteElem.style.color = "#f00"; // Rojo
                if(gaugeElem) gaugeElem.style.boxShadow = "0 0 10px #0cf"; // Azul neon normal
                if(statusText) statusText.textContent = detune < 0 ? "Bajo (b)" : "Alto (#)";
                if(statusText) statusText.style.color = "#ccc";
            }
        }

        rafID = window.requestAnimationFrame(updatePitch);
    }

    // --- MATEMÁTICAS (Algoritmo de Autocorrelación) ---
    function autoCorrelate(buf, sampleRate) {
        // RMS (Root Mean Square) para detectar si hay suficiente volumen
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            const val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        
        if (rms < 0.01) return -1; // Señal muy débil

        // Algoritmo
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

    // Inicializar al cargar el DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTunerUI);
    } else {
        initTunerUI();
    }

})();
