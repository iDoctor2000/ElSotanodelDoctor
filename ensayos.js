
/* 
   ENSAYOS.JS
   Gestión de ensayos, asistencias y panel de administración.
   AHORA SIN COLUMNA DE CALENDARIO EN LA VISTA PRINCIPAL.
*/

console.log("--- ENSAYOS.JS CARGADO ---");

// Variable Global
window.rehearsals = [];
let editingRehearsalIndex = null;

// Referencias a Modales
let rehearsalDetailsModal = null;
let rehearsalDetailMessage = null;

document.addEventListener("DOMContentLoaded", () => {
    rehearsalDetailsModal = document.getElementById('rehearsal-details-modal');
    rehearsalDetailMessage = document.getElementById('rehearsal-detail-message');
    
    // Listeners del Modal de Detalles
    const saveBtn = document.getElementById('save-rehearsal-details');
    if(saveBtn) saveBtn.onclick = saveRehearsalDetailsLogic;
    
    const closeBtn = document.getElementById('close-rehearsal-details-modal');
    if(closeBtn) closeBtn.onclick = () => { 
        if(rehearsalDetailsModal) rehearsalDetailsModal.classList.remove('show');
    };
});

window.renderRehearsals = function() {
    const tbodyMgmt = document.getElementById("rehearsal-table-body");
    const tbodyMain = document.getElementById("rehearsal-main-body");
    
    if(tbodyMgmt) tbodyMgmt.innerHTML = "";
    if(tbodyMain) tbodyMain.innerHTML = "";
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Ordenar ensayos por fecha (más reciente primero para admin, más próximo primero para view)
    window.rehearsals.sort((a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime));

    if (window.rehearsals.length === 0) {
        const emptyRow = '<tr><td colspan="6" style="text-align:center;">No hay ensayos programados.</td></tr>';
        if(tbodyMgmt) tbodyMgmt.innerHTML = emptyRow;
        if(tbodyMain) tbodyMain.innerHTML = emptyRow;
        return;
    }

    window.rehearsals.forEach((r, i) => {
        const formattedDate = window.formatDateWithDay(r.date);
        const durationText = window.toHHMM(window.calculateDuration(r.startTime, r.endTime));
        
        // Calcular asistencias
        const attendance = Array.isArray(r.attendance) ? r.attendance : [];
        const getAttendeeNicknames = status => attendance.filter(a => a.attending === status).map(a => {
            const user = window.users.find(u => u.name === a.name);
            return user ? user.nickname : a.name;
        }).join(", ") || "Ninguno";
        
        const summary = `<div class="attendance-summary"><span class="attending-yes">Asisten: ${getAttendeeNicknames("Sí")}</span><span class="attending-no">No asisten: ${getAttendeeNicknames("No")}</span></div>`;

        // Construir opciones de usuario para el selector
        let userOptions = "";
        window.users.forEach(u => {
            userOptions += `<option value="${u.name}">${u.name} (${u.nickname})</option>`;
        });

        // Tabla Admin
        if(tbodyMgmt) {
            tbodyMgmt.insertAdjacentHTML("beforeend", `<tr><td>${formattedDate}</td><td>${r.startTime}</td><td>${r.endTime}</td><td>${r.location}</td><td>${summary}</td><td><button data-i="${i}" class="edit-rehearsal">Editar</button><button data-i="${i}" class="copy-rehearsal">Copiar</button><button data-i="${i}" class="clear-attendance">Limpiar</button><button data-i="${i}" class="delete-rehearsal">Eliminar</button></td></tr>`);
        }

        // Tabla Principal (Solo futuros u hoy)
        const rehearsalDate = new Date(r.date + 'T00:00:00Z');
        
        // Ajuste de zona horaria simple: Si es hoy, lo mostramos aunque haya pasado la hora por poco
        // Para ser estrictos: new Date(r.date + 'T' + r.endTime) >= now
        
        if(rehearsalDate >= today){
            // Construcción de botones
            const detailsBtnContent = `<button class="details-btn" onclick="window.openRehearsalDetailsModal(${i})" title="Notas del Ensayo">➡️</button>`;
            
            // Fila ESTÁNDAR (SIN COLUMNA CALENDARIO)
            const rowHtml = `
            <tr>
                <td>${formattedDate} <span class="rehearsal-duration">(${durationText})</span></td>
                <td>${r.startTime} - ${r.endTime}</td>
                <td>${r.location}</td>
                <td class="details-col-header">${detailsBtnContent}</td>
                <td>
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
    if(tbodyMgmt) {
        tbodyMgmt.querySelectorAll(".delete-rehearsal").forEach(btn => btn.onclick = async () => {
            const idx = parseInt(btn.dataset.i, 10);
            if(confirm("¿Eliminar ensayo?")) {
                window.rehearsals.splice(idx, 1);
                await window.saveRehearsals();
            }
        });
        tbodyMgmt.querySelectorAll(".edit-rehearsal").forEach(btn => btn.onclick = () => {
            editingRehearsalIndex = parseInt(btn.dataset.i, 10);
            const r = window.rehearsals[editingRehearsalIndex];
            document.getElementById("rehearsal-date").value = r.date;
            document.getElementById("rehearsal-start-time").value = r.startTime;
            document.getElementById("rehearsal-end-time").value = r.endTime;
            document.getElementById("rehearsal-location").value = r.location;
            
            // Preview del día
            const dateInput = document.getElementById("rehearsal-date");
            if(dateInput) dateInput.dispatchEvent(new Event('change'));

            document.getElementById("add-rehearsal").textContent = "Guardar Cambios";
            document.getElementById("cancel-edit-rehearsal").style.display = "inline-block";
        });
        tbodyMgmt.querySelectorAll(".copy-rehearsal").forEach(btn => btn.onclick = () => {
            const idx = parseInt(btn.dataset.i, 10);
            const r = window.rehearsals[idx];
            
            // Prellenar formulario pero sin ID de edición (es nuevo)
            document.getElementById("rehearsal-date").value = ""; // Fecha vacía para obligar a elegir nueva
            document.getElementById("rehearsal-start-time").value = r.startTime;
            document.getElementById("rehearsal-end-time").value = r.endTime;
            document.getElementById("rehearsal-location").value = r.location;
            
            alert("Datos copiados al formulario. Selecciona la nueva fecha.");
            document.getElementById("rehearsal-date").focus();
        });
        tbodyMgmt.querySelectorAll(".clear-attendance").forEach(btn => btn.onclick = async () => {
            const idx = parseInt(btn.dataset.i, 10);
            if(confirm("¿Borrar todas las confirmaciones de asistencia de este ensayo?")) {
                window.rehearsals[idx].attendance = [];
                await window.saveRehearsals();
            }
        });
    }

    // Listeners Main View (Asistencia)
    if(tbodyMain) {
        tbodyMain.querySelectorAll(".confirm-attendance").forEach(btn => btn.onclick = async () => {
            const i = parseInt(btn.dataset.i, 10);
            const row = btn.closest("tr") || btn.closest(".rehearsal-card"); // Fallback for safety
            const userSelect = row.querySelector(".attendance-user");
            const responseSelect = row.querySelector(".attendance-response");
            
            const userName = userSelect.value;
            const attending = responseSelect.value;
            
            if(!userName || !attending) {
                alert("Selecciona tu nombre y respuesta.");
                return;
            }
            
            if(!window.rehearsals[i].attendance) window.rehearsals[i].attendance = [];
            
            // Remover entrada anterior si existe
            window.rehearsals[i].attendance = window.rehearsals[i].attendance.filter(a => a.name !== userName);
            // Añadir nueva
            window.rehearsals[i].attendance.push({ name: userName, attending: attending });
            
            await window.saveRehearsals();
            alert("Asistencia guardada.");
        });
        
        // Auto-seleccionar nombre si ya se ha usado antes
        const storedUser = localStorage.getItem('elSotanoCurrentUser');
        if(storedUser) {
            tbodyMain.querySelectorAll(".attendance-user").forEach(select => {
                // Verificar si la opción existe antes de seleccionarla
                const option = select.querySelector(`option[value="${storedUser}"]`);
                if(option) select.value = storedUser;
            });
        }
        
        // Guardar nombre al cambiar
        tbodyMain.querySelectorAll(".attendance-user").forEach(select => {
            select.addEventListener('change', (e) => {
                localStorage.setItem('elSotanoCurrentUser', e.target.value);
            });
        });
    }
};

window.loadRehearsals = async function() {
    try {
        const data = await window.withRetry(() => window.loadDoc("intranet", "rehearsals", { items: [] }));
        window.rehearsals = Array.isArray(data.items) ? data.items : [];
        window.renderRehearsals();
    } catch (e) {
        console.error("Error al cargar ensayos:", e);
    }
};

window.saveRehearsals = async function() {
    try {
        await window.withRetry(() => window.saveDoc("intranet", "rehearsals", { items: window.rehearsals }));
        window.renderRehearsals();
        window.renderStats(); // Actualizar estadísticas
        if(window.renderVisualCalendar) window.renderVisualCalendar(); // Actualizar calendario
        return true;
    } catch (e) {
        console.error("Error al guardar ensayos:", e);
        throw e;
    }
};

// Lógica de Formulario Admin
document.addEventListener("DOMContentLoaded", () => {
    const addBtn = document.getElementById("add-rehearsal");
    const cancelBtn = document.getElementById("cancel-edit-rehearsal");
    const msg = document.getElementById("rehearsal-message");
    
    // Preview del día de la semana al cambiar fecha
    const dateInput = document.getElementById("rehearsal-date");
    const dayPreview = document.getElementById("rehearsal-day-preview");
    
    if(dateInput && dayPreview) {
        dateInput.addEventListener("change", () => {
            if(dateInput.value) {
                const date = new Date(dateInput.value);
                const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
                dayPreview.textContent = `(${days[date.getDay()]})`;
            } else {
                dayPreview.textContent = "";
            }
        });
    }

    if(addBtn) {
        addBtn.onclick = async () => {
            if(msg) msg.textContent = "";
            const date = document.getElementById("rehearsal-date").value;
            const start = document.getElementById("rehearsal-start-time").value;
            const end = document.getElementById("rehearsal-end-time").value;
            const loc = document.getElementById("rehearsal-location").value.trim();
            
            if(!date || !start || !end || !loc){
                if(msg) { msg.className = "error-message"; msg.textContent = "Todos los campos son obligatorios."; }
                return;
            }
            
            try {
                if(editingRehearsalIndex !== null) {
                    // Mantener asistencias y notas al editar
                    const existing = window.rehearsals[editingRehearsalIndex];
                    window.rehearsals[editingRehearsalIndex] = {
                        ...existing,
                        date, startTime: start, endTime: end, location: loc
                    };
                    if(msg) msg.textContent = "Ensayo actualizado.";
                } else {
                    window.rehearsals.push({
                        date, startTime: start, endTime: end, location: loc, attendance: [], notes: ""
                    });
                    if(msg) msg.textContent = "Ensayo añadido.";
                }
                
                await window.saveRehearsals();
                if(msg) msg.className = "success-message";
                window.resetRehearsalForm();
                
            } catch(e) {
                if(msg) { msg.className = "error-message"; msg.textContent = "Error: " + e.message; }
            }
        };
    }
    
    if(cancelBtn) {
        cancelBtn.onclick = () => {
            window.resetRehearsalForm();
            if(msg) msg.textContent = "";
        };
    }
    
    // Gestión del menú lateral
    const menuReh = document.getElementById("menu-rehearsal");
    const closeReh = document.getElementById("close-rehearsal");
    if(menuReh) {
        menuReh.onclick = e => { 
            e.preventDefault(); 
            if(window.openConfigScreen) window.openConfigScreen("rehearsal-screen"); 
        };
    }
    if(closeReh) {
        closeReh.onclick = () => {
            document.getElementById("rehearsal-screen").style.display = "none";
            if(msg) msg.textContent = "";
            window.resetRehearsalForm();
        };
    }
    
    // View Screen Close
    const closeView = document.getElementById("close-rehearsals-view");
    if(closeView) closeView.onclick = () => document.getElementById("rehearsals-view-screen").style.display = "none";
});

window.resetRehearsalForm = function() {
    document.getElementById("rehearsal-date").value = "";
    document.getElementById("rehearsal-start-time").value = "";
    document.getElementById("rehearsal-end-time").value = "";
    document.getElementById("rehearsal-location").value = "";
    const preview = document.getElementById("rehearsal-day-preview");
    if(preview) preview.textContent = "";
    
    const addBtn = document.getElementById("add-rehearsal");
    if(addBtn) addBtn.textContent = "Añadir Ensayo";
    
    const cancelBtn = document.getElementById("cancel-edit-rehearsal");
    if(cancelBtn) cancelBtn.style.display = "none";
    
    editingRehearsalIndex = null;
};

// Detalles del Ensayo (Notas)
window.openRehearsalDetailsModal = function(index) {
    if(!rehearsalDetailsModal) return;
    
    const r = window.rehearsals[index];
    if(!r) return;
    
    if(rehearsalDetailMessage) {
        rehearsalDetailMessage.textContent = "";
        rehearsalDetailMessage.className = "success-message";
    }
    
    document.getElementById("rehearsal-detail-index").value = index;
    
    const titleDisplay = document.getElementById("rehearsal-detail-title-display");
    if(titleDisplay) {
        const fmtDate = window.formatDateWithDay(r.date);
        titleDisplay.innerHTML = `Ensayo: ${fmtDate} <br><span style="font-size:0.8em; color:#aaa;">${r.location} (${r.startTime}-${r.endTime})</span>`;
    }
    
    document.getElementById("rehearsal-notes").value = r.notes || "";
    
    rehearsalDetailsModal.classList.add('show');
};

async function saveRehearsalDetailsLogic() {
    const index = parseInt(document.getElementById("rehearsal-detail-index").value, 10);
    const notes = document.getElementById("rehearsal-notes").value;
    
    if(isNaN(index) || !window.rehearsals[index]) return;
    
    window.rehearsals[index].notes = notes;
    
    try {
        await window.saveRehearsals();
        if(rehearsalDetailMessage) {
            rehearsalDetailMessage.textContent = "Notas guardadas.";
            rehearsalDetailMessage.className = "success-message";
        }
        setTimeout(() => {
            if(rehearsalDetailsModal) rehearsalDetailsModal.classList.remove('show');
        }, 800);
    } catch(e) {
        if(rehearsalDetailMessage) {
            rehearsalDetailMessage.textContent = "Error al guardar.";
            rehearsalDetailMessage.className = "error-message";
        }
    }
}

// Función ICS simplificada (Aunque ya no se use en la tabla, útil tenerla por si acaso)
window.generateICS = function(title, date, time, location, description, durationSeconds) {
    const startDateTime = new Date(`${date}T${time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + durationSeconds * 1000);
    
    const formatICSDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//El Sotano//Intranet//EN
BEGIN:VEVENT
UID:${Date.now()}@sotano.intranet
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDateTime)}
DTEND:${formatICSDate(endDateTime)}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'evento.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
