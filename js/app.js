// app.js

/* -----------------------------------
    Menú Hamburguesa (común a todas las páginas)
----------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const sidebarMenu = document.getElementById('sidebar-menu');
  const overlay = document.getElementById('overlay');
  const menuCerrar = document.getElementById('menu-cerrar');

  // Si existen estos elementos en la página (en caso de que no estén, no pasa nada)
  if (hamburgerBtn && sidebarMenu && overlay && menuCerrar) {
    hamburgerBtn.addEventListener('click', () => {
      sidebarMenu.classList.add('show');
      overlay.classList.add('show');
    });

    overlay.addEventListener('click', () => {
      sidebarMenu.classList.remove('show');
      overlay.classList.remove('show');
    });

    menuCerrar.addEventListener('click', (e) => {
      e.preventDefault();
      sidebarMenu.classList.remove('show');
      overlay.classList.remove('show');
    });
  }

  // A continuación llamamos a las funciones específicas de cada página
  inicializarSetlists();
  inicializarMiembros();
  inicializarFechasEnsayo();
  inicializarConfig();
});


/* -----------------------------------
    Funciones Comunes
----------------------------------- */
// Subir imagen de miembro a Firebase Storage
async function uploadMemberImage(file) {
  const storageRef = storage.ref();
  const fileRef = storageRef.child('miembros/' + Date.now() + '_' + file.name);
  await fileRef.put(file);
  return await fileRef.getDownloadURL();
}

// Convertir duración a segundos
function parseDurationToSeconds(str) {
  if (!str) return 0;
  if (str.includes(':')) {
    const [min, sec] = str.split(':').map(n => parseInt(n, 10));
    return (min * 60) + (sec || 0);
  }
  const secs = parseInt(str, 10);
  return isNaN(secs) ? 0 : secs;
}

// Formatear segundos a mm:ss (o h:mm:ss si es > 1 hora)
function formatSecondsHMSorMMSS(totalSeconds) {
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  } else {
    const h = Math.floor(totalSeconds / 3600);
    const rest = totalSeconds % 3600;
    const m = Math.floor(rest / 60);
    const s = rest % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}

// Limpiar strings con caracteres raros
function cleanString(str) {
  if (!str) return '';
  let cleaned = str.replace(/[^\x00-\xFF]/g, '');
  return cleaned.trim();
}

/* -----------------------------------
    1) INICIALIZAR SETLISTS (index.html)
----------------------------------- */
const urlPrimerSetlist = 'https://cold-limit-811a.jagomezc.workers.dev';
let urlSegundoSetlist = 'https://www.bandhelper.com/feed/set_list/TXHvyb';
let secondSetlistConcertTitle = '';

// Cargar config local (para el 2º setlist)
function loadConfigFromLocalStorage() {
  const savedURL = localStorage.getItem('urlSegundoSetlist');
  if (savedURL) urlSegundoSetlist = savedURL;
  const savedTitle = localStorage.getItem('secondSetlistConcertTitle');
  if (savedTitle) secondSetlistConcertTitle = savedTitle;
}

// Guardar config local
function saveConfigToLocalStorage(url, title) {
  localStorage.setItem('urlSegundoSetlist', url);
  localStorage.setItem('secondSetlistConcertTitle', title);
}

// Inicializar setlists en index.html
function inicializarSetlists() {
  // Comprobamos si estamos en la página que tiene el ID #setlists
  const setlistsSection = document.getElementById('setlists');
  const secondSetlistSection = document.getElementById('second-setlist');
  if (!setlistsSection || !secondSetlistSection) {
    // Si no existen estos elementos, significa que NO estamos en index.html
    return;
  }

  // Cargar config local
  loadConfigFromLocalStorage();

  // Cargar primer setlist
  cargarPrimerSetlist();

  // Cargar segundo setlist
  cargarSegundoSetlist();

  // Asignar listeners a botones de PDF
  const downloadBtn1 = document.getElementById('download-btn');
  const downloadBtn2 = document.getElementById('download-btn-2');
  if (downloadBtn1) {
    downloadBtn1.addEventListener('click', descargarPDFprimerSetlist);
  }
  if (downloadBtn2) {
    downloadBtn2.addEventListener('click', descargarPDFsegundoSetlist);
  }
}

