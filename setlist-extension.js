/* ============================================================
   SETLIST-EXTENSION.JS
   ------------------------------------------------------------
   Módulo autocontenido. NO toca setlists.js ni calendario.js.
   Hace 4 cosas:
     1) Oculta de la página principal los setlists "Próximo Concierto"
        y "Concierto Estrella" (y sus enlaces del menú lateral).
        El setlist de Ensayo se queda intacto.
     2) Añade en el modal de "Detalles del Concierto" un campo
        para pegar el JSON del setlist (el que descargas de
        BandHelper).
     3) Añade al lado del botón ➡️ "Info" en la tabla de
        Próximos Conciertos otro botón cuadrado naranja 🎵 que,
        al pulsar, abre el setlist de ese concierto en una
        ventana grande (modal).
     4) Si el concierto no tiene JSON: el modal muestra
        "No se ha encontrado ningún setlist vinculado al concierto".
   ------------------------------------------------------------
   Para desactivar: borra del index.html la línea
   <script src="setlist-extension.js?v=1"></script>
   ============================================================ */

(function () {
  "use strict";
  console.log("--- SETLIST-EXTENSION.JS CARGADO ---");

  // ============================================================
  // 1. ESTILOS — ocultar setlist 2 y star, y mejorar UI nueva
  // ============================================================
  function injectStyles() {
    if (document.getElementById("se-styles")) return;
    const css = `
      /* Ocultar secciones que ya no aparecen en la página principal.
         Sus datos siguen cargándose internamente para no romper PDFs/links. */
      #second-setlist, #star-setlist { display: none !important; }
      #menu-second-setlist-section, #menu-star-setlist-section { display: none !important; }

      /* ---- Botón naranja "Setlist" en tabla de conciertos ---- */
      .se-setlist-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: 1px solid #ff8c1a;
        background: #ff8c1a;
        color: #000;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
        transition: transform .15s ease, background .15s ease;
      }
      .se-setlist-btn:hover { transform: scale(1.08); background: #ffae5c; }
      .se-setlist-btn.empty {
        background: transparent;
        color: #ff8c1a;
        border-style: dashed;
        opacity: 0.7;
      }
      .se-setlist-btn.empty:hover { opacity: 1; }
      th.se-setlist-col-header { text-align: center; }
      td.se-setlist-col          { text-align: center; }

      /* ---- Modal "Ver Setlist del Concierto" ---- */
      #se-concert-setlist-modal {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.85);
        display: none;
        align-items: flex-start;
        justify-content: center;
        z-index: 99000;
        overflow-y: auto;
        padding: 30px 10px;
      }
      #se-concert-setlist-modal.show { display: flex; }
      #se-concert-setlist-modal .se-modal-box {
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #333;
        border-radius: 12px;
        max-width: 1100px;
        width: 100%;
        padding: 22px 22px 30px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      }
      #se-concert-setlist-modal h2 {
        color: #ff8c1a;
        text-align: center;
        margin: 0 0 6px;
      }
      #se-concert-setlist-modal .se-subtitle {
        text-align: center;
        color: #aaa;
        margin: 0 0 18px;
        font-size: 0.95em;
      }
      #se-concert-setlist-modal table {
        width: 100%;
        border-collapse: collapse;
        background: #111;
      }
      #se-concert-setlist-modal th,
      #se-concert-setlist-modal td {
        padding: 6px 8px;
        border: 1px solid #2a2a2a;
        font-size: 0.95em;
      }
      #se-concert-setlist-modal thead th {
        background: #222;
        color: #0cf;
      }
      #se-concert-setlist-modal tr.se-set-header td {
        background: #2a2a2a;
        color: #0cf;
        font-weight: bold;
        text-align: center;
      }
      #se-concert-setlist-modal tr.se-break-row td {
        font-style: italic;
        color: #ffae5c;
        text-align: center;
      }
      #se-concert-setlist-modal .se-empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #ffae5c;
        font-size: 1.05em;
        font-style: italic;
      }
      #se-concert-setlist-modal .se-modal-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 18px;
        flex-wrap: wrap;
        gap: 10px;
      }
      #se-concert-setlist-modal .se-modal-total {
        color: #aaa;
        font-size: 0.95em;
      }
      #se-concert-setlist-modal .se-close-btn {
        background: #c33;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 9px 18px;
        cursor: pointer;
      }
      #se-concert-setlist-modal .se-close-btn:hover { background: #e55; }

      /* ---- Textarea JSON dentro del modal de detalles ---- */
      .se-json-block {
        border: 1px solid #444;
        border-radius: 8px;
        padding: 12px;
        margin-top: 14px;
        margin-bottom: 14px;
        background: rgba(255, 140, 26, 0.06);
      }
      .se-json-block label { color: #ff8c1a; font-weight: bold; }
      .se-json-block .se-json-help {
        font-size: 0.85em;
        color: #aaa;
        margin: 4px 0 8px;
      }
      .se-json-block textarea {
        width: 100%;
        min-height: 110px;
        font-family: 'Courier New', monospace;
        font-size: 0.85em;
        background: #0a0a0a;
        color: #ddd;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 8px;
        resize: vertical;
      }
      .se-json-block .se-json-status {
        font-size: 0.85em;
        margin-top: 6px;
        font-style: italic;
      }
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
  // 2. UTILIDADES (clones de las de setlists.js, no las tocamos)
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
  // 3. PARSEO DE JSON BANDHELPER → estructura de sets
  //    (misma lógica que cargarSetlistGenerico, pero sin fetch)
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
  // 4. RENDER DE LA TABLA EN EL MODAL DE CONCIERTO
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
  // 5. MODAL "Ver Setlist del Concierto"
  // ============================================================
  function ensureSetlistModal() {
    if (document.getElementById("se-concert-setlist-modal")) return;
    const html = `
      <div id="se-concert-setlist-modal">
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
    document.getElementById("se-modal-close").onclick = closeSetlistModal;
    document.getElementById("se-concert-setlist-modal").addEventListener("click", (e) => {
      if (e.target.id === "se-concert-setlist-modal") closeSetlistModal();
    });
  }
  function closeSetlistModal() {
    const m = document.getElementById("se-concert-setlist-modal");
    if (m) m.classList.remove("show");
    document.body.style.overflow = "";
  }

  /**
   * Abre el modal con el setlist de un concierto.
   * @param {string} concertTitle  Título a mostrar
   * @param {string} concertDate   Fecha a mostrar (subtítulo)
   * @param {string} jsonText      JSON pegado por el admin
   */
  window.openConcertSetlistModal = function (concertTitle, concertDate, jsonText) {
    ensureSetlistModal();
    const titleEl = document.getElementById("se-modal-title");
    const subEl   = document.getElementById("se-modal-subtitle");
    const bodyEl  = document.getElementById("se-modal-body");
    const totalEl = document.getElementById("se-modal-total");

    titleEl.textContent = concertTitle || "Setlist del Concierto";
    subEl.textContent = concertDate || "";
    totalEl.textContent = "";

    if (!jsonText || !jsonText.trim()) {
      bodyEl.innerHTML = `<div class="se-empty-state">No se ha encontrado ningún setlist vinculado al concierto.</div>`;
    } else {
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        bodyEl.innerHTML = `<div class="se-empty-state">El JSON guardado no es válido. Revisa el campo en los detalles del concierto.<br><br><code style="font-size:.85em;color:#888;">${(e.message || "").replace(/</g,"&lt;")}</code></div>`;
        document.getElementById("se-concert-setlist-modal").classList.add("show");
        document.body.style.overflow = "hidden";
        return;
      }
      const { items, totalSeconds } = parseBandhelperJson(parsed);
      if (!items.length) {
        bodyEl.innerHTML = `<div class="se-empty-state">El JSON no contiene canciones reconocibles.</div>`;
      } else {
        renderSetlistTableInto(bodyEl, items, totalSeconds);
        totalEl.textContent = "Tiempo total: " + toHHMM(totalSeconds);
      }
    }
    document.getElementById("se-concert-setlist-modal").classList.add("show");
    document.body.style.overflow = "hidden";
  };

  // ============================================================
  // 6. CACHE EN MEMORIA DE LOS JSON GUARDADOS
  //    (escuchamos la colección concert_details y guardamos
  //    setlistJson por concertId para tener acceso rápido)
  // ============================================================
  const setlistByConcertId = {};

  function attachSetlistListener() {
    if (typeof db === "undefined") {
      // Reintentar cuando Firebase esté listo
      setTimeout(attachSetlistListener, 800);
      return;
    }
    try {
      db.collection("concert_details").onSnapshot((snapshot) => {
        snapshot.forEach((doc) => {
          const data = doc.data() || {};
          setlistByConcertId[doc.id] = data.setlistJson || "";
        });
        // Re-render columna naranja para reflejar cambios (lleno/vacío)
        refreshSetlistColumn();
      });
    } catch (e) {
      console.warn("[setlist-extension] No se pudo enganchar listener:", e);
    }
  }

  // ============================================================
  // 7. AÑADIR COLUMNA "SETLIST" A LA TABLA DE CONCIERTOS
  //    Como processBandHelperTable es función local de calendario.js,
  //    usamos un MutationObserver y, además, repetimos cada N seg
  //    por si el render llega más tarde.
  // ============================================================
  function refreshSetlistColumn() {
    const container = document.getElementById("bandhelper-concerts-container");
    if (!container) return;
    const table = container.querySelector("table");
    if (!table) return;

    // 1) Cabecera
    const thead = table.tHead;
    if (thead && thead.rows.length) {
      const headerRow = thead.rows[0];
      let setlistTh = headerRow.querySelector("th.se-setlist-col-header");
      if (!setlistTh) {
        setlistTh = document.createElement("th");
        setlistTh.className = "se-setlist-col-header";
        setlistTh.textContent = "Setlist";
        // Insertar antes de la última columna ("Info")
        const lastTh = headerRow.cells[headerRow.cells.length - 1];
        headerRow.insertBefore(setlistTh, lastTh);
      }
    }

    // 2) Filas
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      // Reconstruir el concertId igual que lo hace calendario.js
      const cells = row.cells;
      if (cells.length < 4) return;
      const dateCellFullText = cells[0]?.textContent.trim() || "";
      const eventTitleFromCell = cells[1]?.textContent.trim().split("\n")[0].trim() || "";
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
        // Insertar justo antes de la última celda ("Info")
        const lastTd = cells[cells.length - 1];
        row.insertBefore(setlistTd, lastTd);
      }

      const json = setlistByConcertId[concertId] || "";
      const hasSetlist = !!(json && json.trim());
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
  }

  function watchBandHelperTable() {
    const container = document.getElementById("bandhelper-concerts-container");
    if (!container) return;
    const obs = new MutationObserver(() => {
      // Cuando calendario.js inyecte/actualice la tabla, añadimos la columna
      refreshSetlistColumn();
    });
    obs.observe(container, { childList: true, subtree: true });
    // Y por si acaso, refrescos periódicos suaves los primeros segundos
    setTimeout(refreshSetlistColumn, 1500);
    setTimeout(refreshSetlistColumn, 3500);
    setTimeout(refreshSetlistColumn, 6000);
  }

  // ============================================================
  // 8. INYECTAR CAMPO "JSON DEL SETLIST" EN MODAL DE CONCIERTO
  //    + hook al botón "Guardar Detalles" para persistirlo
  // ============================================================
  function injectJsonFieldInConcertModal() {
    const modal = document.getElementById("concert-details-modal");
    if (!modal) return;
    if (modal.querySelector(".se-json-block")) return; // ya inyectado

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

    // Lo colocamos justo antes del botón "Guardar Detalles"
    const saveBtn = document.getElementById("save-concert-details");
    if (saveBtn && saveBtn.parentNode) {
      saveBtn.parentNode.insertBefore(block, saveBtn);
    } else {
      // Fallback: al final del modal-content
      const content = modal.querySelector(".modal-content") || modal;
      content.appendChild(block);
    }

    // Validación visual al editar
    const ta = document.getElementById("se-concert-setlist-json");
    const status = document.getElementById("se-concert-setlist-json-status");
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

  /**
   * Cuando se abre el modal del concierto, leemos el JSON guardado
   * en concert_details/{concertId} y lo pintamos.
   */
  function onConcertModalOpen() {
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
    if (!json) {
      status.className = "se-json-status empty";
      status.textContent = "Sin JSON. Se mostrará 'No se ha encontrado ningún setlist'.";
    } else {
      // Validar para feedback inmediato
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

  function watchConcertModal() {
    const modal = document.getElementById("concert-details-modal");
    if (!modal) return;
    // Inyectar de inmediato (no destruye nada si se llama varias veces)
    injectJsonFieldInConcertModal();
    const obs = new MutationObserver(() => {
      if (modal.classList.contains("show")) onConcertModalOpen();
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  /**
   * Hook al botón "Guardar Detalles": cuando el usuario lo pulse,
   * guardamos también el JSON del setlist en el documento de Firestore
   * concert_details/{concertId}, sin tocar el resto del flujo original.
   *
   * Importante: dejamos que la lógica original guarde primero todo
   * (locationDetails, attendees, etc.). Después fusionamos el JSON.
   */
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

        // Usar el mismo helper que setlists.js usa
        if (typeof window.saveDoc === "function") {
          // merge:true para no sobreescribir lo que acaba de guardar saveConcertDetailsLogic
          await window.saveDoc("concert_details", id, { setlistJson: json }, true);
        } else if (typeof db !== "undefined") {
          await db.collection("concert_details").doc(id).set({ setlistJson: json }, { merge: true });
        }
        setlistByConcertId[id] = json;
        refreshSetlistColumn();
      } catch (e) {
        console.warn("[setlist-extension] Error guardando JSON setlist:", e);
      }
    }, true); // capture: true → se ejecuta a la vez que el listener original
  }

  // ============================================================
  // 8.bis  EXPORTACIONES PARA OTROS MÓDULOS (zona privada, etc.)
  // ============================================================
  window.SE = window.SE || {};
  window.SE.parseBandhelperJson    = parseBandhelperJson;
  window.SE.renderSetlistTableInto = renderSetlistTableInto;
  window.SE.toHHMM                 = toHHMM;
  window.SE.toMMSS                 = toMMSS;
  /**
   * Descarga + parsea + renderiza un setlist desde una URL feed BandHelper
   * dentro del elemento parentEl. Devuelve { totalSeconds, items, error }.
   */
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
  // 9. INIT
  // ============================================================
  function init() {
    injectStyles();
    ensureSetlistModal();
    watchConcertModal();
    hookSaveButton();
    watchBandHelperTable();
    attachSetlistListener();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
