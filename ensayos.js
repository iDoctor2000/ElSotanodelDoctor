
/* 
   ENSAYOS.JS
   Gestión de ensayos, asistencias y panel de administración.
   VERSION ROBUSTA CON LOGS DE DEPURACIÓN
*/

console.log("--- ENSAYOS.JS CARGADO (v10 Debug) ---");

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
    
    console.log(`Renderizando ensayos... Total en memoria: ${window.rehearsals.length}`);

    // --- FIX FECHAS: Comparación estricta de días locales ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Función auxiliar para convertir "YYYY-MM-DD" a objeto Date Local 00:00:00
    const parseLocalDate = (dateStr) => {
        if(!dateStr) return null;
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d); 
    };

    // Ordenar ensayos por fecha
    window.rehearsals.sort((a, b) => {
        const dateA = new Date(a.date + 'T' + (a.startTime || '00:00'));
        const dateB = new Date(b.date + 'T' + (b.startTime || '00:00'));
        return dateA - dateB;
    });

    if (window.rehearsals.length === 0) {
        const emptyRow = '<tr><td colspan="6" style="text-align:center;">No hay ensayos programados (Lista vacía).</td></tr>';
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

        // Tabla Admin (Muestra todos)
        if(tbodyMgmt) {
            tbodyMgmt.insertAdjacentHTML("beforeend", `<tr><td>${formattedDate}</td><td>${r.startTime}</td><td>${r.endTime}</td><td>${r.location}</td><td>${summary}</td><td><button data-i="${i}" class="edit-rehearsal">Editar</button><button data-i="${i}" class="copy-rehearsal">Copiar</button><button data-i="${i}" class="clear-attendance">Limpiar</button><button data-i="${i}" class="delete-rehearsal">Eliminar</button></td></tr>`);
        }

        // Tabla Principal (Solo futuros u hoy)
        const rLocal = parseLocalDate(r.date);
        
        // Log para depurar por qué no salen
        const isFuture = rLocal && rLocal >= today;
        if (!isFuture) {
            console.log(`Ocultando ensayo pasado: ${r.date} (Hoy es: ${today.toLocaleDateString()})`);
        }

        if (isFuture) {
            const detailsBtnContent = `<button class="details-btn" onclick="window.openRehearsalDetailsModal(${i})" title="Notas del Ensayo">➡️</button>`;
            
            const rowHtml = `
            <tr>
                <td>${formattedDate}<br><span class="rehearsal-duration">(${durationText})</span></td>
                <td>${r.startTime} - ${r.endTime}</td>
                <td>${r.location}</td>
                <td class="details-col-header" style="text-align:center;">${detailsBtnContent}</td>
                <td>
                    <div class="attendance-form">
                        <select class="attendance-user" data-i="${i}"><option value="" disabled selected>¿Nombre?</option>${userOptions}</select>
                        <select class="attendance-response" data-i="${i}"><option value="" disabled selected>¿Asistirás?</option><option value="Sí">Sí</option><option value="No">No</option></select>
                        <button class="confirm-attendance" data-i="${i}">Confirmar</button>
                    </div>
                    ${summary}
                </td>
            </tr>`;
            
            if(tbodyMain) tbodyMain.insertAdjacentHTML("beforeend", rowHtml);
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
            
            const dateInput = document.getElementById("rehearsal-date");
            if(dateInput) dateInput.dispatchEvent(new Event('change'));

            document.getElementById("add-rehearsal").textContent = "Guardar Cambios";
            document.getElementById("cancel-edit-rehearsal").style.display = "inline-block";
        });
        tbodyMgmt.querySelectorAll(".copy-rehearsal").forEach(btn => btn.onclick = () => {
            const idx = parseInt(btn.dataset.i, 10);
            const r = window.rehearsals[idx];
            document.getElementById("rehearsal-date").value = ""; 
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
            const row = btn.closest("tr") || btn.closest(".rehearsal-card"); 
            const userSelect = row.querySelector(".attendance-user");
            const responseSelect = row.querySelector(".attendance-response");
            
            const userName = userSelect.value;
            const attending = responseSelect.value;
            
            if(!userName || !attending) {
                alert("Selecciona tu nombre y respuesta.");
                return;
            }
            
            if(!window.rehearsals[i].attendance) window.rehearsals[i].attendance = [];
            window.rehearsals[i].attendance = window.rehearsals[i].attendance.filter(a => a.name !== userName);
            window.rehearsals[i].attendance.push({ name: userName, attending: attending });
            
            await window.saveRehearsals();
            alert("Asistencia guardada.");
        });
        
        const storedUser = localStorage.getItem('elSotanoCurrentUser');
        if(storedUser) {
            tbodyMain.querySelectorAll(".attendance-user").forEach(select => {
                const option = select.querySelector(`option[value="${storedUser}"]`);
                if(option) select.value = storedUser;
            });
        }
        
        tbodyMain.querySelectorAll(".attendance-user").forEach(select => {
            select.addEventListener('change', (e) => {
                localStorage.setItem('elSotanoCurrentUser', e.target.value);
            });
        });
    }
};

