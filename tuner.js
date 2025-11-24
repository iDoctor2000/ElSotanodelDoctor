/*
  TUNER.JS - GUITAR RACK EDITION
  Afinador Cromático Integrado con Osciloscopio, Aguja Analógica, Visualizador de Cuerdas y Selector de Afinación.
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
    let frameCountInTune = 0;
    let lastNoteName = "-";
    
    // Estroboscopio
    let strobePhase = 0;

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
    let strobeCursor = null;
    let stringContainer = null;
    let tuningSelect = null;

    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Afinaciones de Guitarra (Frecuencias en Hz para cuerdas 6 a 1)
    // Nota: Para la detección visual de cuerda, usamos rangos aproximados, pero aquí definimos las notas base
    const GUITAR_TUNINGS = {
        'standard': [
            { note: 'E', oct: 2, freq: 82.41 },
            { note: 'A', oct: 2, freq: 110.00 },
            { note: 'D', oct: 3, freq: 146.83 },
            { note: 'G', oct: 3, freq: 196.00 },
            { note: 'B', oct: 3, freq: 246.94 },
            { note: 'e', oct: 4, freq: 329.63 }
        ],
        'dropD': [
            { note: 'D', oct: 2, freq: 73.42 }, // Drop
            { note: 'A', oct: 2, freq: 110.00 },
            { note: 'D', oct: 3, freq: 146.83 },
            { note: 'G', oct: 3, freq: 196.00 },
            { note: 'B', oct: 3, freq: 246.94 },
            { note: 'e', oct: 4, freq: 329.63 }
        ],
        'eb': [
            { note: 'Eb', oct: 2, freq: 77.78 },
            { note: 'Ab', oct: 2, freq: 103.83 },
            { note: 'Db', oct: 3, freq: 138.59 },
            { note: 'Gb', oct: 3, freq: 185.00 },
            { note: 'Bb', oct: 3, freq: 233.08 },
            { note: 'eb', oct: 4, freq: 311.13 }
        ],
        'openG': [
            { note: 'D', oct: 2, freq: 73.42 },
            { note: 'G', oct: 2, freq: 98.00 },
            { note: 'D', oct: 3, freq: 146.83 },
            { note: 'G', oct: 3, freq: 196.00 },
            { note: 'B', oct: 3, freq: 246.94 },
            { note: 'd', oct: 4, freq: 293.66 }
        ],
        'dadgad': [
            { note: 'D', oct: 2, freq: 73.42 },
            { note: 'A', oct: 2, freq: 110.00 },
            { note: 'D', oct: 3, freq: 146.83 },
            { note: 'G', oct: 3, freq: 196.00 },
            { note: 'A', oct: 3, freq: 220.00 },
            { note: 'd', oct: 4, freq: 293.66 }
        ]
    };

    let currentTuningKey = 'standard';

    function initTunerUI() {
        tunerModal = document.getElementById('tuner-modal');
        noteElem = document.getElementById('tuner-note');
        freqElem = document.getElementById('tuner-freq');
        needleElem = document.getElementById('tuner-needle');
        centsElem = document.getElementById('tuner-cents');
        canvasElem = document.getElementById('tuner-visualizer');
        ledFlat = document.getElementById('led-flat');
        ledSharp = document.getElementById('led-sharp');
        tunerGauge = document.querySelector('.tuner-gauge-pro');
        strobeCursor = document.getElementById('strobe-cursor');
        stringContainer = document.getElementById('guitar-strings');
        tuningSelect = document.getElementById('tuning-select');

        if (canvasElem) {
            canvasCtx = canvasElem.getContext('2d');
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
        }

        if (tuningSelect) {
            tuningSelect.addEventListener('change', (e) => {
                currentTuningKey = e.target.value;
                renderStringsUI();
            });
        }

        const closeBtn = document.getElementById('close-tuner-btn');
        if(closeBtn) closeBtn.onclick = stopTuner;

        const openBtn = document.getElementById('header-tuner-btn');
        if(openBtn) openBtn.onclick = startTuner;
    }

    function resizeCanvas() {
        if(canvasElem) {
            canvasElem.width = canvasElem.clientWidth;
            canvasElem.height = canvasElem.clientHeight;
        }
    }

    function renderStringsUI() {
        if (!stringContainer) return;
        stringContainer.innerHTML = '';
        
        const tuning = GUITAR_TUNINGS[currentTuningKey];
        // Iterar inverso (6ta cuerda a la izquierda visualmente, pero array es 0..5)
        // Comúnmente afinadores muestran: 6 5 4 3 2 1 (Grave a Agudo)
        for (let i = 0; i < tuning.length; i++) {
            const s = tuning[i];
            const div = document.createElement('div');
            div.className = 'guitar-string';
            div.id = `string-${i}`; // 0 es la 6ta (E grave en standard)
            div.innerHTML = `<span class="note">${s.note}</span><span class="num">${6-i}</span>`;
            stringContainer.appendChild(div);
        }
    }

    async function startTuner() {
        if(isTuning) return;
        
        if(tunerModal) tunerModal.classList.add('show');
        
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
            renderStringsUI();
            resizeCanvas();
            updateLoop();

        } catch (err) {
            console.error("Error mic:", err);
            alert("Permiso de micrófono denegado.");
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
        
        if(tunerModal) tunerModal.classList.remove('show');
    }

    function updateLoop() {
        if(!isTuning) return;
        
        analyser.getFloatTimeDomainData(buf);
        
        drawWaveform();

        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac === -1) {
            targetCents = 0; // Relax needle
            // Fade strings inactive?
            updateActiveString(-1);
        } else {
            const pitch = ac;
            const note = noteFromPitch(pitch);
            lastNoteName = noteStrings[note % 12];
            
            // Detectar cuerda más cercana en la afinación seleccionada
            identifyString(pitch);

            const detune = centsOffFromPitch(pitch, note);
            targetCents = detune;

            if(noteElem) noteElem.textContent = lastNoteName;
            if(freqElem) freqElem.textContent = Math.round(pitch) + " Hz";
            if(centsElem) centsElem.textContent = (detune > 0 ? "+" : "") + detune + " cents";
        }

        // Smooth needle
        currentCents += (targetCents - currentCents) * 0.15;

        updateGauge(currentCents);
        updateStrobe(currentCents);

        rafID = window.requestAnimationFrame(updateLoop);
    }

    // Encuentra qué cuerda de la afinación actual está más cerca de la frecuencia detectada
    function identifyString(freq) {
        const tuning = GUITAR_TUNINGS[currentTuningKey];
        let closestIndex = -1;
        let minDiff = Infinity;

        for (let i = 0; i < tuning.length; i++) {
            const targetFreq = tuning[i].freq;
            // Comparamos en escala logarítmica (ratio) o absoluta si están cerca
            // Para simplificar, diferencia absoluta funciona si no hay armónicos locos
            const diff = Math.abs(freq - targetFreq);
            
            // Umbral para considerar que es esa cuerda (ej: +/- 30% de un semitono es muy poco, 
            // mejor buscar la más cercana simplemente y ver si está dentro de un rango razonable)
            // Rango razonable: +/- 6 semitonos (media octava) para evitar saltos raros?
            // Vamos a hacerlo simple: la más cercana gana.
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        // Solo resaltar si está "razonablemente" cerca (ej: dentro de +/- 10Hz para bajos, más para agudos)
        // O mejor, dentro de 150 cents
        // Vamos a confiar en el más cercano.
        updateActiveString(closestIndex, minDiff);
    }

    function updateActiveString(index, diff) {
        if (!stringContainer) return;
        const strings = stringContainer.children;
        
        for (let i = 0; i < strings.length; i++) {
            const el = strings[i];
            if (i === index) {
                el.classList.add('active');
                // Si está muy afinado (diff muy bajo), añadir clase locked
                // Nota: diff es en Hz. targetCents es más preciso para "locked".
                if (Math.abs(targetCents) < 5 && Math.abs(diff) < 5) {
                    el.classList.add('locked');
                } else {
                    el.classList.remove('locked');
                }
            } else {
                el.classList.remove('active', 'locked');
            }
        }
    }

    function updateStrobe(cents) {
        if (!strobeCursor) return;
        // Velocidad basada en qué tan desafinado está
        const speed = cents * 0.5; 
        strobePhase += speed;
        
        // Limitar fase visual
        let visualPos = (strobePhase % 100); // Moverse en %
        // Para efecto estroboscópico real, debería ser un patrón repetitivo.
        // Simularemos un cursor que corre.
        
        // Si está afinado (cerca de 0), se mueve muy lento o para.
        // Usamos translate
        
        // Hack visual simple: Mover el cursor de izquierda a derecha con wrap
        // Si cents > 0, mueve derecha. Si cents < 0, mueve izquierda.
        
        // Ajustar posición central (50%) + desplazamiento cíclico
        // Para simular la rueda estroboscópica, simplemente hacemos que corra.
        
        if (Math.abs(cents) < 2) {
            strobeCursor.style.transform = `translateX(-50%)`; // Quieto en el centro
        } else {
            // Wrap logic manual para CSS transform es compleja sin resetear transición.
            // Usaremos un approach más simple: Offset desde el centro limitado
            // Ojo: El estroboscopio real gira. 
            
            // Simulación sencilla: Desplazar cursor proporcional al error, pero "vibrando" si no es perfecto?
            // Mejor: Barra estilo "Coche Fantástico" pero siguiendo la afinación.
            
            // Vamos a usar la posición como un indicador fino adicional.
            // -50 cents = 0%, +50 cents = 100%
            let percent = 50 + cents; // Escala directa 1:1
            percent = Math.max(0, Math.min(100, percent));
            strobeCursor.style.left = `${percent}%`;
            strobeCursor.style.transform = `translateX(-50%)`;
        }
    }

    function updateGauge(cents) {
        const angle = Math.max(-45, Math.min(45, cents * 1.2));

        if(needleElem) {
            needleElem.style.transform = `translateX(-50%) rotate(${angle}deg)`;
        }

        const isPerfect = Math.abs(cents) < 4;
        
        if (isPerfect) {
            frameCountInTune++;
        } else {
            frameCountInTune = 0;
        }

        const isLocked = frameCountInTune > 5;
        
        if (isLocked) {
            noteElem.style.color = "#00ff00";
            if(ledFlat) ledFlat.classList.remove('active');
            if(ledSharp) ledSharp.classList.remove('active');
            document.querySelector('.led-indicator.in-tune').classList.add('active');
        } else {
            noteElem.style.color = "#fff";
            document.querySelector('.led-indicator.in-tune').classList.remove('active');

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

    // --- MATEMÁTICAS ---
    function autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) {
            const val = buf[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / size);
        
        if (rms < 0.015) return -1; 

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
