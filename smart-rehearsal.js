/*
   SMART-REHEARSAL.JS
   Semaforo del repertorio + Modo Ensayo Inteligente.
   Modulo aislado para trabajar sobre los setlists ya cargados.
*/
(function () {
  "use strict";

  const DOC_ID = "rehearsal_intelligence";
  const LOCAL_STATE_KEY = "esdd_rehearsal_intelligence_v1";
  const LOCAL_PLAN_KEY = "esdd_rehearsal_plan_v1";
  const MAX_SESSIONS = 20;
  const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  const STATUS = {
    ready: { label: "Lista", short: "Lista", color: "#43d17a", score: 5 },
    review: { label: "Necesita repaso", short: "Repaso", color: "#ffb52e", score: 65 },
    blocked: { label: "Bloqueada", short: "Bloqueada", color: "#ff5353", score: 110 },
    unknown: { label: "Sin valorar", short: "Sin valorar", color: "#777", score: 40 }
  };

  const SOURCE_LABELS = {
    rehearsal: "Proximo ensayo",
    concert: "Proximo concierto",
    star: "Concierto estrella"
  };

  let state = { songs: {}, sessions: [] };
  let songs = [];
  let currentPlan = null;
  let activeSession = null;
  let sessionTimer = null;
  let saveTimer = null;
  let lastSongsFingerprint = "";
  let durationManuallyChanged = false;

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

  function rehearsalDurationMinutes(rehearsal) {
    if (!rehearsal || !rehearsal.startTime || !rehearsal.endTime) return 0;
    const [startHour, startMinute] = rehearsal.startTime.split(":").map(Number);
    const [endHour, endMinute] = rehearsal.endTime.split(":").map(Number);
    let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (minutes < 0) minutes += 24 * 60;
    return minutes;
  }

  function getIdentity() {
    const selector = document.getElementById("user-identity-selector");
    return selector && selector.value ? selector.value : "Banda";
  }

  function readLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        state.songs = saved.songs && typeof saved.songs === "object" ? saved.songs : {};
        state.sessions = Array.isArray(saved.sessions) ? saved.sessions.slice(0, MAX_SESSIONS) : [];
      }
      currentPlan = JSON.parse(localStorage.getItem(LOCAL_PLAN_KEY) || "null");
    } catch (error) {
      console.warn("[Ensayo Inteligente] No se pudo leer la copia local:", error);
    }
  }

  function writeLocalState() {
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
      if (currentPlan) localStorage.setItem(LOCAL_PLAN_KEY, JSON.stringify(currentPlan));
      else localStorage.removeItem(LOCAL_PLAN_KEY);
    } catch (error) {
      console.warn("[Ensayo Inteligente] No se pudo guardar la copia local:", error);
    }
  }

  function setSyncMessage(message, isError) {
    const el = document.getElementById("sr-sync-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error", !!isError);
  }

  async function loadRemoteState() {
    if (typeof window.loadDoc !== "function") return;
    try {
      const remote = await window.loadDoc("intranet", DOC_ID, { songs: {}, sessions: [] });
      if (!remote || typeof remote !== "object") return;
      if (remote.songs && typeof remote.songs === "object") {
        state.songs = { ...state.songs, ...remote.songs };
      }
      if (Array.isArray(remote.sessions) && remote.sessions.length) {
        state.sessions = remote.sessions.slice(0, MAX_SESSIONS);
      }
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
      await window.withRetry(() => window.saveDoc("intranet", DOC_ID, {
        songs: state.songs,
        sessions: state.sessions.slice(0, MAX_SESSIONS),
        updatedAt: new Date().toISOString()
      }, true));
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
    const saved = state.songs[songKey];
    return saved && STATUS[saved.status] ? saved.status : "unknown";
  }

  function getSongRecord(songKey) {
    return state.songs[songKey] || {};
  }

  function setSongStatus(songKey, status) {
    if (!STATUS[status] || status === "unknown") return;
    const previous = state.songs[songKey] || {};
    state.songs[songKey] = {
      ...previous,
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
    const previous = getSongRecord(songKey);
    const note = prompt(`Nota de trabajo para "${song.title}":`, previous.note || "");
    if (note === null) return;
    state.songs[songKey] = {
      ...previous,
      note: note.trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: getIdentity()
    };
    queueSave();
    renderAll();
  }

  function sourceBadges(song) {
    return song.sources.map(source => `<span class="sr-source sr-source-${source}">${escapeHtml(SOURCE_LABELS[source])}</span>`).join("");
  }

  function injectStyles() {
    if (document.getElementById("smart-rehearsal-styles")) return;
    const style = document.createElement("style");
    style.id = "smart-rehearsal-styles";
    style.textContent = `
      #smart-rehearsal {
        background: rgba(20,20,20,.82); backdrop-filter: blur(10px);
        padding: 20px; border-radius: 12px; margin-bottom: 40px;
        border: 1px solid rgba(255,181,46,.25); box-shadow: 0 8px 32px rgba(0,0,0,.37);
      }
      #smart-rehearsal h2 { text-align:center; color:#ffb52e; margin:0 0 5px; }
      .sr-subtitle { text-align:center; color:#aaa; margin:0 0 18px; }
      .sr-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
      .sr-summary-card { background:#111; border:1px solid #333; border-radius:10px; padding:12px; text-align:center; }
      .sr-summary-value { display:block; font-size:1.7em; font-weight:bold; }
      .sr-summary-label { color:#aaa; font-size:.82em; }
      .sr-toolbar { display:flex; flex-wrap:wrap; gap:8px; padding:12px; background:rgba(0,0,0,.28); border:1px solid #333; border-radius:10px; margin-bottom:14px; }
      .sr-toolbar input,.sr-toolbar select { flex:1; min-width:150px; padding:9px; background:#171717; color:#fff; border:1px solid #444; border-radius:7px; }
      .sr-toolbar button,.sr-action-btn { border:0; border-radius:7px; padding:9px 13px; background:#ffb52e; color:#111; font-weight:bold; cursor:pointer; }
      .sr-toolbar button.secondary,.sr-action-btn.secondary { background:#333; color:#fff; border:1px solid #555; }
      .sr-toolbar button:disabled,.sr-action-btn:disabled { opacity:.45; cursor:not-allowed; }
      .sr-sync { min-height:1.2em; color:#66dd99; font-size:.8em; text-align:right; margin:-5px 0 8px; }
      .sr-sync.error { color:#ff8a8a; }
      .sr-next-hint { color:#c9c9c9; font-size:.82em; margin:-5px 0 12px; padding-left:4px; }
      .sr-layout { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr); gap:14px; align-items:start; }
      .sr-panel { background:rgba(0,0,0,.25); border:1px solid #333; border-radius:10px; padding:12px; }
      .sr-panel h3 { color:#ffb52e; margin:0 0 10px; }
      .sr-song-list { max-height:620px; overflow-y:auto; padding-right:3px; }
      .sr-song { display:grid; grid-template-columns:minmax(130px,1fr) auto; gap:10px; padding:10px; border-bottom:1px solid #2c2c2c; align-items:center; }
      .sr-song:last-child { border-bottom:0; }
      .sr-song-title { font-weight:bold; color:#fff; }
      .sr-song-note { color:#aaa; font-size:.78em; margin-top:5px; }
      .sr-sources { display:flex; flex-wrap:wrap; gap:4px; margin-top:5px; }
      .sr-source { font-size:.65em; padding:2px 5px; border-radius:10px; border:1px solid #555; color:#bbb; }
      .sr-source-concert { border-color:#0cf; color:#6de5ff; }
      .sr-source-star { border-color:#ffd700; color:#ffe36a; }
      .sr-source-rehearsal { border-color:#b070ff; color:#c99cff; }
      .sr-status-controls { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
      .sr-status-btn { border:1px solid #555; background:#222; color:#aaa; border-radius:6px; padding:6px 8px; cursor:pointer; font-size:.75em; }
      .sr-status-btn.active.ready { color:#111; background:#43d17a; border-color:#43d17a; }
      .sr-status-btn.active.review { color:#111; background:#ffb52e; border-color:#ffb52e; }
      .sr-status-btn.active.blocked { color:#fff; background:#d93838; border-color:#ff5353; }
      .sr-note-btn { border:1px solid #555; color:#ddd; background:transparent; border-radius:6px; padding:6px 8px; cursor:pointer; font-size:.75em; }
      .sr-plan-empty,.sr-empty { color:#888; text-align:center; padding:22px 8px; }
      .sr-plan-summary { display:flex; justify-content:space-between; gap:8px; color:#aaa; font-size:.85em; margin-bottom:8px; }
      .sr-plan-item { display:grid; grid-template-columns:28px minmax(0,1fr) auto; gap:8px; align-items:center; padding:9px 5px; border-bottom:1px solid #292929; }
      .sr-plan-number { color:#ffb52e; font-weight:bold; text-align:center; }
      .sr-plan-time { color:#aaa; font-size:.8em; }
      .sr-history-item { padding:8px 5px; border-bottom:1px solid #292929; color:#ccc; font-size:.82em; }
      tr[data-sr-status] td:first-child { border-left:4px solid #777 !important; }
      tr[data-sr-status="ready"] td:first-child { border-left-color:#43d17a !important; }
      tr[data-sr-status="review"] td:first-child { border-left-color:#ffb52e !important; }
      tr[data-sr-status="blocked"] td:first-child { border-left-color:#ff5353 !important; }
      #sr-session-overlay { display:none; position:fixed; inset:0; z-index:120000; background:radial-gradient(circle at top,#242424,#050505 70%); color:#fff; overflow-y:auto; }
      #sr-session-overlay.show { display:block; }
      .sr-session-shell { min-height:100%; max-width:900px; margin:0 auto; padding:24px 18px; display:flex; flex-direction:column; justify-content:center; }
      .sr-session-top { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:18px; color:#aaa; }
      .sr-session-progress { height:7px; background:#222; border-radius:10px; overflow:hidden; margin-bottom:28px; }
      .sr-session-progress > div { height:100%; background:#ffb52e; transition:width .25s; }
      .sr-session-title { font-size:clamp(2em,7vw,4.8em); line-height:1.05; text-align:center; margin:10px 0; }
      .sr-session-meta { text-align:center; color:#aaa; font-size:1.05em; }
      .sr-session-note { max-width:650px; margin:18px auto; color:#ddd; text-align:center; min-height:1.4em; }
      .sr-session-clock { font-family:monospace; color:#ffb52e; font-size:clamp(2.2em,8vw,5em); text-align:center; margin:18px 0 5px; }
      .sr-session-target { color:#777; text-align:center; margin-bottom:22px; }
      .sr-session-tools,.sr-session-results { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; margin-top:12px; }
      .sr-session-tools button,.sr-session-results button { border:1px solid #555; background:#222; color:#fff; border-radius:9px; padding:12px 17px; cursor:pointer; font-weight:bold; }
      .sr-session-results button[data-result="good"] { background:#43d17a; color:#111; border-color:#43d17a; }
      .sr-session-results button[data-result="repeat"] { background:#ffb52e; color:#111; border-color:#ffb52e; }
      .sr-session-results button[data-result="blocked"] { background:#d93838; border-color:#ff5353; }
      .sr-session-close { border:1px solid #666; color:#ddd; background:transparent; border-radius:7px; padding:7px 11px; cursor:pointer; }
      @media(max-width:800px) {
        .sr-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .sr-layout { grid-template-columns:1fr; }
        .sr-song { grid-template-columns:1fr; }
        .sr-status-controls { justify-content:flex-start; }
        .sr-song-list { max-height:none; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectInterface() {
    if (document.getElementById("smart-rehearsal")) return;
    const section = document.createElement("section");
    section.id = "smart-rehearsal";
    section.innerHTML = `
      <h2>Semaforo del repertorio</h2>
      <p class="sr-subtitle">Prioridades compartidas y plan automatico para aprovechar cada ensayo.</p>
      <div id="sr-summary" class="sr-summary"></div>
      <div class="sr-toolbar">
        <input id="sr-search" type="search" placeholder="Buscar cancion...">
        <select id="sr-source-filter">
          <option value="all">Todo el repertorio visible</option>
          <option value="rehearsal">Setlist proximo ensayo</option>
          <option value="concert">Setlist proximo concierto</option>
          <option value="star">Setlist concierto estrella</option>
        </select>
        <select id="sr-duration">
          <option value="60">Ensayo de 60 min</option>
          <option value="90" selected>Ensayo de 90 min</option>
          <option value="120">Ensayo de 120 min</option>
          <option value="150">Ensayo de 150 min</option>
        </select>
        <select id="sr-focus">
          <option value="balanced">Plan equilibrado</option>
          <option value="problems">Priorizar problemas</option>
          <option value="concert">Priorizar conciertos</option>
          <option value="unrated">Valorar repertorio pendiente</option>
        </select>
        <button id="sr-generate-plan">Generar plan</button>
      </div>
      <div id="sr-sync-status" class="sr-sync"></div>
      <div id="sr-next-rehearsal-hint" class="sr-next-hint"></div>
      <div class="sr-layout">
        <div class="sr-panel">
          <h3>Repertorio</h3>
          <div id="sr-song-list" class="sr-song-list"></div>
        </div>
        <div>
          <div class="sr-panel">
            <h3>Plan de ensayo</h3>
            <div id="sr-plan"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              <button id="sr-start-session" class="sr-action-btn" disabled>Iniciar Modo Ensayo</button>
              <button id="sr-clear-plan" class="sr-action-btn secondary" disabled>Limpiar plan</button>
            </div>
          </div>
          <div class="sr-panel" style="margin-top:14px;">
            <h3>Ultimos ensayos inteligentes</h3>
            <div id="sr-history"></div>
          </div>
        </div>
      </div>
    `;

    const setlists = document.getElementById("setlists");
    if (setlists && setlists.parentNode) setlists.parentNode.insertBefore(section, setlists.nextSibling);
    else document.querySelector("main")?.prepend(section);

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

    const menu = document.getElementById("sidebar-menu");
    const statsLink = document.getElementById("menu-stats");
    if (menu && !document.getElementById("menu-smart-rehearsal")) {
      const link = document.createElement("a");
      link.href = "#smart-rehearsal";
      link.id = "menu-smart-rehearsal";
      link.textContent = "Semaforo y Modo Ensayo";
      if (statsLink) menu.insertBefore(link, statsLink);
      else menu.appendChild(link);
      link.addEventListener("click", event => {
        event.preventDefault();
        if (typeof window.closeAll === "function") window.closeAll();
        else {
          document.getElementById("sidebar-menu")?.classList.remove("show");
          document.getElementById("overlay")?.classList.remove("show");
        }
        document.getElementById("smart-rehearsal")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function renderSummary() {
    const summary = document.getElementById("sr-summary");
    if (!summary) return;
    const counts = { ready: 0, review: 0, blocked: 0, unknown: 0 };
    songs.forEach(song => counts[getSongStatus(song.key)]++);
    summary.innerHTML = ["ready", "review", "blocked", "unknown"].map(status => `
      <div class="sr-summary-card">
        <span class="sr-summary-value" style="color:${STATUS[status].color}">${counts[status]}</span>
        <span class="sr-summary-label">${escapeHtml(STATUS[status].label)}</span>
      </div>
    `).join("");
  }

  function syncNextRehearsalDuration() {
    const hint = document.getElementById("sr-next-rehearsal-hint");
    const durationSelect = document.getElementById("sr-duration");
    const rehearsals = typeof window.getRehearsalsForSmartMode === "function"
      ? window.getRehearsalsForSmartMode()
      : window.rehearsals;
    if (!hint || !durationSelect || !Array.isArray(rehearsals)) return;
    const now = new Date();
    const next = rehearsals
      .filter(rehearsal => rehearsal && rehearsal.date && new Date(`${rehearsal.date}T${rehearsal.startTime || "00:00"}`) >= now)
      .sort((a, b) => new Date(`${a.date}T${a.startTime || "00:00"}`) - new Date(`${b.date}T${b.startTime || "00:00"}`))[0];
    const oldOption = document.getElementById("sr-next-duration-option");
    if (oldOption) oldOption.remove();
    if (!next) {
      hint.textContent = "No hay un proximo ensayo programado; puedes elegir la duracion manualmente.";
      return;
    }
    const minutes = rehearsalDurationMinutes(next);
    const dateText = new Date(`${next.date}T00:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    hint.textContent = `Proximo ensayo: ${dateText}, ${next.startTime || ""}-${next.endTime || ""}${next.location ? ` en ${next.location}` : ""}.`;
    if (minutes > 0) {
      const option = document.createElement("option");
      option.id = "sr-next-duration-option";
      option.value = String(minutes);
      option.textContent = `Proximo ensayo: ${minutes} min`;
      durationSelect.prepend(option);
      if (!durationManuallyChanged) durationSelect.value = String(minutes);
    }
  }

  function filteredSongs() {
    const query = (document.getElementById("sr-search")?.value || "").trim().toLocaleLowerCase("es");
    const source = document.getElementById("sr-source-filter")?.value || "all";
    return songs.filter(song => {
      const matchesQuery = !query || song.title.toLocaleLowerCase("es").includes(query);
      const matchesSource = source === "all" || song.sources.includes(source);
      return matchesQuery && matchesSource;
    }).sort((a, b) => {
      const statusDiff = STATUS[getSongStatus(b.key)].score - STATUS[getSongStatus(a.key)].score;
      return statusDiff || a.title.localeCompare(b.title, "es");
    });
  }

  function renderSongs() {
    const list = document.getElementById("sr-song-list");
    if (!list) return;
    const visibleSongs = filteredSongs();
    if (!visibleSongs.length) {
      list.innerHTML = `<div class="sr-empty">${songs.length ? "No hay canciones con este filtro." : "Esperando a que carguen los setlists..."}</div>`;
      return;
    }
    list.innerHTML = visibleSongs.map(song => {
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
            <button class="sr-status-btn ready ${status === "ready" ? "active" : ""}" data-status="ready" data-key="${escapeHtml(song.key)}">Lista</button>
            <button class="sr-status-btn review ${status === "review" ? "active" : ""}" data-status="review" data-key="${escapeHtml(song.key)}">Repaso</button>
            <button class="sr-status-btn blocked ${status === "blocked" ? "active" : ""}" data-status="blocked" data-key="${escapeHtml(song.key)}">Bloqueada</button>
            <button class="sr-note-btn" data-note-key="${escapeHtml(song.key)}">Nota</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function scoreSong(song, focus) {
    const status = getSongStatus(song.key);
    let score = STATUS[status].score;
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
    const status = getSongStatus(song.key);
    const baseline = { blocked: 15, review: 10, unknown: 8, ready: 5 }[status];
    const durationMinutes = Math.ceil((song.durationSeconds || 0) / 60);
    return Math.max(baseline, durationMinutes ? durationMinutes + 3 : 0);
  }

  function generatePlan() {
    collectSongs();
    if (!songs.length) {
      alert("Todavia no hay canciones cargadas en los setlists.");
      return;
    }
    const targetMinutes = Number(document.getElementById("sr-duration")?.value || 90);
    const focus = document.getElementById("sr-focus")?.value || "balanced";
    const source = document.getElementById("sr-source-filter")?.value || "all";
    const reserveMinutes = 10 + (targetMinutes >= 90 ? 5 : 0);
    const songsBudget = Math.max(20, targetMinutes - reserveMinutes);
    const candidates = songs
      .filter(song => source === "all" || song.sources.includes(source))
      .map(song => ({ ...song, score: scoreSong(song, focus), plannedMinutes: estimateSongMinutes(song) }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es"));

    const selected = [];
    let usedMinutes = 0;
    candidates.forEach(song => {
      if (usedMinutes + song.plannedMinutes <= songsBudget || selected.length === 0) {
        selected.push(song);
        usedMinutes += song.plannedMinutes;
      }
    });

    const openerIndex = selected.findIndex(song => getSongStatus(song.key) === "ready");
    if (openerIndex > 0) selected.unshift(selected.splice(openerIndex, 1)[0]);
    const closerIndex = selected.map(song => getSongStatus(song.key)).lastIndexOf("ready");
    if (closerIndex > 0 && closerIndex < selected.length - 1) selected.push(selected.splice(closerIndex, 1)[0]);

    currentPlan = {
      generatedAt: new Date().toISOString(),
      targetMinutes,
      reserveMinutes,
      focus,
      source,
      songs: selected
    };
    writeLocalState();
    renderPlan();
  }

  function renderPlan() {
    const container = document.getElementById("sr-plan");
    const startButton = document.getElementById("sr-start-session");
    const clearButton = document.getElementById("sr-clear-plan");
    if (!container) return;
    const planSongs = currentPlan && Array.isArray(currentPlan.songs) ? currentPlan.songs : [];
    if (!planSongs.length) {
      container.innerHTML = `<div class="sr-plan-empty">Genera un plan para ordenar automaticamente las prioridades.</div>`;
      if (startButton) startButton.disabled = true;
      if (clearButton) clearButton.disabled = true;
      return;
    }
    const songsMinutes = planSongs.reduce((sum, song) => sum + song.plannedMinutes, 0);
    container.innerHTML = `
      <div class="sr-plan-summary">
        <span>${planSongs.length} canciones</span>
        <span>${songsMinutes + currentPlan.reserveMinutes} de ${currentPlan.targetMinutes} min</span>
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
            <small style="color:${STATUS[getSongStatus(song.key)].color}">${escapeHtml(STATUS[getSongStatus(song.key)].label)}</small>
          </span>
          <span class="sr-plan-time">${song.plannedMinutes} min</span>
        </div>
      `).join("")}
      ${currentPlan.targetMinutes >= 90 ? `
        <div class="sr-plan-item">
          <span class="sr-plan-number">+</span>
          <span><strong>Descanso / margen</strong></span>
          <span class="sr-plan-time">5 min</span>
        </div>` : ""}
    `;
    if (startButton) startButton.disabled = false;
    if (clearButton) clearButton.disabled = false;
  }

  function renderHistory() {
    const history = document.getElementById("sr-history");
    if (!history) return;
    if (!state.sessions.length) {
      history.innerHTML = `<div class="sr-empty">Aun no hay sesiones registradas.</div>`;
      return;
    }
    history.innerHTML = state.sessions.slice(0, 5).map(session => {
      const results = Array.isArray(session.results) ? session.results : [];
      const ready = results.filter(result => result.result === "good").length;
      const problems = results.filter(result => result.result === "repeat" || result.result === "blocked").length;
      return `
        <div class="sr-history-item">
          <strong>${new Date(session.endedAt || session.startedAt).toLocaleDateString("es-ES")}</strong>
          · ${results.length} canciones · ${ready} listas · ${problems} pendientes
        </div>
      `;
    }).join("");
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
    renderSummary();
    syncNextRehearsalDuration();
    renderSongs();
    renderPlan();
    renderHistory();
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

  function startSession() {
    if (!currentPlan || !Array.isArray(currentPlan.songs) || !currentPlan.songs.length) {
      generatePlan();
      if (!currentPlan || !currentPlan.songs.length) return;
    }
    activeSession = {
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
    return activeSession && currentPlan && currentPlan.songs[activeSession.index];
  }

  function renderSessionClocks() {
    if (!activeSession) return;
    const songElapsed = Math.round((Date.now() - activeSession.songStartedMs) / 1000);
    const totalElapsed = Math.round((Date.now() - activeSession.sessionStartedMs) / 1000);
    const clock = document.getElementById("sr-session-clock");
    const total = document.getElementById("sr-session-total-time");
    if (clock) clock.textContent = formatSeconds(songElapsed);
    if (total) total.textContent = `Tiempo de sesion: ${formatSeconds(totalElapsed)}`;
  }

  function renderSession() {
    const song = currentSessionSong();
    if (!song) {
      finishSession(false);
      return;
    }
    const status = getSongStatus(song.key);
    const record = getSongRecord(song.key);
    const total = currentPlan.songs.length;
    const index = activeSession.index;
    document.getElementById("sr-session-counter").textContent = `${index + 1} / ${total}`;
    document.getElementById("sr-session-progress-fill").style.width = `${((index + 1) / total) * 100}%`;
    document.getElementById("sr-session-status").innerHTML = `<span style="color:${STATUS[status].color}">${escapeHtml(STATUS[status].label)}</span>`;
    document.getElementById("sr-session-title").textContent = song.title;
    document.getElementById("sr-session-meta").textContent = [
      song.musicalKey ? `Tonalidad: ${song.musicalKey}` : "",
      song.tempo ? `Tempo: ${song.tempo}` : "",
      sourceBadges(song).replace(/<[^>]+>/g, " ")
    ].filter(Boolean).join(" · ");
    document.getElementById("sr-session-note").textContent = record.note || "Sin notas de trabajo para esta cancion.";
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
    if (activeSession.index >= currentPlan.songs.length) finishSession(false);
    else renderSession();
  }

  function finishSession(partial) {
    if (!activeSession) return;
    clearInterval(sessionTimer);
    sessionTimer = null;
    const finished = {
      id: `session_${Date.now()}`,
      startedAt: activeSession.startedAt,
      endedAt: new Date().toISOString(),
      plannedMinutes: currentPlan ? currentPlan.targetMinutes : 0,
      partial: !!partial,
      results: activeSession.results
    };
    state.sessions.unshift(finished);
    state.sessions = state.sessions.slice(0, MAX_SESSIONS);
    activeSession = null;
    document.getElementById("sr-session-overlay")?.classList.remove("show");
    if (!IS_LOCAL_PREVIEW && typeof window.releaseWakeLock === "function") window.releaseWakeLock();
    queueSave();
    renderAll();
  }

  function clearPlan() {
    currentPlan = null;
    writeLocalState();
    renderPlan();
  }

  function wireEvents() {
    const section = document.getElementById("smart-rehearsal");
    section?.addEventListener("click", event => {
      const statusButton = event.target.closest("[data-status][data-key]");
      if (statusButton) {
        setSongStatus(statusButton.dataset.key, statusButton.dataset.status);
        return;
      }
      const noteButton = event.target.closest("[data-note-key]");
      if (noteButton) {
        editSongNote(noteButton.dataset.noteKey);
        return;
      }
      if (event.target.closest("#sr-generate-plan")) generatePlan();
      if (event.target.closest("#sr-start-session")) startSession();
      if (event.target.closest("#sr-clear-plan")) clearPlan();
    });
    document.getElementById("sr-search")?.addEventListener("input", renderSongs);
    document.getElementById("sr-source-filter")?.addEventListener("change", renderSongs);
    document.getElementById("sr-duration")?.addEventListener("change", () => {
      durationManuallyChanged = true;
    });

    const overlay = document.getElementById("sr-session-overlay");
    overlay?.addEventListener("click", event => {
      const resultButton = event.target.closest("[data-result]");
      if (resultButton) {
        recordSessionResult(resultButton.dataset.result);
        return;
      }
      if (event.target.closest("#sr-finish-session")) {
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
  }

  function init() {
    readLocalState();
    injectStyles();
    injectInterface();
    wireEvents();
    renderAll();

    setTimeout(loadRemoteState, 2500);
    setTimeout(loadRemoteState, 8000);
    setInterval(() => {
      if (collectSongs()) renderAll();
      else {
        syncNextRehearsalDuration();
        decorateSetlistRows();
      }
    }, 2500);

    window.SmartRehearsal = {
      generatePlan,
      startSession,
      render: renderAll,
      getSongs: () => songs.slice(),
      getState: () => JSON.parse(JSON.stringify(state))
    };
    console.log("--- SMART REHEARSAL v1 cargado ---");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
