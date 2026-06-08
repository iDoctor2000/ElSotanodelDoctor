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

  let state = { songs: {}, sessions: [], rehearsalPlans: {}, actionItems: {} };
  let songs = [];
  let activeSession = null;
  let activePlanScreenId = null;
  let sessionTimer = null;
  let finishConfirmTimer = null;
  let saveTimer = null;
  let lastSongsFingerprint = "";
  let intelligenceFilters = { source: "all", status: "all" };

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

  function getNextFutureRehearsal(rehearsalIdValue) {
    const current = getRehearsals().find(rehearsal => rehearsalId(rehearsal) === rehearsalIdValue);
    const currentTime = current
      ? new Date(`${current.date}T${current.startTime || "00:00"}`).getTime()
      : 0;
    return getFutureRehearsals().find(rehearsal => {
      if (rehearsalId(rehearsal) === rehearsalIdValue) return false;
      const rehearsalTime = new Date(`${rehearsal.date}T${rehearsal.startTime || "00:00"}`).getTime();
      return !currentTime || rehearsalTime > currentTime;
    }) || null;
  }

  function getIdentity() {
    const selector = document.getElementById("user-identity-selector");
    return selector && selector.value ? selector.value : "Banda";
  }

  function ensureSessionId(session) {
    if (!session) return session;
    return session.id ? session : {
      ...session,
      id: `session_${sanitizeKey(session.endedAt || session.startedAt || session.rehearsalId || "legacy")}`
    };
  }

  function normalizeState(saved) {
    if (!saved || typeof saved !== "object") return;
    state.songs = saved.songs && typeof saved.songs === "object" ? saved.songs : state.songs;
    state.sessions = Array.isArray(saved.sessions) ? saved.sessions.map(ensureSessionId).slice(0, MAX_SESSIONS) : state.sessions;
    state.rehearsalPlans = saved.rehearsalPlans && typeof saved.rehearsalPlans === "object"
      ? saved.rehearsalPlans
      : state.rehearsalPlans;
    state.actionItems = saved.actionItems && typeof saved.actionItems === "object"
      ? saved.actionItems
      : state.actionItems;
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
      const normalizedSession = ensureSessionId(session);
      byId.set(normalizedSession.id, normalizedSession);
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
        rehearsalPlans: {},
        actionItems: {}
      });
      if (!remote || typeof remote !== "object") return;
      state.songs = mergeRecordMaps(remote.songs, state.songs, false);
      state.sessions = mergeSessions(remote.sessions, state.sessions);
      state.rehearsalPlans = mergeRecordMaps(remote.rehearsalPlans, state.rehearsalPlans, false);
      state.actionItems = mergeRecordMaps(remote.actionItems, state.actionItems, false);
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
            rehearsalPlans: mergeRecordMaps(remote.rehearsalPlans, localSnapshot.rehearsalPlans),
            actionItems: mergeRecordMaps(remote.actionItems, localSnapshot.actionItems)
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
          rehearsalPlans: {},
          actionItems: {}
        });
        state.songs = mergeRecordMaps(remote.songs, state.songs);
        state.sessions = mergeSessions(remote.sessions, state.sessions);
        state.rehearsalPlans = mergeRecordMaps(remote.rehearsalPlans, state.rehearsalPlans);
        state.actionItems = mergeRecordMaps(remote.actionItems, state.actionItems);
        await window.withRetry(() => window.saveDoc("intranet", DOC_ID, {
          songs: state.songs,
          sessions: state.sessions.slice(0, MAX_SESSIONS),
          rehearsalPlans: state.rehearsalPlans,
          actionItems: state.actionItems,
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

  function daysSince(dateValue) {
    const time = Date.parse(dateValue || "");
    if (!Number.isFinite(time)) return null;
    return Math.max(0, Math.floor((Date.now() - time) / 86400000));
  }

  function getUpcomingConcerts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from(document.querySelectorAll("#bandhelper-concerts-container table tbody tr"))
      .map(row => {
        const dateText = row.cells?.[0]?.textContent.trim() || "";
        const match = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!match) return null;
        let year = Number(match[3]);
        if (year < 100) year += year < 70 ? 2000 : 1900;
        const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
        return {
          date,
          dateText,
          title: row.cells?.[1]?.textContent.trim() || "Próximo concierto",
          days: Math.ceil((date.getTime() - today.getTime()) / 86400000)
        };
      })
      .filter(concert => concert && concert.days >= 0)
      .sort((a, b) => a.date - b.date);
  }

  function getNextConcertInfo() {
    return getUpcomingConcerts()[0] || null;
  }

  function songHistoryStats(songKey) {
    const entries = [];
    state.sessions.forEach(session => {
      (Array.isArray(session.results) ? session.results : []).forEach(result => {
        if (result?.key !== songKey) return;
        entries.push({
          ...result,
          sessionId: session.id,
          endedAt: session.endedAt || session.startedAt || ""
        });
      });
    });
    entries.sort((a, b) => Date.parse(b.endedAt || "") - Date.parse(a.endedAt || ""));
    const recent = entries.slice(0, 3);
    return {
      entries,
      sessions: new Set(entries.map(entry => entry.sessionId)).size,
      totalSeconds: entries.reduce((sum, entry) => sum + Number(entry.seconds || 0), 0),
      lastResult: entries[0]?.result || "",
      lastWorkedAt: entries[0]?.endedAt || "",
      daysSinceWorked: entries[0] ? daysSince(entries[0].endedAt) : null,
      recentProblems: recent.filter(entry => entry.result === "repeat" || entry.result === "blocked").length,
      readyCount: entries.filter(entry => entry.result === "good").length,
      repeatCount: entries.filter(entry => entry.result === "repeat").length,
      blockedCount: entries.filter(entry => entry.result === "blocked").length
    };
  }

  function priorityReasons(song, focus, required, history = songHistoryStats(song.key), nextConcert = getNextConcertInfo()) {
    const status = getSongStatus(song.key);
    const reasons = [];
    if (required) reasons.push("Marcada como imprescindible");
    if (status === "blocked") reasons.push("Está bloqueada");
    else if (status === "review") reasons.push("Necesita repaso");
    else if (status === "unknown") reasons.push("Pendiente de valorar");
    if (history.recentProblems >= 2) reasons.push(`${history.recentProblems} problemas recientes`);
    if (!history.entries.length) reasons.push("Nunca trabajada en Modo Ensayo");
    else if (history.daysSinceWorked >= 45) reasons.push(`${history.daysSinceWorked} días sin trabajar`);
    if (nextConcert && nextConcert.days <= 30 && (song.sources.includes("concert") || song.sources.includes("star"))) {
      reasons.push(`Concierto en ${nextConcert.days} días`);
    }
    if (focus === "concert" && (song.sources.includes("concert") || song.sources.includes("star"))) reasons.push("Enfoque concierto");
    if (focus === "problems" && (status === "blocked" || status === "review")) reasons.push("Enfoque problemas");
    return reasons.slice(0, 3);
  }

  function getActionItems(includeArchived = false) {
    return Object.values(state.actionItems || {})
      .filter(item => item && (includeArchived || !item.archived))
      .sort((a, b) => Number(a.done) - Number(b.done) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  }

  function songOpenTasks(songKey) {
    return getActionItems().filter(item => !item.done && item.songKey === songKey);
  }

  function knownPeople() {
    const values = Array.from(document.querySelectorAll("#user-identity-selector option"))
      .map(option => option.value)
      .filter(Boolean);
    return Array.from(new Set(["Banda", ...values]));
  }

  function defaultTaskDueDate() {
    const rehearsal = getFutureRehearsals()[0];
    if (rehearsal?.date) return rehearsal.date;
    const concert = getNextConcertInfo();
    if (concert?.date) {
      const year = concert.date.getFullYear();
      const month = String(concert.date.getMonth() + 1).padStart(2, "0");
      const day = String(concert.date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    const fallback = new Date(Date.now() + 7 * 86400000);
    return fallback.toISOString().slice(0, 10);
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
      .sr-plan-context { background:#17130b; border:1px solid rgba(255,181,46,.35); border-radius:8px; color:#ddd; font-size:.76em; padding:8px 10px; margin-bottom:8px; }
      .sr-plan-context strong { color:#ffb52e; }
      .sr-plan-item { display:grid; grid-template-columns:27px minmax(0,1fr) auto; gap:8px; align-items:center; padding:8px 4px; border-bottom:1px solid #292929; }
      .sr-plan-number { color:#ffb52e; font-weight:bold; text-align:center; }
      .sr-plan-time { color:#aaa; font-size:.78em; text-align:right; }
      .sr-priority-reasons { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
      .sr-priority-reason { background:#242017; border:1px solid #514427; border-radius:10px; color:#d8c28e; font-size:.65em; padding:2px 6px; }
      .sr-plan-order { display:flex; justify-content:flex-end; gap:4px; margin-top:4px; }
      .sr-plan-order button {
        width:26px; height:24px; border:1px solid #555; background:#222; color:#fff; border-radius:5px; cursor:pointer; padding:0;
      }
      .sr-plan-order button:disabled { opacity:.25; cursor:not-allowed; }
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
      #sr-session-overlay { display:none; position:fixed; inset:0; z-index:120000; background:radial-gradient(circle at top,#242424,#050505 70%); color:#fff; overflow-y:auto; overscroll-behavior:contain; }
      #sr-session-overlay.show { display:block; }
      .sr-session-shell { min-height:100%; max-width:900px; margin:0 auto; padding:24px 18px 40px; display:flex; flex-direction:column; justify-content:flex-start; }
      .sr-session-top { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:18px; color:#aaa; }
      .sr-session-progress { height:7px; background:#222; border-radius:10px; overflow:hidden; margin-bottom:28px; }
      .sr-session-progress > div { height:100%; background:#ffb52e; transition:width .25s; }
      .sr-session-title { font-size:clamp(2em,7vw,4.8em); line-height:1.05; text-align:center; margin:10px 0; }
      .sr-session-meta,.sr-session-note,.sr-session-target { text-align:center; color:#aaa; }
      .sr-session-note { max-width:650px; margin:18px auto; color:#ddd; min-height:1.4em; }
      .sr-session-clock { font-family:monospace; color:#ffb52e; font-size:clamp(2.2em,8vw,5em); text-align:center; margin:18px 0 5px; }
      .sr-session-target.overdue { color:#ff5353; font-weight:bold; }
      .sr-session-difference { text-align:center; color:#aaa; font-size:.8em; min-height:1.2em; }
      .sr-session-note-editor { max-width:650px; width:100%; margin:18px auto 0; }
      .sr-session-note-editor label { display:block; color:#ffb52e; font-size:.82em; font-weight:bold; margin-bottom:5px; }
      #sr-session-quick-note {
        width:100%; min-height:72px; resize:vertical; background:#151515; color:#fff; border:1px solid #444; border-radius:8px; padding:9px;
      }
      .sr-session-note-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:7px; }
      .sr-session-note-status { color:#66dd99; font-size:.75em; }
      .sr-session-tools,.sr-session-results { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; margin-top:12px; }
      .sr-session-tools button,.sr-session-results button,.sr-session-close { border:1px solid #555; background:#222; color:#fff; border-radius:9px; padding:12px 17px; cursor:pointer; font-weight:bold; }
      .sr-session-tools button.active { background:#ffb52e; color:#111; border-color:#ffb52e; }
      .sr-session-results button[data-result="good"] { background:#43d17a; color:#111; border-color:#43d17a; }
      .sr-session-results button[data-result="repeat"] { background:#ffb52e; color:#111; border-color:#ffb52e; }
      .sr-session-results button[data-result="blocked"] { background:#d93838; border-color:#ff5353; }
      .sr-session-results button:disabled { opacity:.35; cursor:not-allowed; }
      #sr-summary-overlay {
        display:none; position:fixed; inset:0; z-index:125000; overflow-y:auto; overscroll-behavior:contain;
        background:radial-gradient(circle at top,#242424,#050505 70%); color:#fff;
      }
      #sr-summary-overlay.show { display:block; }
      .sr-close-summary { border:1px solid #ffb52e; background:#171717; color:#ffb52e; border-radius:8px; padding:9px 12px; cursor:pointer; font-weight:bold; }
      .sr-summary-shell { min-height:100%; max-width:1000px; margin:0 auto; padding:22px 18px 40px; }
      .sr-summary-header { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:18px; }
      .sr-summary-header h2 { color:#ffb52e; margin:0 0 5px; }
      .sr-summary-header p { color:#aaa; margin:0; font-size:.82em; }
      .sr-close-stats { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px; margin:15px 0; }
      .sr-close-stat { background:#111; border:1px solid #333; border-radius:8px; padding:10px; text-align:center; }
      .sr-close-stat strong { display:block; font-size:1.45em; }
      .sr-close-stat span { color:#aaa; font-size:.72em; }
      .sr-close-grid { display:grid; grid-template-columns:1.15fr .85fr; gap:12px; }
      .sr-close-panel { background:rgba(0,0,0,.3); border:1px solid #333; border-radius:10px; padding:12px; margin-top:12px; }
      .sr-close-panel h3 { color:#ffb52e; margin:0 0 10px; font-size:1em; }
      .sr-close-result {
        display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; border-bottom:1px solid #292929; padding:8px 2px;
      }
      .sr-close-result:last-child { border-bottom:0; }
      .sr-close-result small { color:#aaa; }
      .sr-close-result-note { color:#ddd; font-size:.75em; margin-top:3px; }
      .sr-close-badge { border:1px solid #555; border-radius:12px; padding:3px 7px; font-size:.7em; height:max-content; }
      .sr-close-badge.good { color:#43d17a; border-color:#43d17a; }
      .sr-close-badge.repeat { color:#ffb52e; border-color:#ffb52e; }
      .sr-close-badge.blocked { color:#ff5353; border-color:#ff5353; }
      .sr-close-badge.skip,.sr-close-badge.unfinished { color:#aaa; }
      .sr-close-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
      .sr-close-actions button { border:1px solid #555; background:#222; color:#fff; border-radius:8px; padding:9px 12px; cursor:pointer; font-weight:bold; }
      .sr-close-actions button.primary { background:#ffb52e; border-color:#ffb52e; color:#111; }
      .sr-close-actions button:disabled { opacity:.4; cursor:not-allowed; }
      .sr-history-item { position:relative; padding-right:95px; }
      .sr-history-open { position:absolute; right:0; top:5px; border:1px solid #555; background:#222; color:#fff; border-radius:6px; padding:4px 7px; cursor:pointer; font-size:.7em; }
      #sr-intelligence-dashboard {
        max-width:1200px; margin:0 auto; padding:20px; background:#111; border-radius:12px;
        box-shadow:0 4px 15px rgba(0,204,255,.16); border:1px solid #222;
      }
      #sr-intelligence-dashboard > details > summary { color:#0cf; cursor:pointer; font-size:1.35em; font-weight:bold; text-align:center; list-style-position:inside; }
      .sr-dashboard-subtitle { color:#aaa; font-size:.8em; text-align:center; margin:8px 0 14px; }
      .sr-dashboard-toolbar { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin:10px 0 14px; }
      .sr-dashboard-toolbar select { background:#171717; border:1px solid #444; border-radius:7px; color:#fff; padding:7px 9px; }
      .sr-dashboard-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
      .sr-dashboard-card { background:#0b0b0b; border:1px solid #333; border-radius:9px; padding:10px; text-align:center; }
      .sr-dashboard-card strong { display:block; color:#ffb52e; font-size:1.45em; }
      .sr-dashboard-card span { color:#aaa; font-size:.72em; }
      .sr-dashboard-columns { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
      .sr-dashboard-list { max-height:310px; overflow-y:auto; }
      .sr-dashboard-song { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; border-bottom:1px solid #292929; padding:8px 2px; }
      .sr-dashboard-song:last-child { border-bottom:0; }
      .sr-dashboard-song small { color:#888; display:block; margin-top:3px; }
      .sr-dashboard-status { font-size:.7em; font-weight:bold; white-space:nowrap; }
      .sr-dashboard-concert { color:#ddd; font-size:.8em; text-align:center; margin:0 0 10px; }
      .sr-dashboard-concert strong { color:#ffb52e; }
      .sr-radar-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:10px; }
      .sr-radar-card { background:#0b0b0b; border:1px solid #333; border-radius:9px; padding:10px; }
      .sr-radar-card.high { border-color:#ff5353; }
      .sr-radar-card.medium { border-color:#ffb52e; }
      .sr-radar-card.low { border-color:#43d17a; }
      .sr-radar-heading { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
      .sr-radar-heading strong { color:#fff; }
      .sr-risk-badge { border:1px solid currentColor; border-radius:12px; font-size:.65em; font-weight:bold; padding:3px 6px; white-space:nowrap; }
      .sr-risk-badge.high { color:#ff5353; }
      .sr-risk-badge.medium { color:#ffb52e; }
      .sr-risk-badge.low { color:#43d17a; }
      .sr-readiness-bar { background:#222; border-radius:8px; height:7px; overflow:hidden; margin:9px 0 6px; }
      .sr-readiness-bar > span { display:block; height:100%; background:#43d17a; }
      .sr-radar-meta { color:#aaa; font-size:.72em; line-height:1.45; }
      .sr-task-form { display:grid; grid-template-columns:minmax(180px,1.5fr) minmax(140px,1fr) minmax(110px,.8fr) minmax(125px,.8fr) auto; gap:7px; margin-bottom:10px; }
      .sr-task-form input,.sr-task-form select { min-width:0; background:#171717; border:1px solid #444; border-radius:7px; color:#fff; padding:8px; }
      .sr-task-form button { border:0; border-radius:7px; padding:8px 12px; background:#ffb52e; color:#111; font-weight:bold; cursor:pointer; }
      .sr-task-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:8px; align-items:center; border-bottom:1px solid #292929; padding:8px 2px; }
      .sr-task-item.done strong { color:#777; text-decoration:line-through; }
      .sr-task-item small { color:#888; display:block; margin-top:3px; }
      .sr-task-actions { display:flex; gap:5px; }
      .sr-task-actions button { border:1px solid #555; background:#222; color:#ddd; border-radius:6px; padding:5px 7px; cursor:pointer; font-size:.68em; }
      .sr-task-overdue { color:#ff5353 !important; }
      .sr-task-marker { color:#b070ff; font-size:.68em; display:block; margin-top:4px; }
      @media(max-width:800px) {
        .sr-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .sr-song,.sr-rehearsal-grid { grid-template-columns:1fr; }
        .sr-status-controls { justify-content:flex-start; }
        .sr-song-list { max-height:none; }
        .sr-plan-screen-shell { padding:0 10px 20px; }
        .sr-plan-screen-top { align-items:flex-start; }
        .sr-plan-screen-title strong { font-size:.82em; }
        .sr-close-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .sr-close-grid { grid-template-columns:1fr; }
        .sr-summary-shell { padding:16px 10px 30px; }
        #sr-intelligence-dashboard { padding:14px 10px; }
        .sr-dashboard-grid,.sr-dashboard-columns { grid-template-columns:1fr 1fr; }
        .sr-radar-grid { grid-template-columns:1fr; }
        .sr-task-form { grid-template-columns:1fr 1fr; }
      }
      @media(max-width:520px) {
        .sr-dashboard-columns { grid-template-columns:1fr; }
        .sr-task-form { grid-template-columns:1fr; }
        .sr-task-item { grid-template-columns:auto minmax(0,1fr); }
        .sr-task-actions { grid-column:2; }
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
        <div id="sr-session-difference" class="sr-session-difference"></div>
        <div class="sr-session-note-editor">
          <label for="sr-session-quick-note">Nota rapida de esta cancion</label>
          <textarea id="sr-session-quick-note" placeholder="Ej: repetir entrada, ajustar coros, revisar final..."></textarea>
          <div class="sr-session-note-actions">
            <button id="sr-session-save-note" class="sr-session-close">Guardar nota</button>
            <span id="sr-session-note-status" class="sr-session-note-status"></span>
          </div>
        </div>
        <div class="sr-session-tools">
          <button id="sr-session-pause">Pausar</button>
          <button id="sr-session-add-time">+5 min a esta cancion</button>
          <button id="sr-session-jukebox">Abrir Jukebox</button>
          <button id="sr-session-metronome">Iniciar metronomo</button>
        </div>
        <div class="sr-session-results">
          <button data-result="good">Bien, queda lista</button>
          <button data-result="repeat">Necesita repeticion</button>
          <button data-result="blocked">Queda bloqueada</button>
          <button data-result="skip">Saltar cancion</button>
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

  function createSummaryOverlay() {
    if (document.getElementById("sr-summary-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "sr-summary-overlay";
    overlay.className = "modal-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div id="sr-summary-content"></div>';
    document.body.appendChild(overlay);
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
        focus: "smart",
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
    const problemSongs = planSongs.filter(song => ["blocked", "review"].includes(getSongStatus(song.key))).length;
    const contextMessages = [];
    if (plan.nextConcert) contextMessages.push(`Próximo concierto: ${plan.nextConcert.title} en ${plan.nextConcert.days} días`);
    if (problemSongs) contextMessages.push(`${problemSongs} canciones con problemas incluidas`);
    if (songsMinutes + plan.reserveMinutes > plan.targetMinutes) contextMessages.push("El plan supera el tiempo disponible");
    return `
      <div class="sr-plan-summary">
        <span>${planSongs.length} canciones</span>
        <span>${songsMinutes + plan.reserveMinutes} de ${plan.targetMinutes} min</span>
      </div>
      ${contextMessages.length ? `<div class="sr-plan-context"><strong>Lectura inteligente:</strong> ${escapeHtml(contextMessages.join(" · "))}</div>` : ""}
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
            ${(Array.isArray(song.reasons) ? song.reasons : priorityReasons(song, record.focus, record.required.includes(song.key))).length ? `
              <span class="sr-priority-reasons">
                ${(Array.isArray(song.reasons) ? song.reasons : priorityReasons(song, record.focus, record.required.includes(song.key))).map(reason => `<span class="sr-priority-reason">${escapeHtml(reason)}</span>`).join("")}
              </span>
            ` : ""}
            ${songOpenTasks(song.key).length ? `<span class="sr-task-marker">${songOpenTasks(song.key).length} tarea${songOpenTasks(song.key).length === 1 ? "" : "s"} pendiente${songOpenTasks(song.key).length === 1 ? "" : "s"}</span>` : ""}
          </span>
          <span class="sr-plan-time">
            ${song.plannedMinutes} min
            <span class="sr-plan-order">
              <button data-sr-move="up" data-song-key="${escapeHtml(song.key)}" title="Subir cancion" ${index === 0 ? "disabled" : ""}>↑</button>
              <button data-sr-move="down" data-song-key="${escapeHtml(song.key)}" title="Bajar cancion" ${index === planSongs.length - 1 ? "disabled" : ""}>↓</button>
            </span>
          </span>
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

  function resultLabel(result) {
    return {
      good: "Lista",
      repeat: "Necesita repaso",
      blocked: "Bloqueada",
      skip: "Saltada",
      unfinished: "Sin trabajar"
    }[result] || "Pendiente";
  }

  function sessionPendingItems(session) {
    const pending = new Map();
    (Array.isArray(session.results) ? session.results : []).forEach(result => {
      if (!result || result.result === "good" || !result.key) return;
      pending.set(result.key, { ...result });
    });
    (Array.isArray(session.unfinishedSongs) ? session.unfinishedSongs : []).forEach(song => {
      if (!song || !song.key || pending.has(song.key)) return;
      pending.set(song.key, { ...song, result: "unfinished", seconds: 0 });
    });
    return Array.from(pending.values());
  }

  function sessionStats(session) {
    const results = Array.isArray(session.results) ? session.results : [];
    const pending = sessionPendingItems(session);
    return {
      results,
      pending,
      ready: results.filter(result => result.result === "good").length,
      repeat: results.filter(result => result.result === "repeat").length,
      blocked: results.filter(result => result.result === "blocked").length,
      skipped: results.filter(result => result.result === "skip").length,
      actualSeconds: Number(session.actualSeconds || results.reduce((sum, result) => sum + Number(result.seconds || 0), 0)),
      plannedSeconds: Number(session.plannedMinutes || 0) * 60
    };
  }

  function sessionResultsHtml(items) {
    if (!items.length) return '<div class="sr-empty">No hay canciones en este apartado.</div>';
    return items.map(item => `
      <div class="sr-close-result">
        <div>
          <strong>${escapeHtml(item.title || item.key || "Cancion")}</strong>
          <small> · ${formatSeconds(item.seconds || 0)}${item.plannedMinutes ? ` / ${item.plannedMinutes} min previstos` : ""}</small>
          ${item.note ? `<div class="sr-close-result-note">${escapeHtml(item.note)}</div>` : ""}
        </div>
        <span class="sr-close-badge ${escapeHtml(item.result || "unfinished")}">${escapeHtml(resultLabel(item.result))}</span>
      </div>
    `).join("");
  }

  function sessionSummaryHtml(session) {
    const stats = sessionStats(session);
    const nextRehearsal = getNextFutureRehearsal(session.rehearsalId);
    const carried = session.carriedToRehearsalId && nextRehearsal && session.carriedToRehearsalId === rehearsalId(nextRehearsal);
    const date = new Date(session.endedAt || session.startedAt).toLocaleString("es-ES");
    const timeDifference = stats.plannedSeconds - stats.actualSeconds;
    const timeMessage = timeDifference >= 0
      ? `${formatSeconds(timeDifference)} por debajo del tiempo previsto`
      : `${formatSeconds(Math.abs(timeDifference))} por encima del tiempo previsto`;
    return `
      <div class="sr-summary-shell">
        <div class="sr-summary-header">
          <div>
            <h2>${session.partial ? "Ensayo finalizado parcialmente" : "Ensayo completado"}</h2>
            <p>${escapeHtml(date)} · registrado por ${escapeHtml(session.recordedBy || "Banda")}</p>
          </div>
          <button class="sr-close-summary" data-sr-close-summary>Cerrar resumen</button>
        </div>
        <div class="sr-close-stats">
          <div class="sr-close-stat"><strong>${stats.results.length}</strong><span>Trabajadas</span></div>
          <div class="sr-close-stat"><strong style="color:#43d17a">${stats.ready}</strong><span>Listas</span></div>
          <div class="sr-close-stat"><strong style="color:#ffb52e">${stats.repeat}</strong><span>Para repasar</span></div>
          <div class="sr-close-stat"><strong style="color:#ff5353">${stats.blocked}</strong><span>Bloqueadas</span></div>
          <div class="sr-close-stat"><strong>${stats.skipped}</strong><span>Saltadas</span></div>
          <div class="sr-close-stat"><strong>${stats.pending.length}</strong><span>Próximas prioridades</span></div>
        </div>
        <div class="sr-close-panel">
          <h3>Tiempo del ensayo</h3>
          <strong>${formatSeconds(stats.actualSeconds)} reales / ${formatSeconds(stats.plannedSeconds)} previstos</strong>
          <div class="sr-row-meta">${escapeHtml(timeMessage)}</div>
        </div>
        <div class="sr-close-grid">
          <div class="sr-close-panel">
            <h3>Resultado canción por canción</h3>
            ${sessionResultsHtml(stats.results)}
          </div>
          <div>
            <div class="sr-close-panel">
              <h3>Propuesta para el próximo ensayo</h3>
              ${sessionResultsHtml(stats.pending)}
              <div class="sr-close-actions">
                <button class="primary" data-sr-carry-forward="${escapeHtml(session.id)}" ${!nextRehearsal || !stats.pending.length || carried ? "disabled" : ""}>
                  ${carried ? "Prioridades ya añadidas" : "Añadir prioridades al próximo ensayo"}
                </button>
                ${nextRehearsal ? `<button data-sr-open-next-plan="${escapeHtml(rehearsalId(nextRehearsal))}">Abrir próximo plan</button>` : ""}
              </div>
              <div class="sr-row-meta" style="margin-top:8px;">
                ${nextRehearsal ? `Próximo: ${escapeHtml(formatRehearsalDate(nextRehearsal))}` : "Todavía no hay otro ensayo programado."}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function historyHtml(rehearsalIdValue) {
    const sessions = state.sessions.filter(session => session.rehearsalId === rehearsalIdValue).slice(0, 5);
    if (!sessions.length) return '<div class="sr-empty">Este ensayo aun no tiene sesiones registradas.</div>';
    return sessions.map(session => {
      const stats = sessionStats(session);
      return `
        <div class="sr-history-item">
          <strong>${new Date(session.endedAt || session.startedAt).toLocaleString("es-ES")}</strong>
          · ${stats.results.length} canciones · ${stats.ready} listas · ${stats.pending.length} prioridades · ${formatSeconds(stats.actualSeconds)}
          <button class="sr-history-open" data-sr-open-summary="${escapeHtml(session.id)}">Ver resumen</button>
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
              <option value="smart" ${record.focus === "smart" ? "selected" : ""}>Prioridad inteligente (recomendado)</option>
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

  function closeSessionSummary() {
    const overlay = document.getElementById("sr-summary-overlay");
    if (!overlay) return;
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
  }

  function showSessionSummary(sessionOrId) {
    const session = typeof sessionOrId === "string"
      ? state.sessions.find(item => item.id === sessionOrId)
      : sessionOrId;
    const overlay = document.getElementById("sr-summary-overlay");
    const content = document.getElementById("sr-summary-content");
    if (!session || !overlay || !content) return;
    content.innerHTML = sessionSummaryHtml(session);
    overlay.scrollTop = 0;
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

  function carrySessionPrioritiesForward(sessionId) {
    const session = state.sessions.find(item => item.id === sessionId);
    if (!session) return;
    const pending = sessionPendingItems(session);
    const nextRehearsal = getNextFutureRehearsal(session.rehearsalId);
    if (!pending.length || !nextRehearsal) return;
    const record = getPlanRecord(nextRehearsal);
    const pendingKeys = pending.map(item => item.key).filter(Boolean);
    record.required = Array.from(new Set([...record.required, ...pendingKeys]));
    record.excluded = record.excluded.filter(key => !pendingKeys.includes(key));
    record.plan = null;
    touchPlanRecord(record);
    session.carriedToRehearsalId = rehearsalId(nextRehearsal);
    session.carriedAt = new Date().toISOString();
    queueSave();
    renderAll();
    showSessionSummary(session);
  }

  function renderRehearsalPlans() {
    document.getElementById("sr-rehearsal-plans")?.remove();
    renderRehearsalRowSummaries();
    if (activePlanScreenId) renderPlanScreen(activePlanScreenId);
  }

  function getRehearsalById(id) {
    return getRehearsals().find(rehearsal => rehearsalId(rehearsal) === id);
  }

  function scoreSong(song, focus, required, history = songHistoryStats(song.key), nextConcert = getNextConcertInfo()) {
    const status = getSongStatus(song.key);
    let score = STATUS[status].score;
    if (required) score += 1000;
    if (song.sources.includes("star")) score += 32;
    if (song.sources.includes("concert")) score += 25;
    if (song.sources.includes("rehearsal")) score += 12;
    if (!window.jukeboxLibrary || !window.jukeboxLibrary[song.key]) score += 5;
    if (!history.entries.length) score += 35;
    if (history.lastResult === "blocked") score += 75;
    if (history.lastResult === "repeat") score += 45;
    score += Math.min(history.recentProblems * 35, 105);
    if (history.daysSinceWorked >= 30) score += Math.min(Math.floor(history.daysSinceWorked / 10) * 8, 80);
    if (status === "ready" && history.daysSinceWorked !== null && history.daysSinceWorked < 14) score -= 45;
    if (nextConcert && (song.sources.includes("concert") || song.sources.includes("star"))) {
      if (nextConcert.days <= 7) score += 150;
      else if (nextConcert.days <= 14) score += 110;
      else if (nextConcert.days <= 30) score += 70;
    }
    if (focus === "smart") {
      if (status === "blocked" || status === "review") score += 70;
      if (!history.entries.length || history.daysSinceWorked >= 45) score += 45;
    }
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
    const nextConcert = getNextConcertInfo();
    const candidates = selectedSongsForRecord(record)
      .filter(song => !record.excluded.includes(song.key))
      .map(song => {
        const required = record.required.includes(song.key);
        const history = songHistoryStats(song.key);
        return {
          ...song,
          score: scoreSong(song, record.focus, required, history, nextConcert),
          reasons: priorityReasons(song, record.focus, required, history, nextConcert),
          plannedMinutes: estimateSongMinutes(song)
        };
      })
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
      nextConcert: nextConcert ? {
        title: nextConcert.title,
        dateText: nextConcert.dateText,
        days: nextConcert.days
      } : null,
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

  function movePlanSong(id, songKey, direction) {
    const rehearsal = getRehearsalById(id);
    if (!rehearsal) return;
    const record = getPlanRecord(rehearsal);
    const planSongs = record.plan && Array.isArray(record.plan.songs) ? record.plan.songs : [];
    const currentIndex = planSongs.findIndex(song => song.key === songKey);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= planSongs.length) return;
    planSongs.splice(targetIndex, 0, planSongs.splice(currentIndex, 1)[0]);
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
    record.focus = card.querySelector(".sr-focus")?.value || "smart";
    record.sources = Array.from(card.querySelectorAll("[data-sr-source]:checked")).map(input => input.dataset.srSource);
    if (!record.sources.length) record.sources = ["rehearsal"];
    const nextSources = record.sources.slice().sort().join(",");
    if (record.focus !== previousFocus || nextSources !== previousSources) record.plan = null;
    if (record.objective !== previousObjective || record.focus !== previousFocus || nextSources !== previousSources) touchPlanRecord(record);
    return record;
  }

  function dashboardTime(seconds) {
    const totalMinutes = Math.round((Number(seconds) || 0) / 60);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} h${minutes ? ` ${minutes} min` : ""}`;
  }

  function dashboardSongHtml(item, detail) {
    const status = getSongStatus(item.song.key);
    return `
      <div class="sr-dashboard-song">
        <div>
          <strong>${escapeHtml(item.song.title)}</strong>
          <small>${escapeHtml(detail)}</small>
        </div>
        <span class="sr-dashboard-status" style="color:${STATUS[status].color}">${escapeHtml(STATUS[status].label)}</span>
      </div>
    `;
  }

  function concertRadarData(concert) {
    let concertSongs = songs.filter(song => song.sources.includes("concert"));
    if (!concertSongs.length) concertSongs = songs.filter(song => song.sources.includes("star"));
    const analytics = concertSongs.map(song => {
      const history = songHistoryStats(song.key);
      return {
        song,
        history,
        score: scoreSong(song, "concert", false, history, concert)
      };
    });
    const weights = { ready: 100, review: 55, unknown: 25, blocked: 0 };
    const readiness = analytics.length
      ? Math.round(analytics.reduce((sum, item) => sum + weights[getSongStatus(item.song.key)], 0) / analytics.length)
      : 0;
    const critical = analytics
      .filter(item => getSongStatus(item.song.key) !== "ready" || item.history.recentProblems)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const blocked = analytics.filter(item => getSongStatus(item.song.key) === "blocked").length;
    const review = analytics.filter(item => getSongStatus(item.song.key) === "review").length;
    const unknown = analytics.filter(item => getSongStatus(item.song.key) === "unknown").length;
    const recommendedMinutes = critical.reduce((sum, item) => sum + estimateSongMinutes(item.song), 0);
    let risk = "low";
    if (readiness < 65 || (concert.days <= 30 && blocked > 0) || (concert.days <= 14 && critical.length > 0)) risk = "high";
    else if (readiness < 85 || blocked > 0 || (concert.days <= 45 && (review > 0 || unknown > 0))) risk = "medium";
    return { concert, concertSongs, analytics, readiness, critical, blocked, review, unknown, recommendedMinutes, risk };
  }

  function riskLabel(risk) {
    return { high: "Riesgo alto", medium: "Riesgo medio", low: "Riesgo bajo" }[risk] || "Sin datos";
  }

  function radarHtml() {
    const radars = getUpcomingConcerts().slice(0, 3).map(concertRadarData);
    if (!radars.length) return '<div class="sr-empty">Todavía no hay conciertos próximos para analizar.</div>';
    return `
      <div class="sr-radar-grid">
        ${radars.map((radar, index) => `
          <article class="sr-radar-card ${radar.risk}">
            <div class="sr-radar-heading">
              <strong>${escapeHtml(radar.concert.title)}</strong>
              <span class="sr-risk-badge ${radar.risk}">${escapeHtml(riskLabel(radar.risk))}</span>
            </div>
            <div class="sr-readiness-bar"><span style="width:${radar.readiness}%"></span></div>
            <div class="sr-radar-meta">
              ${radar.readiness}% preparada · dentro de ${radar.concert.days} días<br>
              ${radar.blocked} bloqueadas · ${radar.review} para repasar · ${radar.unknown} sin valorar<br>
              Recomendación: reservar ${radar.recommendedMinutes} min para ${radar.critical.length} canciones críticas
            </div>
            ${index === 0 && radar.critical.length ? `
              <div class="sr-actions">
                <button class="sr-small-btn" data-sr-create-radar-tasks>Crear tareas críticas</button>
              </div>
            ` : ""}
          </article>
        `).join("")}
      </div>
    `;
  }

  function taskSongOptionsHtml() {
    return `<option value="">Sin canción concreta</option>${songs.map(song => `<option value="${escapeHtml(song.key)}">${escapeHtml(song.title)}</option>`).join("")}`;
  }

  function taskOwnerOptionsHtml() {
    return knownPeople().map(person => `<option value="${escapeHtml(person)}" ${person === getIdentity() ? "selected" : ""}>${escapeHtml(person)}</option>`).join("");
  }

  function taskListHtml() {
    const tasks = getActionItems().slice(0, 20);
    if (!tasks.length) return '<div class="sr-empty">No hay tareas pendientes. El radar puede crear las primeras automáticamente.</div>';
    const today = new Date().toISOString().slice(0, 10);
    return tasks.map(task => {
      const song = songs.find(item => item.key === task.songKey);
      const overdue = !task.done && task.dueDate && task.dueDate < today;
      return `
        <div class="sr-task-item ${task.done ? "done" : ""}">
          <button class="sr-small-btn" data-sr-toggle-task="${escapeHtml(task.id)}" title="${task.done ? "Reabrir tarea" : "Marcar como completada"}">${task.done ? "↺" : "✓"}</button>
          <div>
            <strong>${escapeHtml(task.title)}</strong>
            <small class="${overdue ? "sr-task-overdue" : ""}">
              ${song ? `${escapeHtml(song.title)} · ` : ""}${escapeHtml(task.owner || "Banda")} · ${task.dueDate ? `límite ${new Date(`${task.dueDate}T00:00:00`).toLocaleDateString("es-ES")}` : "sin fecha límite"}
            </small>
          </div>
          <div class="sr-task-actions">
            <button data-sr-archive-task="${escapeHtml(task.id)}">Quitar</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function tasksPanelHtml() {
    return `
      <div class="sr-panel" style="margin-top:10px;">
        <h4>Tareas entre ensayos</h4>
        <div class="sr-task-form">
          <input data-sr-task-title placeholder="Acción concreta: revisar entrada, preparar coros...">
          <select data-sr-task-song>${taskSongOptionsHtml()}</select>
          <select data-sr-task-owner>${taskOwnerOptionsHtml()}</select>
          <input data-sr-task-due type="date" value="${escapeHtml(defaultTaskDueDate())}">
          <button data-sr-add-task>Añadir tarea</button>
        </div>
        <div class="sr-dashboard-list">${taskListHtml()}</div>
      </div>
    `;
  }

  function addActionItem(title, songKey, owner, dueDate) {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) return false;
    const now = new Date().toISOString();
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    state.actionItems[id] = {
      id,
      title: cleanTitle,
      songKey: songKey || "",
      owner: owner || "Banda",
      dueDate: dueDate || "",
      done: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      updatedBy: getIdentity()
    };
    queueSave();
    renderAll();
    return true;
  }

  function updateActionItem(id, changes) {
    const task = state.actionItems[id];
    if (!task) return;
    state.actionItems[id] = {
      ...task,
      ...changes,
      updatedAt: new Date().toISOString(),
      updatedBy: getIdentity()
    };
    queueSave();
    renderAll();
  }

  function createRadarTasks() {
    const concert = getNextConcertInfo();
    if (!concert) return;
    const radar = concertRadarData(concert);
    const dueDate = defaultTaskDueDate();
    radar.critical.slice(0, 3).forEach(item => {
      if (songOpenTasks(item.song.key).length) return;
      const now = new Date().toISOString();
      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      state.actionItems[id] = {
        id,
        title: `Resolver prioridad antes de ${concert.title}`,
        songKey: item.song.key,
        owner: "Banda",
        dueDate,
        done: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        updatedBy: getIdentity()
      };
    });
    queueSave();
    renderAll();
  }

  function renderIntelligenceDashboard() {
    const rehearsalsSection = document.getElementById("rehearsals");
    if (!rehearsalsSection) return;
    let section = document.getElementById("sr-intelligence-dashboard");
    if (!section) {
      section = document.createElement("section");
      section.id = "sr-intelligence-dashboard";
      rehearsalsSection.insertAdjacentElement("afterend", section);
    }
    const wasOpen = section.querySelector("details")?.open || false;
    const filteredSongs = songs.filter(song => {
      const sourceMatches = intelligenceFilters.source === "all" || song.sources.includes(intelligenceFilters.source);
      const statusMatches = intelligenceFilters.status === "all" || getSongStatus(song.key) === intelligenceFilters.status;
      return sourceMatches && statusMatches;
    });
    const analytics = filteredSongs.map(song => ({ song, history: songHistoryStats(song.key) }));
    const counts = { ready: 0, review: 0, blocked: 0, unknown: 0 };
    filteredSongs.forEach(song => counts[getSongStatus(song.key)]++);
    const readiness = filteredSongs.length ? Math.round((counts.ready / filteredSongs.length) * 100) : 0;
    const worked = analytics.filter(item => item.history.entries.length).length;
    const totalSeconds = analytics.reduce((sum, item) => sum + item.history.totalSeconds, 0);
    const nextConcert = getNextConcertInfo();
    const priorities = analytics
      .map(item => ({
        ...item,
        score: scoreSong(item.song, "smart", false, item.history, nextConcert),
        reasons: priorityReasons(item.song, "smart", false, item.history, nextConcert)
      }))
      .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, "es"))
      .slice(0, 6);
    const mostWorked = analytics
      .filter(item => item.history.totalSeconds > 0)
      .sort((a, b) => b.history.totalSeconds - a.history.totalSeconds)
      .slice(0, 6);
    const recentSessions = state.sessions.slice(0, 5);

    section.innerHTML = `
      <details ${wasOpen ? "open" : ""}>
        <summary>Evolución e historial inteligente</summary>
        <p class="sr-dashboard-subtitle">Una lectura práctica del repertorio basada en el semáforo y en los resultados reales del Modo Ensayo.</p>
        ${nextConcert ? `<p class="sr-dashboard-concert"><strong>Próximo concierto:</strong> ${escapeHtml(nextConcert.title)} · dentro de ${nextConcert.days} días</p>` : ""}
        <div class="sr-dashboard-toolbar">
          <label>
            <span class="sr-row-meta">Setlist</span>
            <select data-sr-dashboard-filter="source">
              <option value="all" ${intelligenceFilters.source === "all" ? "selected" : ""}>Todos</option>
              ${Object.entries(SOURCES).map(([source, config]) => `<option value="${source}" ${intelligenceFilters.source === source ? "selected" : ""}>${escapeHtml(config.short)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span class="sr-row-meta">Estado</span>
            <select data-sr-dashboard-filter="status">
              <option value="all" ${intelligenceFilters.status === "all" ? "selected" : ""}>Todos</option>
              ${Object.entries(STATUS).map(([status, config]) => `<option value="${status}" ${intelligenceFilters.status === status ? "selected" : ""}>${escapeHtml(config.label)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="sr-dashboard-grid">
          <div class="sr-dashboard-card"><strong>${readiness}%</strong><span>Preparación</span></div>
          <div class="sr-dashboard-card"><strong>${worked}/${filteredSongs.length}</strong><span>Canciones trabajadas</span></div>
          <div class="sr-dashboard-card"><strong>${dashboardTime(totalSeconds)}</strong><span>Tiempo real registrado</span></div>
          <div class="sr-dashboard-card"><strong style="color:${STATUS.blocked.color}">${counts.blocked}</strong><span>Bloqueadas</span></div>
        </div>
        <div class="sr-panel" style="margin-top:10px;">
          <h4>Radar de preparación para conciertos</h4>
          ${radarHtml()}
        </div>
        <div class="sr-dashboard-columns">
          <div class="sr-panel">
            <h4>Prioridades automáticas ahora</h4>
            <div class="sr-dashboard-list">
              ${priorities.length ? priorities.map(item => dashboardSongHtml(item, item.reasons.join(" · ") || "Prioridad equilibrada")).join("") : '<div class="sr-empty">No hay canciones para este filtro.</div>'}
            </div>
          </div>
          <div class="sr-panel">
            <h4>Canciones más trabajadas</h4>
            <div class="sr-dashboard-list">
              ${mostWorked.length ? mostWorked.map(item => dashboardSongHtml(item, `${item.history.sessions} sesiones · ${dashboardTime(item.history.totalSeconds)} · último resultado: ${resultLabel(item.history.lastResult)}`)).join("") : '<div class="sr-empty">Aún no hay tiempo registrado con estos filtros.</div>'}
            </div>
          </div>
        </div>
        ${tasksPanelHtml()}
        <div class="sr-panel" style="margin-top:10px;">
          <h4>Sesiones recientes</h4>
          ${recentSessions.length ? recentSessions.map(session => {
            const stats = sessionStats(session);
            return `
              <div class="sr-history-item">
                <strong>${new Date(session.endedAt || session.startedAt).toLocaleString("es-ES")}</strong>
                · ${stats.results.length} trabajadas · ${stats.pending.length} pendientes · ${dashboardTime(stats.actualSeconds)}
                <button class="sr-history-open" data-sr-open-summary="${escapeHtml(session.id)}">Ver resumen</button>
              </div>
            `;
          }).join("") : '<div class="sr-empty">Aún no hay sesiones registradas.</div>'}
        </div>
      </details>
    `;
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
    renderIntelligenceDashboard();
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
    const sessionPlan = JSON.parse(JSON.stringify(record.plan));
    sessionPlan.songs = sessionPlan.songs.map(song => ({
      ...song,
      originalPlannedMinutes: Number(song.plannedMinutes || 0)
    }));
    activeSession = {
      rehearsalId: id,
      plan: sessionPlan,
      startedAt: new Date().toISOString(),
      sessionStartedMs: Date.now(),
      sessionPausedMs: 0,
      songStartedMs: Date.now(),
      songPausedMs: 0,
      pauseStartedMs: null,
      paused: false,
      index: 0,
      results: [],
      quickNotes: {}
    };
    document.getElementById("sr-session-overlay")?.classList.add("show");
    const finishButton = document.getElementById("sr-finish-session");
    if (finishButton) {
      finishButton.textContent = "Finalizar ensayo";
      delete finishButton.dataset.confirming;
    }
    if (!IS_LOCAL_PREVIEW && typeof window.requestWakeLock === "function") window.requestWakeLock();
    clearInterval(sessionTimer);
    sessionTimer = setInterval(renderSessionClocks, 1000);
    renderSession();
  }

  function currentSessionSong() {
    return activeSession && activeSession.plan && activeSession.plan.songs[activeSession.index];
  }

  function elapsedSeconds(startedMs, pausedMs) {
    if (!activeSession || !startedMs) return 0;
    const effectiveNow = activeSession.paused && activeSession.pauseStartedMs ? activeSession.pauseStartedMs : Date.now();
    return Math.max(0, Math.round((effectiveNow - startedMs - Number(pausedMs || 0)) / 1000));
  }

  function sessionSongElapsedSeconds() {
    return elapsedSeconds(activeSession?.songStartedMs, activeSession?.songPausedMs);
  }

  function sessionTotalElapsedSeconds() {
    return elapsedSeconds(activeSession?.sessionStartedMs, activeSession?.sessionPausedMs);
  }

  function renderSessionClocks() {
    if (!activeSession) return;
    const song = currentSessionSong();
    if (!song) return;
    const songElapsed = sessionSongElapsedSeconds();
    const totalElapsed = sessionTotalElapsedSeconds();
    const songTarget = Math.max(0, Number(song.plannedMinutes || 0) * 60);
    const totalTarget = Math.max(0, Number(activeSession.plan.targetMinutes || 0) * 60);
    const difference = songTarget - songElapsed;
    document.getElementById("sr-session-clock").textContent = `${formatSeconds(songElapsed)} / ${formatSeconds(songTarget)}`;
    document.getElementById("sr-session-total-time").textContent = `Ensayo: ${formatSeconds(totalElapsed)} / ${formatSeconds(totalTarget)}`;
    const target = document.getElementById("sr-session-target");
    target.textContent = `Tiempo previsto para esta cancion: ${song.plannedMinutes} min`;
    target.classList.toggle("overdue", difference < 0);
    document.getElementById("sr-session-difference").textContent = difference >= 0
      ? `Quedan ${formatSeconds(difference)} del tiempo previsto`
      : `Tiempo excedido: ${formatSeconds(Math.abs(difference))}`;
    const pauseButton = document.getElementById("sr-session-pause");
    pauseButton.textContent = activeSession.paused ? "Reanudar" : "Pausar";
    pauseButton.classList.toggle("active", activeSession.paused);
    document.querySelectorAll("#sr-session-overlay [data-result]").forEach(button => {
      button.disabled = activeSession.paused;
    });
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
    const savedNote = activeSession.quickNotes[song.key] ?? getSongRecord(song.key).note ?? "";
    document.getElementById("sr-session-note").textContent = savedNote || "Sin notas de trabajo para esta cancion.";
    document.getElementById("sr-session-quick-note").value = savedNote;
    document.getElementById("sr-session-note-status").textContent = "";
    activeSession.songStartedMs = Date.now();
    activeSession.songPausedMs = 0;
    renderSessionClocks();
  }

  function saveSessionQuickNote(showConfirmation = true) {
    const song = currentSessionSong();
    const field = document.getElementById("sr-session-quick-note");
    if (!activeSession || !song || !field) return "";
    const note = field.value.trim();
    activeSession.quickNotes[song.key] = note;
    state.songs[song.key] = {
      ...getSongRecord(song.key),
      note,
      updatedAt: new Date().toISOString(),
      updatedBy: getIdentity()
    };
    document.getElementById("sr-session-note").textContent = note || "Sin notas de trabajo para esta cancion.";
    if (showConfirmation) document.getElementById("sr-session-note-status").textContent = "Nota guardada";
    queueSave();
    return note;
  }

  function toggleSessionPause() {
    if (!activeSession) return;
    if (!activeSession.paused) {
      activeSession.paused = true;
      activeSession.pauseStartedMs = Date.now();
    } else {
      const pausedFor = Math.max(0, Date.now() - activeSession.pauseStartedMs);
      activeSession.sessionPausedMs += pausedFor;
      activeSession.songPausedMs += pausedFor;
      activeSession.pauseStartedMs = null;
      activeSession.paused = false;
    }
    renderSessionClocks();
  }

  function extendCurrentSongTime() {
    const song = currentSessionSong();
    if (!activeSession || !song) return;
    song.plannedMinutes = Number(song.plannedMinutes || 0) + 5;
    document.getElementById("sr-session-note-status").textContent = "Tiempo previsto ampliado en 5 minutos";
    renderSessionClocks();
  }

  function recordSessionResult(result) {
    const song = currentSessionSong();
    if (!song) return;
    if (activeSession.paused) {
      alert("Reanuda el ensayo antes de registrar el resultado.");
      return;
    }
    const seconds = Math.max(1, sessionSongElapsedSeconds());
    const note = saveSessionQuickNote(false);
    activeSession.results.push({
      key: song.key,
      title: song.title,
      result,
      seconds,
      plannedMinutes: Number(song.plannedMinutes || 0),
      extendedMinutes: Math.max(0, Number(song.plannedMinutes || 0) - Number(song.originalPlannedMinutes || 0)),
      note
    });
    if (result === "good") setSongStatus(song.key, "ready");
    if (result === "repeat") setSongStatus(song.key, "review");
    if (result === "blocked") setSongStatus(song.key, "blocked");
    activeSession.index++;
    activeSession.songStartedMs = Date.now();
    activeSession.songPausedMs = 0;
    if (activeSession.index >= activeSession.plan.songs.length) finishSession(false);
    else renderSession();
  }

  function finishSession(partial) {
    if (!activeSession) return;
    saveSessionQuickNote(false);
    clearInterval(sessionTimer);
    sessionTimer = null;
    clearTimeout(finishConfirmTimer);
    finishConfirmTimer = null;
    const plannedSongs = activeSession.plan.songs.map(song => ({
      key: song.key,
      title: song.title,
      plannedMinutes: Number(song.plannedMinutes || 0)
    }));
    const unfinishedSongs = activeSession.plan.songs.slice(activeSession.index).map(song => ({
      key: song.key,
      title: song.title,
      plannedMinutes: Number(song.plannedMinutes || 0),
      note: activeSession.quickNotes[song.key] || getSongRecord(song.key).note || ""
    }));
    const completedSession = {
      id: `session_${Date.now()}`,
      rehearsalId: activeSession.rehearsalId,
      startedAt: activeSession.startedAt,
      endedAt: new Date().toISOString(),
      plannedMinutes: activeSession.plan.targetMinutes,
      actualSeconds: sessionTotalElapsedSeconds(),
      partial: !!partial,
      results: activeSession.results,
      plannedSongs,
      unfinishedSongs,
      recordedBy: getIdentity()
    };
    state.sessions.unshift(completedSession);
    state.sessions = state.sessions.slice(0, MAX_SESSIONS);
    activeSession = null;
    document.getElementById("sr-session-overlay")?.classList.remove("show");
    if (!IS_LOCAL_PREVIEW && typeof window.releaseWakeLock === "function") window.releaseWakeLock();
    queueSave();
    renderAll();
    showSessionSummary(completedSession);
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
      const openSummaryButton = event.target.closest("[data-sr-open-summary]");
      if (openSummaryButton) {
        showSessionSummary(openSummaryButton.dataset.srOpenSummary);
        return;
      }
      if (event.target.closest("[data-sr-close-summary]")) {
        closeSessionSummary();
        return;
      }
      const carryForwardButton = event.target.closest("[data-sr-carry-forward]");
      if (carryForwardButton) {
        carrySessionPrioritiesForward(carryForwardButton.dataset.srCarryForward);
        return;
      }
      const openNextPlanButton = event.target.closest("[data-sr-open-next-plan]");
      if (openNextPlanButton) {
        closeSessionSummary();
        openPlanScreen(openNextPlanButton.dataset.srOpenNextPlan);
        return;
      }
      if (event.target.closest("[data-sr-create-radar-tasks]")) {
        createRadarTasks();
        return;
      }
      if (event.target.closest("[data-sr-add-task]")) {
        const dashboard = event.target.closest("#sr-intelligence-dashboard");
        if (!dashboard) return;
        const title = dashboard.querySelector("[data-sr-task-title]")?.value || "";
        const songKey = dashboard.querySelector("[data-sr-task-song]")?.value || "";
        const owner = dashboard.querySelector("[data-sr-task-owner]")?.value || "Banda";
        const dueDate = dashboard.querySelector("[data-sr-task-due]")?.value || "";
        if (!addActionItem(title, songKey, owner, dueDate)) alert("Escribe una acción concreta antes de añadir la tarea.");
        return;
      }
      const toggleTaskButton = event.target.closest("[data-sr-toggle-task]");
      if (toggleTaskButton) {
        const task = state.actionItems[toggleTaskButton.dataset.srToggleTask];
        if (task) updateActionItem(task.id, { done: !task.done, completedAt: task.done ? null : new Date().toISOString() });
        return;
      }
      const archiveTaskButton = event.target.closest("[data-sr-archive-task]");
      if (archiveTaskButton) {
        updateActionItem(archiveTaskButton.dataset.srArchiveTask, { archived: true });
        return;
      }
      const card = event.target.closest(".sr-rehearsal-card");
      if (card) {
        const record = updatePlanRecordFromCard(card);
        const id = card.dataset.rehearsalId;
        const moveButton = event.target.closest("[data-sr-move]");
        if (moveButton) {
          movePlanSong(id, moveButton.dataset.songKey, moveButton.dataset.srMove);
          return;
        }
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
        const finishButton = event.target.closest("#sr-finish-session");
        if (finishButton.dataset.confirming === "true") {
          finishSession(true);
        } else {
          finishButton.dataset.confirming = "true";
          finishButton.textContent = "Confirmar finalización";
          clearTimeout(finishConfirmTimer);
          finishConfirmTimer = setTimeout(() => {
            if (!activeSession) return;
            finishButton.textContent = "Finalizar ensayo";
            delete finishButton.dataset.confirming;
          }, 5000);
        }
        return;
      }
      if (event.target.closest("#sr-session-save-note")) {
        saveSessionQuickNote();
        return;
      }
      if (event.target.closest("#sr-session-pause")) {
        toggleSessionPause();
        return;
      }
      if (event.target.closest("#sr-session-add-time")) {
        extendCurrentSongTime();
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
      const dashboardFilter = event.target.closest("[data-sr-dashboard-filter]");
      if (dashboardFilter) {
        intelligenceFilters[dashboardFilter.dataset.srDashboardFilter] = dashboardFilter.value;
        renderIntelligenceDashboard();
        return;
      }
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
      if (event.key !== "Escape" || activeSession) return;
      if (document.getElementById("sr-summary-overlay")?.classList.contains("show")) closeSessionSummary();
      else if (activePlanScreenId) closePlanScreen();
    });
  }

  function init() {
    readLocalState();
    injectStyles();
    createSessionOverlay();
    createPlanScreen();
    createSummaryOverlay();
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
      getSongHistory: songHistoryStats,
      getNextConcert: getNextConcertInfo,
      getConcertRadar: () => getUpcomingConcerts().map(concertRadarData),
      getActionItems: () => JSON.parse(JSON.stringify(getActionItems())),
      getState: () => JSON.parse(JSON.stringify(state))
    };
    console.log("--- SMART REHEARSAL v8 cargado ---");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
