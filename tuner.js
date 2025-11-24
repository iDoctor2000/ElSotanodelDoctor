/*
  TUNER.JS
  Afinador Cromático Mejorado con Osciloscopio, Selector de Cuerdas, 
  Gestor de Afinaciones (Presets) y Metrónomo Integrado.
*/

(function() {
    // --- VARIABLES GLOBALES AFINADOR ---
    let audioContext = null;
    let analyser = null;
    let mediaStreamSource = null;
    let isTuning = false;
    let rafID = null;
    let buflen = 2048;
    let buf = new Float32Array(buflen);
    let filterNode = null; 

    // UI Tuning
    let tunerModal = null;
    let noteElem = null;
    let freqElem = null;
    let needleElem = null;
    let statusText = null;
    let gaugeElem = null;
    let canvas = null;
    let canvasCtx = null;
    let stringContainer = null;
    
    // Tuning Logic
    let currentTuningKey = "standard";
    let targetNoteMode = "AUTO"; 
    let smoothedPitch = 0;
    let smoothedAngle = 0;

    // Default Presets
    const defaultTunings = {
        "standard": { 
            name: "Estandar", 
            strings: { "E2": 82.41, "A2": 110.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "E4": 329.63 } 
        },
        "drop_d": { 
            name: "Drop D", 
            strings: { "D2": 73.42, "A2": 110.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "E4": 329.63 } 
        },
        "half_step": {
            name: "Half-Step Down",
            strings: { "Eb2": 77.78, "Ab2": 103.83, "Db3": 138.59, "Gb3": 185.00, "Bb3": 233.08, "eb4": 311.13 }
        },
        "open_g": {
            name: "Open G",
            strings: { "D2": 73.42, "G2": 98.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "D4": 293.66 }
        },
        "dadgad": {
            name: "DADGAD",
            strings: { "D2": 73.42, "A2": 110.00, "D3": 146.83, "G3": 196.00, "A3": 220.00, "D4": 293.66 }
        }
    };
    
    // Custom Tunings (se cargan de localStorage)
    let customTunings = {};

    // --- VARIABLES METRÓNOMO ---
    let metroContext = null;
    let isMetroPlaying = false;
    let metroBpm = 120;
    let lookahead = 25.0; // ms
    let scheduleAheadTime = 0.1; // s
    let nextNoteTime = 0.0;
    let timerID = null;

    // UI Metrónomo
    let metroPlayBtn = null;
    let metroSlider = null;
    let metroDisplay = null;
    let metroUpBtn = null;
    let metroDownBtn = null;

    // Notas cromáticas para visualización
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];


    function initTunerUI() {
        // Elementos Afinador
        tunerModal = document.getElementById('tuner-modal');
        noteElem = document.getElementById('tuner-note');
        freqElem = document.getElementById('tuner-freq');
        needleElem = document.getElementById('tuner-needle');
        statusText = document.getElementById('tuner-status-text');
        gaugeElem = document.querySelector('.tuner-gauge');
        canvas = document.getElementById('tuner-visualizer');
        if(canvas) canvasCtx = canvas.getContext('2d');
        stringContainer = document.getElementById('string-buttons-container');

        // Botones Generales
        const closeBtn = document.getElementById('close-tuner-btn');
        if(closeBtn) closeBtn.onclick = stopAll;

        const openBtn = document.getElementById('header-tuner-btn');
        if(openBtn) openBtn.onclick = startTuner;

        // --- TUNING MANAGER ---
        const tuningSelect = document.getElementById('tuning-select');
        const addBtn = document.getElementById('tuning-add-btn');
        const delBtn = document.getElementById('tuning-delete-btn');
        const saveCustomBtn = document.getElementById('save-custom-tuning');
        const cancelCustomBtn = document.getElementById('cancel-custom-tuning');
        
        loadCustomTunings();
        populateTuningSelect();

        if(tuningSelect) {
            tuningSelect.onchange = (e) => {
                currentTuningKey = e.target.value;
                targetNoteMode = "AUTO";
                renderStringButtons();
                updateDeleteButtonVisibility();
            };
        }

        if(addBtn) addBtn.onclick = openCustomTuningEditor;
        if(cancelCustomBtn) cancelCustomBtn.onclick = closeCustomTuningEditor;
        if(saveCustomBtn) saveCustomBtn.onclick = saveCustomTuning;
        if(delBtn) delBtn.onclick = deleteCurrentTuning;

        // --- METRÓNOMO ---
        metroPlayBtn = document.getElementById('metro-play');
        metroSlider = document.getElementById('metro-slider');
        metroDisplay = document.getElementById('metro-bpm-display');
        metroUpBtn = document.getElementById('metro-up');
        metroDownBtn = document.getElementById('metro-down');

        if(metroPlayBtn) metroPlayBtn.onclick = toggleMetronome;
        
        if(metroSlider) {
            metroSlider.oninput = (e) => {
                metroBpm = parseInt(e.target.value, 10);
                updateMetroDisplay();
            };
        }
        
        if(metroUpBtn) metroUpBtn.onclick = () => { changeBpm(1); };
        if(metroDownBtn) metroDownBtn.onclick = () => { changeBpm(-1); };

        // Render inicial
        renderStringButtons();
    }

    function stopAll() {
        stopTuner();
        if(isMetroPlaying) toggleMetronome();
    }

    // ==========================================
    // LÓGICA AFINADOR (CORE)
    // ==========================================

    async function startTuner() {
        if(isTuning) return;
        
        if(tunerModal) tunerModal.classList.add('show');
        
        // Pausar audio de fondo
        const siteAudio = document.getElementById('site-audio');
        if(siteAudio && !siteAudio.paused) siteAudio.pause();

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
            
            if (audioContext.state === 'suspended') await audioContext.resume();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false 
            }});

            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;

            filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 1000;

            mediaStreamSource.connect(filterNode);
            filterNode.connect(analyser);
            
            isTuning = true;
            if(statusText) statusText.textContent = "Escuchando... Toca algo.";
            drawVisualizer();
            updatePitch();

        } catch (err) {
            console.error("Error micrófono:", err);
            alert("Error accediendo al micrófono. Revisa permisos.");
            stopTuner();
        }
    }

    function stopTuner() {
        isTuning = false;
        if (rafID) window.cancelAnimationFrame(rafID);
        
        if (mediaStreamSource) {
            mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop());
            mediaStreamSource.disconnect();
        }
        if (audioContext) audioContext.close();
        
        audioContext = null;
        mediaStreamSource = null;
        analyser = null;

        if(tunerModal) tunerModal.classList.remove('show');
    }

    function drawVisualizer() {
        if (!isTuning || !canvasCtx || !analyser) return;

        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = 'rgb(0, 0, 0)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = 'rgb(0, 204, 255)';
        canvasCtx.beginPath();

        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;

        for(let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            if(i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
    }

    function updatePitch() {
        if(!isTuning) return;
        drawVisualizer();

        analyser.getFloatTimeDomainData(buf);
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac === -1) {
            if(needleElem) needleElem.style.transform = "translateX(-50%) rotate(0deg)";
            if(gaugeElem) gaugeElem.style.boxShadow = "inset 0 0 10px #000";
        } else {
            let pitch = ac;
            if (smoothedPitch === 0) smoothedPitch = pitch;
            smoothedPitch += (pitch - smoothedPitch) * 0.15;

            // Obtener info de la afinación actual
            const currentStrings = getCurrentStringsObj();

            let noteName = "";
            let detune = 0;
            let note = 0;

            if (targetNoteMode !== "AUTO") {
                // Modo Cuerda Específica
                const targetFreq = currentStrings[targetNoteMode];
                detune = 1200 * Math.log2(smoothedPitch / targetFreq);
                if (detune > 50) detune = 50; 
                if (detune < -50) detune = -50;
                noteName = targetNoteMode.replace(/[0-9]/g, '');
                note = 0; // dummy
            } else {
                // Modo Automático (Cromático)
                note = noteFromPitch(smoothedPitch);
                noteName = noteStrings[note % 12];
                detune = centsOffFromPitch(smoothedPitch, note);
            }

            if(noteElem) noteElem.textContent = noteName;
            if(freqElem) freqElem.textContent = Math.round(smoothedPitch) + " Hz";

            let angle = detune * 0.9;
            smoothedAngle += (angle - smoothedAngle) * 0.1;

            if(needleElem) needleElem.style.transform = `translateX(-50%) rotate(${smoothedAngle}deg)`;

            const isInTune = Math.abs(detune) < 5;
            
            if (isInTune) {
                if(noteElem) noteElem.style.color = "#0f0";
                if(gaugeElem) gaugeElem.style.boxShadow = "0 0 20px #0f0";
                if(statusText) {
                    statusText.textContent = "¡AFINADO!";
                    statusText.style.color = "#0f0";
                }
            } else {
                if(noteElem) noteElem.style.color = "#f00";
                if(gaugeElem) gaugeElem.style.boxShadow = "inset 0 0 10px #000";
                if(statusText) {
                    statusText.textContent = detune < 0 ? "Sube (b)" : "Baja (#)";
                    statusText.style.color = "#ccc";
                }
            }
        }
        rafID = window.requestAnimationFrame(updatePitch);
    }

    // Algoritmo de detección (reutilizado)
    function autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / size);
        if (rms < 0.015) return -1; 

        let r1 = 0, r2 = size - 1, thres = 0.2;
        for (let i = 0; i < size / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
        for (let i = 1; i < size / 2; i++) { if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; } }
        buf = buf.slice(r1, r2);
        size = buf.length;

        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
        }

        let d = 0;
        while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < size; i++) {
            if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
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
    function frequencyFromNoteNumber(note) { return 440 * Math.pow(2, (note - 69) / 12); }
    function centsOffFromPitch(frequency, note) { return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2)); }


    // ==========================================
    // TUNING MANAGER (PRESETS & CUSTOM)
    // ==========================================

    function loadCustomTunings() {
        try {
            const saved = localStorage.getItem('esdd_custom_tunings');
            if(saved) customTunings = JSON.parse(saved);
        } catch(e) { console.error("Error loading tunings", e); }
    }

    function saveCustomTuningsToStorage() {
        localStorage.setItem('esdd_custom_tunings', JSON.stringify(customTunings));
    }

    function populateTuningSelect() {
        const select = document.getElementById('tuning-select');
        if(!select) return;
        
        // Mantener opciones por defecto
        const defaultOpts = Array.from(select.querySelectorAll('option')).filter(o => defaultTunings[o.value]);
        select.innerHTML = '';
        defaultOpts.forEach(o => select.appendChild(o));

        // Añadir customs
        Object.keys(customTunings).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = customTunings[key].name + " (Custom)";
            select.appendChild(option);
        });

        select.value = currentTuningKey;
        updateDeleteButtonVisibility();
    }

    function getCurrentStringsObj() {
        if(defaultTunings[currentTuningKey]) return defaultTunings[currentTuningKey].strings;
        if(customTunings[currentTuningKey]) return customTunings[currentTuningKey].strings;
        return defaultTunings["standard"].strings; // Fallback
    }

    function renderStringButtons() {
        if(!stringContainer) return;
        stringContainer.innerHTML = '';
        
        const strings = getCurrentStringsObj();
        
        // Botón AUTO
        const autoBtn = document.createElement('button');
        autoBtn.className = `string-btn ${targetNoteMode === 'AUTO' ? 'active' : ''}`;
        autoBtn.textContent = 'Auto';
        autoBtn.onclick = () => {
            targetNoteMode = "AUTO";
            statusText.textContent = "Modo Cromático";
            renderStringButtons(); // Re-render para actualizar active
        };
        stringContainer.appendChild(autoBtn);

        Object.keys(strings).forEach(noteKey => {
            const btn = document.createElement('button');
            btn.className = `string-btn ${targetNoteMode === noteKey ? 'active' : ''}`;
            btn.textContent = noteKey;
            btn.onclick = () => {
                targetNoteMode = noteKey;
                statusText.textContent = `Afinando cuerda ${noteKey}`;
                renderStringButtons();
            };
            stringContainer.appendChild(btn);
        });
    }

    function openCustomTuningEditor() {
        document.getElementById('custom-tuning-editor').classList.add('show');
    }
    
    function closeCustomTuningEditor() {
        document.getElementById('custom-tuning-editor').classList.remove('show');
        document.getElementById('custom-tuning-name').value = "";
        document.querySelectorAll('.custom-note-input').forEach(i => i.value = "");
    }

    function saveCustomTuning() {
        const name = document.getElementById('custom-tuning-name').value.trim();
        const inputs = document.querySelectorAll('.custom-note-input');
        
        if(!name) { alert("Ponle un nombre a la afinación."); return; }

        let strings = {};
        let hasData = false;
        
        inputs.forEach(input => {
            const val = input.value.trim();
            if(val) {
                // Intentar adivinar frecuencia o usar un mapa básico
                // Por simplicidad, el usuario debe meter nota. Nosotros calculamos freq aprox si es formato E2
                const freq = parseNoteToFreq(val);
                if(freq > 0) {
                    strings[val] = freq;
                    hasData = true;
                }
            }
        });

        if(!hasData) { alert("Introduce al menos una nota válida (ej: E2, A2)."); return; }

        const id = "custom_" + Date.now();
        customTunings[id] = { name: name, strings: strings };
        saveCustomTuningsToStorage();
        populateTuningSelect();
        
        // Seleccionar la nueva
        document.getElementById('tuning-select').value = id;
        currentTuningKey = id;
        targetNoteMode = "AUTO";
        renderStringButtons();
        updateDeleteButtonVisibility();
        
        closeCustomTuningEditor();
    }

    function deleteCurrentTuning() {
        if(defaultTunings[currentTuningKey]) return; // No borrar defaults
        if(confirm("¿Borrar esta afinación personalizada?")) {
            delete customTunings[currentTuningKey];
            saveCustomTuningsToStorage();
            
            // Volver a standard
            currentTuningKey = "standard";
            populateTuningSelect();
            renderStringButtons();
            updateDeleteButtonVisibility();
        }
    }

    function updateDeleteButtonVisibility() {
        const btn = document.getElementById('tuning-delete-btn');
        if(!btn) return;
        if(customTunings[currentTuningKey]) btn.style.display = 'inline-block';
        else btn.style.display = 'none';
    }

    // Helper simple para convertir "A4" -> 440 (Aprox)
    // Soporta notación científica básica
    function parseNoteToFreq(noteStr) {
        const regex = /^([A-G][#b]?)([0-9])$/;
        const match = noteStr.match(regex);
        if(!match) return 0;
        
        const noteMap = {"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11};
        const noteName = match[1];
        const octave = parseInt(match[2]);
        
        const semitones = noteMap[noteName];
        if(semitones === undefined) return 0;
        
        // A4 es 69. C0 es 12.
        // MIDI Note = (octave + 1) * 12 + semitones
        const midi = (octave + 1) * 12 + semitones;
        return frequencyFromNoteNumber(midi);
    }


    // ==========================================
    // METRÓNOMO
    // ==========================================

    function toggleMetronome() {
        isMetroPlaying = !isMetroPlaying;
        
        if (isMetroPlaying) {
            metroPlayBtn.textContent = '⬛'; // Stop icon
            metroPlayBtn.classList.add('playing');
            
            // Init Context only when needed
            if (!metroContext) metroContext = new (window.AudioContext || window.webkitAudioContext)();
            if (metroContext.state === 'suspended') metroContext.resume();

            nextNoteTime = metroContext.currentTime;
            scheduler();
        } else {
            metroPlayBtn.textContent = '▶';
            metroPlayBtn.classList.remove('playing');
            window.clearTimeout(timerID);
        }
    }

    function scheduler() {
        // while there are notes that will need to play before the next interval, 
        // schedule them and advance the pointer.
        while (nextNoteTime < metroContext.currentTime + scheduleAheadTime) {
            scheduleNote(nextNoteTime);
            nextNote();
        }
        timerID = window.setTimeout(scheduler, lookahead);
    }

    function nextNote() {
        const secondsPerBeat = 60.0 / metroBpm;
        nextNoteTime += secondsPerBeat;
    }

    function scheduleNote(time) {
        const osc = metroContext.createOscillator();
        const gain = metroContext.createGain();

        osc.connect(gain);
        gain.connect(metroContext.destination);

        // Sonido "Click" corto y agudo
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        osc.start(time);
        osc.stop(time + 0.05);
    }

    function changeBpm(delta) {
        metroBpm += delta;
        if(metroBpm < 40) metroBpm = 40;
        if(metroBpm > 240) metroBpm = 240;
        updateMetroDisplay();
    }

    function updateMetroDisplay() {
        if(metroDisplay) metroDisplay.textContent = metroBpm + " BPM";
        if(metroSlider) metroSlider.value = metroBpm;
    }


    // Inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTunerUI);
    } else {
        initTunerUI();
    }

})();
