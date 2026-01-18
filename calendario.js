/* 
   CALENDARIO.JS
   Gestión del Calendario Visual, Widget de BandHelper y Detalles de Conciertos.
*/

console.log("--- CALENDARIO.JS CARGADO ---");

// Variables Globales del Calendario
let currentCalDate = new Date(); 
let globalConcertDetails = {}; 

// Referencias a Modales
let concertDetailModal = null;
let concertDetailMessage = null;

document.addEventListener("DOMContentLoaded", () => {
    // Inicializar referencias DOM
    concertDetailModal = document.getElementById('concert-details-modal');
    concertDetailMessage = document.getElementById('concert-detail-message');

    // 1. Cargar Widget BandHelper (Con retardo para asegurar carga de página)
    setTimeout(loadBandHelperWidget, 100);

    // 2. Listeners de Navegación del Calendario Mensual
    const prevBtn = document.getElementById('prev-month-btn'); 
    const nextBtn = document.getElementById('next-month-btn');
    
    if(prevBtn) { 
        // Reemplazar nodo para limpiar listeners anteriores si los hubiera
        const newPrev = prevBtn.cloneNode(true); 
        prevBtn.parentNode.replaceChild(newPrev, prevBtn); 
        newPrev.addEventListener('click', () => { 
            currentCalDate.setMonth(currentCalDate.getMonth() - 1); 
            renderVisualCalendar(); 
        }); 
    }
    
    if(nextBtn) { 
        const newNext = nextBtn.cloneNode(true); 
        nextBtn.parentNode.replaceChild(newNext, nextBtn); 
        newNext.addEventListener('click', () => { 
            currentCalDate.setMonth(currentCalDate.getMonth() + 1); 
            renderVisualCalendar(); 
        }); 
    }

    // 3. Listeners del Modal de Detalles de Concierto
    const saveConcertBtn = document.getElementById('save-concert-details');
    if(saveConcertBtn) {
        saveConcertBtn.onclick = saveConcertDetailsLogic;
    }

    const closeConcertBtn = document.getElementById('close-concert-details-modal');
    if(closeConcertBtn) {
        closeConcertBtn.onclick = () => { 
            if(window.closeAll) window.closeAll(); 
            else if(concertDetailModal) concertDetailModal.classList.remove('show');
        };
    }

    // Inicialización inicial
    // Si Firebase ya está listo en window, adjuntamos listener, si no esperamos
    if (typeof firebase !== 'undefined' && typeof db !== 'undefined') {
        attachConcertDetailsListener();
    }
    
    // Render inicial y re-renders de seguridad por si cargan datos tarde
    renderVisualCalendar(); 
    setTimeout(renderVisualCalendar, 2000); 
    setTimeout(renderVisualCalendar, 5000);
});

// --- LOGICA BANDHELPER ---

