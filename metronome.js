/* ==========================================================================
   METRONOME.JS  —  iDoctor Metronome PRO
   Estilo "Estudio digital pro" / rack pedalera. Inyección autocontenida:
   - Estilos CSS inyectados desde JS (override del CSS del index).
   - Reemplazo del contenido de #metronome-popup con la UI nueva.
   - Mantiene IDs antiguos (metro-bpm-val, metro-bpm-slider, metro-play-btn,
     metro-tap-btn, metro-minus, metro-plus) para que toggleMetronomeFromTable
     siga funcionando.
   - Audio: scheduler look-ahead con AudioContext (mismo patrón Chris Wilson
     que usaba la versión anterior, extendido con subdivisiones).
   - Sonidos generados (oscilador) con timbres distintos para acento, beat
     normal y subdivisión. El antiguo Click.mp3 ya no se necesita.
   - Funciones nuevas:
        · Compás configurable (2/4, 3/4, 4/4, 5/4, 6/8, 7/8...).
        · Subdivisiones (negras, corcheas, tresillos, semicorcheas).
        · Pulsos visuales (LEDs) sincronizados con el primer pulso acentuado.
        · TAP tempo (botón grande).
   ========================================================================== */

console.log("--- METRONOME.JS Pro v1 cargado ---");

const metronomeState = {
    isPlaying: false,
    bpm: 120,
    nextNoteTime: 0.0,
    timerID: null,
    audioContext: null,
    lookahead: 25.0,             // ms entre llamadas al scheduler
    scheduleAheadTime: 0.10,     // segundos de antelación al programar notas
    activeTableBtn: null,

    // Compás
    beatsPerMeasure: 4,          // numerador del compás
    beatUnit: 4,                 // denominador del compás (4=negra, 8=corchea)

    // Subdivisión por pulso (1=negras, 2=corcheas, 3=tresillos, 4=semicorcheas)
    subdivision: 1,

    // Estado del scheduler
    currentBeat: 0,              // pulso actual dentro del compás (0..beatsPerMeasure-1)
    currentSub: 0,               // subdivisión dentro del pulso (0..subdivision-1)

    // Tap tempo
    tapTimes: [],
    tapTimeout: 2000,
};

// Compases predefinidos. value = "num/den". Marcamos cuáles "marcan acento"
// adicional (ej: 6/8 con dos pulsos, acento en 1 y subacento en 4).
const TIME_SIGNATURES = [
    { value: "2/4",  label: "2/4",  num: 2,  den: 4, accents: [0] },
    { value: "3/4",  label: "3/4",  num: 3,  den: 4, accents: [0] },
    { value: "4/4",  label: "4/4",  num: 4,  den: 4, accents: [0] },
    { value: "5/4",  label: "5/4",  num: 5,  den: 4, accents: [0] },
    { value: "6/8",  label: "6/8",  num: 6,  den: 8, accents: [0, 3] },
    { value: "7/8",  label: "7/8",  num: 7,  den: 8, accents: [0, 3] },
    { value: "9/8",  label: "9/8",  num: 9,  den: 8, accents: [0, 3, 6] },
    { value: "12/8", label: "12/8", num: 12, den: 8, accents: [0, 3, 6, 9] },
];

const SUBDIVISIONS = [
    { id: "q",    label: "♩",   factor: 1, title: "Negras (1 por pulso)" },
    { id: "8",    label: "♫",   factor: 2, title: "Corcheas (2 por pulso)" },
    { id: "trip", label: "♪³",  factor: 3, title: "Tresillos (3 por pulso)" },
    { id: "16",   label: "♬",   factor: 4, title: "Semicorcheas (4 por pulso)" },
];

let _accentsOfCurrentSig = [0];

/* --------------------------------------------------------------
   1. ESTILOS — inyectamos un bloque <style> con la nueva estética
   -------------------------------------------------------------- */
