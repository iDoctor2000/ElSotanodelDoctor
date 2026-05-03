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

  console.log("--- SETLIST-EXTENSION.JS v2 cargado ---");

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
        z-index: 99000; overflow-y: auto;
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
    return `<td class="metronome-col"><button class="metronome-table-btn has-tempo" title="Tempo: ${cleanTempo} BPM" onclick="window.toggleMetronomeFromTable && window.toggleMetronomeFromTable('${cleanTempo}', this)">${svgIcon}</button></td>`;
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

    // PDF Personal: la función global setupPersonalPdfBtn enlaza su propio onclick
    // sobre el botón cuyo id le pasamos. Lo invocamos cada vez que renderizamos.
    if (typeof window.setupPersonalPdfBtn === "function") {
      try { window.setupPersonalPdfBtn("se-download-personal-btn", _currentModalItems, _currentModalName); }
      catch (e) {
        console.warn("[setlist-extension] setupPersonalPdfBtn error:", e);
        const b = document.getElementById("se-download-personal-btn");
        if (b) b.onclick = () => alert("Error preparando PDF Personal.");
      }
    } else {
      const b = document.getElementById("se-download-personal-btn");
      if (b) b.onclick = () => alert("La función de PDF Personal no está disponible.");
    }
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
  // 6.bis  WATCHDOG DE SCROLL — restaura body.overflow si quedó
  //        atascado en "hidden" sin que haya modales visibles.
  // ============================================================
  function startScrollWatchdog() {
    setInterval(() => {
      try {
        if (document.body.style.overflow !== "hidden") return;
        // ¿Hay algún modal visible que justifique el lock?
        const candidates = document.querySelectorAll(
          ".modal, .modal-overlay, [id$='-modal'], #se-concert-setlist-modal"
        );
        let anyVisible = false;
        candidates.forEach((el) => {
          if (anyVisible) return;
          const cs = window.getComputedStyle(el);
          if (cs.display !== "none" && cs.visibility !== "hidden" && el.offsetParent !== null) {
            anyVisible = true;
          }
        });
        if (!anyVisible) {
          document.body.style.overflow = "";
          console.log("[setlist-extension] Watchdog: body.overflow restaurado (no hay modales visibles).");
        }
      } catch (_) {}
    }, 1500);
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
  // 9. INIT — DEFENSIVO: espera 2.5s tras carga completa para
  //    no competir con la inicialización del index.html
  // ============================================================
  function init() {
    safeRun(injectStyles, "injectStyles");
    safeRun(ensureSetlistModal, "ensureSetlistModal");
    safeRun(watchConcertModal, "watchConcertModal");
    safeRun(hookSaveButton, "hookSaveButton");
    safeRun(watchBandHelperTable, "watchBandHelperTable");
    safeRun(attachSetlistListener, "attachSetlistListener");
    safeRun(startScrollWatchdog, "startScrollWatchdog");

    // Reintentos espaciados para Firebase si aún no estaba listo
    const tryFirebase = (delay) => setTimeout(() => safeRun(attachSetlistListener, "attachListenerLate"), delay);
    tryFirebase(2000);
    tryFirebase(5000);
    tryFirebase(10000);
  }

  function startWhenReady() {
    // Esperar 2.5s tras el "load" completo de la página para no
    // interferir con el splash, la carga de Firebase, etc.
    const deferred = () => setTimeout(() => safeRun(init, "init"), 2500);
    if (document.readyState === "complete") deferred();
    else window.addEventListener("load", deferred, { once: true });
  }

  startWhenReady();
})();
