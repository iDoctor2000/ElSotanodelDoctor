
/* 
   ENSAYOS.JS
   Gestión de calendario de ensayos, asistencias y notas.
*/

console.log("--- ENSAYOS.JS CARGADO ---");

// Variables Globales de Ensayos
window.rehearsals = [];
window.editingRehearsalIndex = null;
const excludedRehearsalUsers = ["Ximo", "Ginés Torres"];

// Referencias a modales (se inicializan al cargar el DOM)
let rehearsalDetailModal = null;

document.addEventListener("DOMContentLoaded", () => {
    // Inicializar referencias
    rehearsalDetailModal = document.getElementById('rehearsal-details-modal');

    // 1. Listener para Preview del Día
    const dateInput = document.getElementById("rehearsal-date");
    if(dateInput) {
        dateInput.addEventListener("change", function() {
            const val = this.value;
            const target = document.getElementById("rehearsal-day-preview");
            if(!val) { target.textContent = ""; return; }
            const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
            const d = new Date(val + 'T00:00:00');
            target.textContent = isNaN(d.getTime()) ? "" : `(${days[d.getDay()]})`;
        });
    }

    // 2. Listeners de Menú y Botones de Configuración
    const menuRehearsal = document.getElementById("menu-rehearsal");
    if(menuRehearsal) {
        menuRehearsal.onclick = e => { 
            e.preventDefault(); 
            if(window.openConfigScreen) window.openConfigScreen("rehearsal-screen"); 
        };
    }

    const closeRehearsal = document.getElementById("close-rehearsal");
    if(closeRehearsal) {
        closeRehearsal.onclick = () => { 
            document.getElementById("rehearsal-screen").style.display = "none"; 
            document.getElementById("rehearsal-message").textContent = ""; 
            window.resetRehearsalForm(); 
        };
    }

    const addRehearsalBtn = document.getElementById("add-rehearsal");
    if(addRehearsalBtn) {
        addRehearsalBtn.onclick = async () => { 
            const msg = document.getElementById("rehearsal-message");
            msg.textContent = "";
            const date = document.getElementById("rehearsal-date").value;
            const startTime = document.getElementById("rehearsal-start-time").value;
            const endTime = document.getElementById("rehearsal-end-time").value;
            const loc = document.getElementById("rehearsal-location").value.trim();
            
            if(!date || !startTime || !endTime || !loc){
                msg.className = "error-message";
                msg.textContent = "Completa campos.";
                return; 
            } 
            
            if(window.calculateDuration(startTime, endTime) <= 0){
                msg.className = "error-message";
                msg.textContent = "Hora fin posterior a inicio.";
                return; 
            } 
            
            try {
                const newData = { date, startTime, endTime, location: loc, attendance: [] };
                if(window.editingRehearsalIndex !== null){
                    newData.attendance = window.rehearsals[window.editingRehearsalIndex].attendance || [];
                    newData.notes = window.rehearsals[window.editingRehearsalIndex].notes || ""; // Mantener notas
                    window.rehearsals[window.editingRehearsalIndex] = newData;
                    msg.textContent = "Ensayo actualizado.";
                } else {
                    window.rehearsals.push(newData);
                    msg.textContent = "Ensayo añadido.";
                } 
                await window.saveRehearsals();
                msg.className = "success-message";
                window.resetRehearsalForm();
            } catch(e) {
                msg.className = "error-message";
                msg.textContent = "Error al guardar: " + e.message;
            }
        };
    }

    const cancelEditBtn = document.getElementById("cancel-edit-rehearsal");
    if(cancelEditBtn) {
        cancelEditBtn.onclick = () => { 
            window.resetRehearsalForm(); 
            document.getElementById("rehearsal-message").textContent = ""; 
        };
    }

    // 3. Listeners del Modal de Detalles
    const closeDetailModalBtn = document.getElementById('close-rehearsal-details-modal');
    if(closeDetailModalBtn) {
        closeDetailModalBtn.onclick = () => {
            if(rehearsalDetailModal) rehearsalDetailModal.classList.remove('show');
        };
    }

    const saveDetailBtn = document.getElementById('save-rehearsal-details');
    if(saveDetailBtn) {
        saveDetailBtn.onclick = async () => {
            const index = parseInt(document.getElementById('rehearsal-detail-index').value, 10);
            const notes = document.getElementById('rehearsal-notes').value;
            const msg = document.getElementById('rehearsal-detail-message');
            if (window.rehearsals[index]) {
                window.rehearsals[index].notes = notes;
                try {
                    await window.saveRehearsals();
                    msg.textContent = "Información guardada correctamente.";
                    msg.className = "success-message";
                } catch (e) {
                    msg.textContent = "Error al guardar: " + e.message;
                    msg.className = "error-message";
                }
            }
        };
    }

    // 4. NUEVO: Listeners para la nueva pantalla de visualización
    const btnOpenRehearsals = document.getElementById('btn-open-rehearsals-view');
    if(btnOpenRehearsals) {
        btnOpenRehearsals.onclick = () => {
            if(window.openConfigScreen) window.openConfigScreen("rehearsals-view-screen");
        };
    }

    const btnCloseRehearsalsView = document.getElementById('close-rehearsals-view');
    if(btnCloseRehearsalsView) {
        btnCloseRehearsalsView.onclick = () => {
            document.getElementById("rehearsals-view-screen").style.display = "none";
        };
    }
});