function injectMetronomeStyles() {
    const id = "metronome-pro-styles";
    if (document.getElementById(id)) return;
    const css = `
    /* Override del popup base del index para look "rack pro" */
    #metronome-popup {
        position: fixed; top: 70px; right: 20px; left: auto;
        width: 320px;
        background: linear-gradient(180deg, #1a1d22 0%, #0d0f12 100%);
        border: 1px solid #0cf;
        border-radius: 14px;
        padding: 14px 14px 16px;
        z-index: 100000;          /* por encima de modales (99500) */
        box-shadow:
          0 12px 40px rgba(0,0,0,0.7),
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 0 0 1px rgba(0,204,255,0.15);
        display: none;
        flex-direction: column;
        gap: 10px;
        backdrop-filter: blur(12px);
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #ddd;
    }
    #metronome-popup.visible { display: flex; }

    /* Cabecera con título + cerrar */
    .met-pro-header {
        display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding-bottom: 8px;
    }
    .met-pro-title {
        font-size: 0.78em; letter-spacing: 2px; color: #0cf;
        text-transform: uppercase; font-weight: bold;
    }
    .met-pro-close {
        background: transparent; border: none; color: #888; cursor: pointer;
        font-size: 1.2em; padding: 0 6px;
    }
    .met-pro-close:hover { color: #fff; }

    /* DISPLAY LED — BPM grande con tipografía 7-segments */
    .met-pro-display {
        background: #050708;
        border-radius: 10px;
        padding: 14px 12px 10px;
        text-align: center;
        box-shadow:
          inset 0 2px 6px rgba(0,0,0,0.8),
          inset 0 -1px 0 rgba(255,255,255,0.03);
        position: relative;
    }
    .met-pro-bpm {
        font-family: 'Courier New', monospace;
        font-size: 3.6em;
        font-weight: 900;
        letter-spacing: 2px;
        color: #0cf;
        text-shadow:
          0 0 6px rgba(0,204,255,0.6),
          0 0 14px rgba(0,204,255,0.4),
          0 0 28px rgba(0,204,255,0.2);
        line-height: 1;
    }
    .met-pro-bpm-label {
        display: block;
        font-size: 0.72em;
        letter-spacing: 4px;
        color: #588;
        margin-top: 4px;
    }

    /* Fila de pulsos visuales (LEDs) */
    .met-pro-leds {
        display: flex; justify-content: center; gap: 6px;
        flex-wrap: wrap; padding: 6px 4px 2px;
    }
    .met-pro-led {
        width: 14px; height: 14px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #2a2f35, #0a0c0f 70%);
        border: 1px solid rgba(0,0,0,0.5);
        box-shadow: inset 0 0 3px rgba(0,0,0,0.8);
        transition: background 60ms ease-out, box-shadow 60ms ease-out, transform 60ms;
        flex-shrink: 0;
    }
    .met-pro-led.subbeat {
        width: 8px; height: 8px;
        opacity: 0.55;
    }
    .met-pro-led.lit {
        background: radial-gradient(circle at 35% 35%, #5cf, #06b);
        box-shadow:
          0 0 6px rgba(0,204,255,0.9),
          0 0 14px rgba(0,204,255,0.5);
        transform: scale(1.1);
    }
    .met-pro-led.lit-accent {
        background: radial-gradient(circle at 35% 35%, #ffc, #f80);
        box-shadow:
          0 0 8px rgba(255,160,0,1),
          0 0 18px rgba(255,160,0,0.6);
        transform: scale(1.18);
    }

    /* Slider BPM */
    .met-pro-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        background: linear-gradient(90deg, #043 0%, #088 50%, #0cf 100%);
        border-radius: 3px;
        outline: none;
        margin: 0;
    }
    .met-pro-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px; height: 18px;
        background: linear-gradient(180deg, #fff 0%, #0cf 60%, #08a 100%);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 6px rgba(0,204,255,0.8);
        border: 1px solid #056;
    }
    .met-pro-slider::-moz-range-thumb {
        width: 18px; height: 18px;
        background: linear-gradient(180deg, #fff 0%, #0cf 60%, #08a 100%);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 6px rgba(0,204,255,0.8);
        border: 1px solid #056;
    }

    /* Botonera principal: -, PLAY, + */
    .met-pro-controls {
        display: flex; gap: 12px; align-items: center; justify-content: center;
    }
    .met-pro-btn-circle {
        width: 38px; height: 38px;
        border-radius: 50%;
        border: 1px solid rgba(0,204,255,0.4);
        background: linear-gradient(180deg, #20262d, #0e1114);
        color: #ddd;
        font-weight: bold;
        font-size: 1.3em;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.4);
        transition: transform 0.1s, background 0.15s, border-color 0.15s;
    }
    .met-pro-btn-circle:hover {
        background: linear-gradient(180deg, #2c333c, #14181d);
        border-color: #0cf;
        color: #fff;
    }
    .met-pro-btn-circle:active { transform: scale(0.92); }

    .met-pro-btn-play {
        width: 56px; height: 56px;
        border-radius: 50%;
        border: 2px solid #0cf;
        background: radial-gradient(circle at 35% 30%, #0cf 0%, #069 60%, #047 100%);
        color: #051018;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow:
          0 0 14px rgba(0,204,255,0.5),
          inset 0 -2px 6px rgba(0,0,0,0.4);
        transition: transform 0.1s, box-shadow 0.2s;
    }
    .met-pro-btn-play:hover { transform: scale(1.05); box-shadow: 0 0 22px rgba(0,204,255,0.7), inset 0 -2px 6px rgba(0,0,0,0.4); }
    .met-pro-btn-play.playing {
        border-color: #f44;
        background: radial-gradient(circle at 35% 30%, #f44 0%, #a11 60%, #700 100%);
        box-shadow: 0 0 18px rgba(255,68,68,0.6), inset 0 -2px 6px rgba(0,0,0,0.4);
        animation: met-pro-pulse 1s infinite;
    }
    @keyframes met-pro-pulse {
        0%   { box-shadow: 0 0 14px rgba(255,68,68,0.5), inset 0 -2px 6px rgba(0,0,0,0.4); }
        50%  { box-shadow: 0 0 26px rgba(255,68,68,0.9), inset 0 -2px 6px rgba(0,0,0,0.4); }
        100% { box-shadow: 0 0 14px rgba(255,68,68,0.5), inset 0 -2px 6px rgba(0,0,0,0.4); }
    }

    /* Fila de selectores: Compás + Subdivisión */
    .met-pro-selectors {
        display: flex; gap: 8px; justify-content: space-between;
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 6px 8px;
    }
    .met-pro-selector-group {
        display: flex; flex-direction: column; gap: 4px; flex: 1;
        min-width: 0;
    }
    .met-pro-selector-label {
        font-size: 0.65em; letter-spacing: 2px; color: #588;
        text-transform: uppercase; text-align: center;
    }
    .met-pro-time-sig-select {
        width: 100%;
        background: #0d1014; color: #0cf;
        border: 1px solid #0cf; border-radius: 6px;
        padding: 6px 4px;
        font-family: 'Courier New', monospace;
        font-weight: bold; font-size: 1em;
        text-align: center; text-align-last: center;
        cursor: pointer;
        appearance: none; -webkit-appearance: none;
    }
    .met-pro-time-sig-select option {
        background: #1a1d22; color: #0cf;
    }
    .met-pro-subdiv-row {
        display: flex; gap: 3px; justify-content: center;
    }
    .met-pro-subdiv-btn {
        flex: 1;
        background: #0d1014; color: #888;
        border: 1px solid #2a2f35; border-radius: 5px;
        padding: 5px 0; cursor: pointer;
        font-size: 1em; line-height: 1;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        min-width: 0;
    }
    .met-pro-subdiv-btn:hover { color: #0cf; border-color: #066; }
    .met-pro-subdiv-btn.active {
        background: linear-gradient(180deg, #0cf, #06a);
        color: #001018; border-color: #0cf;
        box-shadow: 0 0 6px rgba(0,204,255,0.5);
        font-weight: bold;
    }

    /* TAP TEMPO grande */
    .met-pro-tap-btn {
        width: 100%;
        padding: 12px 0;
        background: linear-gradient(180deg, #2a3138 0%, #14181d 100%);
        border: 1px solid #0cf; border-radius: 8px;
        color: #0cf;
        font-weight: bold; letter-spacing: 4px; font-size: 1em;
        cursor: pointer;
        text-transform: uppercase;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        transition: background 0.1s, transform 0.05s, color 0.1s;
        user-select: none;
        -webkit-user-select: none;
    }
    .met-pro-tap-btn:hover {
        background: linear-gradient(180deg, #3a434c 0%, #1a1f25 100%);
        color: #fff;
    }
    .met-pro-tap-btn:active, .met-pro-tap-btn.flash {
        background: linear-gradient(180deg, #0cf 0%, #088 100%);
        color: #001018;
        transform: scale(0.98);
    }

    @media(max-width:768px) {
        #metronome-popup { right: 10px; left: 10px; width: auto; top: 65px; }
        .met-pro-bpm { font-size: 3em; }
    }

    /* Flash de borde al pulso (para reforzar el feedback) */
    #metronome-popup.beat-flash {
        box-shadow:
          0 12px 40px rgba(0,0,0,0.7),
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 0 0 2px rgba(0,204,255,0.5),
          0 0 24px rgba(0,204,255,0.3);
    }
    `;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
}

