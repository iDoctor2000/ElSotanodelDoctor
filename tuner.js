/*
  TUNER.JS - EL SÓTANO DEL DOCTOR
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
            #tuner-visualizer { width: 100%; height: 60px; background: #000; border: 1px solid #333; border-radius: 6px; margin-bottom: 10px; display: block; }
            .tuner-section { margin-top: 15px; border-top: 1px solid #333; padding-top: 10px; width: 100%; box-sizing: border-box; }
            .tuner-section h4 { margin: 0 0 10px 0; color: #0cf; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; }
            #string-buttons-container { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-bottom: 10px; }
            .string-btn { background: #222; color: #aaa; border: 1px solid #444; border-radius: 50%; width: 35px; height: 35px; cursor: pointer; font-size: 0.8em; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
            .string-btn:hover { border-color: #fff; color: #fff; }
            .string-btn.active { background: #0cf; color: #000; border-color: #0cf; font-weight: bold; box-shadow: 0 0 10px rgba(0, 204, 255, 0.4); }
            .tuning-controls { display: flex; gap: 5px; justify-content: center; margin-bottom: 10px; width: 100%; }
            #tuning-select { background: #111; color: #fff; border: 1px solid #333; padding: 5px; border-radius: 4px; font-size: 0.9em; flex-grow: 1; }
            .icon-btn { background: #333; border: none; color: #fff; width: 30px; height: 30px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
            .metro-ui { display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; width: 100%; }
            .metro-header { display: flex; justify-content: space-between; align-items: center; color: #ddd; font-size: 0.9em; }
            .metro-bpm-val { color: #0cf; font-weight: bold; font-family: monospace; font-size: 1.2em; }
            .metro-controls { display: flex; align-items: center; gap: 10px; }
            .metro-slider { flex-grow: 1; accent-color: #0cf; cursor: pointer; }
            .metro-play-btn { background: #0cf; color: #000; border: none; border-radius: 4px; padding: 10px; font-weight: bold; cursor: pointer; }
            #custom-tuning-editor { 
                display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                background: rgba(10,10,10,0.98); z-index: 10; padding: 20px; 
                flex-direction: column; align-items: center; justify-content: center; 
            }
            #custom-tuning-editor.show { display: flex; }
            .custom-note-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 15px 0; }
            .custom-note-grid input { width: 100%; padding: 5px; background: #222; color: #fff; border: 1px solid #444; text-align: center; }
        `;
        const style = document.createElement('style');
        style.id = 'tuner-injected-styles';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    // --- 2. INYECCIÓN HTML ---

    function injectTunerHTML() {
        tunerModal = document.getElementById('tuner-modal');
        if(!tunerModal) return false;

        const contentDiv = tunerModal.querySelector('.modal-content');
        if(!contentDiv) return false;

        if(!document.getElementById('tuner-visualizer')) {
            const cvs = document.createElement('canvas');
            cvs.id = 'tuner-visualizer';
            cvs.width = 300; 
            cvs.height = 60;
            const displayDiv = contentDiv.querySelector('.tuner-display');
            displayDiv.insertBefore(cvs, displayDiv.firstChild);
        }

        if(!document.getElementById('tuning-manager-section')) {
            const div = document.createElement('div');
            div.id = 'tuning-manager-section';
            div.className = 'tuner-section';
            div.innerHTML = `
                <h4>Afinación</h4>
                <div class="tuning-controls">
                    <select id="tuning-select"></select>
                    <button id="tuning-add-btn" class="icon-btn" title="Crear">+</button>
                    <button id="tuning-delete-btn" class="icon-btn" title="Borrar" style="background:#522; display:none;">×</button>
                </div>
                <div id="string-buttons-container"></div>
            `;
            const closeBtn = document.getElementById('close-tuner-btn');
            contentDiv.insertBefore(div, closeBtn);
        }

        if(!document.getElementById('metronome-section')) {
            const div = document.createElement('div');
            div.id = 'metronome-section';
            div.className = 'tuner-section';
            div.innerHTML = `
                <h4>Metrónomo</h4>
                <div class="metro-ui">
                    <div class="metro-header">
                        <span id="metro-bpm-display" class="metro-bpm-val">120 BPM</span>
                    </div>
                    <div class="metro-controls">
                        <button id="metro-down" class="icon-btn">-</button>
                        <input type="range" id="metro-slider" class="metro-slider" min="40" max="240" value="120">
                        <button id="metro-up" class="icon-btn">+</button>
                    </div>
                    <button id="metro-play" class="metro-play-btn">PLAY</button>
                </div>
            `;
            const closeBtn = document.getElementById('close-tuner-btn');
            contentDiv.insertBefore(div, closeBtn);
        }

        if(!document.getElementById('custom-tuning-editor')) {
            const overlay = document.createElement('div');
            overlay.id = 'custom-tuning-editor';
            overlay.innerHTML = `
                <h3>Nueva Afinación</h3>
                <input type="text" id="custom-tuning-name" placeholder="Nombre (ej: Drop D)" style="width:100%; padding:10px; margin-bottom:10px; background:#222; color:#fff; border:1px solid #444;">
                <div class="custom-note-grid">
                    ${Array.from({length:6}, (_,i)=> `<input type="text" class="custom-note-input" placeholder="Nota ${i+1}">`).join('')}
                </div>
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button id="save-custom-tuning" style="padding:10px 20px; background:#0cf; border:none; border-radius:5px; font-weight:bold;">Guardar</button>
                    <button id="cancel-custom-tuning" style="padding:10px 20px; background:#444; border:none; border-radius:5px; color:#fff;">Cancelar</button>
                </div>
            `;
            contentDiv.appendChild(overlay);
        }

        bindDynamicEvents();
        return true;
    }

    function initTunerSystem() {
        injectTunerStyles();
        const injected = injectTunerHTML();

        if(!injected) {
            const observer = new MutationObserver((mutations, obs) => {
                if(document.getElementById('tuner-modal')) {
                    if(injectTunerHTML()) obs.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        const openBtn = document.getElementById('header-tuner-btn');
        if(openBtn) openBtn.onclick = startTuning;
    }

    function bindDynamicEvents() {
        noteElem = document.getElementById('tuner-note');
        freqElem = document.getElementById('tuner-freq');
        needleElem = document.getElementById('tuner-needle');
        statusText = document.getElementById('tuner-status-text');
        gaugeElem = document.querySelector('.tuner-gauge');
        canvas = document.getElementById('tuner-visualizer');
        if(canvas) canvasCtx = canvas.getContext('2d');
        stringContainer = document.getElementById('string-buttons-container');

        const closeBtn = document.getElementById('close-tuner-btn');
        if(closeBtn) closeBtn.onclick = stopAll;

        const select = document.getElementById('tuning-select');
        const addBtn = document.getElementById('tuning-add-btn');
        const saveCustom = document.getElementById('save-custom-tuning');
        const cancelCustom = document.getElementById('cancel-custom-tuning');
        const delBtn = document.getElementById('tuning-delete-btn');

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

        loadCustomTunings();
        populateTuningSelect();
        renderStringButtons();
    }

    function stopAll() {
        stopTuner();
        if(isMetroPlaying) toggleMetronome();
    }

    // --- 3. LÓGICA DE AFINACIÓN ---

    async function startTuning() {
        if(isTuning) return;
        tunerModal = document.getElementById('tuner-modal');
        if(tunerModal) tunerModal.classList.add('show');
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
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
            alert("Acceso al micrófono denegado.");
            stopTuner();
        }
    }

    function stopTuner() {
        isTuning = false;
        if (rafID) window.cancelAnimationFrame(rafID);
        if (mediaStreamSource) mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop());
        if (audioContext) audioContext.close();
        if(tunerModal) tunerModal.classList.remove('show');
    }

    function updatePitch() {
        if(!isTuning) return;
        
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        if(canvasCtx) {
            canvasCtx.fillStyle = '#000';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
            canvasCtx.lineWidth = 2; canvasCtx.strokeStyle = '#0cf';
            canvasCtx.beginPath();
            let sliceWidth = canvas.width / bufferLength;
            let x = 0;
            for(let i = 0; i < bufferLength; i++) {
                let v = dataArray[i] / 128.0;
                let y = v * canvas.height / 2;
                if(i===0) canvasCtx.moveTo(x,y); else canvasCtx.lineTo(x,y);
                x += sliceWidth;
            }
            canvasCtx.stroke();
        }

        analyser.getFloatTimeDomainData(buf);
        const ac = autoCorrelate(buf, audioContext.sampleRate);

        if (ac !== -1) {
            smoothedPitch += (ac - smoothedPitch) * 0.15;
            const strings = getCurrentStrings();
            let noteName = "", detune = 0, note = 0;

            if (targetNoteMode !== "AUTO") {
                const targetFreq = strings[targetNoteMode];
                detune = 1200 * Math.log2(smoothedPitch / targetFreq);
                noteName = targetNoteMode;
            } else {
                note = Math.round(12 * (Math.log(smoothedPitch / 440) / Math.log(2))) + 69;
                noteName = noteStrings[note % 12];
                detune = Math.floor(1200 * Math.log(smoothedPitch / (440 * Math.pow(2, (note - 69) / 12))) / Math.log(2));
            }

            if(noteElem) noteElem.textContent = noteName.replace(/[0-9]/g, ''); 
            if(freqElem) freqElem.textContent = Math.round(smoothedPitch) + " Hz";

            smoothedAngle += (detune * 0.9 - smoothedAngle) * 0.1;
            if(needleElem) needleElem.style.transform = `translateX(-50%) rotate(${Math.max(-50, Math.min(50, smoothedAngle))}deg)`;

            if(noteElem) noteElem.style.color = Math.abs(detune) < 5 ? "#0f0" : "#f00";
        }
        rafID = window.requestAnimationFrame(updatePitch);
    }

    function autoCorrelate(buf, sampleRate) {
        let size = buf.length, rms = 0;
        for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
        if (Math.sqrt(rms / size) < 0.01) return -1;
        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) for (let j = 0; j < size - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
        let d = 0; while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < size; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
        return sampleRate / maxpos;
    }

    // --- 4. GESTIÓN DE PRESETS ---
    function loadCustomTunings() {
        const s = localStorage.getItem('esdd_custom_tunings');
        if(s) customTunings = JSON.parse(s);
    }
    function populateTuningSelect() {
        const select = document.getElementById('tuning-select');
        if(!select) return; select.innerHTML = '';
        const grp = document.createElement('optgroup'); grp.label = "Predeterminadas";
        Object.keys(defaultTunings).forEach(k => {
            const o = document.createElement('option'); o.value = k; o.textContent = defaultTunings[k].name;
            grp.appendChild(o);
        });
        select.appendChild(grp);
        if(Object.keys(customTunings).length > 0) {
            const grpC = document.createElement('optgroup'); grpC.label = "Mis Afinaciones";
            Object.keys(customTunings).forEach(k => {
                const o = document.createElement('option'); o.value = k; o.textContent = customTunings[k].name;
                grpC.appendChild(o);
            });
            select.appendChild(grpC);
        }
        select.value = currentTuningKey;
    }
    function getCurrentStrings() { return (defaultTunings[currentTuningKey] || customTunings[currentTuningKey] || defaultTunings["standard"]).strings; }
    function renderStringButtons() {
        if(!stringContainer) return; stringContainer.innerHTML = '';
        const strings = getCurrentStrings();
        const auto = document.createElement('button');
        auto.className = `string-btn ${targetNoteMode === 'AUTO' ? 'active' : ''}`;
        auto.textContent = 'A'; auto.onclick = () => { targetNoteMode = "AUTO"; renderStringButtons(); };
        stringContainer.appendChild(auto);
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
        inputs.forEach((inp, i) => {
            if(inp.value) strings[inp.value] = 440 * Math.pow(2, (i-9)/12); // Simplificación freq para ejemplo
        });
        const id = "c_" + Date.now();
        customTunings[id] = { name, strings };
        localStorage.setItem('esdd_custom_tunings', JSON.stringify(customTunings));
        populateTuningSelect();
        document.getElementById('custom-tuning-editor').classList.remove('show');
    }
    function deleteCurrentTuning() {
        if(customTunings[currentTuningKey] && confirm("¿Borrar?")) {
            delete customTunings[currentTuningKey];
            localStorage.setItem('esdd_custom_tunings', JSON.stringify(customTunings));
            currentTuningKey = "standard"; populateTuningSelect(); renderStringButtons(); updateDeleteButton();
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
            btn.textContent = "STOP"; btn.style.background = "#f33";
            if(!metroContext) metroContext = new AudioContext();
            nextNoteTime = metroContext.currentTime; scheduler();
        } else {
            btn.textContent = "PLAY"; btn.style.background = "#0cf";
            window.clearTimeout(timerID);
        }
    }
    function scheduler() {
        while (nextNoteTime < metroContext.currentTime + 0.1) {
            const osc = metroContext.createOscillator();
            const gain = metroContext.createGain();
            osc.connect(gain); gain.connect(metroContext.destination);
            osc.frequency.value = 1000; gain.gain.setValueAtTime(1, nextNoteTime);
            gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.05);
            osc.start(nextNoteTime); osc.stop(nextNoteTime + 0.05);
            nextNoteTime += (60.0 / metroBpm);
        }
        timerID = window.setTimeout(scheduler, 25);
    }
    function changeBpm(delta) { metroBpm = Math.min(240, Math.max(40, metroBpm + delta)); updateMetroDisplay(); }
    function updateMetroDisplay() {
        document.getElementById('metro-bpm-display').textContent = metroBpm + " BPM";
        document.getElementById('metro-slider').value = metroBpm;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTunerSystem);
    else initTunerSystem();
})();