function loadBandHelperWidget() {
    const container = document.getElementById('bandhelper-concerts-container');
    const loadingMessage = document.getElementById('bandhelper-loading-message');
    if (!container) return;
    
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<head></head><body><script src="https://www.bandhelper.com/widget/calendar/10353?layout=1&range=6"><\/script></body>`);
    doc.close();
    
    let attempts = 0;
    const maxAttempts = 50;
    
    const interval = setInterval(() => {
        attempts++;
        const table = doc.querySelector('table');
        if (table) {
            clearInterval(interval);
            const styles = doc.querySelectorAll('style');
            styles.forEach(s => document.head.appendChild(s.cloneNode(true)));
            container.innerHTML = ""; 
            container.appendChild(table.cloneNode(true));
            document.body.removeChild(iframe);
            processBandHelperTable();
            renderVisualCalendar();
        } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            if(loadingMessage) loadingMessage.textContent = "Error: No se pudieron cargar los conciertos externos.";
            document.body.removeChild(iframe);
        }
    }, 500);
}

function processBandHelperTable() { 
    const container = document.getElementById('bandhelper-concerts-container');
    if(!container) return; 
    const table = container.querySelector("table");
    if(!table) return;
    
    if(table.dataset.processed === "true") return; 
    table.dataset.processed = "true";
    
    let headerRow = table.querySelector("thead tr");
    const desiredHeaders = ["Fecha/Hora", "Evento", "Lugar", "Cal", "Info"];
    
    if(!table.tHead) table.createTHead(); 
    
    headerRow = table.tHead.rows[0] || table.tHead.insertRow(0);
    headerRow.innerHTML = '';
    
    desiredHeaders.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        if(text === "Cal") th.classList.add("calendar-col-header");
        if(text === "Info") th.classList.add("details-col-header");
        headerRow.appendChild(th);
    });
    
    const dataRowsSource = table.querySelector("tbody") ? Array.from(table.querySelectorAll("tbody tr")) : [];
    
    dataRowsSource.forEach(row => {
        const originalCells = Array.from(row.cells);
        row.innerHTML = '';
        
        const dateCellFullText = originalCells[0]?.textContent.trim() || "";
        const eventTitleFromCell = originalCells[1]?.textContent.trim().split('\n')[0].trim() || "Evento Sin Título";
        const locationText = originalCells[3]?.textContent.trim().split('\n')[0].trim() || originalCells[2]?.textContent.trim().split('\n')[0].trim() || "";
        
        row.insertCell().textContent = dateCellFullText;
        row.insertCell().textContent = eventTitleFromCell;
        row.insertCell().textContent = locationText;
        
        // Columna Calendario (ICS)
        const calendarDisplayCell = row.insertCell();
        calendarDisplayCell.className = "calendar-col";
        calendarDisplayCell.style.textAlign = "center";
        
        // Columna Info (Detalles)
        const detailDisplayCell = row.insertCell();
        detailDisplayCell.className = "details-col-header";
        detailDisplayCell.style.textAlign = "center";
        
        const dateForId = dateCellFullText.split(',')[0].trim();
        const concertId = window.sanitizeFirebaseKey(`${dateForId}_${eventTitleFromCell}`);
        
        const detailsBtn = document.createElement("button");
        detailsBtn.className = "details-btn";
        detailsBtn.innerHTML = "➡️";
        detailsBtn.title = "Ver/Editar Detalles del Concierto";
        detailsBtn.onclick = () => window.openConcertDetailModal(concertId, dateCellFullText, eventTitleFromCell, locationText);
        detailDisplayCell.appendChild(detailsBtn);
        
        // Preparar datos para ICS
        let icsDate = new Date().toISOString().split('T')[0];
        let startTimeForICS = "20:00";
        let durationSecondsForICS = 2 * 3600;
        
        const dateMatch = dateCellFullText.match(/(\d{2})\/(\d{2})\/(\d{2})/);
        if(dateMatch){
            let year = parseInt(dateMatch[3], 10);
            year += (year < 70 ? 2000 : 1900);
            icsDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`;
        } 
        
        const timeRangeMatch = dateCellFullText.match(/(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})/);
        const singleTimeMatch = dateCellFullText.match(/,\s*(\d{1,2}:\d{2})/);
        
        if(timeRangeMatch){
            startTimeForICS = timeRangeMatch[1];
            durationSecondsForICS = window.calculateDuration(timeRangeMatch[1], timeRangeMatch[2]);
            if(durationSecondsForICS <= 0) durationSecondsForICS = 2 * 3600;
        } else if(singleTimeMatch){
            startTimeForICS = singleTimeMatch[1];
        } 
        
        const locationForICS = locationText || eventTitleFromCell;
        const descriptionForICS = `Concierto de El Sótano del Doctor en ${locationForICS}. Evento: ${eventTitleFromCell}.`;
        
        const calendarBtn = document.createElement('button');
        calendarBtn.className = 'calendar-btn';
        calendarBtn.title = 'Añadir a mi calendario';
        calendarBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4V2m0 20v-2m8-8h2m-20 0h-2m15.071-3.071l-1.414-1.414M5.343 17.657l-1.414-1.414m0-10.486l1.414-1.414m12.728 12.728l-1.414 1.414"/><rect x="4" y="6" width="16" height="12" rx="2"/></svg>';
        calendarBtn.onclick = () => window.generateICS(`Concierto: ${eventTitleFromCell}`, icsDate, startTimeForICS, locationForICS, descriptionForICS, durationSecondsForICS);
        
        calendarDisplayCell.appendChild(calendarBtn);
    });
}

// --- LOGICA CALENDARIO VISUAL ---