/* --------------------------------------------------------------
   2. UI — reemplazamos el contenido del popup con la nueva estructura
   -------------------------------------------------------------- */
function buildMetronomeUI() {
    const popup = document.getElementById("metronome-popup");
    if (!popup) return;
    if (popup.dataset.proBuilt === "1") return; // ya construido

    const tsOptionsHtml = TIME_SIGNATURES
        .map(t => `<option value="${t.value}"${t.value === "4/4" ? " selected" : ""}>${t.label}</option>`)
        .join("");

    const subdivBtnsHtml = SUBDIVISIONS
        .map(s => `<button type="button" class="met-pro-subdiv-btn${s.id === "q" ? " active" : ""}"
                       data-sub="${s.id}" title="${s.title}">${s.label}</button>`)
        .join("");

    popup.innerHTML = `
      <div class="met-pro-header">
        <span class="met-pro-title">⏱ Metronome PRO</span>
        <button type="button" class="met-pro-close" id="met-pro-close" title="Cerrar">×</button>
      </div>

      <div class="met-pro-display">
        <div class="met-pro-bpm"><span id="metro-bpm-val">120</span></div>
        <span class="met-pro-bpm-label">BPM</span>
        <div class="met-pro-leds" id="met-pro-leds-row"></div>
      </div>

      <input type="range" id="metro-bpm-slider" class="met-pro-slider"
             min="30" max="300" value="120" step="1">

      <div class="met-pro-controls">
        <button type="button" class="met-pro-btn-circle" id="metro-minus" title="-1 BPM">−</button>
        <button type="button" class="met-pro-btn-play" id="metro-play-btn" title="Play / Stop">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" id="metro-icon-play"><path d="M8 5v14l11-7z"/></svg>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" id="metro-icon-stop" style="display:none;"><path d="M6 6h12v12H6z"/></svg>
        </button>
        <button type="button" class="met-pro-btn-circle" id="metro-plus" title="+1 BPM">+</button>
      </div>

      <div class="met-pro-selectors">
        <div class="met-pro-selector-group">
          <span class="met-pro-selector-label">Compás</span>
          <select id="met-pro-time-sig" class="met-pro-time-sig-select" title="Compás">
            ${tsOptionsHtml}
          </select>
        </div>
        <div class="met-pro-selector-group">
          <span class="met-pro-selector-label">Subdivisión</span>
          <div class="met-pro-subdiv-row" id="met-pro-subdiv-row">
            ${subdivBtnsHtml}
          </div>
        </div>
      </div>

      <button type="button" id="metro-tap-btn" class="met-pro-tap-btn" title="Toca al ritmo dos veces para detectar BPM">Tap Tempo</button>
    `;
    popup.dataset.proBuilt = "1";
    rebuildLeds();
}

