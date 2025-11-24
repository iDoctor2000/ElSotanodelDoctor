/*
  TUNER.JS
  Afinador Cromático "All-in-One".
  Versión Robusta: Usa MutationObserver para inyectar la interfaz 
  en cuanto el modal aparece en el DOM.
*/

(function() {
    // --- VARIABLES GLOBALES ---
    let audioContext = null;
    let analyser = null;
    let mediaStreamSource = null;
    let isTuning = false;
    let rafID = null;
    let buflen = 2048;
    let buf = new Float32Array(buflen);
    let filterNode = null; 

    // Referencias DOM
    let tunerModal = null;
    let noteElem = null;
    let freqElem = null;
    let needleElem = null;
    let statusText = null;
    let gaugeElem = null;
    let canvas = null;
    let canvasCtx = null;
    let stringContainer = null;
    
    // Lógica Afinación
    let currentTuningKey = "standard";
    let targetNoteMode = "AUTO"; 
    let smoothedPitch = 0;
    let smoothedAngle = 0;

    // Lógica Metrónomo
    let metroContext = null;
    let isMetroPlaying = false;
    let metroBpm = 120;
    let nextNoteTime = 0.0;
    let timerID = null;

    // Presets
    const defaultTunings = {
        "standard": { name: "Estandar", strings: { "E2": 82.41, "A2": 110.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "E4": 329.63 } },
        "drop_d": { name: "Drop D", strings: { "D2": 73.42, "A2": 110.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "E4": 329.63 } },
        "half_step": { name: "Half-Step Down", strings: { "Eb2": 77.78, "Ab2": 103.83, "Db3": 138.59, "Gb3": 185.00, "Bb3": 233.08, "eb4": 311.13 } },
        "open_g": { name: "Open G", strings: { "D2": 73.42, "G2": 98.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "D4": 293.66 } }
    };
    let customTunings = {};
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // --- 1. INYECCIÓN DE ESTILOS ---

    function injectTunerStyles() {
        if(document.getElementById('tuner-injected-styles')) return;
        const css = `
            /* Visualizador */
            #tuner-visualizer { width: 100%; height: 60px; background: #000; border: 1px solid #333; border-radius: 6px; margin-bottom: 10px; display: block; }
            
            /* Secciones */
            .tuner-section { margin-top: 15px; border-top: 1px solid #333; padding-top: 10px; width: 100%; box-sizing: border-box; }
            .tuner-section h4 { margin: 0 0 10px 0; color: #0cf; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; }

            /* Botones de Cuerda */
            #string-buttons-container { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-bottom: 10px; }
            .string-btn { background: #222; color: #aaa; border: 1px solid #444; border-radius: 50%; width: 35px; height: 35px; cursor: pointer; font-size: 0.8em; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
            .string-btn:hover { border-color: #fff; color: #fff; }
            .string-btn.active { background: #0cf; color: #000; border-color: #0cf; font-weight: bold; box-shadow: 0 0 10px rgba(0, 204, 255, 0.4); }

            /* Controles Afinación */
            .tuning-controls { display: flex; gap: 5px; justify-content: center; margin-bottom: 10px; }
            #tuning-select { background: #111; color: #fff; border: 1px solid #333; padding: 5px; border-radius: 4px; font-size: 0.9em; max-width: 200px; }
            .icon-btn { background: #333; border: none; color: #fff; width: 30px; height: 30px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
            .icon-btn:hover { background: #444; }

            /* Metrónomo */
            .metro-ui { display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; }
            .metro-header { display: flex; justify-content: space-between; align-items: center; color: #ddd; font-size: 0.9em; }
            .metro-bpm-val { color: #0cf; font-weight: bold; font-family: monospace; font-size: 1.2em; }
            .metro-controls { display: flex; align-items: center; gap: 10px; }
            .metro-slider { flex-grow: 1; accent-color: #0cf; cursor: pointer; }
            .metro-play-btn { background: #0cf; color: #000; border: none; border-radius: 4px; padding: 5px 15px; font-weight: bold; cursor: pointer; min-width: 60px; }
            .metro-play-btn.playing { background: #ff3333; color: #fff; animation: pulse 1s infinite; }
            .metro-adj-btn { background: #222; border: 1px solid #444; color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }

            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }

            /* Editor Custom (Overlay) */
            #custom-tuning-editor { 
                display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(10,10,10,0.98); z-index: 10; padding: 20px; 
                flex-direction: column; align-items: center; justify-content: center; 
                box-sizing: border-box;
            }
            #custom-tuning-editor.show { display: flex; }
            .custom-editor-content { width: 100%; max-width: 300px; text-align: center; }
            .custom-editor-content input { width: 100%; padding: 8px; margin: 5px 0; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box; }
            .custom-note-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 15px 0; }
            .custom-actions { display: flex; gap: 10px; justify-content: center; margin-top: 15px; }
            .action-btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
            .btn-save { background: #0cf; color: #000; }
            .btn-cancel { background: #444; color: #fff; }
        `;
        const style = document.createElement('style');
        style.id = 'tuner-injected-styles';
        style.innerHTML = css;
        document.head.appendChild(style);
        console.log("Estilos del afinador inyectados.");
    }

    // --- 2. INYECCIÓN HTML (CON DETECCIÓN DE DOM) ---

    function injectTunerHTML() {
        tunerModal = document.getElementById('tuner-modal');
        if(!tunerModal) {
            console.log("Tuner modal no encontrado aún.");
            return false;
        }

        // Buscamos el contenedor interno
        const contentDiv = tunerModal.querySelector('.modal-content'); // Cambiado a .modal-content para mayor precisión
        if(!contentDiv) return false;

        console.log("Inyectando interfaz del afinador...");

        // 1. Inyectar Visualizador (Canvas)
        // Buscamos tuner-display, si existe lo ponemos ahí, si no, al principio de contentDiv
        const displayDiv = contentDiv.querySelector('.tuner-display');
        const targetForVisualizer = displayDiv || contentDiv;
        
        if(!document.getElementById('tuner-visualizer')) {
            const cvs = document.createElement('canvas');
            cvs.id = 'tuner-visualizer';
            cvs.width = 300; 
            cvs.height = 60;
            if(displayDiv) {
                displayDiv.insertBefore(cvs, displayDiv.firstChild);
            } else {
                contentDiv.insertBefore(cvs, contentDiv.firstChild);
            }
        }

        // 2. Inyectar Secciones de Control
        // Buscamos el botón de cerrar para insertar antes
        const closeBtn = document.getElementById('close-tuner-btn');
        const insertTarget = closeBtn || contentDiv.lastChild;

        if(!document.getElementById('tuning-manager-section')) {
            const div = document.createElement('div');
            div.id = 'tuning-manager-section';
            div.className = 'tuner-section';
            div.innerHTML = `
                <div class="tuning-controls">
                    <select id="tuning-select"></select>
                    <button id="tuning-add-btn" class="icon-btn" title="Crear">+</button>
                    <button id="tuning-delete-btn" class="icon-btn" title="Borrar" style="background:#522; display:none;">×</button>
                </div>
                <div id="string-buttons-container"></div>
            `;
            contentDiv.insertBefore(div, insertTarget);
        }

        if(!document.getElementById('metronome-section')) {
            const div = document.createElement('div');
            div.id = 'metronome-section';
            div.className = 'tuner-section';
            div.innerHTML = `
                <div class="metro-ui">
                    <div class="metro-header">
                        <span>Metrónomo</span>
                        <span id="metro-bpm-display" class="metro-bpm-val">120 BPM</span>
                    </div>
                    <div class="metro-controls">
                        <button id="metro-down" class="metro-adj-btn">-</button>
                        <input type="range" id="metro-slider" class="metro-slider" min="40" max="240" value="120">
                        <button id="metro-up" class="metro-adj-btn">+</button>
                    </div>
                    <button id="metro-play" class="metro-play-btn">PLAY</button>
                </div>
            `;
            contentDiv.insertBefore(div, insertTarget);
        }

        // 3. Editor Overlay
        if(!document.getElementById('custom-tuning-editor')) {
            const overlay = document.createElement('div');
            overlay.id = 'custom-tuning-editor';
            overlay.innerHTML = `
                <div class="custom-editor-content">
                    <h3>Nueva Afinación</h3>
                    <input type="text" id="custom-tuning-name" placeholder="Nombre (ej: Open D)">
                    <p style="font-size:0.8em; color:#aaa; margin-bottom:5px;">Notas (ej: D2, A2, F#3...)</p>
                    <div class="custom-note-grid">
                        <input type="text" class="custom-note-input" placeholder="1">
                        <input type="text" class="custom-note-input" placeholder="2">
                        <input type="text" class="custom-note-input" placeholder="3">
                        <input type="text" class="custom-note-input" placeholder="4">
                        <input type="text" class="custom-note-input" placeholder="5">
                        <input type="text" class="custom-note-input" placeholder="6">
                    </div>
                    <div class="custom-actions">
                        <button id="cancel-custom-tuning" class="action-btn btn-cancel">Cancelar</button>
                        <button id="save-custom-tuning" class="action-btn btn-save">Guardar</button>
                    </div>
                </div>
            `;
            contentDiv.appendChild(overlay);
        }

        // Una vez inyectado, bindeamos eventos
        bindDynamicEvents();
        return true;
    }

    function initTunerSystem() {
        injectTunerStyles();
        
        // Intentar inyectar inmediatamente
        const injected = injectTunerHTML();

        // Si no se pudo inyectar (DOM no listo), usamos MutationObserver
        if(!injected) {
            console.log("Observando DOM para inyección del afinador...");
            const observer = new MutationObserver((mutations, obs) => {
                const modal = document.getElementById('tuner-modal');
                if(modal) {
                    const success = injectTunerHTML();
                    if(success) {
                        console.log("Afinador inyectado tras detección de DOM.");
                        obs.disconnect(); // Dejar de observar una vez inyectado
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // Listener global para abrir
        const openBtn = document.getElementById('header-tuner-btn');
        if(openBtn) {
            openBtn.onclick = startTuner;
        } else {
            // Si el botón está dentro de un menú que también se carga tarde
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('#header-tuner-btn');
                if(btn) {
                    startTuner();
                }
            });
        }
    }

    function bindDynamicEvents() {
        // Referencias
        noteElem = document.getElementById('tuner-note');
        freqElem = document.getElementById('tuner-freq');
        needleElem = document.getElementById('tuner-needle');
        statusText = document.getElementById('tuner-status-text');
        gaugeElem = document.querySelector('.tuner-gauge');
        canvas = document.getElementById('tuner-visualizer');
        if(canvas) canvasCtx = canvas.getContext('2d');
        stringContainer = document.getElementById('string-buttons-container');

        // Botón Cerrar
        const closeBtn = document.getElementById('close-tuner-btn');
        if(closeBtn) {
            // Clonamos para eliminar listeners anteriores y evitar duplicados
            const newClose = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newClose, closeBtn);
            newClose.onclick = stopAll;
        }

        // Tuning Manager
        const select = document.getElementById('tuning-select');
        const addBtn = document.getElementById('tuning-add-btn');
        const delBtn = document.getElementById('tuning-delete-btn');
        const saveCustom = document.getElementById('save-custom-tuning');
        const cancelCustom = document.getElementById('cancel-custom-tuning');

        if(select) select.onchange = (e) => {
            currentTuningKey = e.target.value;
            targetNoteMode = "AUTO";
            renderStringButtons();
            updateDeleteButton();
        };
        if(addBtn) addBtn.onclick = () => document.getElementById('custom-tuning-editor').classList.add('show');
        if(cancelCustom) cancelCustom.onclick = () => document.getElementById('custom-tuning-editor').classList.remove('show');
        if(saveCustom) saveCustom.onclick = saveCustomTuning;
        if(delBtn) delBtn.onclick = deleteCurrentTuning;

        // Metrónomo
        const mPlay = document.getElementById('metro-play');
        const mUp = document.getElementById('metro-up');
        const mDown = document.getElementById('metro-down');
        const mSlide = document.getElementById('metro-slider');
        
        if(mPlay) mPlay.onclick = toggleMetronome;
        if(mUp) mUp.onclick = () => changeBpm(5);
        if(mDown) mDown.onclick = () => changeBpm(-5);
        if(mSlide) mSlide.oninput = (e) => {
            metroBpm = parseInt(e.target.value, 10);
            updateMetroDisplay();
        };

        // Cargar datos
        loadCustomTunings();
        populateTuningSelect();
        renderStringButtons();
    }

    function stopAll() {
        stopTuner();
        if(isMetroPlaying) toggleMetronome();
    }

    // --- 3. LÓGICA DE AUDIO (AFINADOR) ---

    async function startTuner() {
        // Reintentar inyección por si acaso el DOM cambió
        injectTunerHTML();
        
        if(isTuning) return;
        tunerModal = document.getElementById('tuner-modal');
        if(tunerModal) tunerModal.classList.add('show');
        
        const siteAudio = document.getElementById('site-audio');
        if(siteAudio && !siteAudio.paused) siteAudio.pause();

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
            
            // Resume context si está suspendido (requisito navegador)
            if (audioContext.state === 'suspended') await audioContext.resume();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: false, noiseSuppression: false, autoGainControl: false 
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
            if(statusText) statusText.textContent = "Toca una cuerda...";
            
            updatePitch();

        } catch (err) {
            console.error("Error micrófono:", err);
            alert("Error al acceder al micrófono. Verifica permisos y conexión segura (HTTPS/Localhost).");
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
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        if(tunerModal) tunerModal.classList.remove('show');
    }

    function drawVisualizer() {
        if (!isTuning || !canvasCtx || !analyser || !canvas) return;
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#0cf';
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
            // Sin señal clara
        } else {
            let pitch = ac;
            // Suavizado
            if (smoothedPitch === 0) smoothedPitch = pitch;
            smoothedPitch += (pitch - smoothedPitch) * 0.15;

            const strings = getCurrentStrings();
            let noteName = "", detune = 0, note = 0;

            if (targetNoteMode !== "AUTO") {
                const targetFreq = strings[targetNoteMode];
                // Calcular cents de diferencia con la nota objetivo
                detune = 1200 * Math.log2(smoothedPitch / targetFreq);
                // Clamp visual
                if (detune > 50) detune = 50; 
                if (detune < -50) detune = -50;
                noteName = targetNoteMode;
            } else {
                note = noteFromPitch(smoothedPitch);
                noteName = noteStrings[note % 12];
                detune = centsOffFromPitch(smoothedPitch, note);
            }

            if(noteElem) noteElem.textContent = noteName.replace(/[0-9]/g, ''); 
            if(freqElem) freqElem.textContent = Math.round(smoothedPitch) + " Hz";

            let angle = detune * 0.9;
            smoothedAngle += (angle - smoothedAngle) * 0.1;
            if(needleElem) needleElem.style.transform = `translateX(-50%) rotate(${smoothedAngle}deg)`;

            const isInTune = Math.abs(detune) < 5;
            if (isInTune) {
                if(noteElem) noteElem.style.color = "#0f0";
                if(gaugeElem) gaugeElem.style.boxShadow = "0 0 20px #0f0";
            } else {
                if(noteElem) noteElem.style.color = "#f00";
                if(gaugeElem) gaugeElem.style.boxShadow = "inset 0 0 10px #000";
            }
        }
        rafID = window.requestAnimationFrame(updatePitch);
    }

    // --- ALGORITMOS AUDIO ---
    function autoCorrelate(buf, sampleRate) {
        let size = buf.length, rms = 0;
        for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / size);
        if (rms < 0.01) return -1;
        let r1 = 0, r2 = size - 1, thres = 0.2;
        for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
        buf = buf.slice(r1, r2); size = buf.length;
        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) for (let j = 0; j < size - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
        let d = 0; while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < size; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
        let T0 = maxpos;
        const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
        const a = (x1 + x3 - 2 * x2) / 2;
        const b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);
        return sampleRate / T0;
    }
    function noteFromPitch(f) { return Math.round(12 * (Math.log(f / 440) / Math.log(2))) + 69; }
    function frequencyFromNoteNumber(note) { return 440 * Math.pow(2, (note - 69) / 12); }
    function centsOffFromPitch(f, note) { return Math.floor(1200 * Math.log(f / frequencyFromNoteNumber(note)) / Math.log(2)); }


    // --- 4. GESTIÓN DE DATOS Y UI ---

    function loadCustomTunings() {
        try {
            const s = localStorage.getItem('esdd_custom_tunings');
            if(s) customTunings = JSON.parse(s);
        } catch(e) {}
    }
    function saveCustomTuningsToStorage() { localStorage.setItem('esdd_custom_tunings', JSON.stringify(customTunings)); }

    function populateTuningSelect() {
        const select = document.getElementById('tuning-select');
        if(!select) return;
        select.innerHTML = '';
        
        const grpDef = document.createElement('optgroup'); grpDef.label = "Predeterminadas";
        Object.keys(defaultTunings).forEach(k => {
            const o = document.createElement('option'); o.value = k; o.textContent = defaultTunings[k].name;
            grpDef.appendChild(o);
        });
        select.appendChild(grpDef);

        if(Object.keys(customTunings).length > 0) {
            const grpCust = document.createElement('optgroup'); grpCust.label = "Mis Afinaciones";
            Object.keys(customTunings).forEach(k => {
                const o = document.createElement('option'); o.value = k; o.textContent = customTunings[k].name;
                grpCust.appendChild(o);
            });
            select.appendChild(grpCust);
        }
        select.value = currentTuningKey;
    }

    function getCurrentStrings() {
        return (defaultTunings[currentTuningKey] || customTunings[currentTuningKey] || defaultTunings["standard"]).strings;
    }

    function renderStringButtons() {
        if(!stringContainer) return;
        stringContainer.innerHTML = '';
        const strings = getCurrentStrings();
        
        const autoBtn = document.createElement('button');
        autoBtn.className = `string-btn ${targetNoteMode === 'AUTO' ? 'active' : ''}`;
        autoBtn.textContent = 'A';
        autoBtn.title = "Automático (Cromático)";
        autoBtn.onclick = () => { targetNoteMode = "AUTO"; renderStringButtons(); };
        stringContainer.appendChild(autoBtn);

        Object.keys(strings).forEach(k => {
            const btn = document.createElement('button');
            btn.className = `string-btn ${targetNoteMode === k ? 'active' : ''}`;
            btn.textContent = k.replace(/[0-9]/, ''); 
            btn.onclick = () => { targetNoteMode = k; renderStringButtons(); };
            stringContainer.appendChild(btn);
        });
    }

    function saveCustomTuning() {
        const name = document.getElementById('custom-tuning-name').value.trim();
        const inputs = document.querySelectorAll('.custom-note-input');
        if(!name) return alert("Nombre obligatorio");
        
        let strings = {};
        let hasNote = false;
        inputs.forEach(inp => {
            const val = inp.value.trim();
            if(val) {
                const freq = parseNoteToFreq(val);
                if(freq > 0) { strings[val] = freq; hasNote = true; }
            }
        });
        if(!hasNote) return alert("Introduce notas válidas (ej: E2, A#2)");

        const id = "c_" + Date.now();
        customTunings[id] = { name, strings };
        saveCustomTuningsToStorage();
        populateTuningSelect();
        
        document.getElementById('tuning-select').value = id;
        currentTuningKey = id;
        targetNoteMode = "AUTO";
        renderStringButtons();
        updateDeleteButton();
        document.getElementById('custom-tuning-editor').classList.remove('show');
    }

    function parseNoteToFreq(n) {
        // Regex simple ej: E2, C#3
        const m = n.match(/^([A-G][#b]?)([0-9])$/);
        if(!m) return 0;
        const noteMap = {"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11};
        const semis = noteMap[m[1]];
        const oct = parseInt(m[2]);
        if(semis === undefined) return 0;
        return frequencyFromNoteNumber((oct + 1) * 12 + semis);
    }

    function deleteCurrentTuning() {
        if(customTunings[currentTuningKey] && confirm("¿Borrar afinación?")) {
            delete customTunings[currentTuningKey];
            saveCustomTuningsToStorage();
            currentTuningKey = "standard";
            populateTuningSelect();
            renderStringButtons();
            updateDeleteButton();
        }
    }

    function updateDeleteButton() {
        const btn = document.getElementById('tuning-delete-btn');
        if(btn) btn.style.display = customTunings[currentTuningKey] ? 'flex' : 'none';
    }

    // --- 5. METRÓNOMO ---

    function toggleMetronome() {
        isMetroPlaying = !isMetroPlaying;
        const btn = document.getElementById('metro-play');
        if(isMetroPlaying) {
            if(btn) { btn.textContent = "STOP"; btn.classList.add('playing'); }
            if(!metroContext) metroContext = new (window.AudioContext || window.webkitAudioContext)();
            if(metroContext.state === 'suspended') metroContext.resume();
            nextNoteTime = metroContext.currentTime;
            scheduler();
        } else {
            if(btn) { btn.textContent = "PLAY"; btn.classList.remove('playing'); }
            window.clearTimeout(timerID);
        }
    }

    function scheduler() {
        while (nextNoteTime < metroContext.currentTime + 0.1) {
            scheduleNote(nextNoteTime);
            nextNoteTime += (60.0 / metroBpm);
        }
        timerID = window.setTimeout(scheduler, 25);
    }

    function scheduleNote(time) {
        const osc = metroContext.createOscillator();
        const gain = metroContext.createGain();
        osc.connect(gain);
        gain.connect(metroContext.destination);
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
    }

    function changeBpm(delta) {
        metroBpm = Math.min(240, Math.max(40, metroBpm + delta));
        updateMetroDisplay();
    }
    
    function updateMetroDisplay() {
        const disp = document.getElementById('metro-bpm-display');
        const slid = document.getElementById('metro-slider');
        if(disp) disp.textContent = metroBpm + " BPM";
        if(slid) slid.value = metroBpm;
    }

    // --- ARRANQUE ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTunerSystem);
    } else {
        initTunerSystem();
    }

})();
