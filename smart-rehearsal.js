/*
   SMART-REHEARSAL.JS
   Semaforo global por cancion + planes inteligentes por ensayo.
   Este modulo solo se carga desde index.pru.html.
*/
(function () {
  "use strict";

  const DOC_ID = "rehearsal_intelligence";
  const LOCAL_STATE_KEY = "esdd_rehearsal_intelligence_v2";
  const LEGACY_STATE_KEY = "esdd_rehearsal_intelligence_v1";
  const MAX_SESSIONS = 30;
  const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  const STATUS = {
    ready: { label: "Lista", color: "#43d17a", score: 5 },
    review: { label: "Necesita repaso", color: "#ffb52e", score: 65 },
    blocked: { label: "Bloqueada", color: "#ff5353", score: 110 },
    unknown: { label: "Sin valorar", color: "#777", score: 40 }
  };

  const SOURCES = {
    rehearsal: {
      label: "Setlist Proximo Ensayo",
      short: "Ensayo",
      sectionId: "setlists",
      color: "#b070ff"
    },
    concert: {
      label: "Setlist Proximo Concierto",
      short: "Concierto",
      sectionId: "second-setlist",
      color: "#0cf"
    },
    star: {
      label: "Setlist Concierto Estrella",
      short: "Estrella",
      sectionId: "star-setlist",
      color: "#ffd700"
    }
  };

  let state = { songs: {}, sessions: [], rehearsalPlans: {} };
  let songs = [];
  let activeSession = null;
  let activePlanScreenId = null;
  let sessionTimer = null;
  let saveTimer = null;
  let lastSongsFingerprint = "";

  function sanitizeKey(value) {
    return value ? String(value).trim().replace(/[.#$[\]/:\s,]/g, "_") : "unknown";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatSeconds(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function formatRehearsalDate(rehearsal) {
    if (!rehearsal || !rehearsal.date) return "Ensayo sin fecha";
    return new Date(`${rehearsal.date}T00:00:00`).toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function rehearsalDurationMinutes(rehearsal) {
    if (!rehearsal || !rehearsal.startTime || !rehearsal.endTime) return 90;
    const [startHour, startMinute] = rehearsal.startTime.split(":").map(Number);
    const [endHour, endMinute] = rehearsal.endTime.split(":").map(Number);
    let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (minutes < 0) minutes += 24 * 60;
    return minutes || 90;
  }

  function rehearsalId(rehearsal) {
    if (!rehearsal) return "unknown_rehearsal";
    if (rehearsal.smartId) return String(rehearsal.smartId);
    return sanitizeKey([
      rehearsal.date || "sin_fecha",
      rehearsal.startTime || "sin_hora",
      rehearsal.endTime || "",
      rehearsal.location || "sin_lugar"
    ].join("_"));
  }

  window.getRehearsalSmartId = rehearsalId;

  function getRehearsals() {
    const list = typeof window.getRehearsalsForSmartMode === "function"
      ? window.getRehearsalsForSmartMode()
      : window.rehearsals;
    return Array.isArray(list) ? list : [];
  }

  function getFutureRehearsals() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getRehearsals()
      .filter(rehearsal => rehearsal && rehearsal.date && new Date(`${rehearsal.date}T00:00:00`) >= today)
      .sort((a, b) => new Date(`${a.date}T${a.startTime || "00:00"}`) - new Date(`${b.date}T${b.startTime || "00:00"}`));
  }

  function getIdentity() {
    const selector = document.getElementById("user-identity-selector");
    return selector && selector.value ? selector.value : "Banda";
  }

  function normalizeState(saved) {
    if (!saved || typeof saved !== "object") return;
    state.songs = saved.songs && typeof saved.songs === "object" ? saved.songs : state.songs;
    state.sessions = Array.isArray(saved.sessions) ? saved.sessions.slice(0, MAX_SESSIONS) : state.sessions;
    state.rehearsalPlans = saved.rehearsalPlans && typeof saved.rehearsalPlans === "object"
      ? saved.rehearsalPlans
      : state.rehearsalPlans;
  }

  function updatedTime(record) {
    const time = Date.parse(record && record.updatedAt ? record.updatedAt : "");
    return Number.isFinite(time) ? time : 0;
  }

  function mergeRecordMaps(remoteMap, localMap, preferLocalOnTie = true) {
    const merged = { ...(remoteMap || {}) };
    Object.entries(localMap || {}).forEach(([key, localRecord]) => {
      const remoteRecord = merged[key];
      const localTime = updatedTime(localRecord);
      const remoteTime = updatedTime(remoteRecord);
      if (!remoteRecord || localTime > remoteTime || (preferLocalOnTie && localTime === remoteTime)) merged[key] = localRecord;
    });
    return merged;
  }

  function mergeSessions(remoteSessions, localSessions) {
    const byId = new Map();
    [...(remoteSessions || []), ...(localSessions || [])].forEach(session => {
      if (!session) return;
      const id = session.id || `${session.rehearsalId || "legacy"}_${session.startedAt || session.endedAt || "session"}`;
      byId.set(id, session);
    });
    return Array.from(byId.values())
      .sort((a, b) => Date.parse(b.endedAt || b.startedAt || "") - Date.parse(a.endedAt || a.startedAt || ""))
      .slice(0, MAX_SESSIONS);
  }

  function touchPlanRecord(record) {
    const now = new Date();
    const editor = getIdentity();
    const previousTime = Date.parse(record.updatedAt || "");
    const sameEditBurst = record.updatedBy === editor && Number.isFinite(previousTime) && now.getTime() - previousTime < 2000;
    record.updatedAt = now.toISOString();
    record.updatedBy = editor;
    if (!sameEditBurst) record.revision = Number(record.revision || 0) + 1;
  }

  function readLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || localStorage.getItem(LEGACY_STATE_KEY) || "{}");
      normalizeState(saved);
    } catch (error) {
      console.warn("[Ensayo Inteligente] No se pudo leer la copia local:", error);
    }
  }

  function writeLocalState() {
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("[Ensayo Inteligente] No se pudo guardar la copia local:", error);
    }
  }

  function setSyncMessage(message, isError) {
    document.querySelectorAll(".sr-sync-status").forEach(element => {
      element.textContent = message || "";
      element.classList.toggle("error", !!isError);
    });
  }

  async function loadRemoteState() {
    if (typeof window.loadDoc !== "function") return;
    try {
      const remote = await window.loadDoc("intranet", DOC_ID, {
        songs: {},
        sessions: [],
        rehearsalPlans: {}
      });
      if (!remote || typeof remote !== "object") return;
      state.songs = mergeRecordMaps(remote.songs, state.songs, false);
      state.sessions = mergeSessions(remote.sessions, state.sessions);
      state.rehearsalPlans = mergeRecordMaps(remote.rehearsalPlans, state.rehearsalPlans, false);
      writeLocalState();
      renderAll();
      setSyncMessage(IS_LOCAL_PREVIEW
        ? "Modo local: lectura compartida, cambios solo en este navegador"
        : "Datos compartidos sincronizados");
    } catch (error) {
      console.warn("[Ensayo Inteligente] No se pudo sincronizar:", error);
      setSyncMessage("Trabajando con copia local", true);
    }
  }

  async function saveRemoteState() {
    if (IS_LOCAL_PREVIEW) {
      setSyncMessage("Modo local: cambios guardados solo en este navegador");
      return;
    }
    if (typeof window.saveDoc !== "function" || typeof window.withRetry !== "function") {
      setSyncMessage("Guardado local", true);
      return;
    }
    try {
      setSyncMessage("Guardando...");
      const localSnapshot = JSON.parse(JSON.stringify(state));
      if (typeof db !== "undefined" && db && typeof db.runTransaction === "function") {
        let committedState = null;
        await window.withRetry(() => db.runTransaction(async transaction => {
          const ref = db.collection("intranet").doc(DOC_ID);
          const snapshot = await transaction.get(ref);
          const remote = snapshot.exists ? snapshot.data() : {};
          committedState = {
            songs: mergeRecordMaps(remote.songs, localSnapshot.songs),
            sessions: mergeSessions(remote.sessions, localSnapshot.sessions),
            rehearsalPlans: mergeRecordMaps(remote.rehearsalPlans, localSnapshot.rehearsalPlans)
          };
          transaction.set(ref, {
            ...committedState,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }));
        if (committedState) state = committedState;
      } else {
        const remote = await window.loadDoc("intranet", DOC_ID, {
          songs: {},
          sessions: [],
          rehearsalPlans: {}
        });
        state.songs = mergeRecordMaps(remote.songs, state.songs);
        state.sessions = mergeSessions(remote.sessions, state.sessions);
        state.rehearsalPlans = mergeRecordMaps(remote.rehearsalPlans, state.rehearsalPlans);
        await window.withRetry(() => window.saveDoc("intranet", DOC_ID, {
          songs: state.songs,
          sessions: state.sessions.slice(0, MAX_SESSIONS),
          rehearsalPlans: state.rehearsalPlans,
          updatedAt: new Date().toISOString()
        }, true));
      }
      writeLocalState();
      setSyncMessage("Guardado");
    } catch (error) {
      console.error("[Ensayo Inteligente] Error guardando:", error);
      setSyncMessage("Guardado local; pendiente de sincronizar", true);
    }
  }

  function queueSave() {
    writeLocalState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveRemoteState, 500);
  }

  function flattenSetlist(structure, source, map) {
    if (!Array.isArray(structure)) return;
    structure.forEach(item => {
      if (item && item.isSetHeader && Array.isArray(item.songs)) {
        item.songs.forEach(song => addSong(song, source, map));
      } else if (item && item.isSong) {
        addSong(item, source, map);
      }
    });
  }

  function addSong(song, source, map) {
    const title = song && (song.displayName || song.title || song.name);
    if (!title) return;
    const key = sanitizeKey(title);
    const existing = map.get(key) || {
      key,
      title: String(title),
      sources: [],
      durationSeconds: 0,
      tempo: "",
      musicalKey: ""
    };
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.durationSeconds = Math.max(existing.durationSeconds, Number(song.calculatedDurationSeconds) || 0);
    existing.tempo = existing.tempo || String(song.tempo || "");
    existing.musicalKey = existing.musicalKey || String(song.key || "");
    map.set(key, existing);
  }

  function collectSongs() {
    const map = new Map();
    flattenSetlist(window.globalItems1, "rehearsal", map);
    flattenSetlist(window.globalItems2, "concert", map);
    flattenSetlist(window.globalItemsStar, "star", map);
    songs = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, "es"));
    const fingerprint = songs.map(song => `${song.key}:${song.sources.join(",")}`).join("|");
    const changed = fingerprint !== lastSongsFingerprint;
    lastSongsFingerprint = fingerprint;
    return changed;
  }

  function getSongStatus(songKey) {
    const record = state.songs[songKey];
    return record && STATUS[record.status] ? record.status : "unknown";
  }

  function getSongRecord(songKey) {
    return state.songs[songKey] || {};
  }

  function setSongStatus(songKey, status) {
    if (!STATUS[status] || status === "unknown") return;
    state.songs[songKey] = {
      ...getSongRecord(songKey),
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: getIdentity()
    };
    queueSave();
    renderAll();
  }

  function editSongNote(songKey) {
    const song = songs.find(item => item.key === songKey);
    if (!song) return;
    const note = prompt(`Nota de trabajo para "${song.title}":`, getSongRecord(songKey).note || "");
    if (note === null) return;
    state.songs[songKey] = {
      ...getSongRecord(songKey),
      note: note.trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: getIdentity()
    };
    queueSave();
    renderAll();
  }

  function sourceBadges(song) {
    return song.sources.map(source => `
      <span class="sr-source" style="border-color:${SOURCES[source].color};color:${SOURCES[source].color}">
        ${escapeHtml(SOURCES[source].short)}
      </span>
    `).join("");
  }

  function injectStyles() {
    if (document.getElementById("smart-rehearsal-styles")) return;
    const style = document.createElement("style");
    style.id = "smart-rehearsal-styles";
    style.textContent = `
      .sr-setlist-panel,.sr-rehearsal-card {
        margin-top:18px; background:rgba(0,0,0,.28); border:1px solid rgba(255,181,46,.28);
        border-radius:10px; padding:12px;
      }
      .sr-setlist-panel > summary,.sr-rehearsal-card-header {
        color:#ffb52e; cursor:pointer; font-weight:bold; padding:3px; list-style-position:inside;
      }
      .sr-subtitle { color:#aaa; font-size:.82em; margin:9px 0 12px; }
      .sr-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; margin:10px 0; }
      .sr-summary-card { background:#111; border:1px solid #333; border-radius:8px; padding:8px; text-align:center; }
      .sr-summary-value { display:block; font-size:1.35em; font-weight:bold; }
      .sr-summary-label { color:#aaa; font-size:.72em; }
      .sr-song-list { max-height:430px; overflow-y:auto; padding-right:3px; }
      .sr-song { display:grid; grid-template-columns:minmax(130px,1fr) auto; gap:9px; padding:9px 4px; border-bottom:1px solid #292929; align-items:center; }
      .sr-song:last-child { border-bottom:0; }
      .sr-song-title { font-weight:bold; color:#fff; }
      .sr-song-note { color:#aaa; font-size:.76em; margin-top:4px; }
      .sr-sources { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
      .sr-source { font-size:.62em; padding:2px 5px; border-radius:10px; border:1px solid #555; }
      .sr-status-controls { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
      .sr-status-btn,.sr-note-btn,.sr-small-btn {
        border:1px solid #555; background:#222; color:#bbb; border-radius:6px; padding:6px 8px; cursor:pointer; font-size:.75em;
      }
      .sr-status-btn.active.ready { color:#111; background:#43d17a; border-color:#43d17a; }
      .sr-status-btn.active.review { color:#111; background:#ffb52e; border-color:#ffb52e; }
      .sr-status-btn.active.blocked { color:#fff; background:#d93838; border-color:#ff5353; }
      .sr-rehearsal-card-header { cursor:default; }
      .sr-rehearsal-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; align-items:center; }
      .sr-rehearsal-meta { color:#aaa; font-size:.8em; font-weight:normal; }
      .sr-rehearsal-grid { display:grid; grid-template-columns:minmax(260px,.8fr) minmax(320px,1.2fr); gap:12px; margin-top:12px; }
      .sr-panel { background:rgba(0,0,0,.25); border:1px solid #333; border-radius:9px; padding:11px; }
      .sr-panel h4 { color:#ffb52e; margin:0 0 9px; }
      .sr-form-label { display:block; color:#ccc; font-size:.78em; margin:9px 0 4px; }
      .sr-objective,.sr-focus,.sr-song-picker {
        width:100%; padding:8px; background:#171717; color:#fff; border:1px solid #444; border-radius:7px;
      }
      .sr-objective { min-height:72px; resize:vertical; }
      .sr-source-options { display:flex; flex-wrap:wrap; gap:7px; margin:7px 0; }
      .sr-source-option { display:flex; align-items:center; gap:5px; color:#ccc; font-size:.8em; }
      .sr-picker-row { display:flex; gap:6px; margin-top:6px; }
      .sr-picker-row .sr-song-picker { flex:1; min-width:0; }
      .sr-tag-list { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; min-height:20px; }
      .sr-tag { display:inline-flex; align-items:center; gap:5px; background:#252525; border:1px solid #444; border-radius:12px; padding:3px 7px; color:#ddd; font-size:.7em; }
      .sr-tag.required { border-color:#43d17a; }
      .sr-tag.excluded { border-color:#ff5353; }
      .sr-tag button { border:0; background:none; color:#aaa; padding:0; cursor:pointer; }
      .sr-actions { display:flex; gap:7px; flex-wrap:wrap; margin-top:11px; }
      .sr-action-btn { border:0; border-radius:7px; padding:9px 12px; background:#ffb52e; color:#111; font-weight:bold; cursor:pointer; }
      .sr-action-btn.secondary { background:#333; color:#fff; border:1px solid #555; }
      .sr-action-btn:disabled { opacity:.45; cursor:not-allowed; }
      .sr-sync-status { min-height:1.2em; color:#66dd99; font-size:.72em; margin-top:8px; }
      .sr-sync-status.error { color:#ff8a8a; }
      .sr-plan-empty,.sr-empty { color:#888; text-align:center; padding:18px 7px; }
      .sr-plan-summary { display:flex; justify-content:space-between; gap:8px; color:#aaa; font-size:.8em; margin-bottom:7px; }
      .sr-plan-item { display:grid; grid-template-columns:27px minmax(0,1fr) auto; gap:8px; align-items:center; padding:8px 4px; border-bottom:1px solid #292929; }
      .sr-plan-number { color:#ffb52e; font-weight:bold; text-align:center; }
      .sr-plan-time { color:#aaa; font-size:.78em; }
      .sr-history-item { padding:7px 4px; border-bottom:1px solid #292929; color:#ccc; font-size:.78em; }
      .sr-row-summary { min-width:150px; display:flex; flex-direction:column; gap:5px; align-items:flex-start; }
      .sr-row-status { display:inline-flex; align-items:center; border-radius:12px; padding:3px 7px; font-size:.72em; font-weight:bold; border:1px solid #555; }
      .sr-row-status.unprepared { color:#aaa; }
      .sr-row-status.prepared { color:#ffb52e; border-color:#ffb52e; }
      .sr-row-status.completed { color:#43d17a; border-color:#43d17a; }
      .sr-row-objective { color:#ddd; font-size:.74em; max-width:220px; }
      .sr-row-meta { color:#888; font-size:.68em; }
      .sr-row-warning { color:#ff8a8a; font-size:.68em; }
      .sr-open-plan { border:1px solid #555; background:#222; color:#fff; border-radius:6px; padding:5px 8px; cursor:pointer; font-size:.7em; }
      tr[data-sr-status] td:first-child { border-left:4px solid #777 !important; }
      tr[data-sr-status="ready"] td:first-child { border-left-color:#43d17a !important; }
      tr[data-sr-status="review"] td:first-child { border-left-color:#ffb52e !important; }
      tr[data-sr-status="blocked"] td:first-child { border-left-color:#ff5353 !important; }
      #sr-plan-screen {
        display:none; position:fixed; inset:0; z-index:115000; overflow-y:auto; overscroll-behavior:contain;
        background:radial-gradient(circle at top,#242424,#050505 70%); color:#fff;
      }
      #sr-plan-screen.show { display:block; }
      .sr-plan-screen-shell { min-height:100%; max-width:1180px; margin:0 auto; padding:0 18px 30px; }
      .sr-plan-screen-top {
        position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; align-items:center; gap:14px;
        padding:14px 0; background:rgba(8,8,8,.94); border-bottom:1px solid #333; backdrop-filter:blur(8px);
      }
      .sr-plan-screen-title { display:flex; flex-direction:column; gap:2px; text-align:right; }
      .sr-plan-screen-title span { color:#ffb52e; font-size:.78em; font-weight:bold; text-transform:uppercase; letter-spacing:.08em; }
      .sr-plan-screen-title strong { color:#fff; font-size:1em; }
      .sr-plan-back {
        border:1px solid #ffb52e; background:#171717; color:#ffb52e; border-radius:8px; padding:9px 12px; cursor:pointer; font-weight:bold;
      }
      #sr-plan-screen-content .sr-rehearsal-card { margin-top:18px; }
      #sr-session-overlay { display:none; position:fixed; inset:0; z-index:120000; background:radial-gradient(circle at top,#242424,#050505 70%); color:#fff; overflow-y:auto; }
      #sr-session-overlay.show { display:block; }
      .sr-session-shell { min-height:100%; max-width:900px; margin:0 auto; padding:24px 18px; display:flex; flex-direction:column; justify-content:center; }
      .sr-session-top { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:18px; color:#aaa; }
      .sr-session-progress { height:7px; background:#222; border-radius:10px; overflow:hidden; margin-bottom:28px; }
      .sr-session-progress > div { height:100%; background:#ffb52e; transition:width .25s; }
      .sr-session-title { font-size:clamp(2em,7vw,4.8em); line-height:1.05; text-align:center; margin:10px 0; }
      .sr-session-meta,.sr-session-note,.sr-session-target { text-align:center; color:#aaa; }
      .sr-session-note { max-width:650px; margin:18px auto; color:#ddd; min-height:1.4em; }
      .sr-session-clock { font-family:monospace; color:#ffb52e; font-size:clamp(2.2em,8vw,5em); text-align:center; margin:18px 0 5px; }
      .sr-session-tools,.sr-session-results { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; margin-top:12px; }
      .sr-session-tools button,.sr-session-results button,.sr-session-close { border:1px solid #555; background:#222; color:#fff; border-radius:9px; padding:12px 17px; cursor:pointer; font-weight:bold; }
      .sr-session-results button[data-result="good"] { background:#43d17a; color:#111; border-color:#43d17a; }
      .sr-session-results button[data-result="repeat"] { background:#ffb52e; color:#111; border-color:#ffb52e; }
      .sr-session-results button[data-result="blocked"] { background:#d93838; border-color:#ff5353; }
      @media(max-width:800px) {
        .sr-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .sr-song,.sr-rehearsal-grid { grid-template-columns:1fr; }
        .sr-status-controls { justify-content:flex-start; }
        .sr-song-list { max-height:none; }
        .sr-plan-screen-shell { padding:0 10px 20px; }
        .sr-plan-screen-top { align-items:flex-start; }
        .sr-plan-screen-title strong { font-size:.82em; }
      }
    `;
    document.head.appendChild(style);
  }

  function createSessionOverlay() {
    if (document.getElementById("sr-session-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "sr-session-overlay";
    overlay.innerHTML = `
      <div class="sr-session-shell">
        <div class="sr-session-top">
          <span id="sr-session-counter">1 / 1</span>
          <span id="sr-session-total-time">Tiempo de sesion: 0:00</span>
          <button id="sr-finish-session" class="sr-session-close">Finalizar ensayo</button>
        </div>
        <div class="sr-session-progress"><div id="sr-session-progress-fill"></div></div>
        <div id="sr-session-status" style="text-align:center;color:#aaa;"></div>
        <div id="sr-session-title" class="sr-session-title">Cancion</div>
        <div id="sr-session-meta" class="sr-session-meta"></div>
        <div id="sr-session-note" class="sr-session-note"></div>
        <div id="sr-session-clock" class="sr-session-clock">0:00</div>
        <div id="sr-session-target" class="sr-session-target"></div>
        <div class="sr-session-tools">
          <button id="sr-session-jukebox">Abrir Jukebox</button>
          <button id="sr-session-metronome">Iniciar metronomo</button>
        </div>
        <div class="sr-session-results">
          <button data-result="good">Bien, queda lista</button>
          <button data-result="repeat">Necesita repeticion</button>
          <button data-result="blocked">Queda bloqueada</button>
          <button data-result="skip">Saltar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function createPlanScreen() {
    if (document.getElementById("sr-plan-screen")) return;
    const screen = document.createElement("div");
    screen.id = "sr-plan-screen";
    screen.setAttribute("aria-hidden", "true");
    screen.innerHTML = `
      <div class="sr-plan-screen-shell">
        <div class="sr-plan-screen-top">
          <button id="sr-close-plan-screen" class="sr-plan-back">Volver a ensayos</button>
          <div class="sr-plan-screen-title">
            <span>Plan inteligente</span>
            <strong id="sr-plan-screen-date">Ensayo</strong>
          </div>
        </div>
        <div id="sr-plan-screen-content"></div>
      </div>
    `;
    document.body.appendChild(screen);
  }

  function setlistSummaryHtml(sourceSongs) {
    const counts = { ready: 0, review: 0, blocked: 0, unknown: 0 };
    sourceSongs.forEach(song => counts[getSongStatus(song.key)]++);
    return ["ready", "review", "blocked", "unknown"].map(status => `
      <div class="sr-summary-card">
        <span class="sr-summary-value" style="color:${STATUS[status].color}">${counts[status]}</span>
        <span class="sr-summary-label">${escapeHtml(STATUS[status].label)}</span>
      </div>
    `).join("");
  }

  function songStatusHtml(song) {
    const status = getSongStatus(song.key);
    const record = getSongRecord(song.key);
    return `
      <div class="sr-song">
        <div>
          <div class="sr-song-title">${escapeHtml(song.title)}</div>
          <div class="sr-sources">${sourceBadges(song)}</div>
          <div class="sr-song-note">${record.note ? escapeHtml(record.note) : "Sin nota de trabajo"}</div>
        </div>
        <div class="sr-status-controls">
          <button class="sr-status-btn ready ${status === "ready" ? "active" : ""}" data-sr-status="ready" data-song-key="${escapeHtml(song.key)}">Lista</button>
          <button class="sr-status-btn review ${status === "review" ? "active" : ""}" data-sr-status="review" data-song-key="${escapeHtml(song.key)}">Repaso</button>
          <button class="sr-status-btn blocked ${status === "blocked" ? "active" : ""}" data-sr-status="blocked" data-song-key="${escapeHtml(song.key)}">Bloqueada</button>
          <button class="sr-note-btn" data-sr-note="${escapeHtml(song.key)}">Nota</button>
        </div>
      </div>
    `;
  }

  function renderSetlistPanels() {
    Object.entries(SOURCES).forEach(([source, config]) => {
      const section = document.getElementById(config.sectionId);
      if (!section) return;
      let panel = section.querySelector(`[data-sr-setlist="${source}"]`);
      const wasOpen = !!panel?.open;
      if (!panel) {
        panel = document.createElement("details");
        panel.className = "sr-setlist-panel";
        panel.dataset.srSetlist = source;
        section.appendChild(panel);
      }
      const sourceSongs = songs.filter(song => song.sources.includes(source));
      panel.innerHTML = `
        <summary>Semaforo del repertorio · ${sourceSongs.length} canciones</summary>
        <p class="sr-subtitle">El estado de cada cancion es global y se comparte con los otros Setlists.</p>
        <div class="sr-summary">${setlistSummaryHtml(sourceSongs)}</div>
        <div class="sr-song-list">
          ${sourceSongs.length ? sourceSongs.map(songStatusHtml).join("") : '<div class="sr-empty">Esperando a que cargue este Setlist...</div>'}
        </div>
        <div class="sr-sync-status"></div>
      `;
      panel.open = wasOpen;
    });
  }

  function getPlanRecord(rehearsal) {
    const id = rehearsalId(rehearsal);
    if (!state.rehearsalPlans[id]) {
      state.rehearsalPlans[id] = {
        objective: rehearsal.notes || "",
        focus: "balanced",
        sources: ["rehearsal"],
        required: [],
        excluded: [],
        plan: null,
        updatedAt: null,
        updatedBy: null,
        revision: 0
      };
    }
    const record = state.rehearsalPlans[id];
    if (!Array.isArray(record.sources) || !record.sources.length) record.sources = ["rehearsal"];
    if (!Array.isArray(record.required)) record.required = [];
    if (!Array.isArray(record.excluded)) record.excluded = [];
    return record;
  }

  function rehearsalSummary(rehearsal) {
    const id = rehearsalId(rehearsal);
    const record = getPlanRecord(rehearsal);
    const sessions = state.sessions.filter(session => session.rehearsalId === id);
    const planSongs = record.plan && Array.isArray(record.plan.songs) ? record.plan.songs : [];
    const plannedMinutes = planSongs.reduce((sum, song) => sum + Number(song.plannedMinutes || 0), 0) + Number(record.plan?.reserveMinutes || 0);
    const targetMinutes = rehearsalDurationMinutes(rehearsal);
    const status = sessions.length ? "completed" : planSongs.length ? "prepared" : "unprepared";
    const label = { completed: "Ensayo realizado", prepared: "Plan preparado", unprepared: "Sin preparar" }[status];
    const warnings = [];
    if (!record.objective?.trim()) warnings.push("Falta objetivo");
    if (!record.required.length && !planSongs.length) warnings.push("Faltan prioridades");
    if (plannedMinutes > targetMinutes) warnings.push(`Excede ${plannedMinutes - targetMinutes} min`);
    return { id, record, planSongs, plannedMinutes, targetMinutes, status, label, warnings };
  }

  function rehearsalSummaryHtml(rehearsal) {
    const summary = rehearsalSummary(rehearsal);
    const editor = summary.record.updatedBy ? ` · por ${escapeHtml(summary.record.updatedBy)}` : "";
    return `
      <div class="sr-row-summary">
        <span class="sr-row-status ${summary.status}">${escapeHtml(summary.label)}</span>
        ${summary.record.objective ? `<span class="sr-row-objective">${escapeHtml(summary.record.objective)}</span>` : ""}
        <span class="sr-row-meta">${summary.planSongs.length} canciones · ${summary.plannedMinutes || 0}/${summary.targetMinutes} min${editor}</span>
        ${summary.warnings.length ? `<span class="sr-row-warning">${escapeHtml(summary.warnings.join(" · "))}</span>` : ""}
        <button class="sr-open-plan" data-sr-open-plan="${escapeHtml(summary.id)}">Abrir plan</button>
      </div>
    `;
  }

  function renderRehearsalRowSummaries() {
    document.querySelectorAll("[data-smart-rehearsal-id]").forEach(cell => {
      const rehearsal = getRehearsalById(cell.dataset.smartRehearsalId);
      if (rehearsal) cell.innerHTML = rehearsalSummaryHtml(rehearsal);
    });
  }

  function selectedSongsForRecord(record) {
    return songs.filter(song => song.sources.some(source => record.sources.includes(source)));
  }

  function songOptionsHtml(record) {
    const available = selectedSongsForRecord(record).filter(song => !record.required.includes(song.key) && !record.excluded.includes(song.key));
    return `<option value="">Selecciona una cancion...</option>${available.map(song => `
      <option value="${escapeHtml(song.key)}">${escapeHtml(song.title)}</option>
    `).join("")}`;
  }

  function tagsHtml(keys, type) {
    if (!keys.length) return '<span style="color:#777;font-size:.72em;">Ninguna</span>';
    return keys.map(key => {
      const song = songs.find(item => item.key === key);
      return `
        <span class="sr-tag ${type}">
          ${escapeHtml(song ? song.title : key)}
          <button data-sr-remove="${type}" data-song-key="${escapeHtml(key)}" title="Quitar">x</button>
        </span>
      `;
    }).join("");
  }

  function planHtml(record) {
    const plan = record.plan;
    const planSongs = plan && Array.isArray(plan.songs) ? plan.songs : [];
    if (!planSongs.length) return '<div class="sr-plan-empty">Configura las prioridades y genera el plan de este ensayo.</div>';
    const songsMinutes = planSongs.reduce((sum, song) => sum + Number(song.plannedMinutes || 0), 0);
    return `
      <div class="sr-plan-summary">
        <span>${planSongs.length} canciones</span>
        <span>${songsMinutes + plan.reserveMinutes} de ${plan.targetMinutes} min</span>
      </div>
      <div class="sr-plan-item">
        <span class="sr-plan-number">0</span>
        <span><strong>Calentamiento y ajuste de sonido</strong></span>
        <span class="sr-plan-time">10 min</span>
      </div>
      ${planSongs.map((song, index) => `
        <div class="sr-plan-item">
          <span class="sr-plan-number">${index + 1}</span>
          <span>
            <strong>${escapeHtml(song.title)}</strong><br>
            <small style="color:${STATUS[getSongStatus(song.key)].color}">
              ${escapeHtml(STATUS[getSongStatus(song.key)].label)}${record.required.includes(song.key) ? " · Imprescindible" : ""}
            </small>
          </span>
          <span class="sr-plan-time">${song.plannedMinutes} min</span>
        </div>
      `).join("")}
      ${plan.targetMinutes >= 90 ? `
        <div class="sr-plan-item">
          <span class="sr-plan-number">+</span>
          <span><strong>Descanso / margen</strong></span>
          <span class="sr-plan-time">5 min</span>
        </div>
      ` : ""}
    `;
  }

  function historyHtml(rehearsalIdValue) {
    const sessions = state.sessions.filter(session => session.rehearsalId === rehearsalIdValue).slice(0, 5);
    if (!sessions.length) return '<div class="sr-empty">Este ensayo aun no tiene sesiones registradas.</div>';
    return sessions.map(session => {
      const results = Array.isArray(session.results) ? session.results : [];
      const ready = results.filter(result => result.result === "good").length;
      const pending = results.filter(result => result.result === "repeat" || result.result === "blocked").length;
      return `
        <div class="sr-history-item">
          <strong>${new Date(session.endedAt || session.startedAt).toLocaleString("es-ES")}</strong>
          · ${results.length} canciones · ${ready} listas · ${pending} pendientes
        </div>
      `;
    }).join("");
  }

  function rehearsalCardHtml(rehearsal) {
    const id = rehearsalId(rehearsal);
    const record = getPlanRecord(rehearsal);
    const duration = rehearsalDurationMinutes(rehearsal);
    return `
      <article class="sr-rehearsal-card" data-rehearsal-id="${escapeHtml(id)}">
        <div class="sr-rehearsal-card-header">
          <span class="sr-rehearsal-heading">
            <span>Plan · ${escapeHtml(formatRehearsalDate(rehearsal))}</span>
            <span class="sr-rehearsal-meta">${escapeHtml(rehearsal.startTime || "")}-${escapeHtml(rehearsal.endTime || "")} · ${duration} min · ${escapeHtml(rehearsal.location || "")}</span>
          </span>
        </div>
        <div class="sr-rehearsal-grid">
          <div class="sr-panel">
            <h4>Objetivo y prioridades</h4>
            <label class="sr-form-label">Objetivo concreto del ensayo</label>
            <textarea class="sr-objective" data-sr-objective="${escapeHtml(id)}" placeholder="Ej: cerrar finales, trabajar coros y repasar transiciones...">${escapeHtml(record.objective || "")}</textarea>
            <label class="sr-form-label">Setlists incluidos</label>
            <div class="sr-source-options">
              ${Object.entries(SOURCES).map(([source, sourceConfig]) => `
                <label class="sr-source-option">
                  <input type="checkbox" data-sr-source="${source}" ${record.sources.includes(source) ? "checked" : ""}>
                  ${escapeHtml(sourceConfig.short)}
                </label>
              `).join("")}
            </div>
            <label class="sr-form-label">Enfoque automatico</label>
            <select class="sr-focus" data-sr-focus="${escapeHtml(id)}">
              <option value="balanced" ${record.focus === "balanced" ? "selected" : ""}>Plan equilibrado</option>
              <option value="problems" ${record.focus === "problems" ? "selected" : ""}>Priorizar problemas</option>
              <option value="concert" ${record.focus === "concert" ? "selected" : ""}>Priorizar conciertos</option>
              <option value="unrated" ${record.focus === "unrated" ? "selected" : ""}>Valorar repertorio pendiente</option>
            </select>
            <label class="sr-form-label">Canciones imprescindibles</label>
            <div class="sr-picker-row">
              <select class="sr-song-picker" data-sr-picker="required">${songOptionsHtml(record)}</select>
              <button class="sr-small-btn" data-sr-add="required">Anadir</button>
            </div>
            <div class="sr-tag-list">${tagsHtml(record.required, "required")}</div>
            <label class="sr-form-label">Canciones excluidas</label>
            <div class="sr-picker-row">
              <select class="sr-song-picker" data-sr-picker="excluded">${songOptionsHtml(record)}</select>
              <button class="sr-small-btn" data-sr-add="excluded">Excluir</button>
            </div>
            <div class="sr-tag-list">${tagsHtml(record.excluded, "excluded")}</div>
            <div class="sr-row-meta">${record.updatedAt ? `Revision ${Number(record.revision || 0)} · ${escapeHtml(record.updatedBy || "Banda")} · ${new Date(record.updatedAt).toLocaleString("es-ES")}` : "Aun sin modificaciones"}</div>
            <div class="sr-sync-status"></div>
          </div>
          <div>
            <div class="sr-panel">
              <h4>Plan inteligente</h4>
              <div class="sr-plan">${planHtml(record)}</div>
              <div class="sr-actions">
                <button class="sr-action-btn" data-sr-generate="${escapeHtml(id)}">Generar plan</button>
                <button class="sr-action-btn" data-sr-start="${escapeHtml(id)}" ${record.plan && record.plan.songs && record.plan.songs.length ? "" : "disabled"}>Iniciar Modo Ensayo</button>
                <button class="sr-action-btn secondary" data-sr-clear="${escapeHtml(id)}" ${record.plan ? "" : "disabled"}>Limpiar plan</button>
              </div>
            </div>
            <div class="sr-panel" style="margin-top:10px;">
              <h4>Historial de este ensayo</h4>
              ${historyHtml(id)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function closePlanScreen() {
    activePlanScreenId = null;
    const screen = document.getElementById("sr-plan-screen");
    if (!screen) return;
    screen.classList.remove("show");
    screen.setAttribute("aria-hidden", "true");
  }

  function renderPlanScreen(id, resetScroll = false) {
    const screen = document.getElementById("sr-plan-screen");
    const content = document.getElementById("sr-plan-screen-content");
    const rehearsal = getRehearsalById(id);
    if (!screen || !content || !rehearsal) {
      closePlanScreen();
      return;
    }
    const previousScroll = screen.scrollTop;
    content.innerHTML = rehearsalCardHtml(rehearsal);
    const title = document.getElementById("sr-plan-screen-date");
    if (title) title.textContent = formatRehearsalDate(rehearsal);
    screen.scrollTop = resetScroll ? 0 : previousScroll;
  }

  function openPlanScreen(id) {
    const screen = document.getElementById("sr-plan-screen");
    if (!screen || !getRehearsalById(id)) return;
    activePlanScreenId = id;
    renderPlanScreen(id, true);
    screen.classList.add("show");
    screen.setAttribute("aria-hidden", "false");
  }

  function renderRehearsalPlans() {
    document.getElementById("sr-rehearsal-plans")?.remove();
    renderRehearsalRowSummaries();
    if (activePlanScreenId) renderPlanScreen(activePlanScreenId);
  }

  function getRehearsalById(id) {
    return getRehearsals().find(rehearsal => rehearsalId(rehearsal) === id);
  }

  function scoreSong(song, focus, required) {
    const status = getSongStatus(song.key);
    let score = STATUS[status].score;
    if (required) score += 1000;
    if (song.sources.includes("star")) score += 32;
    if (song.sources.includes("concert")) score += 25;
    if (song.sources.includes("rehearsal")) score += 12;
    if (!window.jukeboxLibrary || !window.jukeboxLibrary[song.key]) score += 5;
    if (focus === "problems" && (status === "blocked" || status === "review")) score += 120;
    if (focus === "concert" && (song.sources.includes("concert") || song.sources.includes("star"))) score += 120;
    if (focus === "unrated" && status === "unknown") score += 150;
    return score;
  }

  function estimateSongMinutes(song) {
    const baseline = { blocked: 15, review: 10, unknown: 8, ready: 5 }[getSongStatus(song.key)];
    const durationMinutes = Math.ceil((song.durationSeconds || 0) / 60);
    return Math.max(baseline, durationMinutes ? durationMinutes + 3 : 0);
  }

  function generatePlan(id) {
    collectSongs();
    const rehearsal = getRehearsalById(id);
    if (!rehearsal || !songs.length) {
      alert("Todavia no hay canciones o datos suficientes para generar el plan.");
      return;
    }
    const record = getPlanRecord(rehearsal);
    const targetMinutes = rehearsalDurationMinutes(rehearsal);
    const reserveMinutes = 10 + (targetMinutes >= 90 ? 5 : 0);
    const songsBudget = Math.max(20, targetMinutes - reserveMinutes);
    const candidates = selectedSongsForRecord(record)
      .filter(song => !record.excluded.includes(song.key))
      .map(song => ({
        ...song,
        score: scoreSong(song, record.focus, record.required.includes(song.key)),
        plannedMinutes: estimateSongMinutes(song)
      }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es"));

    const selected = [];
    let usedMinutes = 0;
    candidates.forEach(song => {
      const required = record.required.includes(song.key);
      if (required || usedMinutes + song.plannedMinutes <= songsBudget || selected.length === 0) {
        selected.push(song);
        usedMinutes += song.plannedMinutes;
      }
    });

    const openerIndex = selected.findIndex(song => getSongStatus(song.key) === "ready" && !record.required.includes(song.key));
    if (openerIndex > 0) selected.unshift(selected.splice(openerIndex, 1)[0]);
    record.plan = {
      rehearsalId: id,
      generatedAt: new Date().toISOString(),
      targetMinutes,
      reserveMinutes,
      focus: record.focus,
      sources: record.sources.slice(),
      songs: selected
    };
    touchPlanRecord(record);
    queueSave();
    renderRehearsalPlans();
  }

  function clearPlan(id) {
    const rehearsal = getRehearsalById(id);
    if (!rehearsal) return;
    const record = getPlanRecord(rehearsal);
    record.plan = null;
    touchPlanRecord(record);
    queueSave();
    renderRehearsalPlans();
  }

  function updatePlanRecordFromCard(card) {
    const id = card.dataset.rehearsalId;
    const rehearsal = getRehearsalById(id);
    if (!rehearsal) return null;
    const record = getPlanRecord(rehearsal);
    const previousObjective = record.objective || "";
    const previousFocus = record.focus;
    const previousSources = record.sources.slice().sort().join(",");
    record.objective = card.querySelector(".sr-objective")?.value.trim() || "";
    record.focus = card.querySelector(".sr-focus")?.value || "balanced";
    record.sources = Array.from(card.querySelectorAll("[data-sr-source]:checked")).map(input => input.dataset.srSource);
    if (!record.sources.length) record.sources = ["rehearsal"];
    const nextSources = record.sources.slice().sort().join(",");
    if (record.focus !== previousFocus || nextSources !== previousSources) record.plan = null;
    if (record.objective !== previousObjective || record.focus !== previousFocus || nextSources !== previousSources) touchPlanRecord(record);
    return record;
  }

  function decorateSetlistRows() {
    document.querySelectorAll("#setlist-body tr, #second-body tr, #star-setlist-body tr").forEach(row => {
      if (row.classList.contains("set-header-row") || row.classList.contains("break-row")) return;
      const title = row.cells && row.cells[1] ? row.cells[1].textContent.trim() : "";
      if (!title) return;
      const status = getSongStatus(sanitizeKey(title));
      row.dataset.srStatus = status;
      row.title = `Semaforo: ${STATUS[status].label}`;
    });
  }

  function renderAll() {
    collectSongs();
    renderSetlistPanels();
    renderRehearsalPlans();
    decorateSetlistRows();
  }

  function openJukeboxForSong(song) {
    const url = window.jukeboxLibrary && window.jukeboxLibrary[song.key];
    if (!url || typeof window.openJukeboxPlayer !== "function") {
      alert("Esta cancion todavia no tiene audio asignado en el Jukebox.");
      return;
    }
    window.openJukeboxPlayer(song.title, url);
  }

  function startMetronomeForSong(song) {
    const match = String(song.tempo || "").match(/\d+/);
    if (!match || typeof window.toggleMetronomeFromTable !== "function") {
      alert("Esta cancion no tiene un tempo valido.");
      return;
    }
    window.toggleMetronomeFromTable(match[0], null);
  }

  function startSession(id) {
    const rehearsal = getRehearsalById(id);
    if (!rehearsal) return;
    const record = getPlanRecord(rehearsal);
    if (!record.plan || !Array.isArray(record.plan.songs) || !record.plan.songs.length) {
      generatePlan(id);
    }
    if (!record.plan || !record.plan.songs.length) return;
    activeSession = {
      rehearsalId: id,
      plan: JSON.parse(JSON.stringify(record.plan)),
      startedAt: new Date().toISOString(),
      sessionStartedMs: Date.now(),
      songStartedMs: Date.now(),
      index: 0,
      results: []
    };
    document.getElementById("sr-session-overlay")?.classList.add("show");
    if (!IS_LOCAL_PREVIEW && typeof window.requestWakeLock === "function") window.requestWakeLock();
    clearInterval(sessionTimer);
    sessionTimer = setInterval(renderSessionClocks, 1000);
    renderSession();
  }

  function currentSessionSong() {
    return activeSession && activeSession.plan && activeSession.plan.songs[activeSession.index];
  }

  function renderSessionClocks() {
    if (!activeSession) return;
    const songElapsed = Math.round((Date.now() - activeSession.songStartedMs) / 1000);
    const totalElapsed = Math.round((Date.now() - activeSession.sessionStartedMs) / 1000);
    document.getElementById("sr-session-clock").textContent = formatSeconds(songElapsed);
    document.getElementById("sr-session-total-time").textContent = `Tiempo de sesion: ${formatSeconds(totalElapsed)}`;
  }

  function renderSession() {
    const song = currentSessionSong();
    if (!song) {
      finishSession(false);
      return;
    }
    const status = getSongStatus(song.key);
    const total = activeSession.plan.songs.length;
    const index = activeSession.index;
    document.getElementById("sr-session-counter").textContent = `${index + 1} / ${total}`;
    document.getElementById("sr-session-progress-fill").style.width = `${((index + 1) / total) * 100}%`;
    document.getElementById("sr-session-status").innerHTML = `<span style="color:${STATUS[status].color}">${escapeHtml(STATUS[status].label)}</span>`;
    document.getElementById("sr-session-title").textContent = song.title;
    document.getElementById("sr-session-meta").textContent = [
      song.musicalKey ? `Tonalidad: ${song.musicalKey}` : "",
      song.tempo ? `Tempo: ${song.tempo}` : ""
    ].filter(Boolean).join(" · ");
    document.getElementById("sr-session-note").textContent = getSongRecord(song.key).note || "Sin notas de trabajo para esta cancion.";
    document.getElementById("sr-session-target").textContent = `Tiempo recomendado: ${song.plannedMinutes} min`;
    activeSession.songStartedMs = Date.now();
    renderSessionClocks();
  }

  function recordSessionResult(result) {
    const song = currentSessionSong();
    if (!song) return;
    const seconds = Math.max(1, Math.round((Date.now() - activeSession.songStartedMs) / 1000));
    activeSession.results.push({ key: song.key, title: song.title, result, seconds });
    if (result === "good") setSongStatus(song.key, "ready");
    if (result === "repeat") setSongStatus(song.key, "review");
    if (result === "blocked") setSongStatus(song.key, "blocked");
    activeSession.index++;
    activeSession.songStartedMs = Date.now();
    if (activeSession.index >= activeSession.plan.songs.length) finishSession(false);
    else renderSession();
  }

  function finishSession(partial) {
    if (!activeSession) return;
    clearInterval(sessionTimer);
    sessionTimer = null;
    state.sessions.unshift({
      id: `session_${Date.now()}`,
      rehearsalId: activeSession.rehearsalId,
      startedAt: activeSession.startedAt,
      endedAt: new Date().toISOString(),
      plannedMinutes: activeSession.plan.targetMinutes,
      partial: !!partial,
      results: activeSession.results,
      recordedBy: getIdentity()
    });
    state.sessions = state.sessions.slice(0, MAX_SESSIONS);
    activeSession = null;
    document.getElementById("sr-session-overlay")?.classList.remove("show");
    if (!IS_LOCAL_PREVIEW && typeof window.releaseWakeLock === "function") window.releaseWakeLock();
    queueSave();
    renderAll();
  }

  function wireEvents() {
    document.addEventListener("click", event => {
      const statusButton = event.target.closest("[data-sr-status][data-song-key]");
      if (statusButton) {
        setSongStatus(statusButton.dataset.songKey, statusButton.dataset.srStatus);
        return;
      }
      const noteButton = event.target.closest("[data-sr-note]");
      if (noteButton) {
        editSongNote(noteButton.dataset.srNote);
        return;
      }
      const openPlanButton = event.target.closest("[data-sr-open-plan]");
      if (openPlanButton) {
        openPlanScreen(openPlanButton.dataset.srOpenPlan);
        return;
      }
      if (event.target.closest("#sr-close-plan-screen")) {
        closePlanScreen();
        return;
      }
      const card = event.target.closest(".sr-rehearsal-card");
      if (card) {
        const record = updatePlanRecordFromCard(card);
        const id = card.dataset.rehearsalId;
        const addButton = event.target.closest("[data-sr-add]");
        if (addButton && record) {
          const type = addButton.dataset.srAdd;
          const key = card.querySelector(`[data-sr-picker="${type}"]`)?.value;
          if (key && !record[type].includes(key)) {
            record[type].push(key);
            const opposite = type === "required" ? "excluded" : "required";
            record[opposite] = record[opposite].filter(item => item !== key);
            record.plan = null;
            touchPlanRecord(record);
            queueSave();
            renderRehearsalPlans();
          }
          return;
        }
        const removeButton = event.target.closest("[data-sr-remove]");
        if (removeButton && record) {
          const type = removeButton.dataset.srRemove;
          record[type] = record[type].filter(key => key !== removeButton.dataset.songKey);
          record.plan = null;
          touchPlanRecord(record);
          queueSave();
          renderRehearsalPlans();
          return;
        }
        if (event.target.closest("[data-sr-generate]")) generatePlan(id);
        if (event.target.closest("[data-sr-start]")) startSession(id);
        if (event.target.closest("[data-sr-clear]")) clearPlan(id);
      }
      const resultButton = event.target.closest("[data-result]");
      if (resultButton && activeSession) {
        recordSessionResult(resultButton.dataset.result);
        return;
      }
      if (event.target.closest("#sr-finish-session") && activeSession) {
        if (confirm("Finalizar y guardar el progreso de este ensayo?")) finishSession(true);
        return;
      }
      if (event.target.closest("#sr-session-jukebox")) {
        const song = currentSessionSong();
        if (song) openJukeboxForSong(song);
        return;
      }
      if (event.target.closest("#sr-session-metronome")) {
        const song = currentSessionSong();
        if (song) startMetronomeForSong(song);
      }
    });

    document.addEventListener("change", event => {
      const card = event.target.closest(".sr-rehearsal-card");
      if (!card || !event.target.matches("[data-sr-source],.sr-focus")) return;
      updatePlanRecordFromCard(card);
      queueSave();
      renderRehearsalPlans();
    });

    document.addEventListener("input", event => {
      const card = event.target.closest(".sr-rehearsal-card");
      if (!card || !event.target.matches(".sr-objective")) return;
      updatePlanRecordFromCard(card);
      queueSave();
      renderRehearsalRowSummaries();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && activePlanScreenId && !activeSession) closePlanScreen();
    });
  }

  function init() {
    readLocalState();
    injectStyles();
    createSessionOverlay();
    createPlanScreen();
    wireEvents();
    renderAll();
    setTimeout(loadRemoteState, 1500);
    setTimeout(loadRemoteState, 6000);
    setInterval(() => {
      if (collectSongs()) renderAll();
      else decorateSetlistRows();
    }, 2500);

    window.SmartRehearsal = {
      render: renderAll,
      renderRehearsals: renderRehearsalPlans,
      generatePlan,
      startSession,
      getSongs: () => songs.slice(),
      getState: () => JSON.parse(JSON.stringify(state))
    };
    console.log("--- SMART REHEARSAL v2 cargado ---");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