/* Construye la fila de LEDs según el compás y la subdivisión actuales */
function rebuildLeds() {
    const row = document.getElementById("met-pro-leds-row");
    if (!row) return;
    row.innerHTML = "";
    const total = metronomeState.beatsPerMeasure * metronomeState.subdivision;
    for (let i = 0; i < total; i++) {
        const led = document.createElement("div");
        const isMainBeat = (i % metronomeState.subdivision) === 0;
        led.className = "met-pro-led" + (isMainBeat ? "" : " subbeat");
        led.dataset.idx = String(i);
        row.appendChild(led);
    }
}

/* --------------------------------------------------------------
   3. AUDIO — scheduler look-ahead con osciladores diferenciados
   -------------------------------------------------------------- */
function initAudioContext() {
    if (!metronomeState.audioContext) {
        try {
            metronomeState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn("[Metronome] No se pudo crear AudioContext:", e);
        }
    }
    if (metronomeState.audioContext && metronomeState.audioContext.state === "suspended") {
        try { metronomeState.audioContext.resume(); } catch (e) {}
    }
}

/* Toca un click sintético. tipo:
   - "accent"  → primer pulso del compás (frecuencia alta, volumen alto)
   - "beat"    → resto de pulsos principales (frecuencia media)
   - "sub"     → subdivisión (frecuencia baja, volumen bajo, corto)
*/
function playClick(time, type) {
    const ctx = metronomeState.audioContext;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    let freq, peak, dur;
    if (type === "accent") {
        freq = 1700; peak = 1.0; dur = 0.040;
        osc.type = "square";
    } else if (type === "beat") {
        freq = 1100; peak = 0.65; dur = 0.035;
        osc.type = "square";
    } else {
        freq = 800;  peak = 0.30; dur = 0.020;
        osc.type = "sine";
    }
    osc.frequency.value = freq;

    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(env);
    env.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.02);
}