window.attachConcertDetailsListener = function() { 
    if (typeof db !== 'undefined') { 
        try { 
            db.collection('concert_details').onSnapshot(snapshot => { 
                snapshot.forEach(doc => { 
                    globalConcertDetails[doc.id] = doc.data(); 
                }); 
                renderVisualCalendar(); 
            }); 
        } catch(e) { console.warn(e); } 
    } 
};

window.renderVisualCalendar = function() {
    const grid = document.getElementById('calendar-grid-container');
    const monthDisplay = document.getElementById('calendar-month-display');
    if (!grid || !monthDisplay) return;
    
    grid.innerHTML = ''; 
    const year = currentCalDate.getFullYear(); 
    const month = currentCalDate.getMonth();
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const dayHeaders = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    
    monthDisplay.textContent = `${monthNames[month]} ${year}`;
    
    dayHeaders.forEach(day => { 
        const div = document.createElement('div'); 
        div.className = 'cal-header'; 
        div.textContent = day; 
        grid.appendChild(div); 
    });
    
    const firstDayOfMonth = new Date(year, month, 1);
    let startDay = firstDayOfMonth.getDay() - 1; 
    if (startDay === -1) startDay = 6;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    const events = [];
    
    // 1. Añadir Ensayos (Desde window.rehearsals)
    if (Array.isArray(window.rehearsals)) { 
        window.rehearsals.forEach((r, i) => { 
            let missingStr = ""; 
            if (r.attendance && Array.isArray(r.attendance)) { 
                const missingNames = r.attendance.filter(a => a.attending === "No").map(a => { 
                    const u = window.users.find(user => user.name === a.name); 
                    return u ? u.nickname : a.name; 
                }); 
                if (missingNames.length > 0) missingStr = `<br><span style="color: #fff; font-weight: normal; font-size: 0.9em;">[Faltan: ${missingNames.join(", ")}]</span>`; 
            } 
            events.push({ 
                dateStr: r.date, 
                type: 'ensayo', 
                title: `Ensayo (${r.startTime} - ${r.endTime})${missingStr}`, 
                index: i 
            }); 
        }); 
    }
    
    // 2. Añadir Conciertos (Desde tabla BandHelper ya procesada)
    const concertRows = document.querySelectorAll('#bandhelper-concerts-container table tbody tr');
    concertRows.forEach(row => {
      const cells = row.cells;
      if (cells.length >= 3) {
        const dateText = cells[0].textContent.trim(); 
        const titleText = cells[1].textContent.trim(); 
        const locationText = cells[2].textContent.trim();
        
        const dateMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{2})/);
        if (dateMatch) {
            let y = parseInt(dateMatch[3], 10); 
            y += (y < 70 ? 2000 : 1900); 
            const isoDate = `${y}-${dateMatch[2]}-${dateMatch[1]}`;
            
            const dateForId = dateText.split(',')[0].trim(); 
            const concertId = window.sanitizeFirebaseKey(`${dateForId}_${titleText}`);
            
            let missingStr = ""; 
            const details = globalConcertDetails[concertId];
            
            if (details && details.attendees && window.users) { 
                const missingNames = window.users.filter(u => { 
                    const val = u.nickname || u.name; 
                    return !details.attendees.includes(val); 
                }).map(u => u.nickname); 
                
                if (missingNames.length > 0) missingStr = `<br><span style="color: #fff; font-weight: normal; font-size: 0.9em;">[Faltan: ${missingNames.join(", ")}]</span>`; 
            }
            
            events.push({ 
                dateStr: isoDate, 
                type: 'concierto', 
                title: `${titleText}${missingStr}`, 
                rawDate: dateText, 
                rawTitle: titleText, 
                rawLoc: locationText, 
                id: concertId 
            });
        }
      }
    });
    
    // Render días vacíos previos
    for (let i = 0; i < startDay; i++) { 
        const div = document.createElement('div'); 
        div.className = 'cal-day other-month'; 
        grid.appendChild(div); 
    }
    
    // Render días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const div = document.createElement('div'); 
      div.className = 'cal-day';
      
      if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) div.classList.add('today');
      
      const numDiv = document.createElement('div'); 
      numDiv.className = 'cal-day-number'; 
      numDiv.textContent = day; 
      div.appendChild(numDiv);
      
      const currentIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.dateStr === currentIso);
      
      dayEvents.forEach(evt => {
        const evtDiv = document.createElement('div'); 
        evtDiv.className = `cal-event type-${evt.type}`; 
        evtDiv.innerHTML = evt.title;
        
        if (evt.type === 'concierto') { 
            evtDiv.style.cursor = 'pointer'; 
            evtDiv.onclick = (e) => { 
                e.stopPropagation(); 
                window.openConcertDetailModal(evt.id, evt.rawDate, evt.rawTitle, evt.rawLoc); 
            }; 
        }
        if (evt.type === 'ensayo') { 
            evtDiv.style.cursor = 'pointer'; 
            evtDiv.onclick = (e) => { 
                e.stopPropagation(); 
                if(window.openRehearsalDetailsModal) window.openRehearsalDetailsModal(evt.index); 
            }; 
        }
        div.appendChild(evtDiv);
      });
      
      grid.appendChild(div);
    }
};

