/* ============================================================================
   PRIVATE-ZONE.JS  ·  Zona Privada · El Sótano del Doctor
   ----------------------------------------------------------------------------
   Módulo autocontenido. Añade una "Zona Privada" con login por usuario.
   - Login con usuario + contraseña (hasheada SHA-256, almacenada en Firestore)
   - "Recordar siempre" en este dispositivo (localStorage)
   - Múltiples setlists privados (acústicos, especiales...)
   - Notas privadas compartidas
   - Eventos / conciertos privados
   - Panel de administración (solo para admin de la zona privada)

   No modifica NADA del código existente. Si quieres desactivarlo, basta con
   borrar el <script src="private-zone.js"> del index.html.
   ============================================================================ */

(function () {
  'use strict';

  // ============== CONFIGURACIÓN ==============
  const STORAGE_AUTH_KEY = 'elsotano_pz_auth_v1';
  const COL_USERS    = 'pz_users';
  const COL_SETLISTS = 'pz_setlists';
  const COL_NOTES    = 'pz_notes';
  const COL_EVENTS   = 'pz_events';
  const ADMIN_OVERRIDE_PASSWORD = 'Sotano2014'; // Misma que la del admin general (fallback de emergencia)
  const SALT = 'elsotano_pz_2025_salt';

  // ============== ESTADO ==============
  let currentUser     = null;   // { username, isAdmin }
  let privateSetlists = [];
  let privateUsers    = [];
  let privateEvents   = [];
  let privateNotes    = '';
  let listenersAttached = false;

  // ============== UTILIDADES ==============
  async function hashPassword(password) {
    const enc = new TextEncoder();
    const data = enc.encode(password + SALT);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getDb() {
    if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) return null;
    try { return firebase.firestore(); } catch (e) { return null; }
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showMsg(elementId, text, isError = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ff5555' : '#0cf';
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
  }

  // ============== INYECCIÓN DE CSS ==============
  function injectStyles() {
    const css = `
      /* ===== ZONA PRIVADA ===== */
      #zona-privada {
        background: rgba(20, 20, 20, 0.75);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        padding: 20px; border-radius: 12px;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        border: 1px solid rgba(255, 215, 0, 0.2);
        margin-bottom: 40px; display: none;
      }
      #zona-privada.show { display: block; }
      #zona-privada h2 {
        text-align: center; color: #FFD700; margin-bottom: 5px;
        display: flex; align-items: center; justify-content: center; gap: 10px;
      }
      .pz-header-bar {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px; padding-bottom: 10px;
        border-bottom: 1px solid rgba(255, 215, 0, 0.2);
        flex-wrap: wrap; gap: 10px;
      }
      .pz-user-info { color: #FFD700; font-weight: bold; }
      .pz-user-info small { color: #aaa; font-weight: normal; font-style: italic; }
      .pz-logout-btn {
        background: #444; color: #fff; border: 1px solid #666;
        padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.9em;
      }
      .pz-logout-btn:hover { background: #555; border-color: #888; }

      /* ===== LOGIN FORM ===== */
      .pz-login-container {
        max-width: 400px; margin: 30px auto; padding: 25px;
        background: rgba(0, 0, 0, 0.4); border-radius: 12px;
        border: 1px solid rgba(255, 215, 0, 0.3);
      }
      .pz-login-container h3 {
        color: #FFD700; text-align: center; margin: 0 0 5px 0;
      }
      .pz-login-container p.pz-hint {
        color: #aaa; font-size: 0.85em; text-align: center; margin-bottom: 20px;
      }
      .pz-login-container label {
        display: block; margin: 12px 0 5px; color: #FFD700; font-weight: bold;
      }
      .pz-login-container input {
        width: 100%; padding: 10px; background: #222; color: #fff;
        border: 1px solid #444; border-radius: 5px; box-sizing: border-box;
        font-size: 1em;
      }
      .pz-login-container input:focus {
        outline: none; border-color: #FFD700;
        box-shadow: 0 0 6px rgba(255, 215, 0, 0.4);
      }
      .pz-login-container .pz-checkbox-row {
        display: flex; align-items: center; gap: 8px; margin: 15px 0;
        color: #ccc; font-size: 0.9em;
      }
      .pz-login-container .pz-checkbox-row input[type="checkbox"] {
        width: auto; margin: 0;
      }
      .pz-login-btn {
        width: 100%; padding: 12px; margin-top: 15px;
        background: #FFD700; color: #000; border: none; border-radius: 6px;
        font-weight: bold; font-size: 1em; cursor: pointer;
      }
      .pz-login-btn:hover { background: #fff2a7; }
      .pz-login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ===== TABS ===== */
      .pz-tabs {
        display: flex; gap: 5px; border-bottom: 1px solid #333; margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .pz-tab {
        background: transparent; border: none; color: #aaa;
        padding: 10px 18px; cursor: pointer; font-size: 0.95em;
        border-bottom: 2px solid transparent; transition: all 0.2s;
      }
      .pz-tab:hover { color: #fff; }
      .pz-tab.active {
        color: #FFD700; border-bottom-color: #FFD700; font-weight: bold;
      }
      .pz-tab-content { display: none; }
      .pz-tab-content.active { display: block; }

      /* ===== SETLISTS ===== */
      .pz-setlist-list { display: flex; flex-direction: column; gap: 15px; }
      .pz-setlist-card {
        background: rgba(0, 0, 0, 0.3); border: 1px solid #333;
        border-radius: 10px; padding: 15px; transition: border-color 0.2s;
      }
      .pz-setlist-card:hover { border-color: #FFD700; }
      .pz-setlist-card-header {
        display: flex; justify-content: space-between; align-items: center;
        cursor: pointer; flex-wrap: wrap; gap: 10px;
      }
      .pz-setlist-card-title { color: #FFD700; font-size: 1.15em; font-weight: bold; }
      .pz-setlist-card-meta { color: #888; font-size: 0.85em; }
      .pz-setlist-songs {
        display: none; margin-top: 12px; padding-top: 12px;
        border-top: 1px solid #333;
      }
      .pz-setlist-songs.show { display: block; }
      .pz-setlist-songs table {
        width: 100%; border-collapse: collapse; font-size: 0.9em;
      }
      .pz-setlist-songs th, .pz-setlist-songs td {
        padding: 8px; border-bottom: 1px solid #2a2a2a; text-align: left;
      }
      .pz-setlist-songs th { color: #FFD700; }
      .pz-setlist-actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
      .pz-btn {
        background: #FFD700; color: #000; border: none; padding: 6px 12px;
        border-radius: 5px; cursor: pointer; font-size: 0.85em;
      }
      .pz-btn:hover { background: #fff2a7; }
      .pz-btn-secondary { background: #444; color: #fff; }
      .pz-btn-secondary:hover { background: #555; }
      .pz-btn-danger { background: #cc3333; color: #fff; }
      .pz-btn-danger:hover { background: #aa2222; }
      .pz-empty {
        color: #666; font-style: italic; text-align: center;
        padding: 20px;
      }

      /* ===== NOTAS ===== */
      .pz-notes-area {
        width: 100%; min-height: 250px; padding: 12px;
        background: #1a1a1a; color: #fff; border: 1px solid #333;
        border-radius: 8px; font-family: inherit; font-size: 1em; resize: vertical;
        box-sizing: border-box;
      }
      .pz-notes-bar {
        display: flex; justify-content: space-between; align-items: center;
        margin-top: 10px; flex-wrap: wrap; gap: 8px;
      }
      .pz-notes-info { color: #888; font-size: 0.85em; }

      /* ===== EVENTOS ===== */
      .pz-events-list { display: flex; flex-direction: column; gap: 12px; }
      .pz-event-card {
        background: rgba(0, 0, 0, 0.3); border-left: 4px solid #FFD700;
        padding: 12px 15px; border-radius: 6px;
      }
      .pz-event-title { color: #FFD700; font-weight: bold; font-size: 1.05em; }
      .pz-event-date { color: #fff; font-size: 0.9em; margin-top: 3px; }
      .pz-event-location { color: #aaa; font-size: 0.85em; }
      .pz-event-notes { color: #ccc; font-size: 0.9em; margin-top: 8px; white-space: pre-wrap; }
      .pz-event-actions { margin-top: 8px; display: flex; gap: 6px; }

      /* ===== ADMIN PANEL ===== */
      .pz-admin-section {
        background: rgba(255, 0, 0, 0.05); border: 1px dashed #cc3333;
        padding: 15px; border-radius: 8px; margin-bottom: 20px;
      }
      .pz-admin-section h4 { color: #ff8888; margin: 0 0 10px 0; }
      .pz-admin-section .pz-admin-warn {
        color: #ff8888; font-size: 0.85em; font-style: italic; margin-bottom: 10px;
      }
      .pz-users-table {
        width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9em;
      }
      .pz-users-table th, .pz-users-table td {
        padding: 8px; border-bottom: 1px solid #333; text-align: left;
      }
      .pz-users-table th { color: #FFD700; }

      /* ===== MODALES ===== */
      .pz-modal-backdrop {
        display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: 25000;
        justify-content: center; align-items: center; padding: 10px;
        backdrop-filter: blur(3px);
      }
      .pz-modal-backdrop.show { display: flex; }
      .pz-modal {
        background: rgba(26,26,26,0.97); color: #fff; padding: 22px;
        border-radius: 10px; width: 100%; max-width: 600px;
        max-height: 90vh; overflow-y: auto;
        border: 1px solid rgba(255, 215, 0, 0.3);
        box-shadow: 0 0 30px rgba(255,215,0,0.15);
      }
      .pz-modal h3 { color: #FFD700; margin: 0 0 15px 0; }
      .pz-modal label {
        display: block; margin: 10px 0 5px; color: #FFD700; font-weight: bold;
      }
      .pz-modal input, .pz-modal textarea, .pz-modal select {
        width: 100%; padding: 10px; background: #222; color: #fff;
        border: 1px solid #333; border-radius: 5px; box-sizing: border-box;
        font-family: inherit; font-size: 1em;
      }
      .pz-modal textarea { min-height: 80px; resize: vertical; }
      .pz-modal-actions {
        margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end;
        flex-wrap: wrap;
      }

      /* ===== ENLACE EN MENU LATERAL ===== */
      .sidebar a#menu-zona-privada {
        color: #FFD700 !important; font-weight: bold;
        border-top: 1px solid #444; margin-top: 10px; padding-top: 12px;
      }
      .sidebar a#menu-zona-privada:hover { color: #fff2a7 !important; }

      /* ===== RESPONSIVE ===== */
      @media (max-width: 768px) {
        .pz-header-bar { flex-direction: column; align-items: stretch; }
        .pz-tabs { font-size: 0.85em; }
        .pz-tab { padding: 8px 12px; }
        .pz-modal { padding: 15px; }
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'pz-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ============== INYECCIÓN DE HTML ==============
  function injectHtml() {
    // 1) Añadir enlace en el menú lateral (antes del "Cerrar Menú")
    const sidebar = document.getElementById('sidebar-menu');
    const closeMenu = document.getElementById('menu-cerrar');
    if (sidebar && closeMenu) {
      const link = document.createElement('a');
      link.href = '#zona-privada';
      link.id = 'menu-zona-privada';
      link.textContent = '🔒 Zona Privada';
      sidebar.insertBefore(link, closeMenu);
    }

    // 2) Añadir la sección dentro de <main>
    const main = document.querySelector('main');
    if (!main) return;

    const section = document.createElement('section');
    section.id = 'zona-privada';
    section.innerHTML = `
      <h2>🔒 Zona Privada</h2>

      <!-- LOGIN -->
      <div id="pz-login-container" class="pz-login-container">
        <h3>Acceso restringido</h3>
        <p class="pz-hint">Solo usuarios autorizados. Si no tienes credenciales pídelas al admin.</p>
        <label for="pz-username">Usuario</label>
        <input type="text" id="pz-username" autocomplete="username" autocapitalize="none">
        <label for="pz-password">Contraseña</label>
        <input type="password" id="pz-password" autocomplete="current-password">
        <div class="pz-checkbox-row">
          <input type="checkbox" id="pz-remember" checked>
          <label for="pz-remember" style="margin:0; color:#ccc; font-weight:normal;">Recordar en este dispositivo</label>
        </div>
        <button class="pz-login-btn" id="pz-login-submit">Entrar</button>
        <p id="pz-login-msg" style="text-align:center; margin-top:10px; min-height:1.2em;"></p>
      </div>

      <!-- CONTENIDO -->
      <div id="pz-content" style="display:none;">
        <div class="pz-header-bar">
          <div class="pz-user-info">
            👤 <span id="pz-user-name"></span>
            <small id="pz-user-role"></small>
          </div>
          <button class="pz-logout-btn" id="pz-logout-btn">Cerrar sesión</button>
        </div>

        <div class="pz-tabs">
          <button class="pz-tab active" data-tab="setlists">🎵 Setlists Privados</button>
          <button class="pz-tab" data-tab="notes">📝 Notas</button>
          <button class="pz-tab" data-tab="events">📅 Eventos Privados</button>
          <button class="pz-tab" data-tab="admin" id="pz-tab-admin" style="display:none;">⚙️ Admin</button>
        </div>

        <!-- TAB: SETLISTS -->
        <div class="pz-tab-content active" data-tab-content="setlists">
          <div style="text-align:right; margin-bottom:12px;">
            <button class="pz-btn pz-admin-only" id="pz-btn-new-setlist" style="display:none;">+ Nuevo Setlist</button>
          </div>
          <div class="pz-setlist-list" id="pz-setlists-container"></div>
        </div>

        <!-- TAB: NOTAS -->
        <div class="pz-tab-content" data-tab-content="notes">
          <textarea class="pz-notes-area" id="pz-notes-textarea"
                    placeholder="Notas compartidas entre todos los usuarios autorizados..."></textarea>
          <div class="pz-notes-bar">
            <span class="pz-notes-info" id="pz-notes-info"></span>
            <button class="pz-btn" id="pz-notes-save">Guardar Notas</button>
          </div>
        </div>

        <!-- TAB: EVENTOS -->
        <div class="pz-tab-content" data-tab-content="events">
          <div style="text-align:right; margin-bottom:12px;">
            <button class="pz-btn pz-admin-only" id="pz-btn-new-event" style="display:none;">+ Nuevo Evento</button>
          </div>
          <div class="pz-events-list" id="pz-events-container"></div>
        </div>

        <!-- TAB: ADMIN -->
        <div class="pz-tab-content" data-tab-content="admin">
          <div class="pz-admin-section">
            <h4>👥 Gestión de Usuarios Privados</h4>
            <p class="pz-admin-warn">Cada usuario autorizado tendrá su propio usuario y contraseña.</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:10px;">
              <div style="flex:1; min-width:140px;">
                <label style="display:block; color:#FFD700; font-weight:bold; margin-bottom:4px;">Usuario</label>
                <input type="text" id="pz-new-user" placeholder="ej: pablo" autocapitalize="none"
                       style="width:100%; padding:8px; background:#222; color:#fff; border:1px solid #333; border-radius:4px; box-sizing:border-box;">
              </div>
              <div style="flex:1; min-width:140px;">
                <label style="display:block; color:#FFD700; font-weight:bold; margin-bottom:4px;">Contraseña</label>
                <input type="text" id="pz-new-pass" placeholder="contraseña inicial"
                       style="width:100%; padding:8px; background:#222; color:#fff; border:1px solid #333; border-radius:4px; box-sizing:border-box;">
              </div>
              <div style="display:flex; align-items:center; gap:6px; padding-bottom:8px;">
                <input type="checkbox" id="pz-new-admin">
                <label for="pz-new-admin" style="color:#ccc;">Es admin</label>
              </div>
              <button class="pz-btn" id="pz-add-user-btn">Crear</button>
            </div>
            <p id="pz-admin-msg" style="min-height:1.2em;"></p>
            <table class="pz-users-table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Acciones</th></tr></thead>
              <tbody id="pz-users-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    main.appendChild(section);

    // 3) Modales (setlist editor, event editor, password change)
    const modalsHtml = `
      <!-- MODAL: EDITOR DE SETLIST -->
      <div id="pz-modal-setlist" class="pz-modal-backdrop">
        <div class="pz-modal">
          <h3 id="pz-setlist-modal-title">Editar Setlist Privado</h3>
          <input type="hidden" id="pz-setlist-id">
          <label>Nombre del setlist</label>
          <input type="text" id="pz-setlist-name" placeholder="Ej: Acústico Sala X">
          <label>Descripción / Notas</label>
          <textarea id="pz-setlist-desc" placeholder="Detalles del concierto, fecha, lugar..."></textarea>
          <label>URL del feed BandHelper</label>
          <p style="color:#888; font-size:0.8em; margin:0 0 5px 0;">
            Pega la URL completa del feed (igual que en los setlists públicos).
            Ejemplo: <code>https://www.bandhelper.com/feed/set_list/123456</code>
          </p>
          <input type="url" id="pz-setlist-feed-url"
                 placeholder="https://www.bandhelper.com/feed/set_list/..."
                 style="width:100%; font-family:monospace; font-size:.9em;">
          <div class="pz-modal-actions">
            <button class="pz-btn pz-btn-secondary" id="pz-setlist-cancel">Cancelar</button>
            <button class="pz-btn" id="pz-setlist-save">Guardar</button>
          </div>
        </div>
      </div>

      <!-- MODAL: EDITOR DE EVENTO -->
      <div id="pz-modal-event" class="pz-modal-backdrop">
        <div class="pz-modal">
          <h3 id="pz-event-modal-title">Evento Privado</h3>
          <input type="hidden" id="pz-event-id">
          <label>Nombre</label>
          <input type="text" id="pz-event-name" placeholder="Ej: Concierto privado boda Marta">
          <label>Fecha</label>
          <input type="date" id="pz-event-date">
          <label>Lugar</label>
          <input type="text" id="pz-event-location" placeholder="Ej: Finca El Robledal">
          <label>Notas</label>
          <textarea id="pz-event-notes" placeholder="Detalles, contacto, cachet..."></textarea>
          <div class="pz-modal-actions">
            <button class="pz-btn pz-btn-secondary" id="pz-event-cancel">Cancelar</button>
            <button class="pz-btn" id="pz-event-save">Guardar</button>
          </div>
        </div>
      </div>

      <!-- MODAL: CAMBIAR CONTRASEÑA -->
      <div id="pz-modal-password" class="pz-modal-backdrop">
        <div class="pz-modal" style="max-width:400px;">
          <h3>Cambiar contraseña</h3>
          <input type="hidden" id="pz-pwd-userid">
          <p style="color:#aaa;">Usuario: <strong id="pz-pwd-username" style="color:#FFD700;"></strong></p>
          <label>Nueva contraseña</label>
          <input type="text" id="pz-pwd-new" placeholder="Mínimo 4 caracteres">
          <div class="pz-modal-actions">
            <button class="pz-btn pz-btn-secondary" id="pz-pwd-cancel">Cancelar</button>
            <button class="pz-btn" id="pz-pwd-save">Guardar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalsHtml);
  }

  // ============== AUTENTICACIÓN ==============
  async function attemptLogin(username, password) {
    const db = getDb();
    if (!db) throw new Error('Base de datos no disponible');

    username = username.toLowerCase().trim();
    const hashedPwd = await hashPassword(password);

    // Buscar en colección de usuarios
    const snap = await db.collection(COL_USERS).where('username', '==', username).get();
    if (!snap.empty) {
      const userDoc = snap.docs[0].data();
      if (userDoc.passwordHash === hashedPwd) {
        return { username: userDoc.username, isAdmin: !!userDoc.isAdmin };
      }
    }

    // Fallback: si NO hay usuarios todavía, permitir el "admin" con la contraseña maestra
    // Esto sirve para crear el primer usuario.
    const allUsersSnap = await db.collection(COL_USERS).limit(1).get();
    if (allUsersSnap.empty) {
      if (username === 'admin' && password === ADMIN_OVERRIDE_PASSWORD) {
        return { username: 'admin', isAdmin: true, _bootstrap: true };
      }
    }

    return null;
  }

  function saveAuth(user, remember) {
    currentUser = user;
    if (remember) {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify({
        username: user.username, isAdmin: user.isAdmin
      }));
    } else {
      sessionStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify({
        username: user.username, isAdmin: user.isAdmin
      }));
    }
  }

  function loadStoredAuth() {
    let stored = localStorage.getItem(STORAGE_AUTH_KEY) || sessionStorage.getItem(STORAGE_AUTH_KEY);
    if (stored) {
      try { currentUser = JSON.parse(stored); } catch (e) { currentUser = null; }
    }
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem(STORAGE_AUTH_KEY);
    sessionStorage.removeItem(STORAGE_AUTH_KEY);
    renderUI();
  }

  // ============== LISTENERS DE FIRESTORE ==============
  function attachListeners() {
    if (listenersAttached) return;
    const db = getDb();
    if (!db) return;
    listenersAttached = true;

    db.collection(COL_USERS).onSnapshot(snap => {
      privateUsers = [];
      snap.forEach(doc => privateUsers.push({ id: doc.id, ...doc.data() }));
      renderUsersList();
    }, err => console.warn('PZ users listener error:', err));

    db.collection(COL_SETLISTS).onSnapshot(snap => {
      privateSetlists = [];
      snap.forEach(doc => privateSetlists.push({ id: doc.id, ...doc.data() }));
      privateSetlists.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      renderSetlists();
    }, err => console.warn('PZ setlists listener error:', err));

    db.collection(COL_NOTES).doc('shared').onSnapshot(doc => {
      if (doc.exists) {
        privateNotes = doc.data().content || '';
        const meta = doc.data();
        const ta = document.getElementById('pz-notes-textarea');
        const info = document.getElementById('pz-notes-info');
        if (ta && document.activeElement !== ta) ta.value = privateNotes;
        if (info && meta.lastUpdatedBy) {
          const dt = meta.lastUpdatedAt ? new Date(meta.lastUpdatedAt).toLocaleString() : '';
          info.textContent = `Última actualización: ${meta.lastUpdatedBy} · ${dt}`;
        }
      }
    }, err => console.warn('PZ notes listener error:', err));

    db.collection(COL_EVENTS).onSnapshot(snap => {
      privateEvents = [];
      snap.forEach(doc => privateEvents.push({ id: doc.id, ...doc.data() }));
      privateEvents.sort((a, b) => new Date(a.date || '9999') - new Date(b.date || '9999'));
      renderEvents();
    }, err => console.warn('PZ events listener error:', err));
  }

  // ============== RENDER ==============
  function renderUI() {
    const loginEl = document.getElementById('pz-login-container');
    const contentEl = document.getElementById('pz-content');
    if (!loginEl || !contentEl) return;

    if (currentUser) {
      loginEl.style.display = 'none';
      contentEl.style.display = 'block';
      const nameEl = document.getElementById('pz-user-name');
      const roleEl = document.getElementById('pz-user-role');
      if (nameEl) nameEl.textContent = currentUser.username;
      if (roleEl) roleEl.textContent = currentUser.isAdmin ? '· admin' : '';

      // Mostrar/ocultar elementos de admin
      const isAdmin = !!currentUser.isAdmin;
      document.querySelectorAll('.pz-admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
      });
      const adminTab = document.getElementById('pz-tab-admin');
      if (adminTab) adminTab.style.display = isAdmin ? '' : 'none';

      attachListeners();
      renderSetlists();
      renderEvents();
      renderUsersList();
    } else {
      loginEl.style.display = 'block';
      contentEl.style.display = 'none';
    }
  }

  function renderSetlists() {
    const container = document.getElementById('pz-setlists-container');
    if (!container) return;
    if (privateSetlists.length === 0) {
      container.innerHTML = '<p class="pz-empty">No hay setlists privados todavía.</p>';
      return;
    }
    const isAdmin = currentUser && currentUser.isAdmin;
    container.innerHTML = privateSetlists.map(sl => {
      const adminBtns = isAdmin ? `
        <button class="pz-btn" data-action="edit-setlist" data-id="${sl.id}">Editar</button>
        <button class="pz-btn pz-btn-danger" data-action="delete-setlist" data-id="${sl.id}">Eliminar</button>
      ` : '';
      const hasUrl = !!(sl.feedUrl && sl.feedUrl.trim());
      const subtitle = sl.description
        ? `<div class="pz-setlist-card-meta">${escapeHtml(sl.description)}</div>`
        : '';
      const urlMeta = hasUrl
        ? `<div class="pz-setlist-card-meta" style="color:#6f6;">✓ Feed BandHelper configurado</div>`
        : `<div class="pz-setlist-card-meta" style="color:#f88;">⚠️ Sin URL de feed BandHelper</div>`;
      return `
        <div class="pz-setlist-card">
          <div class="pz-setlist-card-header" data-action="toggle-setlist" data-id="${sl.id}">
            <div>
              <div class="pz-setlist-card-title">${escapeHtml(sl.name)}</div>
              ${subtitle}
              ${urlMeta}
            </div>
            <div style="color:#FFD700;">▼</div>
          </div>
          <div class="pz-setlist-songs" id="pz-songs-${sl.id}">
            <div class="pz-setlist-render" id="pz-render-${sl.id}" data-feed-url="${escapeHtml(sl.feedUrl || '')}" data-loaded="0">
              <p class="pz-empty">Pulsa la cabecera para cargar el setlist.</p>
            </div>
            <div class="pz-setlist-actions">${adminBtns}</div>
          </div>
        </div>`;
    }).join('');
  }

  // Cargar el setlist en su contenedor (la primera vez que se abre)
  async function ensureSetlistLoaded(id) {
    const renderEl = document.getElementById('pz-render-' + id);
    if (!renderEl) return;
    if (renderEl.dataset.loaded === '1') return;
    const url = renderEl.dataset.feedUrl || '';
    if (window.SE && typeof window.SE.renderFromFeedUrl === 'function') {
      await window.SE.renderFromFeedUrl(renderEl, url, { appendTotal: true });
    } else {
      renderEl.innerHTML = '<p class="pz-empty" style="color:#f88;">El módulo setlist-extension.js no está cargado.</p>';
    }
    renderEl.dataset.loaded = '1';
  }

  function renderEvents() {
    const container = document.getElementById('pz-events-container');
    if (!container) return;
    if (privateEvents.length === 0) {
      container.innerHTML = '<p class="pz-empty">No hay eventos privados.</p>';
      return;
    }
    const isAdmin = currentUser && currentUser.isAdmin;
    container.innerHTML = privateEvents.map(ev => {
      const dateStr = ev.date
        ? new Date(ev.date + 'T00:00:00').toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long', year:'numeric'})
        : '(sin fecha)';
      const adminBtns = isAdmin ? `
        <div class="pz-event-actions">
          <button class="pz-btn" data-action="edit-event" data-id="${ev.id}">Editar</button>
          <button class="pz-btn pz-btn-danger" data-action="delete-event" data-id="${ev.id}">Eliminar</button>
        </div>` : '';
      return `
        <div class="pz-event-card">
          <div class="pz-event-title">${escapeHtml(ev.name)}</div>
          <div class="pz-event-date">📅 ${dateStr}</div>
          ${ev.location ? `<div class="pz-event-location">📍 ${escapeHtml(ev.location)}</div>` : ''}
          ${ev.notes ? `<div class="pz-event-notes">${escapeHtml(ev.notes)}</div>` : ''}
          ${adminBtns}
        </div>`;
    }).join('');
  }

  function renderUsersList() {
    const tbody = document.getElementById('pz-users-tbody');
    if (!tbody) return;
    if (privateUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:#888; font-style:italic;">Sin usuarios.</td></tr>';
      return;
    }
    tbody.innerHTML = privateUsers.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>${u.isAdmin ? '<span style="color:#ff8888;">admin</span>' : 'usuario'}</td>
        <td>
          <button class="pz-btn pz-btn-secondary" data-action="change-pwd" data-id="${u.id}" data-username="${escapeHtml(u.username)}">🔑 Cambiar contraseña</button>
          <button class="pz-btn" data-action="toggle-admin" data-id="${u.id}">${u.isAdmin ? 'Quitar admin' : 'Hacer admin'}</button>
          <button class="pz-btn pz-btn-danger" data-action="delete-user" data-id="${u.id}" data-username="${escapeHtml(u.username)}">Eliminar</button>
        </td>
      </tr>`).join('');
  }

  // ============== ACCIONES (CRUD) ==============
  async function bootstrapFirstUser(password) {
    const db = getDb();
    if (!db) throw new Error('No DB');
    const hashedPwd = await hashPassword(password);
    await db.collection(COL_USERS).add({
      username: 'admin',
      passwordHash: hashedPwd,
      isAdmin: true,
      createdAt: Date.now(),
      bootstrap: true
    });
  }

  async function addUser(username, password, isAdmin) {
    const db = getDb();
    username = username.toLowerCase().trim();
    if (!username || !password || password.length < 4) {
      throw new Error('Usuario y contraseña requeridos (mín. 4 caracteres).');
    }
    const exists = await db.collection(COL_USERS).where('username', '==', username).get();
    if (!exists.empty) throw new Error('Ese usuario ya existe.');
    const hashedPwd = await hashPassword(password);
    await db.collection(COL_USERS).add({
      username, passwordHash: hashedPwd,
      isAdmin: !!isAdmin,
      createdAt: Date.now(),
      createdBy: currentUser ? currentUser.username : 'system'
    });
  }

  async function deleteUser(id, username) {
    if (!confirm(`¿Eliminar al usuario "${username}"?`)) return;
    const db = getDb();
    await db.collection(COL_USERS).doc(id).delete();
  }

  async function toggleAdmin(id) {
    const db = getDb();
    const user = privateUsers.find(u => u.id === id);
    if (!user) return;
    if (!confirm(`¿${user.isAdmin ? 'Quitar' : 'Dar'} permisos de admin a "${user.username}"?`)) return;
    await db.collection(COL_USERS).doc(id).update({ isAdmin: !user.isAdmin });
  }

  async function changeUserPassword(id, newPwd) {
    if (!newPwd || newPwd.length < 4) throw new Error('Mínimo 4 caracteres.');
    const db = getDb();
    const hashedPwd = await hashPassword(newPwd);
    await db.collection(COL_USERS).doc(id).update({ passwordHash: hashedPwd });
  }

  function parseSongsText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        title: parts[0] || '',
        key:   parts[1] || '',
        tempo: parts[2] || '',
        notes: parts[3] || ''
      };
    });
  }

  function songsToText(songs) {
    return (songs || []).map(s => {
      const parts = [s.title || '', s.key || '', s.tempo || '', s.notes || ''];
      while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
      return parts.join(' | ');
    }).join('\n');
  }

  async function saveSetlist(id, name, description, feedUrl) {
    const db = getDb();
    if (!name.trim()) throw new Error('El nombre es obligatorio.');
    const data = {
      name: name.trim(),
      description: description.trim(),
      feedUrl: (feedUrl || '').trim(),
      updatedAt: Date.now(),
      updatedBy: currentUser.username
    };
    if (id) {
      await db.collection(COL_SETLISTS).doc(id).update(data);
    } else {
      data.createdAt = Date.now();
      data.createdBy = currentUser.username;
      await db.collection(COL_SETLISTS).add(data);
    }
  }

  async function deleteSetlist(id) {
    if (!confirm('¿Eliminar este setlist privado?')) return;
    const db = getDb();
    await db.collection(COL_SETLISTS).doc(id).delete();
  }

  async function saveEvent(id, name, date, location, notes) {
    const db = getDb();
    if (!name.trim()) throw new Error('El nombre es obligatorio.');
    const data = {
      name: name.trim(), date: date || '',
      location: location.trim(), notes: notes.trim(),
      updatedAt: Date.now(), updatedBy: currentUser.username
    };
    if (id) {
      await db.collection(COL_EVENTS).doc(id).update(data);
    } else {
      data.createdAt = Date.now();
      data.createdBy = currentUser.username;
      await db.collection(COL_EVENTS).add(data);
    }
  }

  async function deleteEvent(id) {
    if (!confirm('¿Eliminar este evento?')) return;
    const db = getDb();
    await db.collection(COL_EVENTS).doc(id).delete();
  }

  async function saveSharedNotes(content) {
    const db = getDb();
    await db.collection(COL_NOTES).doc('shared').set({
      content, lastUpdatedBy: currentUser.username, lastUpdatedAt: Date.now()
    }, { merge: true });
  }

  // ============== EVENT HANDLERS (defensivo) ==============
  // Helper: envuelve callbacks en try/catch para que NUNCA rompan la página
  function _safe(fn, label) {
    try { return fn(); }
    catch (e) { console.warn('[private-zone] ' + (label || 'err') + ':', e && e.message); return null; }
  }
  function _on(elId, evt, handler) {
    const el = document.getElementById(elId);
    if (!el) { console.warn('[private-zone] elemento no encontrado:', elId); return; }
    el.addEventListener(evt, handler);
  }

  function setupEventHandlers() {
    _safe(() => {
      // Login
      const loginBtn = document.getElementById('pz-login-submit');
      const userInp  = document.getElementById('pz-username');
      const passInp  = document.getElementById('pz-password');
      const remInp   = document.getElementById('pz-remember');

      async function handleLogin() {
        if (!userInp || !passInp) return;
        const u = userInp.value, p = passInp.value;
        if (!u || !p) { showMsg('pz-login-msg', 'Usuario y contraseña requeridos.', true); return; }
        if (loginBtn) loginBtn.disabled = true;
        try {
          const result = await attemptLogin(u, p);
          if (!result) {
            showMsg('pz-login-msg', 'Credenciales incorrectas.', true);
          } else {
            if (result._bootstrap) {
              await bootstrapFirstUser(p);
              showMsg('pz-login-msg', 'Primer admin creado. Bienvenido.', false);
            }
            saveAuth({ username: result.username, isAdmin: result.isAdmin }, remInp ? remInp.checked : true);
            passInp.value = '';
            renderUI();
          }
        } catch (e) {
          showMsg('pz-login-msg', 'Error: ' + e.message, true);
        } finally {
          if (loginBtn) loginBtn.disabled = false;
        }
      }
      if (loginBtn) loginBtn.addEventListener('click', handleLogin);
      [userInp, passInp].forEach(inp => {
        if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
      });

      // Logout
      _on('pz-logout-btn', 'click', () => {
        if (confirm('¿Cerrar sesión de la zona privada?')) logout();
      });

      // Tabs
      document.querySelectorAll('.pz-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.dataset.tab;
          document.querySelectorAll('.pz-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          document.querySelectorAll('.pz-tab-content').forEach(c => c.classList.remove('active'));
          const content = document.querySelector(`[data-tab-content="${target}"]`);
          if (content) content.classList.add('active');
        });
      });

      // Click delegation en zona-privada
      const zona = document.getElementById('zona-privada');
      if (zona) {
        zona.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          try {
            if (action === 'toggle-setlist') {
              const songsBox = document.getElementById('pz-songs-' + id);
              if (!songsBox) return;
              songsBox.classList.toggle('show');
              if (songsBox.classList.contains('show')) {
                await ensureSetlistLoaded(id);
              }
            } else if (action === 'edit-setlist') {
              openSetlistModal(id);
            } else if (action === 'delete-setlist') {
              await deleteSetlist(id);
            } else if (action === 'edit-event') {
              openEventModal(id);
            } else if (action === 'delete-event') {
              await deleteEvent(id);
            } else if (action === 'change-pwd') {
              openPasswordModal(id, btn.dataset.username);
            } else if (action === 'toggle-admin') {
              await toggleAdmin(id);
            } else if (action === 'delete-user') {
              await deleteUser(id, btn.dataset.username);
            }
          } catch (err) {
            alert('Error: ' + err.message);
          }
        });
      }

      // Botones globales
      _on('pz-btn-new-setlist', 'click', () => openSetlistModal(null));
      _on('pz-btn-new-event', 'click', () => openEventModal(null));

      // Notas
      _on('pz-notes-save', 'click', async () => {
        try {
          const ta = document.getElementById('pz-notes-textarea');
          await saveSharedNotes(ta ? ta.value : '');
          showMsg('pz-notes-info', 'Guardado ✓', false);
        } catch (e) { alert('Error: ' + e.message); }
      });

      // Admin: crear usuario
      _on('pz-add-user-btn', 'click', async () => {
        try {
          const u = document.getElementById('pz-new-user')?.value;
          const p = document.getElementById('pz-new-pass')?.value;
          const a = document.getElementById('pz-new-admin')?.checked;
          await addUser(u, p, a);
          const userF = document.getElementById('pz-new-user'); if (userF) userF.value = '';
          const passF = document.getElementById('pz-new-pass'); if (passF) passF.value = '';
          const adminF = document.getElementById('pz-new-admin'); if (adminF) adminF.checked = false;
          showMsg('pz-admin-msg', 'Usuario creado ✓', false);
        } catch (e) {
          showMsg('pz-admin-msg', e.message, true);
        }
      });

      // Modales: setlist
      _on('pz-setlist-cancel', 'click', () => closeModal('pz-modal-setlist'));
      _on('pz-setlist-save', 'click', async () => {
        try {
          const id = document.getElementById('pz-setlist-id')?.value;
          await saveSetlist(
            id || null,
            document.getElementById('pz-setlist-name')?.value || '',
            document.getElementById('pz-setlist-desc')?.value || '',
            document.getElementById('pz-setlist-feed-url')?.value || ''
          );
          closeModal('pz-modal-setlist');
        } catch (e) { alert('Error: ' + e.message); }
      });

      // Modales: evento
      _on('pz-event-cancel', 'click', () => closeModal('pz-modal-event'));
      _on('pz-event-save', 'click', async () => {
        try {
          const id = document.getElementById('pz-event-id')?.value;
          await saveEvent(
            id || null,
            document.getElementById('pz-event-name')?.value || '',
            document.getElementById('pz-event-date')?.value || '',
            document.getElementById('pz-event-location')?.value || '',
            document.getElementById('pz-event-notes')?.value || ''
          );
          closeModal('pz-modal-event');
        } catch (e) { alert('Error: ' + e.message); }
      });

      // Modal: cambio de contraseña
      _on('pz-pwd-cancel', 'click', () => closeModal('pz-modal-password'));
      _on('pz-pwd-save', 'click', async () => {
        try {
          const id = document.getElementById('pz-pwd-userid')?.value;
          const newPwd = document.getElementById('pz-pwd-new')?.value;
          await changeUserPassword(id, newPwd);
          closeModal('pz-modal-password');
          alert('Contraseña actualizada.');
        } catch (e) { alert('Error: ' + e.message); }
      });

      // Cerrar modales pulsando el backdrop
      document.querySelectorAll('.pz-modal-backdrop').forEach(bd => {
        bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('show'); });
      });

      // Enlace del menú lateral: cierra sidebar y hace scroll
      const menuLink = document.getElementById('menu-zona-privada');
      if (menuLink) {
        menuLink.addEventListener('click', e => {
          e.preventDefault();
          const sb = document.getElementById('sidebar-menu');
          const ov = document.getElementById('overlay');
          if (sb) sb.classList.remove('show');
          if (ov) ov.classList.remove('show');
          // Restauramos overflow por si el menú original lo cambió
          document.body.style.overflow = '';
          const target = document.getElementById('zona-privada');
          if (target) {
            target.classList.add('show');
            const headerOffset = (document.querySelector('header')?.offsetHeight || 60);
            const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset - 10;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        });
      }
    }, 'setupEventHandlers');
  }

  function openModal(id) {
    document.getElementById(id).classList.add('show');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('show');
  }

  function openSetlistModal(id) {
    document.getElementById('pz-setlist-modal-title').textContent = id ? 'Editar Setlist' : 'Nuevo Setlist Privado';
    document.getElementById('pz-setlist-id').value = id || '';
    if (id) {
      const sl = privateSetlists.find(s => s.id === id);
      if (sl) {
        document.getElementById('pz-setlist-name').value = sl.name || '';
        document.getElementById('pz-setlist-desc').value = sl.description || '';
        document.getElementById('pz-setlist-feed-url').value = sl.feedUrl || '';
      }
    } else {
      document.getElementById('pz-setlist-name').value = '';
      document.getElementById('pz-setlist-desc').value = '';
      document.getElementById('pz-setlist-feed-url').value = '';
    }
    openModal('pz-modal-setlist');
  }

  function openEventModal(id) {
    document.getElementById('pz-event-modal-title').textContent = id ? 'Editar Evento' : 'Nuevo Evento Privado';
    document.getElementById('pz-event-id').value = id || '';
    if (id) {
      const ev = privateEvents.find(e => e.id === id);
      if (ev) {
        document.getElementById('pz-event-name').value = ev.name || '';
        document.getElementById('pz-event-date').value = ev.date || '';
        document.getElementById('pz-event-location').value = ev.location || '';
        document.getElementById('pz-event-notes').value = ev.notes || '';
      }
    } else {
      document.getElementById('pz-event-name').value = '';
      document.getElementById('pz-event-date').value = '';
      document.getElementById('pz-event-location').value = '';
      document.getElementById('pz-event-notes').value = '';
    }
    openModal('pz-modal-event');
  }

  function openPasswordModal(id, username) {
    document.getElementById('pz-pwd-userid').value = id;
    document.getElementById('pz-pwd-username').textContent = username;
    document.getElementById('pz-pwd-new').value = '';
    openModal('pz-modal-password');
  }

  // ============== INIT (defensivo) ==============
  let _initialized = false;
  function init() {
    if (_initialized) return;
    // No bloqueamos si Firebase aún no está listo. Lo verificamos solo
    // cuando el usuario intenta hacer login. Así NUNCA rompemos la página.
    _initialized = true;
    _safe(injectStyles, 'injectStyles');
    _safe(injectHtml, 'injectHtml');
    _safe(loadStoredAuth, 'loadStoredAuth');
    _safe(setupEventHandlers, 'setupEventHandlers');
    _safe(renderUI, 'renderUI');
    if (currentUser) {
      // Esperar a que Firebase exista antes de adjuntar listeners
      const tryAttach = (delay) => setTimeout(() => _safe(attachListeners, 'attachListeners'), delay);
      tryAttach(0);
      tryAttach(2000);
      tryAttach(5000);
    }
  }

  function _start() {
    // Nos enganchamos al "load" + 3.5s para que el splash, Firebase,
    // setlists.js, calendario.js y todo lo del index estén ya configurados.
    const deferred = () => setTimeout(() => _safe(init, 'init'), 3500);
    if (document.readyState === 'complete') deferred();
    else window.addEventListener('load', deferred, { once: true });
  }

  _start();
})();