/* Programa todos los pulsos pendientes mientras estén dentro del lookahead */
function scheduler() {
    const ctx = metronomeState.audioContext;
    if (!ctx) return;

    while (metronomeState.nextNoteTime < ctx.currentTime + metronomeState.scheduleAheadTime) {
        const time = metronomeState.nextNoteTime;
        const isMainBeat = metronomeState.currentSub === 0;
        const beatIdx = metronomeState.currentBeat;
        const isAccent = isMainBeat && _accentsOfCurrentSig.indexOf(beatIdx) !== -1;

        let type;
        if (!isMainBeat) type = "sub";
        else if (isAccent) type = "accent";
        else type = "beat";

        playClick(time, type);

        // Programar el LED visual para que "encienda" justo cuando suena
        const ledIdx = beatIdx * metronomeState.subdivision + metronomeState.currentSub;
        const visualType = type;
        const isFirstOfMeasure = (beatIdx === 0 && metronomeState.currentSub === 0);
        const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
        setTimeout(() => triggerVisualBeat(ledIdx, visualType, isFirstOfMeasure), delayMs);

        advanceNote();
    }
    metronomeState.timerID = window.setTimeout(scheduler, metronomeState.lookahead);
}

/* Avanza el contador (currentBeat / currentSub) y el reloj nextNoteTime */
function advanceNote() {
    // Tiempo entre subdivisiones
    // secondsPerBeat asume que el "pulso" siempre dura 60/BPM (BPM se mide en pulsos del compás).
    const secondsPerBeat = 60.0 / metronomeState.bpm;
    const secondsPerSub  = secondsPerBeat / metronomeState.subdivision;
    metronomeState.nextNoteTime += secondsPerSub;

    metronomeState.currentSub++;
    if (metronomeState.currentSub >= metronomeState.subdivision) {
        metronomeState.currentSub = 0;
        metronomeState.currentBeat = (metronomeState.currentBeat + 1) % metronomeState.beatsPerMeasure;
    }
}

/* Animación visual de los LEDs — apaga todos y enciende el actual */
function triggerVisualBeat(ledIdx, type, isFirstOfMeasure) {
    const popup = document.getElementById("metronome-popup");
    if (popup && type !== "sub" && isFirstOfMeasure) {
        // flash de borde solo en el primer pulso del compás
        popup.classList.add("beat-flash");
        setTimeout(() => popup.classList.remove("beat-flash"), 90);
    }
    const row = document.getElementById("met-pro-leds-row");
    if (!row) return;
    const leds = row.children;
    for (let i = 0; i < leds.length; i++) {
        leds[i].classList.remove("lit", "lit-accent");
    }
    const led = leds[ledIdx];
    if (!led) return;
    if (type === "accent") led.classList.add("lit-accent");
    else /* beat | sub */ led.classList.add("lit");
    // Apagar el LED tras un breve destello para que cada pulso sea claro
    const onDuration = type === "sub" ? 70 : 130;
    setTimeout(() => { led.classList.remove("lit", "lit-accent"); }, onDuration);
}