window.loadRehearsals = async function() {
    try {
        // Carga con fallback vacío
        const data = await window.withRetry(() => window.loadDoc("intranet", "rehearsals", {}));
        
        console.log("Raw Data from Firestore (rehearsals):", data);

        // LÓGICA ROBUSTA PARA ENCONTRAR EL ARRAY
        if (Array.isArray(data)) {
            window.rehearsals = data;
        } else if (data && Array.isArray(data.items)) {
            window.rehearsals = data.items;
        } else if (data && Array.isArray(data.rehearsals)) {
            window.rehearsals = data.rehearsals;
        } else {
            window.rehearsals = [];
            console.warn("No se encontró array de ensayos válido en la respuesta DB.");
        }

        console.log(`Ensayos cargados en memoria: ${window.rehearsals.length}`);
        window.renderRehearsals();
    } catch (e) {
        console.error("Error al cargar ensayos:", e);
    }
};

window.saveRehearsals = async function() {
    try {
        // Guardamos bajo 'items' para estandarizar, pero 'load' lee ambos por si acaso
        await window.withRetry(() => window.saveDoc("intranet", "rehearsals", { items: window.rehearsals }));
        window.renderRehearsals();
        window.renderStats(); 
        if(window.renderVisualCalendar) window.renderVisualCalendar();
        return true;
    } catch (e) {
        console.error("Error al guardar ensayos:", e);
        throw e;
    }
};

