/* ============================================================
   SETLIST-EXTENSION.JS  (v2 — defensivo)
   ------------------------------------------------------------
   Versión refactorizada con protección anti-bloqueo:
   - Todo envuelto en try/catch para que NUNCA pueda romper la página
   - Espera a que el DOM esté listo Y a que la página termine de cargar
     antes de tocar nada (delay de 2s para no competir con el splash)
   - No usa document.body.style.overflow (causa bloqueo de scroll)
   - No reintenta Firebase de forma agresiva
   - Observer del calendario es ULTRA conservador
   ============================================================ */

(function () {
  "use strict";

  // ============================================================
  // PROTECCIÓN GLOBAL: cualquier error queda capturado aquí
  // ============================================================
  function safeRun(fn, label) {
    try { return fn(); }
    catch (e) {
      console.warn("[setlist-extension] " + (label || "error") + ":", e && e.message);
      return null;
    }
  }

  console.log("--- SETLIST-EXTENSION.JS v4 cargado ---");

  // ============================================================
  // 1. ESTILOS — solo lo imprescindible
  // ============================================================
  function injectStyles() {
    if (document.getElementById("se-styles")) return;
    const css = `
      /* Ocultar setlists 2 y star de la página principal */
      #second-setlist, #star-setlist { display: none !important; }
      #menu-second-setlist-section, #menu-star-setlist-section { display: none !important; }

      /* Botón naranja "Setlist" en tabla de conciertos */
      .se-setlist-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; border-radius: 6px;
        border: 1px solid #ff8c1a; background: #ff8c1a; color: #000;
        cursor: pointer; font-size: 16px; line-height: 1; padding: 0;
      }
      .se-setlist-btn:hover { background: #ffae5c; }
      .se-setlist-btn.empty { background: transparent; color: #ff8c1a; border-style: dashed; opacity: 0.7; }
      th.se-setlist-col-header { text-align: center; }
      td.se-setlist-col          { text-align: center; }

      /* Modal "Ver Setlist del Concierto" - empieza display:none de forma estricta */
      #se-concert-setlist-modal {
        display: none;
      }
      #se-concert-setlist-modal.show {
        display: flex;
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        align-items: flex-start; justify-content: center;
        /* z-index 99500: por encima del modal de "Conciertos Pasados" (99000)
           para que cuando el usuario pulse 🎵 desde un concierto pasado, el
           setlist aparezca POR ENCIMA del modal de pasados, no debajo. */
        z-index: 99500; overflow-y: auto;
        padding: 30px 10px;
      }
      #se-concert-setlist-modal .se-modal-box {
        background: #1a1a1a; color: #fff; border: 1px solid #333;
        border-radius: 12px; max-width: 1200px; width: 100%;
        padding: 22px 22px 30px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      }
      #se-concert-setlist-modal h2 { color: #ff8c1a; text-align: center; margin: 0 0 6px; }
      #se-concert-setlist-modal .se-subtitle { text-align: center; color: #aaa; margin: 0 0 18px; font-size: 0.95em; }
      /* La tabla DENTRO del modal HEREDA los estilos globales (.table-wrapper, table, etc.)
         de la página principal: misma apariencia que el setlist de ensayos */
      #se-concert-setlist-modal .se-empty-state { text-align: center; padding: 40px 20px; color: #ffae5c; font-size: 1.05em; font-style: italic; }
      #se-concert-setlist-modal .se-actions-bar { text-align: center; margin-top: 14px; }
      #se-concert-setlist-modal .se-modal-total { color: #aaa; font-size: 0.95em; text-align: center; margin: 12px 0 4px; }
      #se-concert-setlist-modal .se-close-row { text-align: center; margin-top: 10px; }
      #se-concert-setlist-modal .se-close-btn {
        background: #c33; color: #fff; border: none; border-radius: 8px;
        padding: 9px 22px; cursor: pointer;
      }
      #se-concert-setlist-modal .se-close-btn:hover { background: #e55; }

      /* Botón "Conciertos Pasados" inyectado en la sección #calendario */
      .se-past-concerts-bar {
        text-align: center; margin: 18px 0 6px;
      }
      .se-past-concerts-btn {
        display: inline-block; background: #ff8c1a; color: #000;
        border: none; border-radius: 8px; padding: 10px 22px;
        font-size: 1em; font-weight: bold; cursor: pointer;
      }
      .se-past-concerts-btn:hover { background: #ffae5c; }

      /* Modal "Conciertos Pasados" */
      #se-past-concerts-modal { display: none; }
      #se-past-concerts-modal.show {
        display: flex;
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85);
        align-items: flex-start; justify-content: center;
        z-index: 99000; overflow-y: auto;
        padding: 30px 10px;
      }
      #se-past-concerts-modal .se-modal-box {
        background: #1a1a1a; color: #fff; border: 1px solid #333;
        border-radius: 12px; max-width: 1100px; width: 100%;
        padding: 22px 22px 30px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      }
      #se-past-concerts-modal h2 { color: #ff8c1a; text-align: center; margin: 0 0 6px; }
      #se-past-concerts-modal .se-subtitle { text-align: center; color: #aaa; margin: 0 0 18px; font-size: 0.95em; }
      #se-past-concerts-modal .se-empty-state { text-align: center; padding: 40px 20px; color: #ffae5c; font-size: 1.05em; font-style: italic; }
      #se-past-concerts-modal .se-close-row { text-align: center; margin-top: 14px; }
      #se-past-concerts-modal .details-btn {
        background: transparent; border: 1px solid #0cf; color: #0cf;
        padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 1.1em;
      }
      #se-past-concerts-modal .details-btn:hover { background: rgba(0,204,255,0.1); }

      /* Bloque JSON dentro del modal de concierto */
      .se-json-block {
        border: 1px solid #444; border-radius: 8px; padding: 12px;
        margin-top: 14px; margin-bottom: 14px;
        background: rgba(255, 140, 26, 0.06);
      }
      .se-json-block label { color: #ff8c1a; font-weight: bold; }
      .se-json-block .se-json-help { font-size: 0.85em; color: #aaa; margin: 4px 0 8px; }
      .se-json-block textarea {
        width: 100%; min-height: 70px;
        font-family: 'Courier New', monospace; font-size: 0.85em;
        background: #0a0a0a; color: #ddd; border: 1px solid #333;
        border-radius: 6px; padding: 8px; resize: vertical;
        box-sizing: border-box;
      }
      .se-json-block .se-json-status { font-size: 0.85em; margin-top: 6px; font-style: italic; }
      .se-json-block .se-json-status.ok    { color: #6f6; }
      .se-json-block .se-json-status.err   { color: #f66; }
      .se-json-block .se-json-status.empty { color: #888; }

      /* === IMPORTANTÍSIMO: el popup del metrónomo (#metronome-popup) tiene
         z-index:2000 en index.html. Nuestro modal está a z-index:99000, así
         que por defecto el popup quedaría DETRÁS del modal y parecería que
         no funciona. Lo subimos por encima con !important. */
      #metronome-popup { z-index: 100000 !important; }

      /* === Jukebox: index.html lo crea con z-index:11000 — eso lo deja
         POR DEBAJO de nuestros modales (z-index 99000) y al pulsar el icono
         🎧 dentro del modal del setlist, el reproductor aparecía oculto.
         Lo subimos por encima de TODO para que siempre se vea. */
      #jukebox-player-bar { z-index: 100500 !important; }

      /* === RESPONSIVE: que las tablas dentro de los modales del setlist
         se comporten EXACTAMENTE como las tablas del setlist principal
         del index (líneas 488-520 de index.html):
         - overflow-x:hidden (NO scroll horizontal)
         - min-width:unset, width:100%
         - texto envuelto, max-width 150px por celda
         Esto garantiza que en móvil se vean igual que el "Setlist Próximo
         Ensayo" original. */
      #se-concert-setlist-modal .table-wrapper,
      #se-past-concerts-modal   .table-wrapper {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
        display: flex;
        justify-content: center;
      }
      #se-concert-setlist-modal table,
      #se-past-concerts-modal   table {
        width: 100%;
        min-width: unset;
        border-collapse: collapse;
        table-layout: auto;
      }

      /* Las tablas de la zona privada se ajustan igual */
      .pz-setlist-songs { overflow-x: hidden !important; }
      .pz-setlist-render { overflow-x: hidden !important; max-width: 100%; }
      .pz-setlist-render .table-wrapper { overflow-x: hidden; max-width: 100%; }
      .pz-setlist-render table { min-width: unset !important; width: 100%; }

      /* === Ajustes específicos para móviles (≤768px) === */
      @media (max-width: 768px) {
        #se-concert-setlist-modal { padding: 10px 4px; }
        #se-past-concerts-modal   { padding: 10px 4px; }
        #se-concert-setlist-modal .se-modal-box,
        #se-past-concerts-modal   .se-modal-box {
          padding: 14px 8px 18px;
          border-radius: 10px;
        }
        #se-concert-setlist-modal h2,
        #se-past-concerts-modal   h2 { font-size: 1.15em; }
        #se-concert-setlist-modal .se-subtitle,
        #se-past-concerts-modal   .se-subtitle { font-size: 0.85em; }

        /* Tablas: fuerza ajuste y permite envoltura de texto, igual que
           hace index.html @media(max-width:768px) { th,td ... } */
        #se-concert-setlist-modal table,
        #se-past-concerts-modal   table,
        .pz-setlist-render table {
          font-size: 0.8em !important;
          min-width: unset !important;
          width: 100% !important;
        }
        #se-concert-setlist-modal th,
        #se-concert-setlist-modal td,
        #se-past-concerts-modal   th,
        #se-past-concerts-modal   td,
        .pz-setlist-render th,
        .pz-setlist-render td {
          padding: 6px 3px !important;
          white-space: normal !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          max-width: 130px;
        }
        /* Columnas de iconos: ancho mínimo, sin truncar */
        #se-concert-setlist-modal th.jukebox-col-header,
        #se-concert-setlist-modal td.jukebox-col,
        #se-concert-setlist-modal th.pdf-col-header,
        #se-concert-setlist-modal td.pdf-col,
        #se-concert-setlist-modal th.metronome-col-header,
        #se-concert-setlist-modal td.metronome-col,
        #se-past-concerts-modal   th.details-col-header,
        #se-past-concerts-modal   td.details-col-header,
        #se-past-concerts-modal   th.se-setlist-col-header,
        #se-past-concerts-modal   td.se-setlist-col,
        .pz-setlist-render th.jukebox-col-header,
        .pz-setlist-render td.jukebox-col,
        .pz-setlist-render th.pdf-col-header,
        .pz-setlist-render td.pdf-col,
        .pz-setlist-render th.metronome-col-header,
        .pz-setlist-render td.metronome-col {
          width: 32px !important; padding: 4px 1px !important; text-align: center !important;
        }
        /* Iconos un poquito más pequeños en móvil */
        #se-concert-setlist-modal .jukebox-btn,
        #se-concert-setlist-modal .pdf-btn,
        #se-concert-setlist-modal .metronome-table-btn,
        .pz-setlist-render .jukebox-btn,
        .pz-setlist-render .pdf-btn,
        .pz-setlist-render .metronome-table-btn {
          width: 28px !important; height: 28px !important;
        }

        #se-concert-setlist-modal .se-actions-bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
        #se-concert-setlist-modal .se-actions-bar button { font-size: 0.85em; padding: 7px 10px; }
        /* Popup metrónomo en móvil ocupando casi toda la anchura */
        #metronome-popup { right: 10px !important; left: 10px !important; width: auto !important; top: 65px !important; }

        /* === FIX para la tabla del Setlist Próximo Ensayo (index.html) === */
        /* El usuario reportó que la columna Time se cortaba a la derecha en
           móvil. Endurecemos los anchos sin tocar el index.html. */
        #setlists table, #second-setlist table, #star-setlist table {
          width: 100% !important;
          min-width: unset !important;
          table-layout: auto !important;
        }
        #setlists .table-wrapper,
        #second-setlist .table-wrapper,
        #star-setlist .table-wrapper {
          overflow-x: hidden !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        #setlists th, #setlists td,
        #second-setlist th, #second-setlist td,
        #star-setlist th, #star-setlist td {
          padding: 5px 2px !important;
          font-size: 0.78em !important;
          white-space: normal !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
        }
        #setlists th.jukebox-col-header, #setlists td.jukebox-col,
        #setlists th.pdf-col-header,    #setlists td.pdf-col,
        #setlists th.metronome-col-header, #setlists td.metronome-col {
          width: 28px !important; padding: 4px 1px !important; text-align: center !important;
        }
        #setlists .jukebox-btn, #setlists .pdf-btn, #setlists .metronome-table-btn {
          width: 26px !important; height: 26px !important;
        }
      }

      /* ====== UNIFORMIDAD VISUAL DE LOS BOTONES DEL HEADER ======
         Recuadre suave para todos los iconos para que se vean alineados.
         (Aplica también al metrónomo, al de audio y al calendario.) */
      .header-controls-right .header-icon-btn {
        border: 1px solid rgba(255,255,255,0.25) !important;
        border-radius: 8px !important;
        background: rgba(0,0,0,0.35);
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        transition: background 0.2s, border-color 0.2s, transform 0.1s;
      }
      .header-controls-right .header-icon-btn:hover {
        border-color: #0cf !important;
        transform: translateY(-1px);
      }

      /* (CSS del botón afinador ahora está en tuner.js — eliminado de aquí) */

      /* ====== BOTÓN CALENDARIO — fondo amarillento ====== */
      #header-calendar-btn {
        background: #c9a227 !important;        /* amarillo dorado */
        border: 1px solid #e3c04a !important;
        color: #1a1a1a !important;
      }
      #header-calendar-btn svg { fill: #1a1a1a !important; }
      #header-calendar-btn:hover {
        background: #e3c04a !important;
        border-color: #ffd966 !important;
      }

    `;
    const tag = document.createElement("style");
    tag.id = "se-styles";
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ============================================================
  // 2. UTILIDADES
  // ============================================================
  const decodeHtml = (text) => {
    if (typeof text !== "string") return text;
    const t = document.createElement("textarea");
    t.innerHTML = text;
    return t.value;
  };
  const toMMSS = (s) => {
    if (isNaN(s) || s === null || s === undefined) s = 0;
    const total = Math.round(s);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };
  const toHHMM = (s) => {
    if (isNaN(s) || s === null || s === undefined) s = 0;
    const total = Math.round(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  };

  // ============================================================
  // 3. PARSEO JSON BANDHELPER → estructura de sets
  // ============================================================
  function parseBandhelperJson(rawData) {
    if (!rawData) return { items: [], totalSeconds: 0 };
    const dataToProcess = Array.isArray(rawData) ? rawData : (rawData.items || []);

    const processed = dataToProcess.map((item) => {
      if (!item || (item.type !== "song" && item.type !== "set")) return null;
      let raw = parseFloat(item.duration);
      let invalid = isNaN(raw) || raw === 0;
      if (isNaN(raw)) { raw = 0; invalid = true; }

      let durationSec = 0;
      const itemName = item.name || item.title || (item.type === "song" ? "Canción" : "Set");
      const isBreakByName = /break|descanso|intermedio|pausa|intermission|beer time/i.test(itemName);

      item.isSong = false; item.isBreak = false; item.isSetHeader = false;

      if (item.type === "song") {
        durationSec = raw;
        item.isSong = true;
      } else if (item.type === "set") {
        if (isBreakByName) {
          item.isBreak = true;
          durationSec = invalid ? 3 * 60 : raw * 60;
        } else {
          item.isSetHeader = true;
          durationSec = raw * 60;
        }
      }
      item.calculatedDurationSeconds = durationSec;
      item.displayName = decodeHtml(item.title || item.name || itemName);
      return item;
    }).filter(x => x !== null);

    const structure = [];
    let currentSet = null;
    processed.forEach((item) => {
      if (item.isSetHeader) {
        if (currentSet) {
          currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((s, x) => s + (x.calculatedDurationSeconds || 0), 0);
          structure.push(currentSet);
        }
        currentSet = { ...item, songs: [], calculatedBlockDurationSeconds: 0 };
      } else if (item.isBreak) {
        if (currentSet) {
          currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((s, x) => s + (x.calculatedDurationSeconds || 0), 0);
          structure.push(currentSet);
          currentSet = null;
        }
        structure.push(item);
      } else if (item.isSong) {
        if (!currentSet) {
          currentSet = { isSetHeader: true, displayName: "Set General", calculatedDurationSeconds: 0, songs: [], calculatedBlockDurationSeconds: 0 };
        }
        currentSet.songs.push(item);
      }
    });
    if (currentSet) {
      currentSet.calculatedBlockDurationSeconds = currentSet.songs.reduce((s, x) => s + (x.calculatedDurationSeconds || 0), 0);
      structure.push(currentSet);
    }

    let totalSeconds = 0;
    structure.forEach((it) => {
      if (it.isSetHeader) totalSeconds += (it.calculatedBlockDurationSeconds || 0);
      else if (it.isBreak) totalSeconds += (it.calculatedDurationSeconds || 0);
    });

    return { items: structure, totalSeconds };
  }

  // ============================================================
  // 4. RENDER DE TABLA — IDÉNTICO al setlist principal
  //    (misma estructura, mismas columnas, mismas celdas activas)
  // ============================================================

  // Helpers réplica de los de index.html (createJukeboxCell / createPdfCell / createMetronomeCell)
  function _createJukeboxCell(songName) {
    const cleanName = _sanitizeFirebaseKey(songName);
    const url = window.jukeboxLibrary ? window.jukeboxLibrary[cleanName] : null;
    const hasLink = !!url;
    const statusClass = hasLink ? "active" : "inactive";
    const safeName = String(songName).replace(/'/g, "\\'");
    const clickAction = hasLink
      ? `window.openJukeboxPlayer('${safeName}', '${url}')`
      : `window.openJukeboxEditModal && window.openJukeboxEditModal('${safeName}')`;
    return `<td class="jukebox-col"><button class="jukebox-btn ${statusClass}" onclick="${clickAction}"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/></svg></button></td>`;
  }
  function _createPdfCell(songName) {
    const cleanName = _sanitizeFirebaseKey(songName);
    const url = window.pdfLibrary ? window.pdfLibrary[cleanName] : null;
    const hasLink = !!url;
    const statusClass = hasLink ? "active" : "inactive";
    const safeName = String(songName).replace(/'/g, "\\'");
    const clickAction = hasLink
      ? `window.openPdfLink('${url}')`
      : `window.openPdfEditModal && window.openPdfEditModal('${safeName}')`;
    const iconSvg = `<svg viewBox="0 0 24 24"><path d="M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/><path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zM3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>`;
    return `<td class="pdf-col"><button class="pdf-btn ${statusClass}" onclick="${clickAction}">${iconSvg}</button></td>`;
  }
  function _createMetronomeCell(tempo) {
    const tempoStr = decodeHtml(tempo || "-");
    const match = String(tempoStr).match(/\d+/);
    const svgIcon = `<svg viewBox="0 0 24 24"><path d="M12 2L3 20h18L12 2zm0 3.8L17.6 18H6.4L12 5.8zM11 8v6h2V8h-2z"/></svg>`;
    if (!match) {
      return `<td class="metronome-col"><button class="metronome-table-btn" title="Sin tempo definido">${svgIcon}</button></td>`;
    }
    const cleanTempo = match[0];
    // Llamamos a window.SE.toggleMetronome (siempre presente) que delega en
    // window.toggleMetronomeFromTable si existe, o usa nuestro fallback.
    return `<td class="metronome-col"><button class="metronome-table-btn has-tempo" title="Tempo: ${cleanTempo} BPM" onclick="window.SE && window.SE.toggleMetronome && window.SE.toggleMetronome('${cleanTempo}', this)">${svgIcon}</button></td>`;
  }

  // ============================================================
  // 4.bis  METRÓNOMO — fallback autocontenido
  // ------------------------------------------------------------
  // Si metronome.js cargó correctamente expondrá window.toggleMetronomeFromTable
  // (en el index original así funciona).  En cualquier otro caso (offline,
  // 404, error en el script externo, etc.) usamos esta implementación que
  // reutiliza el popup #metronome-popup ya presente en el DOM.
  // ============================================================
  const _metroState = {
    audioCtx: null,
    isPlaying: false,
    timerId: null,
    bpm: 120,
    activeBtn: null,
  };

  function _ensureAudioCtx() {
    if (_metroState.audioCtx) return _metroState.audioCtx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      _metroState.audioCtx = new Ctx();
    } catch (_) { _metroState.audioCtx = null; }
    return _metroState.audioCtx;
  }

  function _metroClick() {
    const ctx = _ensureAudioCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1000;
      gain.gain.value = 0.4;
      osc.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch (_) {}
  }

  function _metroSetBpm(bpm) {
    const v = Math.max(40, Math.min(240, parseInt(bpm, 10) || 120));
    _metroState.bpm = v;
    const display = document.getElementById("metro-bpm-val");
    if (display) display.textContent = v;
    const slider = document.getElementById("metro-bpm-slider");
    if (slider) slider.value = v;
  }

  function _metroStart() {
    if (_metroState.isPlaying) return;
    _ensureAudioCtx();
    if (_metroState.audioCtx && _metroState.audioCtx.state === "suspended") {
      try { _metroState.audioCtx.resume(); } catch (_) {}
    }
    _metroState.isPlaying = true;
    const intervalMs = 60000 / Math.max(1, _metroState.bpm);
    _metroClick();
    _metroState.timerId = setInterval(_metroClick, intervalMs);
    const playBtn = document.getElementById("metro-play-btn");
    if (playBtn) {
      playBtn.classList.add("playing");
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
    }
    if (_metroState.activeBtn) _metroState.activeBtn.classList.add("active-metronome");
  }

  function _metroStop() {
    _metroState.isPlaying = false;
    if (_metroState.timerId) { clearInterval(_metroState.timerId); _metroState.timerId = null; }
    const playBtn = document.getElementById("metro-play-btn");
    if (playBtn) {
      playBtn.classList.remove("playing");
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="2"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
    }
    document.querySelectorAll(".metronome-table-btn.active-metronome").forEach((b) => b.classList.remove("active-metronome"));
    _metroState.activeBtn = null;
  }

  function _metroTogglePopup(visible) {
    const popup = document.getElementById("metronome-popup");
    if (!popup) return;
    if (visible === undefined) popup.classList.toggle("visible");
    else popup.classList.toggle("visible", !!visible);
  }

  // Conecta una sola vez los controles del popup (-, +, slider, play, tap).
  function _wireMetronomePopupOnce() {
    const popup = document.getElementById("metronome-popup");
    if (!popup || popup.dataset.seWired === "1") return;
    popup.dataset.seWired = "1";

    const slider = document.getElementById("metro-bpm-slider");
    const minus  = document.getElementById("metro-minus");
    const plus   = document.getElementById("metro-plus");
    const play   = document.getElementById("metro-play-btn");
    const tap    = document.getElementById("metro-tap-btn");

    if (slider) slider.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 120;
      _metroSetBpm(v);
      if (_metroState.isPlaying) { _metroStop(); _metroStart(); }
    });
    if (minus) minus.addEventListener("click", () => {
      _metroSetBpm(_metroState.bpm - 1);
      if (_metroState.isPlaying) { _metroStop(); _metroStart(); }
    });
    if (plus) plus.addEventListener("click", () => {
      _metroSetBpm(_metroState.bpm + 1);
      if (_metroState.isPlaying) { _metroStop(); _metroStart(); }
    });
    if (play) play.addEventListener("click", () => {
      if (_metroState.isPlaying) _metroStop(); else _metroStart();
    });
    // TAP tempo
    let tapTimes = [];
    if (tap) tap.addEventListener("click", () => {
      const now = Date.now();
      tapTimes.push(now);
      if (tapTimes.length > 5) tapTimes.shift();
      // Reset si han pasado >2s desde el último tap
      tapTimes = tapTimes.filter(t => now - t < 2000);
      if (tapTimes.length >= 2) {
        const diffs = [];
        for (let i = 1; i < tapTimes.length; i++) diffs.push(tapTimes[i] - tapTimes[i - 1]);
        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const bpm = Math.round(60000 / avg);
        _metroSetBpm(bpm);
        if (_metroState.isPlaying) { _metroStop(); _metroStart(); }
      }
    });
  }

  // Implementación propia de toggleMetronomeFromTable (fallback)
  function _ourToggleMetronomeFromTable(tempo, btn) {
    _wireMetronomePopupOnce();
    const bpm = parseInt(String(tempo).match(/\d+/)?.[0] || "120", 10);

    // Si pulsamos sobre el mismo botón que ya está activo → parar
    if (_metroState.activeBtn === btn && _metroState.isPlaying) {
      _metroStop();
      return;
    }
    // Si había otro tocando, lo paramos antes
    if (_metroState.isPlaying) _metroStop();

    _metroSetBpm(bpm);
    _metroState.activeBtn = btn;
    _metroTogglePopup(true);
    _metroStart();
  }

  // Punto de entrada único usado por TODOS nuestros botones del setlist.
  // Delega en metronome.js (window.toggleMetronomeFromTable) si existe;
  // si no, usa nuestro fallback.
  function toggleMetronomeUnified(tempo, btn) {
    try {
      if (typeof window.toggleMetronomeFromTable === "function") {
        window.toggleMetronomeFromTable(tempo, btn);
        return;
      }
    } catch (e) {
      console.warn("[setlist-extension] toggleMetronomeFromTable original falló, uso fallback:", e);
    }
    _ourToggleMetronomeFromTable(tempo, btn);
  }

  // Render con las 8 columnas idénticas al setlist principal:
  //   #  |  Título  |  🎧  |  📝  |  Key  |  Tempo  |  ⏱  |  Time
  function renderSetlistTableInto(parentEl, structure, totalSeconds) {
    let body = "";
    let count = 0;
    structure.forEach((item) => {
      if (item.isSetHeader) {
        const setTime = toHHMM(item.calculatedBlockDurationSeconds || 0);
        body += `<tr class="set-header-row"><td colspan="8">${item.displayName} (${setTime})</td></tr>`;
        (item.songs || []).forEach((s) => {
          count++;
          const t = toMMSS(s.calculatedDurationSeconds || 0);
          body += `<tr>
            <td>${count}</td>
            <td>${s.displayName}</td>
            ${_createJukeboxCell(s.displayName)}
            ${_createPdfCell(s.displayName)}
            <td>${decodeHtml(s.key || "-")}</td>
            <td>${decodeHtml(s.tempo || "-")}</td>
            ${_createMetronomeCell(s.tempo)}
            <td>${t}</td>
          </tr>`;
        });
      } else if (item.isBreak) {
        const t = toMMSS(item.calculatedDurationSeconds || 0);
        body += `<tr class="break-row">
          <td></td>
          <td style="font-style:italic;">${item.displayName}</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:center;">-</td>
          <td style="font-style:italic; text-align:center;">-</td>
          <td style="font-style:italic; text-align:center;">-</td>
          <td style="text-align:center;">-</td>
          <td style="font-style:italic; text-align:center;">${t}</td>
        </tr>`;
      } else if (item.isSong) {
        count++;
        const t = toMMSS(item.calculatedDurationSeconds || 0);
        body += `<tr>
          <td>${count}</td>
          <td>${item.displayName}</td>
          ${_createJukeboxCell(item.displayName)}
          ${_createPdfCell(item.displayName)}
          <td>${decodeHtml(item.key || "-")}</td>
          <td>${decodeHtml(item.tempo || "-")}</td>
          ${_createMetronomeCell(item.tempo)}
          <td>${t}</td>
        </tr>`;
      }
    });

    const html = `
      <div class="table-wrapper" style="margin-top:6px;">
        <table>
          <thead><tr>
            <th>#</th><th>Título</th>
            <th class="jukebox-col-header">🎧</th>
            <th class="pdf-col-header">📝</th>
            <th>Key</th><th>Tempo</th>
            <th class="metronome-col-header">⏱</th>
            <th>Time</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    parentEl.innerHTML = html;
  }

  // ============================================================
  // 5. MODAL DE CONCIERTO
  // ============================================================
  function ensureSetlistModal() {
    if (document.getElementById("se-concert-setlist-modal")) return;
    const html = `
      <div id="se-concert-setlist-modal" style="display:none;">
        <div class="se-modal-box">
          <h2 id="se-modal-title">Setlist del Concierto</h2>
          <p class="se-subtitle" id="se-modal-subtitle"></p>
          <div id="se-modal-body"></div>
          <div class="se-actions-bar" id="se-modal-actions-bar" style="display:none;">
            <button class="download-btn" id="se-download-complex-btn">Pdf Complex</button>
            <button class="download-btn" id="se-download-basic-btn">Pdf Simple</button>
            <button class="download-btn" id="se-download-personal-btn">PDF Personal</button>
            <button class="live-mode-btn" id="se-live-mode-btn">Modo Show 🎤</button>
          </div>
          <p class="se-modal-total" id="se-modal-total"></p>
          <div class="se-close-row">
            <button class="se-close-btn" id="se-modal-close">Cerrar</button>
          </div>
        </div>
      </div>`;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);
    const closeBtn = document.getElementById("se-modal-close");
    if (closeBtn) closeBtn.onclick = closeSetlistModal;
    const m = document.getElementById("se-concert-setlist-modal");
    if (m) {
      m.addEventListener("click", (e) => {
        if (e.target.id === "se-concert-setlist-modal") closeSetlistModal();
      });
    }
  }

  // Estado del modal actual: items procesados + nombre para los PDFs
  let _currentModalItems = null;
  let _currentModalName  = "Setlist del Concierto";

  function _wireModalActionButtons() {
    const bar = document.getElementById("se-modal-actions-bar");
    if (!bar) return;
    // Solo mostramos los botones si tenemos items y las funciones globales existen
    const hasItems = !!(_currentModalItems && _currentModalItems.length);
    if (!hasItems) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "block";

    const setHandler = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.onclick = fn;
    };

    setHandler("se-download-complex-btn", () => {
      if (typeof window.genPDF === "function") {
        try { window.genPDF(_currentModalItems, _currentModalName, _currentModalName); }
        catch (e) { console.warn("[setlist-extension] genPDF error:", e); alert("Error al generar PDF Complex."); }
      } else { alert("La función de PDF Complex no está disponible."); }
    });
    setHandler("se-download-basic-btn", () => {
      if (typeof window.genBasicPDF === "function") {
        try { window.genBasicPDF(_currentModalItems, _currentModalName, _currentModalName); }
        catch (e) { console.warn("[setlist-extension] genBasicPDF error:", e); alert("Error al generar PDF Simple."); }
      } else { alert("La función de PDF Simple no está disponible."); }
    });
    setHandler("se-live-mode-btn", () => {
      if (typeof window.startLiveMode === "function") {
        try { window.startLiveMode(_currentModalItems); }
        catch (e) { console.warn("[setlist-extension] startLiveMode error:", e); alert("Error al iniciar Modo Show."); }
      } else { alert("Modo Show no está disponible."); }
    });

    // PDF Personal: setupPersonalPdfBtn no está expuesta en window (es un const
    // dentro de un closure de index.html). Replicamos la lógica localmente
    // usando window.genPersonalPDF, que SÍ está expuesta (setlists.js).
    setHandler("se-download-personal-btn", () => {
      if (typeof window.genPersonalPDF !== "function") {
        alert("La función de PDF Personal no está disponible.");
        return;
      }
      if (!_currentModalItems || !_currentModalItems.length) {
        alert("Setlist vacío.");
        return;
      }
      const sizeStr = prompt("PDF Personal - Tamaño letra títulos (8-30 pt):", "14");
      if (!sizeStr) return;
      const fontSize = parseInt(sizeStr, 10);
      if (isNaN(fontSize) || fontSize < 8 || fontSize > 30) {
        alert("Tamaño inválido. Debe estar entre 8 y 30.");
        return;
      }
      try {
        window.genPersonalPDF(_currentModalItems, _currentModalName, _currentModalName, fontSize);
      } catch (e) {
        console.warn("[setlist-extension] genPersonalPDF error:", e);
        alert("Error al generar PDF Personal.");
      }
    });
  }

  function closeSetlistModal() {
    const m = document.getElementById("se-concert-setlist-modal");
    if (m) {
      m.classList.remove("show");
      m.style.display = "none";
    }
    const bar = document.getElementById("se-modal-actions-bar");
    if (bar) bar.style.display = "none";
    _currentModalItems = null;
    // NO tocamos document.body.style.overflow para no bloquear scroll de la página
  }

  // Detecta si una cadena es una URL HTTP/HTTPS válida
  function looksLikeUrl(text) {
    if (!text) return false;
    const t = text.trim();
    return /^https?:\/\//i.test(t);
  }

  window.openConcertSetlistModal = async function (concertTitle, concertDate, savedText) {
    await safeRun(async () => {
      ensureSetlistModal();
      const titleEl = document.getElementById("se-modal-title");
      const subEl   = document.getElementById("se-modal-subtitle");
      const bodyEl  = document.getElementById("se-modal-body");
      const totalEl = document.getElementById("se-modal-total");
      const bar     = document.getElementById("se-modal-actions-bar");
      if (!titleEl || !bodyEl) return;

      titleEl.textContent = concertTitle || "Setlist del Concierto";
      if (subEl) subEl.textContent = concertDate || "";
      if (totalEl) totalEl.textContent = "";
      if (bar) bar.style.display = "none"; // se mostrará tras tener items

      // Guardamos el nombre para los PDFs
      _currentModalName  = (concertTitle || "Setlist del Concierto").trim() || "Setlist del Concierto";
      _currentModalItems = null;

      const trimmed = (savedText || "").trim();

      if (!trimmed) {
        bodyEl.innerHTML = `<div class="se-empty-state">No se ha encontrado ningún setlist vinculado al concierto.</div>`;
        showSetlistModal();
        return;
      }

      // CASO 1: URL del feed BandHelper → descargar y renderizar
      if (looksLikeUrl(trimmed)) {
        showSetlistModal();
        const result = await window.SE.renderFromFeedUrl(bodyEl, trimmed, { appendTotal: false });
        if (result && result.items && result.items.length) {
          _currentModalItems = result.items;
          if (totalEl) totalEl.textContent = "Tiempo total del set: " + toHHMM(result.totalSeconds || 0) + (result.usedCache ? " (Datos guardados)" : "");
          _wireModalActionButtons();
        }
        return;
      }

      // CASO 2: JSON pegado directamente → parsear y renderizar
      let parsed;
      try { parsed = JSON.parse(trimmed); }
      catch (e) {
        bodyEl.innerHTML = `<div class="se-empty-state">El contenido guardado no es ni una URL válida ni un JSON válido.<br><br><code style="font-size:.85em;color:#888;">${(e.message || "").replace(/</g,"&lt;")}</code></div>`;
        showSetlistModal();
        return;
      }
      const { items, totalSeconds } = parseBandhelperJson(parsed);
      if (!items.length) {
        bodyEl.innerHTML = `<div class="se-empty-state">El JSON no contiene canciones reconocibles.</div>`;
      } else {
        renderSetlistTableInto(bodyEl, items, totalSeconds);
        _currentModalItems = items;
        if (totalEl) totalEl.textContent = "Tiempo total del set: " + toHHMM(totalSeconds);
        _wireModalActionButtons();
      }
      showSetlistModal();
    }, "openConcertSetlistModal");
  };

  function showSetlistModal() {
    const m = document.getElementById("se-concert-setlist-modal");
    if (m) {
      m.style.display = "flex";
      m.classList.add("show");
    }
  }

  // ============================================================
  // 6. CACHE DE JSONs (lazy, no agresivo)
  // ============================================================
  const setlistByConcertId = {};
  let listenerAttached = false;

  function attachSetlistListener() {
    if (listenerAttached) return;
    if (typeof db === "undefined") return; // No reintentamos agresivamente
    try {
      // 1) Carga directa inmediata (no depende del listener)
      db.collection("concert_details").get().then((snap) => {
        let n = 0;
        snap.forEach((doc) => {
          const data = doc.data() || {};
          setlistByConcertId[doc.id] = data.setlistJson || "";
          n++;
        });
        console.log("[setlist-extension] Cache cargado por .get() →", n, "documentos. IDs:", Object.keys(setlistByConcertId));
        scheduleRefresh();
      }).catch((err) => {
        console.warn("[setlist-extension] .get() concert_details falló:", err);
      });

      // 2) Listener para cambios futuros
      db.collection("concert_details").onSnapshot((snapshot) => {
        try {
          snapshot.forEach((doc) => {
            const data = doc.data() || {};
            setlistByConcertId[doc.id] = data.setlistJson || "";
          });
          scheduleRefresh();
        } catch (e) {
          console.warn("[setlist-extension] snapshot processing:", e);
        }
      }, (err) => {
        console.warn("[setlist-extension] firestore listener error:", err);
      });
      listenerAttached = true;
    } catch (e) {
      console.warn("[setlist-extension] No se pudo enganchar listener:", e);
    }
  }

  // ============================================================
  // 6.bis  WATCHDOG DE SCROLL — restaura body/html.overflow si
  //        quedaron atascados en "hidden" sin que haya modales
  //        visibles. Incluye:
  //          • intervalo periódico (cada 500 ms)
  //          • listener de wheel/touchstart (reacción inmediata)
  //          • listener de keydown ESC (libera al instante)
  // ============================================================
  function _anyBlockingModalVisible() {
    // ¿Hay algún modal visible que justifique el lock?
    // Incluye los modales nativos del index, los nuestros y los de Zona Privada.
    const candidates = document.querySelectorAll([
      ".modal.show",
      ".modal-overlay.show",
      "#concert-details-modal.show",
      "#se-concert-setlist-modal.show",
      "#se-past-concerts-modal.show",
      ".pz-modal-backdrop.show",
      "#metronome-popup.visible",
      "#idoctor-tuner-popup.visible",
    ].join(","));
    let anyVisible = false;
    candidates.forEach((el) => {
      if (anyVisible) return;
      try {
        const cs = window.getComputedStyle(el);
        if (cs.display !== "none" && cs.visibility !== "hidden") {
          anyVisible = true;
        }
      } catch (_) {}
    });
    return anyVisible;
  }

  function _maybeRestoreScroll(reason) {
    try {
      const bodyLocked = document.body.style.overflow === "hidden";
      const htmlLocked = document.documentElement.style.overflow === "hidden";
      if (!bodyLocked && !htmlLocked) return;
      if (_anyBlockingModalVisible()) return;
      if (bodyLocked) document.body.style.overflow = "";
      if (htmlLocked) document.documentElement.style.overflow = "";
      console.log("[setlist-extension] scroll restaurado (" + reason + ")");
    } catch (_) {}
  }

  function startScrollWatchdog() {
    // Tic periódico
    setInterval(() => _maybeRestoreScroll("watchdog"), 500);

    // Cuando el usuario intenta hacer scroll, restaurar al instante.
    // Usamos `passive: true` para no afectar al rendimiento del scroll.
    const onWheelOrTouch = () => _maybeRestoreScroll("wheel/touch");
    window.addEventListener("wheel", onWheelOrTouch, { passive: true, capture: true });
    window.addEventListener("touchstart", onWheelOrTouch, { passive: true, capture: true });

    // ESC siempre libera el scroll (por si quedó algún modal escondido).
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.keyCode === 27) {
        setTimeout(() => _maybeRestoreScroll("escape"), 50);
      }
    });

    // Cualquier click en zona "vacía" del documento → comprobamos.
    window.addEventListener("click", () => _maybeRestoreScroll("click"), true);
  }

  // ============================================================
  // 6.ter  CONCIERTOS PASADOS — botón + modal con tabla
  // ============================================================

  // Mapas de meses/días para parseo de IDs
  const _MONTH_NAMES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

  // Registro de setlists de conciertos pasados.
  // Evitamos meter JSON.stringify en un atributo onclick="..." porque las
  // comillas internas del JSON colisionan con los delimitadores del atributo
  // y rompen el HTML (-> Uncaught SyntaxError: Unexpected end of input).
  // En su lugar guardamos los datos en este map y el onclick sólo pasa el id.
  const _pastSetlistRegistry = {};

  // Parsea un concert_id como "Sab_02_05_26_Boda_Bruno_-_hijo_Patato-"
  // o "Sab_07_06_25__19_00_a_23_55_Boda_Tardeo".
  // Devuelve { dateObj, dateStr, title } o null si no se puede.
  function parsePastConcertId(id) {
    if (!id) return null;
    // Día (3-9 letras incluyendo acentos), DD, MM, YY, resto.
    const m = id.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,9})_(\d{2})_(\d{2})_(\d{2})_(.*)$/);
    if (!m) return null;
    const dayName = m[1];
    const dd = parseInt(m[2], 10);
    const mm = parseInt(m[3], 10);
    const yy = parseInt(m[4], 10);
    const yearFull = yy >= 70 ? 1900 + yy : 2000 + yy;
    const dateObj = new Date(yearFull, mm - 1, dd);
    if (isNaN(dateObj.getTime())) return null;

    // Resto puede empezar con "_19_00_a_23_55_..." o "19_00_a_23_55_..." (rango horario)
    let rest = m[5] || "";
    let timeRange = "";
    const timeMatch = rest.match(/^_?(\d{2})_(\d{2})_a_(\d{2})_(\d{2})_(.*)$/);
    if (timeMatch) {
      timeRange = `${timeMatch[1]}:${timeMatch[2]} a ${timeMatch[3]}:${timeMatch[4]}`;
      rest = timeMatch[5];
    }
    // Reemplazar guiones bajos por espacios para reconstruir el título
    const title = rest.replace(/_/g, " ").trim() || "Evento";

    const dateStr = `${dayName} ${String(dd).padStart(2,"0")}/${String(mm).padStart(2,"0")}/${String(yy).padStart(2,"0")}`
      + (timeRange ? `, ${timeRange}` : "");

    return { dateObj, dateStr, title, timeRange };
  }

  // Helper: escapa texto para que sea seguro insertarlo en HTML (innerHTML
  // o atributos). Importante porque los títulos pueden contener &, <, >, "
  // o ' que romperían el HTML.
  function _escHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensurePastConcertsModal() {
    if (document.getElementById("se-past-concerts-modal")) return;
    const html = `
      <div id="se-past-concerts-modal" style="display:none;">
        <div class="se-modal-box">
          <h2>📅 Conciertos Pasados</h2>
          <p class="se-subtitle">Listado de conciertos ya celebrados, del más reciente al más antiguo.</p>
          <div id="se-past-concerts-body">
            <div class="se-empty-state">⌛ Cargando…</div>
          </div>
          <div class="se-close-row">
            <button class="se-close-btn" id="se-past-modal-close">Cerrar</button>
          </div>
        </div>
      </div>`;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstElementChild);
    const closeBtn = document.getElementById("se-past-modal-close");
    if (closeBtn) closeBtn.onclick = closePastConcertsModal;
    const m = document.getElementById("se-past-concerts-modal");
    if (m) {
      m.addEventListener("click", (e) => {
        if (e.target.id === "se-past-concerts-modal") closePastConcertsModal();
      });
    }
    // Delegación de eventos para los botones de la tabla.
    // Usamos data-action + data-id en vez de onclick="..." para evitar que
    // caracteres especiales en títulos/localizaciones rompan el HTML del
    // atributo (es lo que estaba haciendo que un botón hiciera lo del otro).
    const bodyEl = document.getElementById("se-past-concerts-body");
    if (bodyEl) {
      console.log("[setlist-extension] Listener delegación pasados → enganchado a", bodyEl);
      bodyEl.addEventListener("click", (e) => {
        const target = e.target;
        const btn = target && target.closest ? target.closest("button[data-pc-action]") : null;
        console.log("[setlist-extension] click bodyEl pasados", {
          targetTag: target && target.tagName,
          targetClass: target && target.className,
          foundBtn: !!btn,
          action: btn && btn.getAttribute("data-pc-action"),
          id: btn && btn.getAttribute("data-pc-id"),
          registrySize: Object.keys(_pastSetlistRegistry).length
        });
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute("data-pc-action");
        const id = btn.getAttribute("data-pc-id");
        if (!action || !id) {
          console.warn("[setlist-extension] click sin action/id válidos:", { action, id });
          return;
        }
        if (action === "info") {
          const entry = _pastSetlistRegistry[id] || {};
          console.log("[setlist-extension] → INFO", { id, entry });
          openPastConcertDetails(id, entry.date || "", entry.title || "", entry.location || "");
        } else if (action === "setlist") {
          console.log("[setlist-extension] → SETLIST", { id, hasFn: typeof window.SE.openPastSetlist });
          if (typeof window.SE.openPastSetlist === "function") {
            window.SE.openPastSetlist(id);
          } else {
            alert("Función openPastSetlist no disponible.");
          }
        } else {
          console.warn("[setlist-extension] action desconocida:", action);
        }
      });
    } else {
      console.warn("[setlist-extension] No se encontró #se-past-concerts-body para enganchar listener");
    }
  }

  function closePastConcertsModal() {
    const m = document.getElementById("se-past-concerts-modal");
    if (m) {
      m.classList.remove("show");
      m.style.display = "none";
    }
  }

  function showPastConcertsModal() {
    const m = document.getElementById("se-past-concerts-modal");
    if (m) {
      m.style.display = "flex";
      m.classList.add("show");
    }
  }

  async function openPastConcertsModal() {
    ensurePastConcertsModal();
    showPastConcertsModal();
    const bodyEl = document.getElementById("se-past-concerts-body");
    if (!bodyEl) return;
    bodyEl.innerHTML = `<div class="se-empty-state">⌛ Cargando conciertos pasados…</div>`;

    // 1) Conseguir todos los concert_details
    let docs = [];
    try {
      if (typeof db === "undefined") throw new Error("Firestore no disponible");
      const snap = await db.collection("concert_details").get();
      snap.forEach((d) => docs.push({ id: d.id, data: d.data() || {} }));
    } catch (e) {
      console.warn("[setlist-extension] Error cargando conciertos pasados:", e);
      bodyEl.innerHTML = `<div class="se-empty-state">No se pudo cargar el listado.<br><span style="font-size:.85em;color:#888;">${(e.message || "").replace(/</g,"&lt;")}</span></div>`;
      return;
    }

    // 2) Parsear y filtrar pasados (anteriores a hoy a las 00:00)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const past = [];
    docs.forEach(({ id, data }) => {
      const info = parsePastConcertId(id);
      if (!info) return;
      if (info.dateObj < today) {
        past.push({ id, info, data });
      }
    });

    // 3) Ordenar descendentemente (más reciente primero)
    past.sort((a, b) => b.info.dateObj.getTime() - a.info.dateObj.getTime());

    if (!past.length) {
      bodyEl.innerHTML = `<div class="se-empty-state">No hay conciertos pasados registrados.</div>`;
      return;
    }

    // 4) Renderizar tabla similar a la de Próximos Conciertos, sin "Cal" ni "Lugar"
    //
    // IMPORTANTE: NUNCA inyectamos texto del usuario (título, localización,
    // id) dentro de un atributo onclick="..." porque cualquier comilla,
    // ampersand o etiqueta podía romper el HTML del atributo y hacer que
    // un botón disparara el handler de OTRO botón (o no disparara nada).
    // En su lugar:
    //   • Guardamos los datos del concierto en `_pastSetlistRegistry`.
    //   • Los botones llevan `data-pc-action` y `data-pc-id` (sólo el id).
    //   • Un único listener (en ensurePastConcertsModal) hace la delegación.
    let rowsHtml = "";
    past.forEach(({ id, info, data }) => {
      const location = (data.locationDetails || data.location || "").trim();
      const setlistJson = (data.setlistJson || "").trim();
      const hasSetlist = !!setlistJson;

      // Registro del concierto, indexado por id.
      _pastSetlistRegistry[id] = {
        title:    info.title,
        date:     info.dateStr,
        location: location,
        json:     setlistJson
      };

      // Todo lo que va al HTML pasa por _escHtml.
      const idAttr    = _escHtml(id);
      const dateHtml  = _escHtml(info.dateStr);
      const titleHtml = _escHtml(info.title);
      const slTitle   = hasSetlist ? "Ver setlist de este concierto" : "Sin setlist vinculado";

      rowsHtml += `<tr>
        <td>${dateHtml}</td>
        <td>${titleHtml}</td>
        <td class="details-col-header" style="text-align:center;">
          <button type="button" class="details-btn"
                  data-pc-action="info" data-pc-id="${idAttr}"
                  title="Ver/Editar Detalles del Concierto">➡️</button>
        </td>
        <td class="se-setlist-col" style="text-align:center;">
          <button type="button" class="se-setlist-btn${hasSetlist ? "" : " empty"}"
                  data-pc-action="setlist" data-pc-id="${idAttr}"
                  title="${_escHtml(slTitle)}">🎵</button>
        </td>
      </tr>`;
    });

    bodyEl.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Evento</th>
              <th class="details-col-header">Info</th>
              <th class="se-setlist-col-header">Setlist</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <p style="text-align:center; color:#aaa; font-size:.9em; margin-top:10px;">${past.length} concierto${past.length === 1 ? "" : "s"} pasado${past.length === 1 ? "" : "s"}.</p>
    `;
  }

  // Wrapper para abrir el modal de detalles desde la tabla de pasados.
  // openConcertDetailModal se declara con `function ...` en el script
  // global de index.html, así que está disponible como window.openConcertDetailModal.
  // IMPORTANTE: cerramos el modal de "Conciertos Pasados" ANTES de abrir el
  // modal de detalles para evitar superposiciones de z-index y para que
  // el body.style.overflow no quede bloqueado al cerrarse el detalle.
  // Guardia de re-entrada: evita que dos clicks rápidos abran dos modales.
  let _openingPastDetail = false;
  function openPastConcertDetails(concertId, dateText, title, location) {
    if (_openingPastDetail) return;
    if (typeof window.openConcertDetailModal !== "function") {
      alert("La función de detalles del concierto no está disponible en esta página.");
      return;
    }
    _openingPastDetail = true;
    // Cerrar primero el modal de pasados (dejándolo listo para reabrirse luego)
    closePastConcertsModal();
    // Pequeño delay para que la transición visual sea limpia
    setTimeout(() => {
      try { window.openConcertDetailModal(concertId, dateText, title, location); }
      catch (e) {
        console.warn("[setlist-extension] openConcertDetailModal error:", e);
        alert("No se pudo abrir el detalle del concierto.");
      } finally {
        // Liberar la guardia un poco más tarde para amortiguar dobles clicks
        setTimeout(() => { _openingPastDetail = false; }, 400);
      }
    }, 80);
  }

  function injectPastConcertsButton() {
    const calendarSection = document.getElementById("calendario");
    if (!calendarSection) return;
    if (document.getElementById("se-past-concerts-btn")) return;

    const bar = document.createElement("div");
    bar.className = "se-past-concerts-bar";
    bar.innerHTML = `<button id="se-past-concerts-btn" class="se-past-concerts-btn">📅 Conciertos Pasados</button>`;
    calendarSection.appendChild(bar);

    const btn = document.getElementById("se-past-concerts-btn");
    if (btn) btn.onclick = () => safeRun(openPastConcertsModal, "openPastConcertsModal");
  }

  // ============================================================
  // 7. COLUMNA "SETLIST" EN LA TABLA DE CONCIERTOS
  // ============================================================
  let bandhelperObserver = null;
  let refreshScheduled = false;
  let refreshing = false;

  function scheduleRefresh() {
    if (refreshScheduled || refreshing) return;
    refreshScheduled = true;
    setTimeout(() => {
      refreshScheduled = false;
      safeRun(refreshSetlistColumn, "refreshSetlistColumn");
    }, 250);
  }

  // Replicamos exactamente la función de index.html (no está en window)
  // const sanitizeFirebaseKey = (str) => str.replace(/[.#$[\]/:\s,]/g, '_');
  function _sanitizeFirebaseKey(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[.#$[\]/:\s,]/g, "_");
  }

  // Calcula concertId del modo más cercano posible al original (calendario.js)
  function computeConcertIdFromRow(row) {
    const cells = row.cells;
    if (!cells || cells.length < 2) return { concertId: "", date: "", title: "" };
    // SIEMPRE las dos primeras celdas son: [0]=fecha, [1]=título
    const dateCellFullText = (cells[0]?.textContent || "").trim();
    const eventTitleFromCell = ((cells[1]?.textContent || "").trim().split("\n")[0] || "").trim();
    const dateForId = dateCellFullText.split(",")[0].trim();
    let concertId = "";
    try {
      // Preferimos la función global si existe; si no, usamos la nuestra
      const fn = (typeof window.sanitizeFirebaseKey === "function")
        ? window.sanitizeFirebaseKey
        : _sanitizeFirebaseKey;
      concertId = fn(`${dateForId}_${eventTitleFromCell}`);
    } catch (_) {
      concertId = _sanitizeFirebaseKey(`${dateForId}_${eventTitleFromCell}`);
    }
    return { concertId, date: dateCellFullText, title: eventTitleFromCell };
  }

  function refreshSetlistColumn() {
    const container = document.getElementById("bandhelper-concerts-container");
    if (!container) return;
    const table = container.querySelector("table");
    if (!table) return;

    refreshing = true;
    if (bandhelperObserver) {
      try { bandhelperObserver.disconnect(); } catch (_) {}
    }

    try {
      const thead = table.tHead;
      if (thead && thead.rows.length) {
        const headerRow = thead.rows[0];
        let setlistTh = headerRow.querySelector("th.se-setlist-col-header");
        if (!setlistTh) {
          setlistTh = document.createElement("th");
          setlistTh.className = "se-setlist-col-header";
          setlistTh.textContent = "Setlist";
          const lastTh = headerRow.cells[headerRow.cells.length - 1];
          if (lastTh) headerRow.insertBefore(setlistTh, lastTh);
          else headerRow.appendChild(setlistTh);
        }
      }

      const rows = table.querySelectorAll("tbody tr");
      rows.forEach((row) => {
        const cells = row.cells;
        if (cells.length < 3) return;
        const { concertId, date: rowDate, title: rowTitle } = computeConcertIdFromRow(row);
        // Log de un solo concert por fila para depurar mismatches:
        if (rowTitle && !row.dataset.seLogged) {
          row.dataset.seLogged = "1";
          console.log("[setlist-extension] Fila →", { concertId, title: rowTitle, date: rowDate, inCache: !!setlistByConcertId[concertId] });
        }

        let setlistTd = row.querySelector("td.se-setlist-col");
        if (!setlistTd) {
          setlistTd = document.createElement("td");
          setlistTd.className = "se-setlist-col";
          const lastTd = cells[cells.length - 1];
          if (lastTd) row.insertBefore(setlistTd, lastTd);
          else row.appendChild(setlistTd);
        }

        // Guardar el concertId en la propia celda para que el click pueda
        // releer el cache dinámicamente en el momento del click
        setlistTd.dataset.concertId = concertId || "";
        setlistTd.dataset.concertDate = rowDate || "";
        setlistTd.dataset.concertTitle = rowTitle || "";

        const saved = setlistByConcertId[concertId] || "";
        const hasSetlist = !!(saved && saved.trim());

        const prevState = setlistTd.dataset.hasSetlist || "";
        const newState = hasSetlist ? "1" : "0";
        if (prevState === newState && setlistTd.querySelector("button")) return;
        setlistTd.dataset.hasSetlist = newState;

        const btn = document.createElement("button");
        btn.className = "se-setlist-btn" + (hasSetlist ? "" : " empty");
        btn.title = hasSetlist ? "Ver setlist de este concierto" : "Sin setlist vinculado";
        btn.textContent = "🎵";
        // IMPORTANTE: el handler NO captura `saved` por closure.
        // Lee el cache dinámicamente en el momento del click, así
        // refleja siempre el estado más reciente de Firestore.
        // Si el cache está vacío (porque el listener aún no ha
        // disparado o falló), hacemos una lectura directa del
        // documento como fallback.
        btn.onclick = async (ev) => {
          ev.stopPropagation();
          const td = ev.currentTarget.parentElement;
          const id = td?.dataset.concertId || concertId;
          const d  = td?.dataset.concertDate || rowDate;
          const t  = td?.dataset.concertTitle || rowTitle;
          let current = (id && setlistByConcertId[id]) || "";
          console.log("[setlist-extension] Click 🎵 →", {
            id: id,
            hasInCache: !!current,
            cacheSize: Object.keys(setlistByConcertId).length
          });
          // Fallback: si no hay nada en cache, leer concert_details/{id}
          // directamente desde Firestore.
          if (!current && id) {
            try {
              if (window.firebase && window.firebase.firestore) {
                const snap = await window.firebase.firestore()
                  .collection("concert_details")
                  .doc(id)
                  .get();
                if (snap.exists) {
                  const data = snap.data() || {};
                  if (typeof data.setlistJson === "string" && data.setlistJson.trim()) {
                    current = data.setlistJson.trim();
                    setlistByConcertId[id] = current;
                    console.log("[setlist-extension] Fallback Firestore OK →", id);
                  } else {
                    console.log("[setlist-extension] Doc sin setlistJson:", id);
                  }
                } else {
                  console.log("[setlist-extension] No existe concert_details/" + id);
                }
              }
            } catch (e) {
              console.warn("[setlist-extension] Fallback Firestore error:", e);
            }
          }
          window.openConcertSetlistModal(t, d, current);
        };
        setlistTd.innerHTML = "";
        setlistTd.appendChild(btn);
      });
    } catch (e) {
      console.warn("[setlist-extension] refreshSetlistColumn error:", e);
    } finally {
      try {
        if (bandhelperObserver) {
          const c2 = document.getElementById("bandhelper-concerts-container");
          if (c2) bandhelperObserver.observe(c2, { childList: true, subtree: true });
        }
      } catch (_) {}
      refreshing = false;
    }
  }

  function watchBandHelperTable() {
    const container = document.getElementById("bandhelper-concerts-container");
    if (!container) return;
    try {
      bandhelperObserver = new MutationObserver(() => scheduleRefresh());
      bandhelperObserver.observe(container, { childList: true, subtree: true });
    } catch (e) {
      console.warn("[setlist-extension] no observer:", e);
    }
    setTimeout(scheduleRefresh, 2000);
    setTimeout(scheduleRefresh, 5000);
    setTimeout(scheduleRefresh, 10000);
  }

  // ============================================================
  // 8. CAMPO JSON EN MODAL DE CONCIERTO
  // ============================================================
  function injectJsonFieldInConcertModal() {
    const modal = document.getElementById("concert-details-modal");
    if (!modal) return;
    if (modal.querySelector(".se-json-block")) return;

    const block = document.createElement("div");
    block.className = "se-json-block";
    block.innerHTML = `
      <label for="se-concert-setlist-json">🎵 Setlist del Concierto (BandHelper)</label>
      <p class="se-json-help">
        Pega aquí <strong>la URL del feed</strong> de BandHelper para este concierto
        (recomendado, p. ej. <code>https://www.bandhelper.com/feed/set_list/123456</code>)
        <strong>o</strong> el JSON exportado completo.
        Si lo dejas vacío, el cuadro naranja del calendario mostrará
        "No se ha encontrado ningún setlist vinculado al concierto".
      </p>
      <textarea id="se-concert-setlist-json" placeholder='https://www.bandhelper.com/feed/set_list/123456&#10;&#10;( o un JSON completo: [{"type":"set","name":"Set 1","duration":"45"}, ...] )'></textarea>
      <p class="se-json-status empty" id="se-concert-setlist-json-status">Sin URL ni JSON guardado.</p>
    `;

    const saveBtn = document.getElementById("save-concert-details");
    if (saveBtn && saveBtn.parentNode) {
      saveBtn.parentNode.insertBefore(block, saveBtn);
    } else {
      const content = modal.querySelector(".modal-content") || modal;
      content.appendChild(block);
    }

    const ta = document.getElementById("se-concert-setlist-json");
    const status = document.getElementById("se-concert-setlist-json-status");
    if (ta && status) {
      ta.addEventListener("input", () => {
        const v = ta.value.trim();
        if (!v) {
          status.className = "se-json-status empty";
          status.textContent = "Sin URL ni JSON. Se mostrará 'No se ha encontrado ningún setlist'.";
          return;
        }
        // ¿Es una URL?
        if (looksLikeUrl(v)) {
          if (/bandhelper\.com\/feed\/set_list/i.test(v)) {
            status.className = "se-json-status ok";
            status.textContent = "✓ URL del feed BandHelper detectada. Se cargará en directo al pulsar 🎵.";
          } else {
            status.className = "se-json-status ok";
            status.textContent = "✓ URL detectada. Se cargará en directo al pulsar 🎵.";
          }
          return;
        }
        // Si no es URL, intentamos parsear como JSON
        try {
          const parsed = JSON.parse(v);
          const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
          const songs = items.filter(it => it && it.type === "song").length;
          status.className = "se-json-status ok";
          status.textContent = `✓ JSON válido (${songs} canciones detectadas).`;
        } catch (e) {
          status.className = "se-json-status err";
          status.textContent = "✗ Ni URL ni JSON válido. Pega la URL del feed BandHelper o el JSON exportado.";
        }
      });
    }
  }

  function onConcertModalOpen() {
    safeRun(() => {
      const modal = document.getElementById("concert-details-modal");
      if (!modal || !modal.classList.contains("show")) return;
      injectJsonFieldInConcertModal();
      const idEl = document.getElementById("concert-detail-id");
      const ta = document.getElementById("se-concert-setlist-json");
      const status = document.getElementById("se-concert-setlist-json-status");
      if (!idEl || !ta) return;
      const id = idEl.value;
      const saved = setlistByConcertId[id] || "";
      ta.value = saved;
      if (status) {
        const v = saved.trim();
        if (!v) {
          status.className = "se-json-status empty";
          status.textContent = "Sin URL ni JSON. Se mostrará 'No se ha encontrado ningún setlist'.";
        } else if (looksLikeUrl(v)) {
          status.className = "se-json-status ok";
          status.textContent = "✓ URL del feed BandHelper guardada.";
        } else {
          try {
            const parsed = JSON.parse(v);
            const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
            const songs = items.filter(it => it && it.type === "song").length;
            status.className = "se-json-status ok";
            status.textContent = `✓ JSON guardado (${songs} canciones).`;
          } catch (_) {
            status.className = "se-json-status err";
            status.textContent = "✗ Contenido guardado no es válido.";
          }
        }
      }
    }, "onConcertModalOpen");
  }

  function watchConcertModal() {
    const modal = document.getElementById("concert-details-modal");
    if (!modal) return;
    safeRun(injectJsonFieldInConcertModal, "injectJsonField");
    try {
      const obs = new MutationObserver(() => {
        if (modal.classList.contains("show")) onConcertModalOpen();
      });
      obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    } catch (e) {
      console.warn("[setlist-extension] modal observer error:", e);
    }
  }

  function hookSaveButton() {
    const saveBtn = document.getElementById("save-concert-details");
    if (!saveBtn || saveBtn.dataset.seHooked === "1") return;
    saveBtn.dataset.seHooked = "1";

    saveBtn.addEventListener("click", async () => {
      try {
        const idEl = document.getElementById("concert-detail-id");
        const ta = document.getElementById("se-concert-setlist-json");
        if (!idEl || !ta) return;
        const id = idEl.value;
        if (!id) return;
        const json = ta.value.trim();

        console.log("[setlist-extension] GUARDANDO setlistJson →", { id: id, length: json.length, isUrl: looksLikeUrl(json) });

        if (typeof window.saveDoc === "function") {
          await window.saveDoc("concert_details", id, { setlistJson: json }, true);
        } else if (typeof db !== "undefined") {
          await db.collection("concert_details").doc(id).set({ setlistJson: json }, { merge: true });
        }
        setlistByConcertId[id] = json;
        console.log("[setlist-extension] Guardado OK. Cache ahora tiene", Object.keys(setlistByConcertId).length, "ids");
        scheduleRefresh();
      } catch (e) {
        console.warn("[setlist-extension] Error guardando JSON setlist:", e);
      }
    }, true);
  }

  // ============================================================
  // 8.bis  EXPORTACIONES
  // ============================================================
  window.SE = window.SE || {};
  window.SE.parseBandhelperJson    = parseBandhelperJson;
  window.SE.renderSetlistTableInto = renderSetlistTableInto;
  window.SE.toHHMM                 = toHHMM;
  window.SE.toMMSS                 = toMMSS;
  window.SE.openPastConcertDetails = openPastConcertDetails;
  window.SE.openPastConcertsModal  = openPastConcertsModal;
  window.SE.toggleMetronome        = toggleMetronomeUnified;

  // Abre el setlist de un concierto pasado a partir del id, leyendo el
  // contenido del registro (_pastSetlistRegistry). Esto evita meter JSON
  // dentro del atributo onclick="..." (donde rompe el HTML).
  window.SE.openPastSetlist = function (concertId) {
    console.log("[setlist-extension] openPastSetlist() INVOCADA con id =", concertId);
    try {
      const entry = _pastSetlistRegistry[concertId];
      console.log("[setlist-extension] openPastSetlist → registry entry:", {
        found: !!entry,
        title: entry && entry.title,
        date: entry && entry.date,
        location: entry && entry.location,
        jsonLen: entry && entry.json ? entry.json.length : 0,
        jsonPreview: entry && entry.json ? entry.json.slice(0, 80) : null,
        registryKeys: Object.keys(_pastSetlistRegistry).length
      });
      if (!entry) {
        console.warn("[setlist-extension] openPastSetlist → NO entry para id", concertId,
          "claves registro:", Object.keys(_pastSetlistRegistry));
        alert("No se encontraron datos del setlist para este concierto.");
        return;
      }
      if (!entry.json) {
        console.warn("[setlist-extension] openPastSetlist → entry.json vacío para id", concertId);
        alert("Este concierto no tiene setlist vinculado.");
        return;
      }
      console.log("[setlist-extension] openPastSetlist → window.openConcertSetlistModal typeof =",
        typeof window.openConcertSetlistModal);
      if (typeof window.openConcertSetlistModal !== "function") {
        console.warn("[setlist-extension] openPastSetlist → openConcertSetlistModal NO es función");
        alert("La función para abrir el setlist no está disponible.");
        return;
      }
      console.log("[setlist-extension] openPastSetlist → llamando openConcertSetlistModal(",
        entry.title, ",", entry.date, ", json[" + entry.json.length + " chars])");
      window.openConcertSetlistModal(entry.title || "", entry.date || "", entry.json);
      console.log("[setlist-extension] openPastSetlist → openConcertSetlistModal devolvió OK");
    } catch (e) {
      console.warn("[setlist-extension] openPastSetlist error:", e);
      alert("No se pudo abrir el setlist del concierto.");
    }
  };
  window.SE.renderFromFeedUrl = async function (parentEl, feedUrl, opts = {}) {
    if (!parentEl) return { error: "no-parent" };
    parentEl.innerHTML = `<div style="text-align:center;color:#aaa;padding:20px;">⌛ Cargando setlist...</div>`;
    if (!feedUrl || !feedUrl.trim()) {
      parentEl.innerHTML = `<div class="se-empty-state">No hay URL de BandHelper configurada para este setlist.</div>`;
      return { error: "no-url" };
    }
    const cacheKey = "se_feed_cache_" + feedUrl;
    let raw = null, usedCache = false;
    try {
      const r = await fetch(feedUrl);
      if (!r.ok) throw new Error("HTTP " + r.status);
      raw = await r.json();
      try { localStorage.setItem(cacheKey, JSON.stringify(raw)); } catch (_) {}
    } catch (netErr) {
      const cached = (() => { try { return localStorage.getItem(cacheKey); } catch (_) { return null; } })();
      if (cached) {
        try { raw = JSON.parse(cached); usedCache = true; } catch (_) { raw = null; }
      }
      if (!raw) {
        parentEl.innerHTML = `<div class="se-empty-state">No se pudo cargar el setlist (sin conexión y sin caché).<br><span style="font-size:.85em;color:#888;">${(netErr.message || "").replace(/</g,"&lt;")}</span></div>`;
        return { error: "fetch-failed" };
      }
    }
    const { items, totalSeconds } = parseBandhelperJson(raw);
    if (!items.length) {
      parentEl.innerHTML = `<div class="se-empty-state">El feed no contiene canciones reconocibles.</div>`;
      return { error: "empty", items: [], totalSeconds: 0 };
    }
    renderSetlistTableInto(parentEl, items, totalSeconds);
    if (opts.appendTotal !== false) {
      const totalP = document.createElement("p");
      totalP.style.cssText = "color:#aaa;text-align:center;margin-top:10px;font-size:.95em;";
      totalP.textContent = "Tiempo total: " + toHHMM(totalSeconds) + (usedCache ? " (datos guardados)" : "");
      parentEl.appendChild(totalP);
    }
    return { items, totalSeconds, usedCache };
  };

  // ============================================================
  // 9. INIT — se ejecuta al estar disponible el DOM; las conexiones
  //    externas mantienen sus propios reintentos defensivos.
  // ============================================================
  // ============================================================
  // 8.ter  OCULTAR EN EL PANEL DE CONFIGURACIÓN los bloques de
  //        "Setlist Próximo Concierto" y "Setlist Concierto Estrella".
  //        Los inputs siguen existiendo en el DOM (no rompemos
  //        ningún handler de index.html), solo se ocultan visualmente.
  // ============================================================
  function hideSetlistConfigSections() {
    const screen = document.getElementById("setlist-config-screen");
    if (!screen) return;
    if (screen.dataset.seConfigHidden === "1") return;

    // Anclas: los inputs setlist2-name y setlistStar-name. Caminamos hacia
    // atrás hasta el <h3> y ocultamos h3 + label + input + label + input.
    const anchorsIds = ["setlist2-name", "setlistStar-name"];
    let hiddenAny = false;

    anchorsIds.forEach((anchorId) => {
      const anchor = document.getElementById(anchorId);
      if (!anchor) return;

      // Buscar el <h3> hermano anterior más cercano
      let h3 = anchor.previousElementSibling;
      while (h3 && h3.tagName !== "H3") h3 = h3.previousElementSibling;
      if (!h3) return;

      // Recorrer hacia delante desde h3 hasta el siguiente <h3> o <button>
      // y ocultar todo lo que esté en medio (h3 incluido).
      const toHide = [];
      let cur = h3;
      while (cur) {
        toHide.push(cur);
        const next = cur.nextElementSibling;
        if (!next || next.tagName === "H3" || next.tagName === "BUTTON") break;
        cur = next;
      }
      toHide.forEach((el) => { el.style.display = "none"; hiddenAny = true; });
    });

    if (hiddenAny) {
      screen.dataset.seConfigHidden = "1";
      console.log("[setlist-extension] Panel de configuración: ocultados bloques setlist2 y star");
    }
  }

  function init() {
    safeRun(injectStyles, "injectStyles");
    safeRun(ensureSetlistModal, "ensureSetlistModal");
    safeRun(ensurePastConcertsModal, "ensurePastConcertsModal");
    // (afinador movido a tuner.js — ya no se inyecta desde aquí)
    safeRun(watchConcertModal, "watchConcertModal");
    safeRun(hookSaveButton, "hookSaveButton");
    safeRun(watchBandHelperTable, "watchBandHelperTable");
    safeRun(attachSetlistListener, "attachSetlistListener");
    safeRun(startScrollWatchdog, "startScrollWatchdog");
    safeRun(hideSetlistConfigSections, "hideSetlistConfigSections");
    safeRun(injectPastConcertsButton, "injectPastConcertsButton");

    // Reintentos espaciados para Firebase si aún no estaba listo
    const tryFirebase = (delay) => setTimeout(() => safeRun(attachSetlistListener, "attachListenerLate"), delay);
    tryFirebase(2000);
    tryFirebase(5000);
    tryFirebase(10000);

    // Si el panel de configuración se renderiza tarde, lo reintentamos
    setTimeout(() => safeRun(hideSetlistConfigSections, "hideSetlistConfigSectionsLate"), 3000);
    setTimeout(() => safeRun(hideSetlistConfigSections, "hideSetlistConfigSectionsLate2"), 8000);

    // Si la sección #calendario se renderiza tarde, reintentamos inyectar el botón
    setTimeout(() => safeRun(injectPastConcertsButton, "injectPastConcertsButtonLate"), 3000);
    setTimeout(() => safeRun(injectPastConcertsButton, "injectPastConcertsButtonLate2"), 8000);
  }

  function startWhenReady() {
    const run = () => safeRun(init, "init");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  startWhenReady();
})();