// --- FUNCIONES LÓGICAS ---

window.renderRehearsals = function() { 
    const tbodyConfig = document.getElementById("rehearsal-table-body");
    const tbodyMain = document.getElementById("rehearsal-main-body");
    
    if(!tbodyConfig || !tbodyMain){ console.error("Tablas de ensayos no encontradas en el DOM."); return; } 
    
    // Ordenar por fecha
    window.rehearsals.sort((a,b) => new Date(a.date+'T'+(a.startTime||'00:00')) - new Date(b.date+'T'+(b.startTime||'00:00')));
    tbodyConfig.innerHTML = tbodyMain.innerHTML = "";
    
    if(!Array.isArray(window.rehearsals) || window.rehearsals.length === 0){
        const emptyMsgConfig = '<tr><td colspan="6">No hay ensayos programados.</td></tr>';
        tbodyConfig.innerHTML = emptyMsgConfig;
        const emptyMsgMain = '<tr><td colspan="6">No hay próximos ensayos.</td></tr>';
        tbodyMain.innerHTML = emptyMsgMain;
        return;
    } 
    
    const availableUsersForRehearsal = window.users.filter(user => !excludedRehearsalUsers.includes(user.name));
    const userOptions = availableUsersForRehearsal.length > 0 
        ? availableUsersForRehearsal.map(user => `<option value="${user.name}">${user.nickname||user.name}</option>`).join("") 
        : `<option value="" disabled>No hay usuarios disponibles</option>`;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); 
    
    window.rehearsals.forEach((r, i) => {
        // Fix legacy time format
        if(r.time && (!r.startTime || !r.endTime)){
            r.startTime = r.time;
            const [hours, minutes] = r.time.split(":").map(Number);
            const endHours = (hours + 2) % 24;
            r.endTime = `${String(endHours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}`;
            delete r.time;
        } 
        
        const formattedDate = window.formatDateWithDay(r.date);
        const durationSeconds = window.calculateDuration(r.startTime, r.endTime);
        const durationText = window.toHHMM(durationSeconds);
        const attendance = Array.isArray(r.attendance) ? r.attendance : [];
        
        const getAttendeeNicknames = status => attendance.filter(a => a.attending === status).map(a => {
            const user = window.users.find(u => u.name === a.name);
            return user ? user.nickname : a.name;
        }).join(", ") || "Ninguno";
        
        const summary = `<div class="attendance-summary"><span class="attending-yes">Asisten: ${getAttendeeNicknames("Sí")}</span><span class="attending-no">No asisten: ${getAttendeeNicknames("No")}</span></div>`;
        
        // Tabla de configuración Admin con botón Copiar
        tbodyConfig.insertAdjacentHTML("beforeend", `<tr><td>${r.date}</td><td>${r.startTime}</td><td>${r.endTime}</td><td>${r.location}</td><td>${summary}</td><td><button data-i="${i}" class="copy-rehearsal">Copiar</button><button data-i="${i}" class="edit-rehearsal">Editar</button><button data-i="${i}" class="clear-attendance">Eliminar Asistentes</button><button data-i="${i}" class="delete-rehearsal">Eliminar</button></td></tr>`); 
        
        // Tabla Principal (Solo futuros u hoy)
        const rehearsalDate = new Date(r.date + 'T00:00:00Z');
        if(rehearsalDate >= today){
            // Construcción de botones
            const calendarBtnContent = `<button class="calendar-btn" title="Añadir a mi calendario" onclick='window.generateICS("Ensayo El Sótano del Doctor", "${r.date}", "${r.startTime}", "${r.location}", "Ensayo de la banda El Sótano del Doctor.", ${durationSeconds})'><svg viewBox="0 0 24 24"><path d="M12 4V2m0 20v-2m8-8h2m-20 0h-2m15.071-3.071l-1.414-1.414M5.343 17.657l-1.414-1.414m0-10.486l1.414-1.414m12.728 12.728l-1.414 1.414"/><rect x="4" y="6" width="16" height="12" rx="2"/></svg></button>`;
            const detailsBtnContent = `<button class="details-btn" onclick="window.openRehearsalDetailsModal(${i})" title="Notas del Ensayo">➡️</button>`;
            
            // Fila con data-labels para Responsive Card View
            const rowHtml = `
            <tr>
                <td data-label="Fecha">${formattedDate} <span class="rehearsal-duration">(${durationText})</span></td>
                <td data-label="Hora">${r.startTime} - ${r.endTime}</td>
                <td data-label="Lugar">${r.location}</td>
                <td data-label="Cal" class="calendar-col">${calendarBtnContent}</td>
                <td data-label="Info" class="details-col-header">${detailsBtnContent}</td>
                <td data-label="Asistencia">
                    <div class="attendance-form">
                        <select class="attendance-user" data-i="${i}"><option value="" disabled selected>¿Nombre?</option>${userOptions}</select>
                        <select class="attendance-response" data-i="${i}"><option value="" disabled selected>¿Asistirás?</option><option value="Sí">Sí</option><option value="No">No</option></select>
                        <button class="confirm-attendance" data-i="${i}">Confirmar</button>
                    </div>
                    ${summary}
                </td>
            </tr>`;
            
            tbodyMain.insertAdjacentHTML("beforeend", rowHtml);
        }
    }); 

    // Listeners Admin (Config Screen)
    tbodyConfig.querySelectorAll(".copy-rehearsal").forEach(btn => btn.onclick = () => {
        const index = parseInt(btn.dataset.i, 10);
        const rehearsal = window.rehearsals[index];
        document.getElementById("rehearsal-start-time").value = rehearsal.startTime || "";
        document.getElementById("rehearsal-end-time").value = rehearsal.endTime || "";
        document.getElementById("rehearsal-location").value = rehearsal.location || "";
        document.getElementById("rehearsal-date").focus();
        document.getElementById("rehearsal-screen").scrollTop = 0;
        // Trigger preview dia si hay fecha
        document.getElementById("rehearsal-date").dispatchEvent(new Event('change'));
    });

    tbodyConfig.querySelectorAll(".edit-rehearsal").forEach(btn => btn.onclick = () => {
        window.editingRehearsalIndex = parseInt(btn.dataset.i, 10);
        const rehearsal = window.rehearsals[window.editingRehearsalIndex];
        document.getElementById("rehearsal-date").value = rehearsal.date;
        document.getElementById("rehearsal-start-time").value = rehearsal.startTime;
        document.getElementById("rehearsal-end-time").value = rehearsal.endTime;
        document.getElementById("rehearsal-location").value = rehearsal.location;
        document.getElementById("add-rehearsal").textContent = "Guardar Cambios";
        document.getElementById("cancel-edit-rehearsal").style.display = "inline-block";
        document.getElementById("rehearsal-date").dispatchEvent(new Event('change'));
    }); 

    tbodyConfig.querySelectorAll(".delete-rehearsal").forEach(btn => btn.onclick = async () => {
        if(confirm("¿Estás seguro de que deseas eliminar este ensayo?")){
            window.rehearsals.splice(parseInt(btn.dataset.i, 10), 1);
            await window.saveRehearsals();
            if(window.renderStats) window.renderStats();
        }
    }); 

    tbodyConfig.querySelectorAll(".clear-attendance").forEach(btn => btn.onclick = async () => {
        const index = parseInt(btn.dataset.i, 10);
        const rehearsal = window.rehearsals[index];
        if(confirm(`¿Eliminar asistencias para ensayo del ${window.formatDateWithDay(rehearsal.date)} en ${rehearsal.location}?`)){
            rehearsal.attendance = [];
            await window.saveRehearsals();
            document.getElementById("rehearsal-message").textContent = "Asistencias eliminadas.";
            if(window.renderStats) window.renderStats();
        }
    }); 
    
    // Listeners Main Screen (Confirm Attendance)
    tbodyMain.querySelectorAll(".confirm-attendance").forEach(btn => {
        btn.onclick = async () => {
            const index = parseInt(btn.dataset.i, 10);
            const userSelect = document.querySelector(`.attendance-user[data-i="${index}"]`);
            const responseSelect = document.querySelector(`.attendance-response[data-i="${index}"]`);
            const name = userSelect.value;
            const attending = responseSelect.value;
            
            if(!name || !attending){ alert("Selecciona nombre y respuesta."); return; } 
            
            const rehearsal = window.rehearsals[index];
            const confirmMsg = `${name}, ¿${attending === "Sí" ? "ASISTIRÁS" : "NO ASISTIRÁS"} al ensayo del ${window.formatDateWithDay(rehearsal.date)}?`;
            
            if(!confirm(confirmMsg)) return;
            
            if(!Array.isArray(rehearsal.attendance)) rehearsal.attendance = [];
            
            const existingResponse = rehearsal.attendance.find(a => a.name === name);
            if(existingResponse) existingResponse.attending = attending;
            else rehearsal.attendance.push({ name, attending });
            
            try {
                await window.saveRehearsals();
                userSelect.value = "";
                responseSelect.value = "";
                if(window.renderStats) window.renderStats();
            } catch(e) {
                alert("Error al guardar asistencia: " + e.message);
            }
        }
    });
};

