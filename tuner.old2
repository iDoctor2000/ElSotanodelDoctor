/* ==========================================================================
   TUNER.JS  —  iDoctor TUNER PRO v2
   Afinador autocontenido (un solo archivo). Inyecta su propio botón en el
   header, su popup y todos los estilos.

   Funcionalidades:
   - 8 instrumentos: Guitarra, Guitarra 12 cuerdas, Bajo 4, Bajo 5, Ukelele,
     Guitalele, Mandolina, Violín.
   - Afinaciones por instrumento: Estándar + Drop D / Drop tunings, Half-step
     down (Eb), Open G, Open D, DADGAD, Low-G ukelele, Baritone, etc.
   - 3 MODOS de afinación:
        AUTO   → aguja analógica clásica (estilo dial).
        METER  → barra horizontal con línea media vertical (estilo GuitarTuna),
                 desplazamiento ←♭ / ♯→ con colores rojo/amarillo/verde.
        MANUAL → botones por cuerda con tono de referencia (oscilador).
   - Detección de tono vía autocorrelación (algoritmo robusto para
     guitarra/bajo/ukelele).
   ========================================================================== */

console.log("--- TUNER.JS v2 cargado (8 instrumentos + 3 modos) ---");

(function () {
    // ============================================================
    // 1. CONSTANTES Y TABLAS
    // ============================================================
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    /* INSTRUMENTOS y AFINACIONES ---------------------------------
       Cada instrumento tiene un objeto `tunings` con varias afinaciones.
       Cada afinación es un array de cuerdas con `note` (etiqueta) y `freq`
       (Hz, calculado con A4=440Hz).
       --------------------------------------------------------- */
    const INSTRUMENTS = {
        guitar: {
            name: "Guitarra",
            emoji: "🎸",
            tunings: {
                standard:  { name: "Estándar (E A D G B E)", strings: [
                    { note: "E2", freq: 82.41 },  { note: "A2", freq: 110.00 },
                    { note: "D3", freq: 146.83 }, { note: "G3", freq: 196.00 },
                    { note: "B3", freq: 246.94 }, { note: "E4", freq: 329.63 }
                ]},
                drop_d:    { name: "Drop D (D A D G B E)", strings: [
                    { note: "D2", freq: 73.42 },  { note: "A2", freq: 110.00 },
                    { note: "D3", freq: 146.83 }, { note: "G3", freq: 196.00 },
                    { note: "B3", freq: 246.94 }, { note: "E4", freq: 329.63 }
                ]},
                half_down: { name: "½ tono abajo (Eb Ab Db Gb Bb Eb)", strings: [
                    { note: "Eb2", freq: 77.78 }, { note: "Ab2", freq: 103.83 },
                    { note: "Db3", freq: 138.59 },{ note: "Gb3", freq: 185.00 },
                    { note: "Bb3", freq: 233.08 },{ note: "Eb4", freq: 311.13 }
                ]},
                open_g:    { name: "Open G (D G D G B D)", strings: [
                    { note: "D2", freq: 73.42 },  { note: "G2", freq: 98.00 },
                    { note: "D3", freq: 146.83 }, { note: "G3", freq: 196.00 },
                    { note: "B3", freq: 246.94 }, { note: "D4", freq: 293.66 }
                ]},
                open_d:    { name: "Open D (D A D F# A D)", strings: [
                    { note: "D2", freq: 73.42 },  { note: "A2", freq: 110.00 },
                    { note: "D3", freq: 146.83 }, { note: "F#3", freq: 185.00 },
                    { note: "A3", freq: 220.00 }, { note: "D4", freq: 293.66 }
                ]},
                dadgad:    { name: "DADGAD", strings: [
                    { note: "D2", freq: 73.42 },  { note: "A2", freq: 110.00 },
                    { note: "D3", freq: 146.83 }, { note: "G3", freq: 196.00 },
                    { note: "A3", freq: 220.00 }, { note: "D4", freq: 293.66 }
                ]},
            }
        },

        guitar12: {
            name: "Guitarra 12 cuerdas",
            emoji: "🎸",
            tunings: {
                standard:  { name: "Estándar (12 cuerdas, octavas)", strings: [
                    { note: "E2", freq: 82.41 },  { note: "E3", freq: 164.81 },
                    { note: "A2", freq: 110.00 }, { note: "A3", freq: 220.00 },
                    { note: "D3", freq: 146.83 }, { note: "D4", freq: 293.66 },
                    { note: "G3", freq: 196.00 }, { note: "G4", freq: 392.00 },
                    { note: "B3", freq: 246.94 }, { note: "B3", freq: 246.94 },
                    { note: "E4", freq: 329.63 }, { note: "E4", freq: 329.63 }
                ]},
                half_down: { name: "½ tono abajo (12 cuerdas)", strings: [
                    { note: "Eb2", freq: 77.78 }, { note: "Eb3", freq: 155.56 },
                    { note: "Ab2", freq: 103.83 },{ note: "Ab3", freq: 207.65 },
                    { note: "Db3", freq: 138.59 },{ note: "Db4", freq: 277.18 },
                    { note: "Gb3", freq: 185.00 },{ note: "Gb4", freq: 369.99 },
                    { note: "Bb3", freq: 233.08 },{ note: "Bb3", freq: 233.08 },
                    { note: "Eb4", freq: 311.13 },{ note: "Eb4", freq: 311.13 }
                ]},
            }
        },

        bass4: {
            name: "Bajo 4 cuerdas",
            emoji: "🎻",
            tunings: {
                standard:  { name: "Estándar (E A D G)", strings: [
                    { note: "E1", freq: 41.20 }, { note: "A1", freq: 55.00 },
                    { note: "D2", freq: 73.42 }, { note: "G2", freq: 98.00 }
                ]},
                drop_d:    { name: "Drop D (D A D G)", strings: [
                    { note: "D1", freq: 36.71 }, { note: "A1", freq: 55.00 },
                    { note: "D2", freq: 73.42 }, { note: "G2", freq: 98.00 }
                ]},
                half_down: { name: "½ tono abajo (Eb Ab Db Gb)", strings: [
                    { note: "Eb1", freq: 38.89 }, { note: "Ab1", freq: 51.91 },
                    { note: "Db2", freq: 69.30 }, { note: "Gb2", freq: 92.50 }
                ]},
                bead:      { name: "BEAD (afinación grave)", strings: [
                    { note: "B0", freq: 30.87 }, { note: "E1", freq: 41.20 },
                    { note: "A1", freq: 55.00 }, { note: "D2", freq: 73.42 }
                ]},
            }
        },

        bass5: {
            name: "Bajo 5 cuerdas",
            emoji: "🎻",
            tunings: {
                standard:  { name: "Estándar (B E A D G)", strings: [
                    { note: "B0", freq: 30.87 }, { note: "E1", freq: 41.20 },
                    { note: "A1", freq: 55.00 }, { note: "D2", freq: 73.42 },
                    { note: "G2", freq: 98.00 }
                ]},
                drop_a:    { name: "Drop A (A E A D G)", strings: [
                    { note: "A0", freq: 27.50 }, { note: "E1", freq: 41.20 },
                    { note: "A1", freq: 55.00 }, { note: "D2", freq: 73.42 },
                    { note: "G2", freq: 98.00 }
                ]},
                half_down: { name: "½ tono abajo", strings: [
                    { note: "Bb0", freq: 29.14 }, { note: "Eb1", freq: 38.89 },
                    { note: "Ab1", freq: 51.91 }, { note: "Db2", freq: 69.30 },
                    { note: "Gb2", freq: 92.50 }
                ]},
            }
        },

        ukulele: {
            name: "Ukelele",
            emoji: "🏝️",
            tunings: {
                high_g:   { name: "High-G estándar (G C E A)", strings: [
                    { note: "G4", freq: 392.00 }, { note: "C4", freq: 261.63 },
                    { note: "E4", freq: 329.63 }, { note: "A4", freq: 440.00 }
                ]},
                low_g:    { name: "Low-G (G3 C E A)", strings: [
                    { note: "G3", freq: 196.00 }, { note: "C4", freq: 261.63 },
                    { note: "E4", freq: 329.63 }, { note: "A4", freq: 440.00 }
                ]},
                d_tuning: { name: "D-tuning (A D F# B)", strings: [
                    { note: "A4", freq: 440.00 }, { note: "D4", freq: 293.66 },
                    { note: "F#4", freq: 369.99 },{ note: "B4", freq: 493.88 }
                ]},
                baritone: { name: "Barítono (D G B E)", strings: [
                    { note: "D3", freq: 146.83 }, { note: "G3", freq: 196.00 },
                    { note: "B3", freq: 246.94 }, { note: "E4", freq: 329.63 }
                ]},
            }
        },

        guitalele: {
            name: "Guitalele",
            emoji: "🪕",
            tunings: {
                standard: { name: "Estándar (A D G C E A)", strings: [
                    { note: "A2", freq: 110.00 }, { note: "D3", freq: 146.83 },
                    { note: "G3", freq: 196.00 }, { note: "C4", freq: 261.63 },
                    { note: "E4", freq: 329.63 }, { note: "A4", freq: 440.00 }
                ]},
                drop_g:   { name: "Drop G (G D G C E A)", strings: [
                    { note: "G2", freq: 98.00 },  { note: "D3", freq: 146.83 },
                    { note: "G3", freq: 196.00 }, { note: "C4", freq: 261.63 },
                    { note: "E4", freq: 329.63 }, { note: "A4", freq: 440.00 }
                ]},
            }
        },

        mandolin: {
            name: "Mandolina",
            emoji: "🪕",
            tunings: {
                standard: { name: "Estándar (G D A E)", strings: [
                    { note: "G3", freq: 196.00 }, { note: "D4", freq: 293.66 },
                    { note: "A4", freq: 440.00 }, { note: "E5", freq: 659.26 }
                ]},
                cross:    { name: "Cross-tuning (A D A E)", strings: [
                    { note: "A3", freq: 220.00 }, { note: "D4", freq: 293.66 },
                    { note: "A4", freq: 440.00 }, { note: "E5", freq: 659.26 }
                ]},
            }
        },

        violin: {
            name: "Violín",
            emoji: "🎻",
            tunings: {
                standard: { name: "Estándar (G D A E)", strings: [
                    { note: "G3", freq: 196.00 }, { note: "D4", freq: 293.66 },
                    { note: "A4", freq: 440.00 }, { note: "E5", freq: 659.26 }
                ]},
            }
        },
    };

    // ============================================================
    // 2. ESTADO INTERNO
    // ============================================================
    let audioContext      = null;
    let analyser          = null;
    let microphoneStream  = null;
    let rafID             = null;
    let isTunerRunning    = false;
    let activeOscillator  = null;
    let mode              = "auto";       // "auto" | "manual" | "meter"
    let currentInstrument = "guitar";
    let currentTuning     = "standard";

    const BUFLEN = 2048;
    const sampleBuf = new Float32Array(BUFLEN);
    const MIN_VOLUME_THRESHOLD = 0.01;

    // ============================================================
    // 3. UTILIDADES MUSICALES
    // ============================================================
    function noteFromPitch(frequency) {
        return Math.round(12 * (Math.log(frequency / 440) / Math.log(2))) + 69;
    }
    function frequencyFromNoteNumber(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    function centsOffFromPitch(frequency, midi) {
        return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(midi)) / Math.log(2));
    }

    /* Algoritmo de autocorrelación.
       Devuelve la frecuencia detectada (Hz) o -1 si no hay señal clara. */
    function autoCorrelate(buf, sampleRate) {
        let size = buf.length;
        let rms = 0;
        for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / size);
        if (rms < MIN_VOLUME_THRESHOLD) return -1;

        let r1 = 0, r2 = size - 1;
        const thres = 0.2;
        for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
        buf = buf.slice(r1, r2);
        size = buf.length;

        const c = new Array(size).fill(0);
        for (let i = 0; i < size; i++)
            for (let j = 0; j < size - i; j++)
                c[i] += buf[j] * buf[j + i];

        let d = 0;
        while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;
        for (let i = d; i < size; i++) {
            if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
        }
        let T0 = maxpos;
        if (T0 <= 0) return -1;
        const x1 = c[T0 - 1] || 0, x2 = c[T0] || 0, x3 = c[T0 + 1] || 0;
        const a = (x1 + x3 - 2 * x2) / 2;
        const b = (x3 - x1) / 2;
        if (a) T0 = T0 - b / (2 * a);
        return sampleRate / T0;
    }

    /* Encuentra la cuerda más cercana a la frecuencia detectada. */
    function findClosestString(freq) {
        const inst = INSTRUMENTS[currentInstrument];
        if (!inst) return null;
        const tuning = inst.tunings[currentTuning];
        if (!tuning) return null;
        let best = null, bestDist = Infinity;
        for (const s of tuning.strings) {
            const cents = Math.abs(1200 * Math.log(freq / s.freq) / Math.log(2));
            if (cents < bestDist) { bestDist = cents; best = s; }
        }
        if (bestDist > 200) return null;
        return best;
    }

    // ============================================================
    // 4. INYECCIÓN DE ESTILOS
    // ============================================================
    function injectStyles() {
        if (document.getElementById("idoctor-tuner-styles")) return;
        const css = `
        /* Botón header */
        #idoctor-tuner-btn {
            cursor: pointer;
            width: 40px; height: 40px; padding: 7px;
            display: flex; align-items: center; justify-content: center;
            color: #fff;
            background: #4b5320 !important;
            border: 1px solid #6b7335 !important;
            border-radius: 8px !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
        }
        #idoctor-tuner-btn svg { width: 100%; height: 100%; fill: currentColor; }
        #idoctor-tuner-btn:hover {
            background: #5d6628 !important;
            border-color: #8a9446 !important;
            color: #d4e69c;
        }
        #idoctor-tuner-btn.active {
            background: #6d7838 !important;
            border-color: #d4e69c !important;
            color: #d4e69c;
            box-shadow: 0 0 12px rgba(212,230,156,0.5);
        }
        @media (max-width: 768px) {
            #idoctor-tuner-btn { width: 35px; height: 35px; padding: 6px; }
        }

        /* Popup */
        #idoctor-tuner-popup {
            position: fixed; top: 70px; right: 20px;
            width: 380px; max-width: 92vw;
            background: linear-gradient(180deg, #1a1d22 0%, #0d0f12 100%);
            color: #ddd;
            border: 1px solid #2a2a2a;
            border-radius: 16px;
            padding: 14px;
            box-shadow: 0 14px 50px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.04);
            z-index: 100000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
            user-select: none;
            -webkit-user-select: none;
        }
        #idoctor-tuner-popup.visible { display: flex; flex-direction: column; gap: 10px; }

        .idt-header {
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            padding-bottom: 8px;
        }
        .idt-brand {
            font-size: 0.78em; letter-spacing: 2px; color: #d4e69c;
            font-weight: bold; text-transform: uppercase;
        }
        .idt-close {
            background: transparent; border: none; color: #888; cursor: pointer;
            font-size: 1.2em; padding: 0 6px;
        }
        .idt-close:hover { color: #fff; }

        .idt-mode-switch {
            display: flex; background: #0a0a0a; border-radius: 999px;
            padding: 2px; border: 1px solid #2a2a2a;
        }
        .idt-mode-btn {
            flex: 1; background: transparent; border: none; color: #888;
            padding: 5px 8px; border-radius: 999px; cursor: pointer;
            font-size: 0.72em; font-weight: bold; letter-spacing: 1.5px;
            transition: all 0.2s; text-transform: uppercase;
        }
        .idt-mode-btn.active {
            background: linear-gradient(180deg, #1eb5d9, #0883a3);
            color: #001018;
            box-shadow: 0 0 6px rgba(30,181,217,0.5);
        }

        .idt-selectors {
            display: flex; flex-direction: column; gap: 6px;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            padding: 8px;
        }
        .idt-selectors label {
            font-size: 0.65em; letter-spacing: 1.5px; color: #588;
            text-transform: uppercase; font-weight: bold;
        }
        .idt-select {
            width: 100%;
            background: #0d1014; color: #d4e69c;
            border: 1px solid #4b5320; border-radius: 6px;
            padding: 6px 8px;
            font-family: 'Courier New', monospace;
            font-weight: bold; font-size: 0.92em;
            cursor: pointer;
            appearance: none; -webkit-appearance: none;
        }
        .idt-select option { background: #1a1d22; color: #d4e69c; }

        /* AUTO (galga) */
        .idt-gauge-wrap {
            position: relative; width: 100%;
            background: #050708; border-radius: 12px;
            padding: 14px 0 6px;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.8);
        }
        .idt-gauge-wrap svg { width: 100%; height: auto; display: block; }

        /* METER (barra horizontal) */
        .idt-meter {
            background: #050708; border-radius: 12px;
            padding: 18px 14px 14px;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.8);
            display: none;
        }
        .idt-meter.visible { display: block; }
        .idt-meter-note-row {
            display: flex; justify-content: center; align-items: baseline;
            gap: 8px; margin-bottom: 4px;
        }
        .idt-meter-note {
            font-family: 'Courier New', monospace;
            font-size: 4em; font-weight: 900;
            color: #3df04a;
            text-shadow: 0 0 8px rgba(61,240,74,0.5);
            line-height: 1;
        }
        .idt-meter-note.off  { color: #888; text-shadow: none; }
        .idt-meter-note.warn { color: #ffae00; text-shadow: 0 0 8px rgba(255,174,0,0.5); }
        .idt-meter-note.bad  { color: #ff3d3d; text-shadow: 0 0 8px rgba(255,61,61,0.5); }
        .idt-meter-octave {
            font-family: 'Courier New', monospace;
            font-size: 1.2em; color: #888; font-weight: normal;
        }
        .idt-meter-info {
            display: flex; justify-content: space-between;
            font-family: 'Courier New', monospace;
            font-size: 0.78em;
            color: #888;
            padding: 0 4px;
            margin-bottom: 8px;
        }
        .idt-meter-cents  { color: #d4e69c; font-weight: bold; }
        .idt-meter-target { color: #588; }

        .idt-meter-bar-wrap {
            position: relative;
            width: 100%; height: 36px;
            background: linear-gradient(90deg,
                #5a1010 0%, #c33 12%,
                #c97000 22%, #ffae00 30%,
                #1a4d1a 42%, #3df04a 50%, #1a4d1a 58%,
                #ffae00 70%, #c97000 78%,
                #c33 88%, #5a1010 100%);
            border-radius: 6px;
            overflow: visible;
            border: 1px solid #2a2a2a;
            box-shadow: inset 0 0 8px rgba(0,0,0,0.7);
        }
        .idt-meter-center-line {
            position: absolute;
            top: -6px; bottom: -6px;
            left: 50%; width: 2px;
            background: #fff;
            transform: translateX(-50%);
            box-shadow: 0 0 6px rgba(255,255,255,0.7);
            z-index: 2;
        }
        .idt-meter-needle {
            position: absolute;
            top: -3px; bottom: -3px;
            left: 50%; width: 4px;
            background: #ff3d3d;
            border-radius: 2px;
            transform: translateX(-50%);
            transition: left 0.08s ease-out, background-color 0.2s, box-shadow 0.2s;
            box-shadow: 0 0 8px rgba(255,61,61,0.8);
            z-index: 3;
        }
        .idt-meter-needle.in-tune {
            background: #3df04a;
            box-shadow: 0 0 12px rgba(61,240,74,1);
        }
        .idt-meter-needle.warn {
            background: #ffae00;
            box-shadow: 0 0 8px rgba(255,174,0,0.8);
        }
        .idt-meter-labels {
            display: flex; justify-content: space-between;
            font-family: 'Courier New', monospace; font-size: 0.7em;
            color: #888;
            padding: 4px 2px 0;
            letter-spacing: 1px;
        }
        .idt-meter-labels .lo { color: #c33; }
        .idt-meter-labels .ok { color: #3df04a; font-weight: bold; }
        .idt-meter-labels .hi { color: #c33; }
        .idt-meter-status {
            text-align: center;
            font-size: 0.85em;
            color: #3df04a;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-top: 8px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .idt-meter-status.visible { opacity: 1; }

        /* MANUAL */
        .idt-manual {
            display: none; flex-direction: column; gap: 10px;
            border-top: 1px solid rgba(255,255,255,0.08);
            padding-top: 10px;
        }
        .idt-manual.visible { display: flex; }
        .idt-manual-strings {
            display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
        }
        .idt-string-btn {
            min-width: 48px;
            background: #0d1014;
            border: 2px solid #4b5320;
            color: #d4e69c;
            padding: 8px 10px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.15s;
            font-size: 0.95em;
        }
        .idt-string-btn:hover {
            background: #1a1d22; border-color: #d4e69c; color: #fff;
        }
        .idt-string-btn.active {
            background: linear-gradient(180deg, #d4e69c, #4b5320);
            border-color: #d4e69c; color: #001018;
            box-shadow: 0 0 12px rgba(212,230,156,0.5);
        }
        .idt-manual-hint {
            font-size: 0.72em; color: #588;
            text-align: center; font-style: italic;
        }

        /* MIC viz */
        .idt-mic-row {
            display: flex; align-items: center; justify-content: center;
            gap: 4px; height: 14px; margin-top: -2px;
        }
        .idt-mic-bar {
            width: 3px; background: #2a2f35; border-radius: 1px;
            height: 4px; transition: height 0.1s, background 0.1s;
        }
        .idt-mic-icon { font-size: 0.85em; color: #588; margin-left: 4px; }

        @media (max-width: 480px) {
            #idoctor-tuner-popup { width: 96vw; padding: 10px; }
            .idt-meter-note { font-size: 3em; }
            .idt-string-btn { min-width: 40px; padding: 6px 8px; font-size: 0.85em; }
        }
        `;
        const s = document.createElement("style");
        s.id = "idoctor-tuner-styles";
        s.textContent = css;
        document.head.appendChild(s);
    }

    // ============================================================
    // 5. INYECCIÓN DEL BOTÓN (HEADER)
    // ============================================================
    function injectButton() {
        if (document.getElementById("idoctor-tuner-btn")) return true;
        const headerRight = document.querySelector(".header-controls-right");
        if (!headerRight) return false;
        const hamburger = headerRight.querySelector(".hamburger");
        const btn = document.createElement("button");
        btn.id = "idoctor-tuner-btn";
        btn.className = "header-icon-btn";
        btn.title = "Afinador (iDoctor TUNER PRO)";
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3a9 9 0 0 0-9 9h2a7 7 0 0 1 14 0h2a9 9 0 0 0-9-9zm0 4a5 5 0 0 0-5 5h2a3 3 0 0 1 6 0h2a5 5 0 0 0-5-5zm-1 6v6a1 1 0 1 0 2 0v-6h-2z"/>
            </svg>
        `;
        btn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            toggleTuner();
        });
        if (hamburger) headerRight.insertBefore(btn, hamburger);
        else headerRight.appendChild(btn);
        console.log("[tuner] Botón inyectado en el header");
        return true;
    }

    // ============================================================
    // 6. INYECCIÓN DEL POPUP (HTML COMPLETO)
    // ============================================================
    function injectPopup() {
        if (document.getElementById("idoctor-tuner-popup")) return;
        const popup = document.createElement("div");
        popup.id = "idoctor-tuner-popup";

        const instrumentOptions = Object.keys(INSTRUMENTS).map(key => {
            const inst = INSTRUMENTS[key];
            return `<option value="${key}">${inst.emoji} ${inst.name}</option>`;
        }).join("");

        popup.innerHTML = `
          <div class="idt-header">
            <span class="idt-brand">⊙ iDoctor TUNER PRO</span>
            <button type="button" class="idt-close" id="idt-close" title="Cerrar">×</button>
          </div>

          <div class="idt-mode-switch">
            <button type="button" class="idt-mode-btn active" data-mode="auto">Auto</button>
            <button type="button" class="idt-mode-btn" data-mode="meter">Meter</button>
            <button type="button" class="idt-mode-btn" data-mode="manual">Manual</button>
          </div>

          <div class="idt-selectors">
            <label>Instrumento</label>
            <select class="idt-select" id="idt-instrument">${instrumentOptions}</select>
            <label>Afinación</label>
            <select class="idt-select" id="idt-tuning"></select>
          </div>

          <div class="idt-gauge-wrap" id="idt-auto-view">${buildGaugeSVG()}</div>

          <div class="idt-meter" id="idt-meter-view">
            <div class="idt-meter-note-row">
              <span class="idt-meter-note off" id="idt-meter-note">--</span>
              <span class="idt-meter-octave" id="idt-meter-octave"></span>
            </div>
            <div class="idt-meter-info">
              <span><span id="idt-meter-freq">— Hz</span></span>
              <span class="idt-meter-cents" id="idt-meter-cents">±0 ¢</span>
              <span class="idt-meter-target" id="idt-meter-target">→ —</span>
            </div>
            <div class="idt-meter-bar-wrap">
              <div class="idt-meter-center-line"></div>
              <div class="idt-meter-needle" id="idt-meter-needle"></div>
            </div>
            <div class="idt-meter-labels">
              <span class="lo">−50¢ ♭</span>
              <span class="ok">PERFECTO</span>
              <span class="hi">♯ +50¢</span>
            </div>
            <div class="idt-meter-status" id="idt-meter-status">¡AFINADO!</div>
          </div>

          <div class="idt-manual" id="idt-manual-view">
            <div class="idt-manual-strings" id="idt-manual-strings"></div>
            <div class="idt-manual-hint">Pulsa una cuerda para escuchar el tono de referencia (3 s).</div>
          </div>

          <div class="idt-mic-row" id="idt-mic-row">
            <span class="idt-mic-bar"></span><span class="idt-mic-bar"></span>
            <span class="idt-mic-bar"></span><span class="idt-mic-bar"></span>
            <span class="idt-mic-bar"></span>
            <span class="idt-mic-icon">🎤</span>
          </div>
        `;
        document.body.appendChild(popup);
        wireEvents();
        rebuildTuningOptions();
    }

    /* SVG de la galga analógica (modo AUTO) */
    function buildGaugeSVG() {
        const cx = 200, cy = 220;
        const rIn = 130, rOut = 158;
        const totalLeds = 25;
        const halfArcDeg = 75;
        const stepDeg = (halfArcDeg * 2) / (totalLeds - 1);
        let leds = "";
        for (let i = 0; i < totalLeds; i++) {
            const a = -halfArcDeg + i * stepDeg;
            const svgA = (a - 90) * Math.PI / 180;
            const x1 = cx + rIn  * Math.cos(svgA);
            const y1 = cy + rIn  * Math.sin(svgA);
            const x2 = cx + rOut * Math.cos(svgA);
            const y2 = cy + rOut * Math.sin(svgA);
            leds += `<line class="idt-led" data-i="${i}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1a4d1a" stroke-width="6" stroke-linecap="round"/>`;
        }
        return `
        <svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="idt-led-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <g id="idt-leds">${leds}</g>
          <line id="idt-needle"
                x1="200" y1="220" x2="200" y2="78"
                stroke="#ff3322" stroke-width="3" stroke-linecap="round"
                filter="url(#idt-led-glow)"
                transform="rotate(0 200 220)"/>
          <circle cx="200" cy="220" r="9" fill="#222" stroke="#444" stroke-width="1.5"/>
          <circle cx="200" cy="220" r="3" fill="#666"/>
          <text id="idt-note-text" x="190" y="160"
                text-anchor="middle"
                font-family="Arial Black, Arial, sans-serif"
                font-size="78" font-weight="900"
                fill="#3df04a" opacity="0.95">—</text>
          <text id="idt-octave-text" x="252" y="165"
                font-family="Arial, sans-serif"
                font-size="26" fill="#666">—</text>
          <text id="idt-freq-text" x="200" y="195"
                text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="14" fill="#888">— Hz</text>
          <text id="idt-status-text" x="200" y="218"
                text-anchor="middle"
                font-family="Arial Black, Arial, sans-serif"
                font-size="13" font-weight="900" letter-spacing="1.5"
                fill="#3df04a" opacity="0">¡AFINADO!</text>
        </svg>`;
    }

    function wireEvents() {
        document.getElementById("idt-close").addEventListener("click", (e) => {
            e.stopPropagation(); stopTuner();
        });
        document.querySelectorAll(".idt-mode-btn").forEach(btn => {
            btn.addEventListener("click", () => setMode(btn.dataset.mode));
        });
        const instSel = document.getElementById("idt-instrument");
        instSel.value = currentInstrument;
        instSel.addEventListener("change", (e) => {
            currentInstrument = e.target.value;
            currentTuning = Object.keys(INSTRUMENTS[currentInstrument].tunings)[0];
            rebuildTuningOptions();
        });
        const tuningSel = document.getElementById("idt-tuning");
        tuningSel.addEventListener("change", (e) => {
            currentTuning = e.target.value;
            rebuildManualButtons();
        });
    }

    function rebuildTuningOptions() {
        const tuningSel = document.getElementById("idt-tuning");
        if (!tuningSel) return;
        const tunings = INSTRUMENTS[currentInstrument].tunings;
        tuningSel.innerHTML = Object.keys(tunings).map(key => {
            return `<option value="${key}"${key === currentTuning ? " selected" : ""}>${tunings[key].name}</option>`;
        }).join("");
        tuningSel.value = currentTuning;
        rebuildManualButtons();
    }

    function rebuildManualButtons() {
        const cont = document.getElementById("idt-manual-strings");
        if (!cont) return;
        cont.innerHTML = "";
        const tuning = INSTRUMENTS[currentInstrument].tunings[currentTuning];
        if (!tuning) return;
        tuning.strings.forEach(s => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "idt-string-btn";
            btn.textContent = s.note;
            btn.title = `${s.note} – ${s.freq.toFixed(2)} Hz`;
            btn.addEventListener("click", () => playReferenceTone(s.freq, btn));
            cont.appendChild(btn);
        });
    }

    // ============================================================
    // 7. CONTROL DE MODOS Y TONO DE REFERENCIA
    // ============================================================
    function setMode(newMode) {
        mode = newMode;
        document.querySelectorAll(".idt-mode-btn").forEach(b => {
            b.classList.toggle("active", b.dataset.mode === newMode);
        });
        const autoView   = document.getElementById("idt-auto-view");
        const meterView  = document.getElementById("idt-meter-view");
        const manualView = document.getElementById("idt-manual-view");
        if (autoView)   autoView.style.display   = (newMode === "auto") ? "block" : "none";
        if (meterView)  meterView.classList.toggle("visible", newMode === "meter");
        if (manualView) manualView.classList.toggle("visible", newMode === "manual");

        if (newMode !== "manual" && activeOscillator) {
            try { activeOscillator.stop(); } catch (e) {}
            activeOscillator = null;
            document.querySelectorAll(".idt-string-btn").forEach(b => b.classList.remove("active"));
        }
    }

    function playReferenceTone(freq, btnEl) {
        if (!audioContext) {
            try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { return; }
        }
        if (audioContext.state === "suspended") {
            try { audioContext.resume(); } catch (e) {}
        }
        if (activeOscillator) {
            try { activeOscillator.stop(); } catch (e) {}
            activeOscillator = null;
        }
        document.querySelectorAll(".idt-string-btn").forEach(b => b.classList.remove("active"));
        if (btnEl) btnEl.classList.add("active");

        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 3.0);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + 3.0);
        activeOscillator = osc;
        setTimeout(() => { if (btnEl) btnEl.classList.remove("active"); }, 3000);
    }

    // ============================================================
    // 8. ARRANQUE / PARADA
    // ============================================================
    async function startTuner() {
        injectStyles();
        if (!injectButton()) {
            setTimeout(startTuner, 500);
            return;
        }
        injectPopup();

        const popup = document.getElementById("idoctor-tuner-popup");
        const btn   = document.getElementById("idoctor-tuner-btn");
        if (!popup) return;

        isTunerRunning = true;
        popup.classList.add("visible");
        if (btn) btn.classList.add("active");

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Micrófono no soportado en este navegador.");
            }
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === "suspended") await audioContext.resume();

            microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
            });
            const source = audioContext.createMediaStreamSource(microphoneStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = BUFLEN;
            source.connect(analyser);

            updatePitchLoop();
        } catch (err) {
            console.error("[tuner] Error iniciando micrófono:", err);
            alert("No se pudo acceder al micrófono.\n\n" + (err.message || err));
            stopTuner();
        }
    }

    function stopTuner() {
        isTunerRunning = false;
        const popup = document.getElementById("idoctor-tuner-popup");
        const btn   = document.getElementById("idoctor-tuner-btn");
        if (popup) popup.classList.remove("visible");
        if (btn) btn.classList.remove("active");
        if (rafID) { cancelAnimationFrame(rafID); rafID = null; }
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(t => t.stop());
            microphoneStream = null;
        }
        if (activeOscillator) {
            try { activeOscillator.stop(); } catch (e) {}
            activeOscillator = null;
        }
    }

    function toggleTuner() {
        if (isTunerRunning) stopTuner();
        else startTuner();
    }

    // ============================================================
    // 9. LOOP DE DETECCIÓN
    // ============================================================
    function updatePitchLoop() {
        if (!isTunerRunning || !analyser) return;
        analyser.getFloatTimeDomainData(sampleBuf);

        let sum = 0;
        for (let i = 0; i < sampleBuf.length; i++) sum += sampleBuf[i] * sampleBuf[i];
        const rms = Math.sqrt(sum / sampleBuf.length);
        updateMicViz(rms);

        if (mode !== "manual") {
            const freq = autoCorrelate(sampleBuf, audioContext.sampleRate);
            if (freq !== -1) {
                const midi = noteFromPitch(freq);
                const cents = centsOffFromPitch(freq, midi);
                updateUI(midi, cents, freq);
            } else {
                dimUI();
            }
        }
        rafID = requestAnimationFrame(updatePitchLoop);
    }

    function updateMicViz(volume) {
        const bars = document.querySelectorAll(".idt-mic-bar");
        if (!bars.length) return;
        bars.forEach((bar, idx) => {
            const h = Math.min(14, Math.max(2, volume * 60 * (idx + 1)));
            bar.style.height = h + "px";
            bar.style.background = h > 6 ? "#d4e69c" : "#2a2f35";
        });
    }

    function updateUI(midiNote, cents, freq) {
        const noteName = NOTE_NAMES[midiNote % 12];
        const octave = Math.floor(midiNote / 12) - 1;
        const inTune = Math.abs(cents) < 5;
        const close  = Math.abs(cents) < 15;
        const closest = findClosestString(freq);

        if (mode === "auto") {
            updateAutoView(noteName, octave, cents, freq, inTune);
        } else if (mode === "meter") {
            updateMeterView(noteName, octave, cents, freq, inTune, close, closest);
        }
    }

    function updateAutoView(noteName, octave, cents, freq, inTune) {
        const noteEl   = document.getElementById("idt-note-text");
        const octEl    = document.getElementById("idt-octave-text");
        const freqEl   = document.getElementById("idt-freq-text");
        const statusEl = document.getElementById("idt-status-text");
        const needle   = document.getElementById("idt-needle");
        const leds     = document.querySelectorAll("#idt-leds .idt-led");
        if (!noteEl || !needle) return;

        noteEl.textContent = noteName;
        if (octEl)  octEl.textContent  = octave;
        if (freqEl) freqEl.textContent = freq.toFixed(1) + " Hz";

        const angle = Math.max(-75, Math.min(75, cents * 1.5));
        needle.setAttribute("transform", `rotate(${angle} 200 220)`);
        needle.setAttribute("stroke", inTune ? "#3df04a" : "#ff3322");

        const ledIdx = Math.round((cents + 50) / 100 * 24);
        leds.forEach((led, i) => {
            if (i === Math.max(0, Math.min(24, ledIdx))) {
                led.setAttribute("stroke", inTune ? "#3df04a" : (Math.abs(i - 12) <= 2 ? "#ffae00" : "#ff3322"));
            } else if (i === 12) {
                led.setAttribute("stroke", inTune ? "#3df04a" : "#1a4d1a");
            } else {
                led.setAttribute("stroke", "#1a4d1a");
            }
        });

        if (statusEl) statusEl.setAttribute("opacity", inTune ? 1 : 0);
        if (noteEl) noteEl.setAttribute("fill", inTune ? "#3df04a" : "#fff");
    }

    function updateMeterView(noteName, octave, cents, freq, inTune, close, closest) {
        const noteEl   = document.getElementById("idt-meter-note");
        const octEl    = document.getElementById("idt-meter-octave");
        const freqEl   = document.getElementById("idt-meter-freq");
        const centsEl  = document.getElementById("idt-meter-cents");
        const targetEl = document.getElementById("idt-meter-target");
        const needleEl = document.getElementById("idt-meter-needle");
        const statusEl = document.getElementById("idt-meter-status");
        if (!noteEl || !needleEl) return;

        noteEl.textContent = noteName;
        if (octEl) octEl.textContent = octave;
        if (freqEl) freqEl.textContent = freq.toFixed(1) + " Hz";
        const sign = cents > 0 ? "+" : "";
        if (centsEl) centsEl.textContent = sign + cents + " ¢";
        if (targetEl) targetEl.textContent = closest ? "→ " + closest.note : "→ —";

        const pct = Math.max(0, Math.min(100, 50 + cents));
        needleEl.style.left = pct + "%";

        noteEl.classList.remove("off", "warn", "bad");
        needleEl.classList.remove("in-tune", "warn");
        if (inTune) {
            needleEl.classList.add("in-tune");
        } else if (close) {
            noteEl.classList.add("warn");
            needleEl.classList.add("warn");
        } else {
            noteEl.classList.add("bad");
        }
        if (statusEl) statusEl.classList.toggle("visible", inTune);
    }

    function dimUI() {
        if (mode === "auto") {
            const needle = document.getElementById("idt-needle");
            if (needle) {
                needle.setAttribute("transform", "rotate(0 200 220)");
                needle.setAttribute("stroke", "#555");
            }
            const noteEl = document.getElementById("idt-note-text");
            if (noteEl) noteEl.textContent = "—";
            const octEl = document.getElementById("idt-octave-text");
            if (octEl) octEl.textContent = "—";
            const freqEl = document.getElementById("idt-freq-text");
            if (freqEl) freqEl.textContent = "— Hz";
            const statusEl = document.getElementById("idt-status-text");
            if (statusEl) statusEl.setAttribute("opacity", 0);
            const leds = document.querySelectorAll("#idt-leds .idt-led");
            leds.forEach(l => l.setAttribute("stroke", "#1a4d1a"));
        } else if (mode === "meter") {
            const noteEl = document.getElementById("idt-meter-note");
            if (noteEl) {
                noteEl.textContent = "--";
                noteEl.className = "idt-meter-note off";
            }
            const octEl = document.getElementById("idt-meter-octave");
            if (octEl) octEl.textContent = "";
            const freqEl = document.getElementById("idt-meter-freq");
            if (freqEl) freqEl.textContent = "— Hz";
            const centsEl = document.getElementById("idt-meter-cents");
            if (centsEl) centsEl.textContent = "±0 ¢";
            const targetEl = document.getElementById("idt-meter-target");
            if (targetEl) targetEl.textContent = "→ —";
            const needleEl = document.getElementById("idt-meter-needle");
            if (needleEl) {
                needleEl.style.left = "50%";
                needleEl.classList.remove("in-tune", "warn");
            }
            const statusEl = document.getElementById("idt-meter-status");
            if (statusEl) statusEl.classList.remove("visible");
        }
    }

    // ============================================================
    // 10. EXPOSICIÓN PÚBLICA + INIT
    // ============================================================
    window.iDoctorTuner = {
        toggle: toggleTuner,
        start:  startTuner,
        stop:   stopTuner,
    };
    window.closeTuner = stopTuner;
    if (window.SE) window.SE.toggleTuner = toggleTuner;
    else window.SE = { toggleTuner: toggleTuner };

    function init() {
        injectStyles();
        if (!injectButton()) {
            [200, 500, 1000, 2000, 5000].forEach(ms => setTimeout(injectButton, ms));
        }
        // Compatibilidad: si por algún motivo el viejo botón #se-tuner-toggle-btn
        // sigue presente (cache), engancharlo también al nuevo toggle.
        const oldBtn = document.getElementById("se-tuner-toggle-btn");
        if (oldBtn && !oldBtn.dataset.idtWired) {
            oldBtn.dataset.idtWired = "1";
            oldBtn.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                toggleTuner();
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