// --- LOGICA DETALLES CONCIERTO ---

window.openConcertDetailModal = async function(concertId, concertFullDateText, concertTitle, concertLocationOriginal) {
    // Asegurar referencias
    if(!concertDetailModal) concertDetailModal = document.getElementById('concert-details-modal');
    if(!concertDetailMessage) concertDetailMessage = document.getElementById('concert-detail-message');

    concertDetailMessage.textContent = "";
    concertDetailMessage.className = "success-message";
    document.body.style.overflow = 'hidden';
    
    document.getElementById('concert-detail-id').value = concertId;
    
    const concertTitleDisplay = document.getElementById('concert-detail-title-display');
    if (concertTitleDisplay) {
        const datePartOnly = concertFullDateText.split(',')[0].trim();
        concertTitleDisplay.innerHTML = `${window.decodeHtmlEntities(concertTitle) || "Título no disponible"} <span class="concert-date">(${datePartOnly || 'Fecha no disp.'})</span>`
    }
    
    // Resetear campos
    document.getElementById('concert-detail-location').value = '';
    document.getElementById('concert-detail-sound-company').value = ''; 
    document.getElementById('concert-detail-soundsetup').value = '';
    document.getElementById('concert-detail-instrumentssetup').value = '';
    document.getElementById('concert-detail-soundcheck').value = '';
    document.getElementById('concert-detail-showtime').value = '';
    document.getElementById('concert-detail-notes').value = '';
    document.getElementById('concert-detail-gmaps-link').value = '';
    
    const openGmapsBtn = document.getElementById('open-gmaps-link-btn');
    openGmapsBtn.style.display = 'none';
    openGmapsBtn.onclick = null;
    
    // Renderizar lista asistentes
    const musiciansListDiv = document.getElementById('musicians-attendance-list');
    const techListDiv = document.getElementById('technicians-attendance-list');
    musiciansListDiv.innerHTML = 'Cargando...';
    techListDiv.innerHTML = 'Cargando...';
    
    const techRolesList = ["Técnico de Sonido", "Montador", "Técnico de Luces", "Road Manager", "Backliner"];
    
    if (window.users && window.users.length > 0) {
        musiciansListDiv.innerHTML = '';
        techListDiv.innerHTML = '';
        window.users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.style.display = 'flex';         
            userDiv.style.alignItems = 'center';    
            userDiv.style.marginBottom = '8px';     
            const checkboxId = `user-att-${window.sanitizeFirebaseKey(user.nickname || user.name)}-${concertId}`;
            userDiv.innerHTML = ` <input type="checkbox" id="${checkboxId}" name="concertAttendees" value="${user.nickname || user.name}" style="margin-right: 8px;"> <label for="${checkboxId}" style="margin:0; cursor:pointer;">${user.name} (${user.nickname})</label> `;
            const isTech = user.roles.some(r => techRolesList.includes(r));
            if (isTech) techListDiv.appendChild(userDiv); else musiciansListDiv.appendChild(userDiv);
        });
        if (musiciansListDiv.children.length === 0) musiciansListDiv.innerHTML = 'No hay músicos listados.';
        if (techListDiv.children.length === 0) techListDiv.innerHTML = 'No hay técnicos listados.';
    } else {
        musiciansListDiv.innerHTML = 'No hay usuarios registrados.';
        techListDiv.innerHTML = '';
    }
    
    try {
        const details = await window.withRetry(() => window.loadDoc('concert_details', concertId, {}));
        if (details && Object.keys(details).length > 0) {
            document.getElementById('concert-detail-location').value = details.locationDetails || '';
            document.getElementById('concert-detail-sound-company').value = details.soundCompany || ''; 
            document.getElementById('concert-detail-soundsetup').value = details.soundSetupTime || '';
            document.getElementById('concert-detail-instrumentssetup').value = details.instrumentsSetupTime || '';
            document.getElementById('concert-detail-soundcheck').value = details.soundcheckTime || '';
            document.getElementById('concert-detail-showtime').value = details.showTime || '';
            document.getElementById('concert-detail-notes').value = details.generalNotes || '';
            
            const gmapsLink = details.googleMapsLink || '';
            document.getElementById('concert-detail-gmaps-link').value = gmapsLink;
            if (gmapsLink) {
                openGmapsBtn.style.display = 'inline-block';
                openGmapsBtn.onclick = () => {
                    const currentLink = document.getElementById('concert-detail-gmaps-link').value.trim();
                    if (currentLink) window.open(currentLink, '_blank')
                }
            } else openGmapsBtn.style.display = 'none';
            
            if (details.attendees && Array.isArray(details.attendees)) {
                details.attendees.forEach(attendeeName => {
                    const checkbox = document.querySelector(`input[name="concertAttendees"][value="${attendeeName}"]`);
                    if (checkbox) checkbox.checked = true
                })
            }
        } else openGmapsBtn.style.display = 'none';
    } catch (error) {
        console.error("Error al intentar cargar detalles del concierto:", error);
        concertDetailMessage.className = "error-message";
        concertDetailMessage.textContent = `Error al cargar detalles: ${error.message}.`;
        openGmapsBtn.style.display = 'none'
    }
    concertDetailModal.classList.add('show')
};