window.openRehearsalDetailsModal = function(index) {
    const rehearsal = window.rehearsals[index];
    if(!rehearsal) return;
    
    // Asegurar que el modal esté disponible
    if(!rehearsalDetailModal) rehearsalDetailModal = document.getElementById('rehearsal-details-modal');
    
    document.getElementById('rehearsal-detail-index').value = index;
    document.getElementById('rehearsal-detail-title-display').textContent = `Ensayo: ${window.formatDateWithDay(rehearsal.date)} (${rehearsal.startTime} - ${rehearsal.endTime})`;
    document.getElementById('rehearsal-notes').value = rehearsal.notes || "";
    document.getElementById('rehearsal-detail-message').textContent = "";
    
    rehearsalDetailModal.classList.add('show');
};

window.loadRehearsals = async function() { 
    try { 
        const data = await window.withRetry(() => window.loadDoc("intranet", "rehearsals", { rehearsals: [] })); 
        window.rehearsals = Array.isArray(data.rehearsals) ? data.rehearsals : []; 
        window.renderRehearsals(); 
    } catch (e) { 
        console.error("Error al cargar ensayos:", e); 
    } 
};

window.saveRehearsals = async function() { 
    try { 
        await window.withRetry(() => window.saveDoc("intranet", "rehearsals", { rehearsals: window.rehearsals })); 
        window.renderRehearsals(); 
        if(window.renderStats) window.renderStats(); 
        return true; 
    } catch (e) { 
        console.error("Error al guardar ensayos:", e); 
        throw e; 
    } 
};

window.resetRehearsalForm = function() { 
    document.getElementById("rehearsal-date").value = ""; 
    document.getElementById("rehearsal-start-time").value = ""; 
    document.getElementById("rehearsal-end-time").value = ""; 
    document.getElementById("rehearsal-location").value = ""; 
    document.getElementById("add-rehearsal").textContent = "Añadir Ensayo"; 
    document.getElementById("cancel-edit-rehearsal").style.display = "none"; 
    window.editingRehearsalIndex = null; 
    document.getElementById("rehearsal-day-preview").textContent = ""; 
};