/* --------------------------------------------------------------
   4. CONTROL — play/stop, BPM, compás, subdivisión, TAP
   -------------------------------------------------------------- */
function toggleMetronome() {
    initAudioContext();
    if (!metronomeState.audioContext) return;

    if (metronomeState.isPlaying) {
        window.clearTimeout(metronomeState.timerID);
        metronomeState.isPlaying = false;
        updatePlayButtonUI(false);
        // Apagar todos los LEDs
        const row = document.getElementById("met-pro-leds-row");
        if (row) for (const led of row.children) led.classList.remove("lit", "lit-accent");
    } else {
        metronomeState.currentBeat = 0;
        metronomeState.currentSub = 0;
        metronomeState.nextNoteTime = metronomeState.audioContext.currentTime + 0.06;
        metronomeState.isPlaying = true;
        scheduler();
        updatePlayButtonUI(true);

        if (window.logInteraction) {
            window.logInteraction("METRONOME", "Start: " + metronomeState.bpm + " BPM " +
                metronomeState.beatsPerMeasure + "/" + metronomeState.beatUnit +
                " sub:" + metronomeState.subdivision);
        }
    }
}

function updatePlayButtonUI(isPlaying) {
    const btn = document.getElementById("metro-play-btn");
    const iconPlay = document.getElementById("metro-icon-play");
    const iconStop = document.getElementById("metro-icon-stop");
    if (!btn) return;
    if (isPlaying) {
        btn.classList.add("playing");
        if (iconPlay) iconPlay.style.display = "none";
        if (iconStop) iconStop.style.display = "block";
    } else {
        btn.classList.remove("playing");
        if (iconPlay) iconPlay.style.display = "block";
        if (iconStop) iconStop.style.display = "none";
    }
    if (!isPlaying && metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove("active-metronome");
        metronomeState.activeTableBtn = null;
    }
}

function setBPM(val) {
    let next = parseInt(val, 10);
    if (isNaN(next)) return;
    if (next < 30) next = 30;
    if (next > 300) next = 300;
    metronomeState.bpm = next;
    const valDisplay = document.getElementById("metro-bpm-val");
    const slider = document.getElementById("metro-bpm-slider");
    if (valDisplay) valDisplay.textContent = next;
    if (slider && parseInt(slider.value, 10) !== next) slider.value = next;
}

function setTimeSignature(value) {
    const ts = TIME_SIGNATURES.find(t => t.value === value);
    if (!ts) return;
    metronomeState.beatsPerMeasure = ts.num;
    metronomeState.beatUnit = ts.den;
    _accentsOfCurrentSig = ts.accents.slice();
    rebuildLeds();
    // Si está sonando, reset el contador para no descuadrar el compás
    metronomeState.currentBeat = 0;
    metronomeState.currentSub = 0;
}

function setSubdivision(id) {
    const sub = SUBDIVISIONS.find(s => s.id === id);
    if (!sub) return;
    metronomeState.subdivision = sub.factor;
    rebuildLeds();
    // Marcar el botón activo
    document.querySelectorAll(".met-pro-subdiv-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.sub === id);
    });
    metronomeState.currentSub = 0;
}

function handleTapTempo(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const tapBtn = document.getElementById("metro-tap-btn");
    if (tapBtn) {
        tapBtn.classList.add("flash");
        setTimeout(() => tapBtn.classList.remove("flash"), 80);
    }
    const now = Date.now();
    const last = metronomeState.tapTimes[metronomeState.tapTimes.length - 1];
    if (last !== undefined && (now - last) > metronomeState.tapTimeout) {
        metronomeState.tapTimes = [];
    }
    metronomeState.tapTimes.push(now);
    if (metronomeState.tapTimes.length > 5) metronomeState.tapTimes.shift();
    if (metronomeState.tapTimes.length > 1) {
        const intervals = [];
        for (let i = 1; i < metronomeState.tapTimes.length; i++) {
            intervals.push(metronomeState.tapTimes[i] - metronomeState.tapTimes[i - 1]);
        }
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const calcBpm = Math.round(60000 / avg);
        if (calcBpm >= 30 && calcBpm <= 300) setBPM(calcBpm);
    }
}