async function saveConcertDetailsLogic() {
    const concertId = document.getElementById('concert-detail-id').value;
    if (!concertId) {
        if(concertDetailMessage) {
            concertDetailMessage.className = "error-message";
            concertDetailMessage.textContent = "Error: ID de concierto no encontrado.";
        }
        return
    }
    
    const selectedAttendees = [];
    document.querySelectorAll('input[name="concertAttendees"]:checked').forEach(checkbox => { selectedAttendees.push(checkbox.value) });
    
    const gmapsLinkValue = document.getElementById('concert-detail-gmaps-link').value.trim();
    const concertData = {
        locationDetails: document.getElementById('concert-detail-location').value.trim(),
        soundCompany: document.getElementById('concert-detail-sound-company').value.trim(),
        soundSetupTime: document.getElementById('concert-detail-soundsetup').value,
        instrumentsSetupTime: document.getElementById('concert-detail-instrumentssetup').value,
        soundcheckTime: document.getElementById('concert-detail-soundcheck').value,
        showTime: document.getElementById('concert-detail-showtime').value,
        generalNotes: document.getElementById('concert-detail-notes').value.trim(),
        attendees: selectedAttendees,
        googleMapsLink: gmapsLinkValue,
        lastUpdated: new Date().toISOString()
    };
    
    try {
        await window.withRetry(() => window.saveDoc('concert_details', concertId, concertData, true));
        if(concertDetailMessage) {
            concertDetailMessage.className = "success-message";
            concertDetailMessage.textContent = "Detalles guardados correctamente.";
        }
        
        const openGmapsBtn = document.getElementById('open-gmaps-link-btn');
        if (gmapsLinkValue) {
            openGmapsBtn.style.display = 'inline-block';
            openGmapsBtn.onclick = () => {
                const currentLink = document.getElementById('concert-detail-gmaps-link').value.trim();
                if (currentLink) window.open(currentLink, '_blank')
            }
        } else openGmapsBtn.style.display = 'none';
    } catch (error) {
        if(concertDetailMessage) {
            concertDetailMessage.className = "error-message";
            concertDetailMessage.textContent = `Error al guardar: ${error.message}.`
        }
    }
};