// Cargar primer setlist
async function cargarPrimerSetlist() {
  try {
    const res = await fetch(urlPrimerSetlist);
    const data = await res.json();
    const tbody = document.getElementById('setlist-body');
    tbody.innerHTML = '';

    const songs = data.filter(item => item.type === 'song');
    let totalSecs = 0;
    songs.forEach((song, i) => {
      const secs = parseDurationToSeconds(song.duration || '');
      totalSecs += secs;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${cleanString(song.name || '')}</td>
        <td>${cleanString(song.key || '')}</td>
        <td>${cleanString(song.tempo || '')}</td>
        <td>${formatSecondsHMSorMMSS(secs)}</td>
      `;
      tbody.appendChild(row);
    });
    document.getElementById('total-time').textContent =
      'Tiempo total del set: ' + formatSecondsHMSorMMSS(totalSecs);
    return songs;
  } catch (err) {
    console.error('Error al cargar el primer setlist:', err);
    const tbody = document.getElementById('setlist-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5">Error al cargar el primer setlist.</td></tr>';
    }
    return [];
  }
}

// Descargar PDF primer setlist
async function descargarPDFprimerSetlist() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'A4' });
  doc.setFont('helvetica', 'normal');

  const songs = await cargarPrimerSetlist(); // recarga (por si hubo cambios)
  // Agregar logo
  try {
    const imgUrl = 'assets/logo_negro copia.jpg';
    const imgRes = await fetch(imgUrl);
    const imgBlob = await imgRes.blob();
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });
    reader.readAsDataURL(imgBlob);
    const base64Img = await base64Promise;
    doc.addImage(base64Img, 'JPEG', 40, 30, 60, 60);
  } catch (err) {
    console.warn('No se pudo cargar el logo (primer setlist):', err);
  }
  doc.setFontSize(16);
  doc.setTextColor(40);
  doc.text('Setlist - El Sótano del Doctor (Primer)', 120, 50);

  let totalSecs = 0;
  songs.forEach(s => {
    totalSecs += parseDurationToSeconds(s.duration || '0');
  });
  const totalTime = formatSecondsHMSorMMSS(totalSecs);
  const totalSongs = songs.length;

  doc.setFontSize(12);
  doc.setTextColor(80);
  doc.text(`${totalSongs} canciones, ${totalTime} total`, 120, 70);

  const columns = [
    { header: '#', dataKey: 'num' },
    { header: 'Título', dataKey: 'title' },
    { header: 'Tonalidad', dataKey: 'key' },
    { header: 'Tempo', dataKey: 'tempo' },
    { header: 'Duración', dataKey: 'duration' }
  ];

  const rows = songs.map((song, i) => {
    const secs = parseDurationToSeconds(song.duration || '0');
    return {
      num: i + 1,
      title: cleanString(song.name || ''),
      key: cleanString(song.key || ''),
      tempo: cleanString(song.tempo || ''),
      duration: formatSecondsHMSorMMSS(secs)
    };
  });

  doc.autoTable({
    startY: 100,
    head: [columns.map(c => c.header)],
    body: rows.map(r => [r.num, r.title, r.key, r.tempo, r.duration]),
    headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [230, 230, 230] },
    styles: { halign: 'left', fontSize: 10, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 150 },
      2: { cellWidth: 80 },
      3: { cellWidth: 50 },
      4: { cellWidth: 60 }
    }
  });

  doc.save('setlist_ElSotanoDelDoctor.pdf');
}

// Cargar segundo setlist
async function cargarSegundoSetlist() {
  const secondBody = document.getElementById('second-body');
  if (!secondBody) {
    // Si no existe, no estamos en la página con el segundo setlist
    return;
  }
  try {
    // Ponemos el título en pantalla
    document.getElementById('concert-title').textContent = secondSetlistConcertTitle;

    const url = urlSegundoSetlist;
    const res = await fetch(url);
    const data = await res.json();

    const songs = data.filter(item => item.type === 'song');
    secondBody.innerHTML = '';

    let totalSecs = 0;
    songs.forEach((song, index) => {
      const secs = parseDurationToSeconds(song.duration || '0');
      totalSecs += secs;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${cleanString(song.name || '')}</td>
        <td>${cleanString(song.key || '')}</td>
        <td>${cleanString(song.tempo || '')}</td>
        <td>${formatSecondsHMSorMMSS(secs)}</td>
      `;
      secondBody.appendChild(row);
    });

    document.getElementById('url-actual').textContent = url;
    document.getElementById('total-time-2').textContent =
      'Tiempo total del set: ' + formatSecondsHMSorMMSS(totalSecs);

    return songs;
  } catch (err) {
    console.error('Error al cargar el segundo setlist:', err);
    secondBody.innerHTML = '<tr><td colspan="5">Error al cargar el segundo setlist.</td></tr>';
    return [];
  }
}

