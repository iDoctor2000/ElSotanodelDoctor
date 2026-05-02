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
        border-radius: 12px; max-width: 1100px; width: 100%;
        padding: 22px 22px 30px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      }
      #se-concert-setlist-modal h2 { color: #ff8c1a; text-align: center; margin: 0 0 6px; }
      #se-concert-setlist-modal .se-subtitle { text-align: center; color: #aaa; margin: 0 0 18px; font-size: 0.95em; }
      #se-concert-setlist-modal table { width: 100%; border-collapse: collapse; background: #111; }
      #se-concert-setlist-modal th, #se-concert-setlist-modal td {
        padding: 6px 8px; border: 1px solid #2a2a2a; font-size: 0.95em;
      }
      #se-concert-setlist-modal thead th { background: #222; color: #0cf; }
      #se-concert-setlist-modal tr.se-set-header td { background: #2a2a2a; color: #0cf; font-weight: bold; text-align: center; }
      #se-concert-setlist-modal tr.se-break-row td { font-style: italic; color: #ffae5c; text-align: center; }
      #se-concert-setlist-modal .se-empty-state { text-align: center; padding: 40px 20px; color: #ffae5c; font-size: 1.05em; font-style: italic; }
      #se-concert-setlist-modal .se-modal-actions {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 18px; flex-wrap: wrap; gap: 10px;
      }
      #se-concert-setlist-modal .se-modal-total { color: #aaa; font-size: 0.95em; }
      #se-concert-setlist-modal .se-close-btn {
        background: #c33; color: #fff; border: none; border-radius: 8px;
        padding: 9px 18px; cursor: pointer;
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
        width: 100%; min-height: 110px;
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
  // 4. RENDER DE TABLA
  // ============================================================
  function renderSetlistTableInto(parentEl, structure, totalSeconds) {
    let html = `
      <div class="table-wrapper" style="margin-top:6px;">
        <table>
          <thead><tr>
            <th>#</th><th>Título</th><th>Key</th><th>Tempo</th><th>Time</th>
          </tr></thead>
          <tbody>`;
    let count = 0;
    structure.forEach((item) => {
      if (item.isSetHeader) {
        html += `<tr class="se-set-header"><td colspan="5">${item.displayName} (${toHHMM(item.calculatedBlockDurationSeconds || 0)})</td></tr>`;
        item.songs.forEach((s) => {
          count++;
          html += `<tr>
            <td>${count}</td>
            <td>${s.displayName}</td>
            <td>${decodeHtml(s.key || "-")}</td>
            <td>${decodeHtml(s.tempo || "-")}</td>
            <td>${toMMSS(s.calculatedDurationSeconds || 0)}</td>
          </tr>`;
        });
      } else if (item.isBreak) {
        html += `<tr class="se-break-row"><td colspan="4">${item.displayName}</td><td>${toMMSS(item.calculatedDurationSeconds || 0)}</td></tr>`;
      }
    });
    html += `</tbody></table></div>`;
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
          <div class="se-modal-actions">
            <span class="se-modal-total" id="se-modal-total"></span>
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

  function closeSetlistModal() {
    const m = document.getElementById("se-concert-setlist-modal");
    if (m) {
      m.classList.remove("show");
      m.style.display = "none";
    }
    // NO tocamos document.body.style.overflow para no bloquear scroll de la página
  }

  window.openConcertSetlistModal = function (concertTitle, concertDate, jsonText) {
    safeRun(() => {
      ensureSetlistModal();
      const titleEl = document.getElementById("se-modal-title");
      const subEl   = document.getElementById("se-modal-subtitle");
      const bodyEl  = document.getElementById("se-modal-body");
      const totalEl = document.getElementById("se-modal-total");
      if (!titleEl || !bodyEl) return;

      titleEl.textContent = concertTitle || "Setlist del Concierto";
      if (subEl) subEl.textContent = concertDate || "";
      if (totalEl) totalEl.textContent = "";

      if (!jsonText || !jsonText.trim()) {
        bodyEl.innerHTML = `<div class="se-empty-state">No se ha encontrado ningún setlist vinculado al concierto.</div>`;
      } else {
        let parsed;
        try { parsed = JSON.parse(jsonText); }
        catch (e) {
          bodyEl.innerHTML = `<div class="se-empty-state">El JSON guardado no es válido. Revisa el campo en los detalles del concierto.<br><br><code style="font-size:.85em;color:#888;">${(e.message || "").replace(/</g,"&lt;")}</code></div>`;
          showSetlistModal();
          return;
        }
        const { items, totalSeconds } = parseBandhelperJson(parsed);
        if (!items.length) {
          bodyEl.innerHTML = `<div class="se-empty-state">El JSON no contiene canciones reconocibles.</div>`;
        } else {
          renderSetlistTableInto(bodyEl, items, totalSeconds);
          if (totalEl) totalEl.textContent = "Tiempo total: " + toHHMM(totalSeconds);
        }
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
        const dateCellFullText = (cells[0]?.textContent || "").trim();
        const eventTitleFromCell = ((cells[1]?.textContent || "").trim().split("\n")[0] || "").trim();
        const dateForId = dateCellFullText.split(",")[0].trim();
        let concertId = "";
        try {
          if (window.sanitizeFirebaseKey) {
            concertId = window.sanitizeFirebaseKey(`${dateForId}_${eventTitleFromCell}`);
          }
        } catch (_) {}

        let setlistTd = row.querySelector("td.se-setlist-col");
        if (!setlistTd) {
          setlistTd = document.createElement("td");
          setlistTd.className = "se-setlist-col";
          const lastTd = cells[cells.length - 1];
          if (lastTd) row.insertBefore(setlistTd, lastTd);
          else row.appendChild(setlistTd);
        }

        const json = setlistByConcertId[concertId] || "";
        const hasSetlist = !!(json && json.trim());

        const prevState = setlistTd.dataset.hasSetlist || "";
        const newState = hasSetlist ? "1" : "0";
        if (prevState === newState && setlistTd.querySelector("button")) return;
        setlistTd.dataset.hasSetlist = newState;

        const btn = document.createElement("button");
        btn.className = "se-setlist-btn" + (hasSetlist ? "" : " empty");
        btn.title = hasSetlist ? "Ver setlist de este concierto" : "Sin setlist vinculado";
        btn.textContent = "🎵";
        btn.onclick = (ev) => {
          ev.stopPropagation();
          window.openConcertSetlistModal(eventTitleFromCell, dateCellFullText, json);
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
      <label for="se-concert-setlist-json">🎵 JSON del Setlist (BandHelper)</label>
      <p class="se-json-help">
        Pega aquí el JSON exportado desde BandHelper para este concierto.
        Si lo dejas vacío, el cuadro naranja del calendario mostrará
        "No se ha encontrado ningún setlist vinculado al concierto".
      </p>
      <textarea id="se-concert-setlist-json" placeholder='[{"type":"set","name":"Set 1","duration":"45"}, {"type":"song","title":"Black Magic Woman","key":"Am","tempo":"122","duration":"260"}, ...]'></textarea>
      <p class="se-json-status empty" id="se-concert-setlist-json-status">Sin JSON guardado.</p>
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
        if (!v) { status.className = "se-json-status empty"; status.textContent = "Sin JSON. Se mostrará 'No se ha encontrado ningún setlist'."; return; }
        try {
          const parsed = JSON.parse(v);
          const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
          const songs = items.filter(it => it && it.type === "song").length;
          status.className = "se-json-status ok";
          status.textContent = `✓ JSON válido (${songs} canciones detectadas).`;
        } catch (e) {
          status.className = "se-json-status err";
          status.textContent = "✗ JSON inválido: " + (e.message || "error de sintaxis");
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
      const json = setlistByConcertId[id] || "";
      ta.value = json;
      if (status) {
        if (!json) {
          status.className = "se-json-status empty";
          status.textContent = "Sin JSON. Se mostrará 'No se ha encontrado ningún setlist'.";
        } else {
          try {
            const parsed = JSON.parse(json);
            const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
            const songs = items.filter(it => it && it.type === "song").length;
            status.className = "se-json-status ok";
            status.textContent = `✓ JSON cargado (${songs} canciones).`;
          } catch (_) {
            status.className = "se-json-status err";
            status.textContent = "✗ JSON guardado no es válido.";
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

        if (typeof window.saveDoc === "function") {
          await window.saveDoc("concert_details", id, { setlistJson: json }, true);
        } else if (typeof db !== "undefined") {
          await db.collection("concert_details").doc(id).set({ setlistJson: json }, { merge: true });
        }
        setlistByConcertId[id] = json;
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
