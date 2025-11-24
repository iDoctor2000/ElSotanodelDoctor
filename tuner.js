/*
  TUNER.JS - PRO EDITION
  Afinador Cromático Integrado con Osciloscopio y Aguja Analógica.
*/

(function() {
    let audioContext = null;
    let analyser = null;
    let mediaStreamSource = null;
    let isTuning = false;
    let rafID = null;
    
    // Configuración de Audio
    const buflen = 2048;
    const buf = new Float32Array(buflen);
    
    // Variables para suavizado (Smoothing)
    let currentCents = 0;
    let targetCents = 0;
    let lastNoteName = "-";
    let frameCountInTune = 0; // Para detectar "Lock" estable
    
    // Elementos UI
    let tunerModal = null;
    let noteElem = null;
    let freqElem = null;
    let needleElem = null;
    let centsElem = null;
    let canvasElem = null;
    let canvasCtx = null;
    let ledFlat = null;
    let ledSharp = null;
    let tunerGauge = null;

    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function initTunerUI() {
        tunerModal = document.getElementById('tuner-modal');
        noteElem = document.getElementById('tuner-note');
        freqElem = document.getElementById('tuner-freq');
        needleElem = document.getElementById('tuner-needle');
        centsElem = document.getElementById('tuner-cents');
        canvasElem = document.getElementById('tuner-visualizer');
        ledFlat = document.getElementById('led-flat');
        ledSharp = document.getElementById('led-sharp');
        tunerGauge = document.querySelector('.tuner-gauge');

        // Inicializar Canvas Context
        if (canvasElem) {
            canvasCtx = canvasElem.getContext('2d');
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
        }

        // Listener botón cerrar del modal
        const closeBtn = document.getElementById('close-tuner-btn');
        if(closeBtn) {
            closeBtn.onclick = stopTuner;
        }

        // Listener botón header
        const openBtn = document.getElementById('header-tuner-btn');
        if(openBtn) {
            openBtn.onclick = startTuner;
        }
    }

    function resizeCanvas() {
        if(canvasElem) {
            canvasElem.width = canvasElem.clientWidth;
            canvasElem.height = canvasElem.clientHeight;
        }
    }

    async function startTuner() {
        if(isTuning) return;
        
        if(tunerModal) tunerModal.classList.add('show');
        
        // Pausar audio de fondo si suena
        const siteAudio = document.getElementById('site-audio');
        if(siteAudio && !siteAudio.paused) siteAudio.pause();

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                latency: 0 
            }});

            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            mediaStreamSource.connect(analyser);
            
            isTuning = true;
            resizeCanvas();
            updateLoop();

        } catch (err) {
            console.error("Error accediendo al micrófono:", err);
            if(freqElem) freqElem.textContent = "Error mic";
            alert("No se pudo acceder al micrófono. Verifica los permisos.");
        }
    }

    function stopTuner() {
        isTuning = false;
        if (rafID) window.cancelAnimationFrame(rafID);
        
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
        
        // Reset UI
        currentCents = 0;
        targetCents = 0;
        lastNoteName = "-";
        
        if(tunerModal) tunerModal.classList.remove('show');
    }

    function updateLoop() {
        if(!isTuning) return;
        
        analyser.getFloatTimeDomainData(buf);
        
        // 1. Dibujar Onda (Osciloscopio)
        drawWaveform();

        // 2. Calcular Pitch
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac === -1) {
            // Si no hay señal clara, relajamos la aguja hacia 0 lentamente o mantenemos
            // Para efecto visual, si hay silencio, la aguja cae
            targetCents = 0; 
            // No borramos la nota inmediatamente para evitar parpadeo, pero podemos indicar silencio
            if(canvasCtx && isSilence(buf)) {
                // Silencio total
            }
        } else {
            const pitch = ac;
            const note = noteFromPitch(pitch);
            lastNoteName = noteStrings[note % 12];
            
            // Calcular Cents (-50 a +50)
            const detune = centsOffFromPitch(pitch, note);
            targetCents = detune;

            // UI Text Updates
            if(noteElem) noteElem.textContent = lastNoteName;
            if(freqElem) freqElem.textContent = Math.round(pitch) + " Hz";
            if(centsElem) centsElem.textContent = (detune > 0 ? "+" : "") + detune + " cents";
        }

        // 3. Lógica de Suavizado (Lerp) para la aguja
        // Mueve currentCents un 15% hacia targetCents en cada frame
        currentCents += (targetCents - currentCents) * 0.15;

        // 4. Actualizar Visuales de Aguja y LEDs
        updateGauge(currentCents);

        rafID = window.requestAnimationFrame(updateLoop);
    }

    function updateGauge(cents) {
        // Clamp visual
        let visualCents = Math.max(-50, Math.min(50, cents));
        
        // Mapear cents (-50..50) a grados (-45..45) o (-90..90) según diseño
        // Vamos a usar -45 a 45 grados para un look de medidor VU clásico
        const angle = visualCents * 1.2; // -50 cents * 1.2 = -60 degrees

        if(needleElem) {
            needleElem.style.transform = `translateX(-50%) rotate(${angle}deg)`;
        }

        // Detección de "Afinado" (Zona muerta de 3 cents)
        const isPerfect = Math.abs(cents) < 4;
        
        if (isPerfect) {
            frameCountInTune++;
        } else {
            frameCountInTune = 0;
        }

        // Efectos de color
        const isLocked = frameCountInTune > 5; // Requiere 5 frames estables para brillar
        
        if (isLocked) {
            tunerGauge.classList.add('in-tune');
            noteElem.style.color = "#00ff00";
            noteElem.style.textShadow = "0 0 30px #00ff00";
            
            // Apagar LEDs direccionales
            if(ledFlat) ledFlat.classList.remove('active');
            if(ledSharp) ledSharp.classList.remove('active');
        } else {
            tunerGauge.classList.remove('in-tune');
            noteElem.style.color = "#fff";
            noteElem.style.textShadow = "none";

            // LEDs direccionales
            if (cents < -5) {
                if(ledFlat) ledFlat.classList.add('active');
                if(ledSharp) ledSharp.classList.remove('active');
            } else if (cents > 5) {
                if(ledFlat) ledFlat.classList.remove('active');
                if(ledSharp) ledSharp.classList.add('active');
            } else {
                if(ledFlat) ledFlat.classList.remove('active');
                if(ledSharp) ledSharp.classList.remove('active');
            }
        }
    }

    function drawWaveform() {
        if(!canvasCtx || !canvasElem) return;

        const width = canvasElem.width;
        const height = canvasElem.height;

        canvasCtx.clearRect(0, 0, width, height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#0cf';
        canvasCtx.beginPath();

        const sliceWidth = width * 1.0 / buf.length;
        let x = 0;

        for (let i = 0; i < buf.length; i++) {
            const v = buf[i] * 2; // Ganancia visual
            const y = (height / 2) + (v * height / 2);

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        canvasCtx.stroke();
    }

    function isSilence(buffer) {
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) {
            rms += buffer[i] * buffer[i];
        }
        return Math.sqrt(rms / buffer.length) < 0.01;
    }

    // --- MATEMÁTICAS (Autocorrelación Mejorada) ---
    function autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            const val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        
        if (rms < 0.015) return -1; // Threshold de ruido

        let r1 = 0, r2 = size - 1, thres = 0.2;
        for (let i = 0; i < size / 2; i++) {
            if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        }
        for (let i = 1; i < size / 2; i++) {
            if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
        }

        const newBuf = buf.slice(r1, r2);
        size = newBuf.length;

        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size - i; j++) {
                c[i] = c[i] + newBuf[j] * newBuf[j + i];
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTunerUI);
    } else {
        initTunerUI();
    }

})();