// Descargar PDF segundo setlist
async function descargarPDFsegundoSetlist() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'A4' });
  doc.setFont('helvetica', 'normal');

  const songs = await cargarSegundoSetlist();
  if (!songs) return;

  try {
    const imgUrl = 'assets/logo_negro copia.jpg';
    const imgRes = await fetch(imgUrl);
    const imgBlob = await imgRes.blob();
    const reader = new FileReader();
    const base64Promise = new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });
    reader.readAsDataURL(imgBlob);
    const base64Img = await base64Promise;
    doc.addImage(base64Img, 'JPEG', 40, 30, 60, 60);
  } catch (err) {
    console.warn('No se pudo cargar el logo (segundo setlist):', err);
  }

  doc.setFontSize(16);
  doc.setTextColor(40);
  const pdfTitle = secondSetlistConcertTitle || 'El Sótano del Doctor (Segundo)';
  doc.text(`Setlist - ${pdfTitle}`, 120, 50);

  let totalSecs = 0;
  songs.forEach(song => {
    totalSecs += parseDurationToSeconds(song.duration || '0');
  });
  const totalTime = formatSecondsHMSorMMSS(totalSecs);
  const totalSongs = songs.length;

  doc.setFontSize(12);
  doc.setTextColor(80);
  doc.text(`${totalSongs} canciones, ${totalTime} total`, 120, 70);

  const columns2 = [
    { header: '#', dataKey: 'num' },
    { header: 'Canción', dataKey: 'name' },
    { header: 'Tonalidad', dataKey: 'key' },
    { header: 'Tempo', dataKey: 'tempo' },
    { header: 'Duración', dataKey: 'duration' }
  ];

  const rows2 = songs.map((song, i) => {
    const secs = parseDurationToSeconds(song.duration || '0');
    return {
      num: i + 1,
      name: cleanString(song.name || ''),
      key: cleanString(song.key || ''),
      tempo: cleanString(song.tempo || ''),
      duration: formatSecondsHMSorMMSS(secs)
    };
  });

  doc.autoTable({
    startY: 100,
    head: [columns2.map(c => c.header)],
    body: rows2.map(r => [r.num, r.name, r.key, r.tempo, r.duration]),
    headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [230, 230, 230] },
    styles: { halign: 'left', fontSize: 10, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 150 },
      2: { cellWidth: 80 },
      3: { cellWidth: 50 },
      4: { cellWidth: 60 }
    }
  });

  doc.save('SegundoSetlist.pdf');
}


/* -----------------------------------
    2) INICIALIZAR MIEMBROS (miembros.html)
----------------------------------- */
function inicializarMiembros() {
  const miembrosSection = document.getElementById('miembros');
  if (!miembrosSection) return; // No estamos en la página de miembros

  // Listeners para añadir miembro
  const formMiembros = document.getElementById('form-miembros');
  if (formMiembros) {
    formMiembros.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('nombre-miembro').value.trim();
      const rol = document.getElementById('rol-miembro').value.trim();
      const telefono = document.getElementById('telefono-miembro').value.trim();
      const email = document.getElementById('email-miembro').value.trim();

      let fotoURL = "";
      const fileInput = document.getElementById('foto-miembro');
      if (fileInput.files && fileInput.files[0]) {
        try {
          fotoURL = await uploadMemberImage(fileInput.files[0]);
        } catch (error) {
          console.error("Error subiendo la imagen:", error);
          alert("Error al subir la imagen. Se usará imagen por defecto.");
          fotoURL = "assets/default.jpg";
        }
      } else {
        fotoURL = "assets/default.jpg";
      }

      if (!nombre || !rol) {
        alert('Por favor, rellena al menos el nombre y el rol');
        return;
      }

      try {
        await db.collection('miembros').add({
          nombre, rol, telefono, email, foto: fotoURL
        });
        alert('Miembro añadido correctamente');
        cargarMiembros();
        e.target.reset();
      } catch (error) {
        console.error("Error al añadir miembro: ", error);
        alert('Error añadiendo el miembro');
      }
    });
  }

  // Listener para cancelar edición
  const cancelEditBtn = document.getElementById('cancel-edit-member');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      document.getElementById('edit-member-modal').style.display