// ... Resto del código de UI (Formulario, Modales, etc) ...
// Lógica de Formulario Admin
document.addEventListener("DOMContentLoaded", () => {
    const addBtn = document.getElementById("add-rehearsal");
    const cancelBtn = document.getElementById("cancel-edit-rehearsal");
    const msg = document.getElementById("rehearsal-message");
    
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
    
    const openViewBtn = document.getElementById("btn-open-rehearsals-view");
    if(openViewBtn) {
        openViewBtn.onclick = () => {
             if(window.openConfigScreen) {
                 window.openConfigScreen("rehearsals-view-screen");
                 if(window.renderRehearsals) window.renderRehearsals();
             }
        };
    }

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

window.openRehearsalDetailsModal = function(index) {
    if(!rehearsalDetailsModal) return;
    
    const r = window.rehearsals[index];
    if(!r) return;
    
    if(rehearsalDetailMessage) {
        rehearsalDetailMessage.textContent = "";
        rehearsalDetailMessage.className = "success-message";
    }
    
    document.getElementById("rehearsal-detail-index").value = index;
    
    // --- LÓGICA DE TÍTULO ---
    const titleDisplay = document.getElementById("rehearsal-detail-title-display");
    if(titleDisplay) {
        const fmtDate = window.formatDateWithDay(r.date);
        titleDisplay.innerHTML = `Ensayo: ${fmtDate} <br><span style="font-size:0.8em; color:#aaa;">${r.location} (${r.startTime}-${r.endTime})</span>`;
    }

    // --- INICIO NUEVA FUNCIONALIDAD: WIDGET DE ASISTENCIA EN MODAL ---
    // Buscar o crear contenedor del widget
    let widgetContainer = document.getElementById("rehearsal-attendance-widget");
    if (!widgetContainer) {
        widgetContainer = document.createElement("div");
        widgetContainer.id = "rehearsal-attendance-widget";
        // Insertar justo después del título
        if (titleDisplay && titleDisplay.parentNode) {
            titleDisplay.parentNode.insertBefore(widgetContainer, titleDisplay.nextSibling);
        }
    }
    
    // Preparar datos para el widget
    const storedUser = localStorage.getItem('elSotanoCurrentUser');
    let userOptionsHTML = '<option value="">Selecciona Músico</option>';
    if (window.users) {
        window.users.forEach(u => {
            const isSelected = storedUser === u.name ? 'selected' : '';
            userOptionsHTML += `<option value="${u.name}" ${isSelected}>${u.name} (${u.nickname})</option>`;
        });
    }

    const attendance = r.attendance || [];
    const getNamesByStatus = (status) => attendance.filter(a => a.attending === status).map(a => {
        const u = window.users ? window.users.find(user => user.name === a.name) : null;
        return u ? u.nickname : a.name;
    }).join(", ") || "Nadie";

    // Inyectar HTML del Widget (3 líneas solicitadas)
    widgetContainer.style.cssText = "margin: 15px 0; padding: 15px; background: #222; border-radius: 8px; border: 1px solid #444;";
    widgetContainer.innerHTML = `
        <h3 style="color: #00d2ff; font-size: 1em; margin-top: 0; margin-bottom: 10px;">Confirmar Asistencia</h3>
        
        <!-- Línea 1: Combos -->
        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <select id="modal-att-user" style="flex: 1; padding: 8px; background: #333; border: 1px solid #555; color: white; border-radius: 4px;">
                ${userOptionsHTML}
            </select>
            <select id="modal-att-status" style="width: 120px; padding: 8px; background: #333; border: 1px solid #555; color: white; border-radius: 4px;">
                <option value="">¿Asistirás?</option>
                <option value="Sí">Sí</option>
                <option value="No">No</option>
            </select>
        </div>

        <!-- Línea 2: Botón Confirmar -->
        <button id="modal-att-confirm-btn" style="width: 100%; padding: 10px; background: #00d2ff; color: #000; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; text-transform: uppercase;">
            Confirmar
        </button>

        <!-- Línea 3: Resumen -->
        <div id="modal-att-summary" style="margin-top: 15px; font-size: 0.9em; line-height: 1.4;">
            <p style="margin: 0;"><span style="color: #00d2ff;">Asisten:</span> <span id="summ-yes">${getNamesByStatus('Sí')}</span></p>
            <p style="margin: 5px 0 0 0;"><span style="color: #ff4444;">No asisten:</span> <span id="summ-no">${getNamesByStatus('No')}</span></p>
        </div>
    `;

    // Lógica del botón Confirmar dentro del widget
    const confirmBtn = document.getElementById('modal-att-confirm-btn');
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const userSelect = document.getElementById('modal-att-user');
            const statusSelect = document.getElementById('modal-att-status');
            const user = userSelect.value;
            const status = statusSelect.value;

            if (!user || !status) {
                alert("Por favor selecciona músico y respuesta.");
                return;
            }

            // Guardar preferencia de usuario
            localStorage.setItem('elSotanoCurrentUser', user);
            confirmBtn.textContent = "Guardando...";

            // Actualizar array en memoria
            if(!window.rehearsals[index].attendance) window.rehearsals[index].attendance = [];
            // Eliminar registro previo de este usuario si existe
            window.rehearsals[index].attendance = window.rehearsals[index].attendance.filter(a => a.name !== user);
            // Añadir nuevo
            window.rehearsals[index].attendance.push({ name: user, attending: status });

            try {
                await window.saveRehearsals();
                
                // Actualizar UI Local
                const newYes = (window.rehearsals[index].attendance || []).filter(a => a.attending === 'Sí').map(a => {
                    const u = window.users.find(us => us.name === a.name); return u ? u.nickname : a.name;
                }).join(", ") || "Nadie";
                
                const newNo = (window.rehearsals[index].attendance || []).filter(a => a.attending === 'No').map(a => {
                    const u = window.users.find(us => us.name === a.name); return u ? u.nickname : a.name;
                }).join(", ") || "Nadie";

                document.getElementById('summ-yes').textContent = newYes;
                document.getElementById('summ-no').textContent = newNo;

                confirmBtn.textContent = "¡Guardado!";
                setTimeout(() => confirmBtn.textContent = "Confirmar", 1500);

            } catch (e) {
                console.error(e);
                confirmBtn.textContent = "Error";
                alert("Error al guardar asistencia.");
            }
        };
    }
    // --- FIN NUEVA FUNCIONALIDAD ---

    // Cargar notas existentes
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
