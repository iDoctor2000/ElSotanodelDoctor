/*
    TUNER.JS - PRO VERSION (Self-Contained & Gauge Style)
    Características:
    - Inyección automática de estilos y HTML.
    - Modo Auto (Default) con visualización tipo "Gauge" (arco de colores).
    - Modo Manual con selector de cuerdas y generador de tonos.
    - Soporte Guitarra, Bajo (4/5), Ukelele.
*/

console.log("--- TUNER.JS GAUGE EDITION CARGADO ---");

(function() {
    let audioContext = null;
    let analyser = null;
    let microphoneStream = null;
    let tunerInterval = null;
    let isTunerRunning = false;
    let activeOscillator = null; 
    
    // Estado
    let isManualMode = false; // Por defecto Automático
    let currentInstrument = 'guitar';

    // Configuración Audio
    const buflen = 2048;
    const buf = new Float32Array(buflen);
    const MIN_VOLUME_THRESHOLD = 0.01; // Sensibilidad
    
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Datos de Instrumentos
    const instruments = {
        guitar: {
            name: "Guitarra",
            strings: [
                { note: "E2", freq: 82.41 }, { note: "A2", freq: 110.00 }, { note: "D3", freq: 146.83 },
                { note: "G3", freq: 196.00 }, { note: "B3", freq: 246.94 }, { note: "E4", freq: 329.63 }
            ]
        },
        bass: {
            name: "Bajo (4)",
            strings: [
                { note: "E1", freq: 41.20 }, { note: "A1", freq: 55.00 },
                { note: "D2", freq: 73.42 }, { note: "G2", freq: 98.00 }
            ]
        },
        bass5: {
            name: "Bajo (5)",
            strings: [
                { note: "B0", freq: 30.87 }, { note: "E1", freq: 41.20 }, { note: "A1", freq: 55.00 },
                { note: "D2", freq: 73.42 }, { note: "G2", freq: 98.00 }
            ]
        },
        ukulele: {
            name: "Ukelele",
            strings: [
                { note: "G4", freq: 392.00 }, { note: "C4", freq: 261.63 },
                { note: "E4", freq: 329.63 }, { note: "A4", freq: 440.00 }
            ]
        }
    };

    // --- INYECCIÓN DE ASSETS (CSS y HTML) ---
    function injectTunerAssets() {
        if (!document.getElementById('tuner-injected-styles')) {
            const css = `
                #tuner-popup {
                    position: fixed; top: 70px; right: 20px; width: 340px;
                    background: #1a1a1a; 
                    border: 1px solid #333; border-radius: 16px;
                    padding: 20px; z-index: 11000;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.9);
                    display: none; flex-direction: column; align-items: center;
                    font-family: 'Segoe UI', sans-serif;
                    user-select: none;
                }
                #tuner-popup.visible { display: flex !important; }

                /* HEADER: SWITCH MANUAL/AUTO */
                .tuner-header { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
                .tuner-mode-switch {
                    background: #333; border-radius: 20px; padding: 3px; display: flex; cursor: pointer;
                }
                .tuner-mode-btn {
                    padding: 4px 12px; border-radius: 16px; border: none; background: transparent;
                    color: #888; font-size: 0.75em; font-weight: bold; transition: all 0.2s;
                }
                .tuner-mode-btn.active { background: #0cf; color: #000; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }

                /* GAUGE AREA (ARCO) */
                .tuner-gauge-wrap {
                    position: relative; width: 280px; height: 140px; 
                    overflow: hidden; margin-bottom: 10px;
                }
                .tuner-ticks {
                    position: absolute; bottom: 0; left: 50%; width: 240px; height: 240px;
                    transform: translateX(-50%); border-radius: 50%;
                }
                .tuner-tick {
                    position: absolute; top: 0; left: 50%; width: 6px; height: 25px;
                    background: #333; transform-origin: center 120px;
                    border-radius: 3px; transition: background 0.1s;
                }
                /* Colores de los ticks (definidos por JS o CSS nth-child) */
                
                /* BIG NOTE DISPLAY */
                .tuner-note-display {
                    position: absolute; bottom: 0; left: 0; width: 100%; text-align: center;
                }
                .tuner-main-note {
                    font-size: 5em; font-weight: bold; color: #fff; line-height: 1;
                    text-shadow: 0 5px 20px rgba(0,0,0,0.5);
                }
                .tuner-octave { font-size: 0.4em; color: #888; margin-left: 2px; }
                .tuner-status-text {
                    font-size: 0.9em; color: #00e676; margin-top: -5px; height: 20px;
                    text-transform: uppercase; letter-spacing: 1px; font-weight: bold;
                    opacity: 0; transition: opacity 0.2s;
                }
                .tuner-status-text.visible { opacity: 1; }

                /* MICROPHONE VISUALIZER */
                .tuner-mic-viz {
                    display: flex; gap: 4px; align-items: flex-end; height: 20px; margin-top: 10px;
                }
                .tuner-mic-bar {
                    width: 4px; background: #555; border-radius: 2px; height: 4px;
                    transition: height 0.1s, background-color 0.1s;
                }

                /* MANUAL CONTROLS (HIDDEN BY DEFAULT) */
                .tuner-manual-panel {
                    width: 100%; display: none; flex-direction: column; gap: 10px; margin-top: 10px;
                    border-top: 1px solid #333; padding-top: 15px;
                    animation: slideDown 0.3s ease;
                }
                .tuner-manual-panel.visible { display: flex; }
                
                .tuner-select {
                    width: 100%; background: #222; color: #eee; border: 1px solid #444; 
                    padding: 8px; border-radius: 6px; outline: none;
                }
                .tuner-strings-grid { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
                .tuner-string-btn {
                    width: 40px; height: 40px; border-radius: 50%;
                    background: #222; border: 2px solid #444; color: #aaa;
                    font-weight: bold; font-size: 1em; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                }
                .tuner-string-btn:hover { border-color: #fff; color: #fff; }
                .tuner-string-btn.active {
                    background: #0cf; border-color: #0cf; color: #000;
                    box-shadow: 0 0 15px rgba(0, 204, 255, 0.4); transform: scale(1.1);
                }

                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
            `;
            const style = document.createElement('style');
            style.id = 'tuner-injected-styles';
            style.innerHTML = css;
            document.head.appendChild(style);
        }

        if (!document.getElementById('tuner-popup')) {
            const popup = document.createElement('div');
            popup.id = 'tuner-popup';
            document.body.appendChild(popup);
        }
    }

    function injectTunerHTML() {
        const popup = document.getElementById('tuner-popup');
        if(!popup) return;

        // Construcción HTML
        popup.innerHTML = `
            <div class="tuner-header">
                <span style="color:#666; font-size:0.8em;">iDoctor TUNER PRO</span>
                <div class="tuner-mode-switch">
                    <button class="tuner-mode-btn active" id="btn-mode-auto">AUTO</button>
                    <button class="tuner-mode-btn" id="btn-mode-manual">MANUAL</button>
                </div>
            </div>

            <!-- GAUGE VISUALIZATION -->
            <div class="tuner-gauge-wrap">
                <div class="tuner-ticks" id="tuner-ticks-container">
                    <!-- Ticks generados por JS -->
                </div>
                <div class="tuner-note-display">
                    <div class="tuner-main-note" id="tuner-note-char">--<span class="tuner-octave"></span></div>
                    <div class="tuner-status-text" id="tuner-status">IN TUNE!</div>
                </div>
            </div>

            <!-- MICROPHONE VISUALIZER -->
            <div class="tuner-mic-viz" id="tuner-mic-viz">
                <span class="tuner-mic-bar"></span><span class="tuner-mic-bar"></span>
                <span class="tuner-mic-bar"></span><span class="tuner-mic-bar"></span>
                <span class="tuner-mic-bar"></span>
                <span style="font-size:12px; color:#666; margin-left:5px;">🎤</span>
            </div>

            <!-- MANUAL CONTROLS -->
            <div class="tuner-manual-panel" id="tuner-manual-panel">
                <select id="tuner-instrument-select" class="tuner-select">
                    <option value="guitar">🎸 Guitarra</option>
                    <option value="bass">🎸 Bajo (4)</option>
                    <option value="bass5">🎸 Bajo (5)</option>
                    <option value="ukulele">🏝️ Ukelele</option>
                </select>
                <div class="tuner-strings-grid" id="tuner-strings-area"></div>
            </div>
        `;

        // Generar Ticks (Segmentos del arco)
        const ticksContainer = document.getElementById('tuner-ticks-container');
        const totalTicks = 21; // Impar para tener centro exacto
        const startAngle = -90; 
        const endAngle = 90;
        const step = (endAngle - startAngle) / (totalTicks - 1);

        for (let i = 0; i < totalTicks; i++) {
            const tick = document.createElement('div');
            tick.className = 'tuner-tick';
            tick.dataset.index = i;
            // Rotación
            const rotation = startAngle + (i * step);
            tick.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
            
            // Colores por defecto (apagados)
            tick.style.background = '#333';
            
            ticksContainer.appendChild(tick);
        }

        // Event Listeners
        document.getElementById('btn-mode-auto').onclick = () => setMode(false);
        document.getElementById('btn-mode-manual').onclick = () => setMode(true);

        const select = document.getElementById('tuner-instrument-select');
        select.value = currentInstrument;
        select.addEventListener('change', (e) => {
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
            btn.textContent = s.note.replace(/[0-9]/g, ''); 
            btn.onclick = () => playReferenceTone(s.freq, btn);
            container.appendChild(btn);
        });
    }

    function setMode(manual) {
        isManualMode = manual;
        const btnAuto = document.getElementById('btn-mode-auto');
        const btnManual = document.getElementById('btn-mode-manual');
        const manualPanel = document.getElementById('tuner-manual-panel');
        const noteChar = document.getElementById('tuner-note-char');
        const status = document.getElementById('tuner-status');
        const gauge = document.getElementById('tuner-ticks-container');

        if(manual) {
            btnAuto.classList.remove('active');
            btnManual.classList.add('active');
            manualPanel.classList.add('visible');
            noteChar.innerHTML = '<span style="font-size:0.5em; color:#888;">MANUAL</span>';
            status.style.opacity = 0;
            // Apagar gauge en manual
            Array.from(gauge.children).forEach(t => t.style.background = '#222');
        } else {
            btnAuto.classList.add('active');
            btnManual.classList.remove('active');
            manualPanel.classList.remove('visible');
            noteChar.innerHTML = '--';
            // Parar tono si suena
            if(activeOscillator) {
                activeOscillator.stop();
                activeOscillator = null;
                document.querySelectorAll('.tuner-string-btn').forEach(b => b.classList.remove('active'));
            }
        }
    }

    function playReferenceTone(freq, btnElement) {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (activeOscillator) {
            activeOscillator.stop();
            activeOscillator = null;
        }

        const allBtns = document.querySelectorAll('.tuner-string-btn');
        allBtns.forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');

        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.type = 'triangle'; // Onda un poco más rica
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 3.0);

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.start();
        osc.stop(audioContext.currentTime + 3.0);
        
        activeOscillator = osc;
        setTimeout(() => { if(btnElement) btnElement.classList.remove('active'); }, 3000);
    }

    function initTuner() {
        injectTunerAssets();
        const toggleBtn = document.getElementById('tuner-toggle-btn');
        if (toggleBtn) {
            toggleBtn.removeEventListener('click', handleToggleClick); 
            toggleBtn.addEventListener('click', handleToggleClick);
            injectTunerHTML(); 
        } else {
            setTimeout(initTuner, 1000);
        }
    }

    function handleToggleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (isTunerRunning) stopTuner(); else startTuner();
    }

    async function startTuner() {
        const popup = document.getElementById('tuner-popup');
        const toggleBtn = document.getElementById('tuner-toggle-btn');

        if (!popup) { injectTunerAssets(); return; }

        isTunerRunning = true;
        popup.classList.add('visible');
        
        if(toggleBtn) {
            toggleBtn.style.backgroundColor = '#0cf';
            toggleBtn.style.color = '#000';
            toggleBtn.style.boxShadow = '0 0 10px #0cf';
        }

        // Default to Auto
        setMode(false); 

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Micrófono no soportado.");
            }

            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();

            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
            
            const source = audioContext.createMediaStreamSource(microphoneStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);

            updatePitch();

        } catch (err) {
            console.error("Error Tuner:", err);
            document.getElementById('tuner-note-char').textContent = "ERR";
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
        if (activeOscillator) {
            activeOscillator.stop();
            activeOscillator = null;
        }
    }

    function updatePitch() {
        if (!isTunerRunning || !analyser) return;

        analyser.getFloatTimeDomainData(buf);
        
        // Volumen para visualizador
        let sum = 0;
        for(let i=0; i<buf.length; i++) sum += buf[i]*buf[i];
        let rms = Math.sqrt(sum / buf.length);
        updateMicVisualizer(rms);

        if (!isManualMode) {
            const ac = autoCorrelate(buf, audioContext.sampleRate);
            if (ac !== -1) {
                const pitch = ac;
                const note = noteFromPitch(pitch);
                const detune = centsOffFromPitch(pitch, note);
                updateUI(note, detune);
            } else {
                // Decay si no hay sonido
                dimGauge();
            }
        }

        tunerInterval = requestAnimationFrame(updatePitch);
    }

    function updateMicVisualizer(volume) {
        const bars = document.querySelectorAll('.tuner-mic-bar');
        const sensitivity = 5; 
        bars.forEach((bar, idx) => {
            // Animación simple escalonada
            let h = Math.min(100, volume * 300 * (idx+1));
            bar.style.height = Math.max(4, h/sensitivity) + 'px';
            bar.style.background = h > 10 ? '#0cf' : '#555';
        });
    }

    function autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / size);

        if (rms < MIN_VOLUME_THRESHOLD) return -1;

        let r1 = 0, r2 = size - 1, thres = 0.2;
        for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }

        buf = buf.slice(r1, r2);
        size = buf.length;

        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++) 
            for (let j = 0; j < size - i; j++) c[i] = c[i] + buf[j] * buf[j + i];

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

    // --- LÓGICA DE VISUALIZACIÓN GAUGE ---
    function updateUI(noteNum, cents) {
        const noteChar = document.getElementById('tuner-note-char');
        const status = document.getElementById('tuner-status');
        const ticks = document.querySelectorAll('.tuner-tick');
        
        const noteName = noteStrings[noteNum % 12];
        const octave = Math.floor(noteNum / 12) - 1;

        noteChar.innerHTML = `${noteName}<span class="tuner-octave">${octave}</span>`;

        // 21 Ticks. Centro es index 10.
        // Rango de cents: -50 a +50.
        // Mapa: -50 -> Index 0, 0 -> Index 10, +50 -> Index 20
        let tickIndex = Math.round(10 + (cents / 5)); // Cada tick son 5 cents
        tickIndex = Math.max(0, Math.min(20, tickIndex));

        // Actualizar colores de los ticks
        ticks.forEach((tick, i) => {
            // Distancia al tick activo
            const dist = Math.abs(i - tickIndex);
            
            if (dist === 0) {
                // Tick Activo
                if (Math.abs(cents) < 5) tick.style.background = '#00e676'; // Verde perfecto
                else if (Math.abs(cents) < 15) tick.style.background = '#ffea00'; // Amarillo
                else tick.style.background = '#ff3d00'; // Rojo
                tick.style.boxShadow = `0 0 10px ${tick.style.background}`;
                tick.style.height = '35px'; // Crece un poco
            } else if (dist === 1) {
                // Ticks adyacentes (estela)
                tick.style.background = '#555';
                tick.style.boxShadow = 'none';
                tick.style.height = '25px';
            } else {
                // Ticks inactivos
                tick.style.background = '#222';
                tick.style.boxShadow = 'none';
                tick.style.height = '25px';
            }
        });

        // Status Text
        if (Math.abs(cents) < 5) {
            status.textContent = "IN TUNE!";
            status.style.color = "#00e676";
            status.classList.add('visible');
            noteChar.style.color = "#00e676";
        } else {
            status.classList.remove('visible');
            noteChar.style.color = "#fff";
        }
    }

    function dimGauge() {
        const ticks = document.querySelectorAll('.tuner-tick');
        ticks.forEach(t => {
            t.style.background = '#222';
            t.style.height = '25px';
            t.style.boxShadow = 'none';
        });
        document.getElementById('tuner-status').classList.remove('visible');
        // Mantener la última nota visible pero atenuada
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initTuner); } 
    else { initTuner(); }
    setTimeout(initTuner, 1000);
    window.closeTuner = stopTuner;

})();