/* --------------------------------------------------------------
   5. API PÚBLICA — compatibilidad con setlists / setlist-extension
   -------------------------------------------------------------- */
window.toggleMetronomeFromTable = function (bpmRaw, btnElement) {
    const match = String(bpmRaw).match(/\d+/);
    if (!match) { alert("No se encontró un tempo válido."); return; }
    const targetBpm = parseInt(match[0], 10);

    initAudioContext();
    buildMetronomeUI();          // por si alguien lo llama antes de abrir el popup
    rebuildLeds();

    // Si ya está sonando este mismo botón → toggle off
    if (metronomeState.isPlaying && metronomeState.activeTableBtn === btnElement) {
        toggleMetronome();
        return;
    }

    setBPM(targetBpm);

    if (metronomeState.activeTableBtn) {
        metronomeState.activeTableBtn.classList.remove("active-metronome");
    }
    if (btnElement) {
        btnElement.classList.add("active-metronome");
        metronomeState.activeTableBtn = btnElement;
    }

    if (!metronomeState.isPlaying) toggleMetronome();
};

window.toggleMetronome = toggleMetronome;
window.setMetronomeBPM = setBPM;

/* --------------------------------------------------------------
   6. EVENTOS DOM — enganchamos handlers tras construir la UI
   -------------------------------------------------------------- */
function wireMetronomeEvents() {
    const playBtn = document.getElementById("metro-play-btn");
    if (playBtn) playBtn.addEventListener("click", () => {
        initAudioContext();
        toggleMetronome();
    });

    const slider = document.getElementById("metro-bpm-slider");
    if (slider) {
        slider.addEventListener("input", (e) => setBPM(e.target.value));
        slider.addEventListener("change", (e) => setBPM(e.target.value));
    }

    const minus = document.getElementById("metro-minus");
    if (minus) minus.addEventListener("click", () => setBPM(metronomeState.bpm - 1));
    const plus = document.getElementById("metro-plus");
    if (plus) plus.addEventListener("click", () => setBPM(metronomeState.bpm + 1));

    const tap = document.getElementById("metro-tap-btn");
    if (tap) {
        tap.addEventListener("mousedown", handleTapTempo);
        tap.addEventListener("touchstart", handleTapTempo, { passive: false });
    }

    const ts = document.getElementById("met-pro-time-sig");
    if (ts) ts.addEventListener("change", (e) => setTimeSignature(e.target.value));

    const subRow = document.getElementById("met-pro-subdiv-row");
    if (subRow) {
        subRow.addEventListener("click", (e) => {
            const btn = e.target.closest(".met-pro-subdiv-btn");
            if (btn && btn.dataset.sub) setSubdivision(btn.dataset.sub);
        });
    }

    const closeBtn = document.getElementById("met-pro-close");
    if (closeBtn) closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const popup = document.getElementById("metronome-popup");
        if (popup) popup.classList.remove("visible");
        if (metronomeState.isPlaying) toggleMetronome();
    });
}

/* --------------------------------------------------------------
   7. BOOT — inyectamos estilos + UI + eventos en DOMContentLoaded
   -------------------------------------------------------------- */
function bootMetronome() {
    injectMetronomeStyles();
    buildMetronomeUI();
    wireMetronomeEvents();

    // Sincronizar valores iniciales con el estado
    setBPM(metronomeState.bpm);
    rebuildLeds();

    // Toggle de apertura del popup (mismo patrón que la versión vieja)
    const toggleBtn = document.getElementById("metronome-toggle-btn");
    const popup = document.getElementById("metronome-popup");
    if (toggleBtn && popup && !toggleBtn.dataset.proWired) {
        toggleBtn.dataset.proWired = "1";
        toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (popup.classList.contains("visible")) {
                popup.classList.remove("visible");
                if (metronomeState.isPlaying) toggleMetronome();
            } else {
                popup.classList.add("visible");
                initAudioContext();
            }
        });

        // Cerrar al pulsar fuera
        document.addEventListener("click", (ev) => {
            if (!popup.classList.contains("visible")) return;
            if (popup.contains(ev.target)) return;
            if (toggleBtn === ev.target || toggleBtn.contains(ev.target)) return;
            popup.classList.remove("visible");
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMetronome);
} else {
    bootMetronome();
}
