// app.js

/* -----------------------------------
    Funciones / Variables Globales
----------------------------------- */

// CLAVE para panel de administración de fechas:
const CLAVE_ADMIN_FECHAS = "ensayo2025";

// URLs de setlists
const urlPrimerSetlist = 'https://cold-limit-811a.jagomezc.workers.dev';
let urlSegundoSetlist = 'https://www.bandhelper.com/feed/set_list/TXHvyb';
let secondSetlistConcertTitle = '';

// Al cargar la página
window.addEventListener('DOMContentLoaded', () => {
  loadConfigFromLocalStorage();
  cargarPrimerSetlist();
  cargarSegundoSetlist();
});

/* -----------------------------------
    LÓGICA DE MENÚ / NAVEGACIÓN
----------------------------------- */
const hamburgerBtn = document.getElementById('hamburger-btn');
const sidebarMenu  = document.getElementById('sidebar-menu');
const overlay      = document.getElementById('overlay');

hamburgerBtn.addEventListener('click', () => {
  sidebarMenu.classList.add('show');
  overlay.classList.add('show');
});
overlay.addEventListener('click', () => {
  sidebarMenu.classList.remove('show');
  overlay.classList.remove('show');
});

document.getElementById('menu-cerrar').addEventListener('click', (e) => {
  e.preventDefault();
  sidebarMenu.classList.remove('show');
  overlay.classList.remove('show');
});

function hideAllSections() {
  document.getElementById('miembros').style.display = 'none';
  document.getElementById('fechas-ensayo').style.display = 'none';
  document.getElementById('config-screen').style.display = 'none';
}

// Enlaces del menú
document.getElementById('menu-miembros').addEventListener('click', (e) => {
  e.preventDefault();
  hideAllSections();
  document.getElementById('miembros').style.display = 'block';
  sidebarMenu.classList.remove('show');
  overlay.classList.remove('show');
  cargarMiembros();
});
document.getElementById('menu-fechas').addEventListener('click', (e) => {
  e.preventDefault();
  hideAllSections();
  document.getElementById('fechas-ensayo').style.display = 'block';
  sidebarMenu.classList.remove('show');
  overlay.classList.remove('show');
  cargarFechasDisponiblesVotacion();
  cargarMiembrosSelect();
});
document.getElementById('menu-config').addEventListener('click', (e) => {
  e.preventDefault();
  hideAllSections();
  document.getElementById('config-screen').style.display = 'block';
  sidebarMenu.classList.remove('show');
  overlay.classList.remove('show');
  // Ajustar campos
  const feedSuffix = urlSegundoSetlist.replace('https://www.bandhelper.com/feed/set_list/', '');
  document.getElementById('feed-url').value = feedSuffix;
  document.getElementById('concert-title-input').value = secondSetlistConcertTitle;
});

// Botón cerrar en Configuración
document.getElementById('close-config').addEventListener('click', () => {
  document.getElementById('config-screen').style.display = 'none';
});


/* -----------------------------------
    LÓGICA DE MIEMBROS DEL GRUPO
----------------------------------- */

// Subir imagen de miembro a Firebase Storage
async function uploadMemberImage(file) {
  const storageRef = storage.ref();
  const fileRef = storageRef.child('miembros/' + Date.now() + '_' + file.name);
  await fileRef.put(file);
  return await fileRef.getDownloadURL();
}

// Agregar miembro
document.getElementById('form-miembros').addEventListener('submit', async (e) => {
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

// Cargar miembros
async function cargarMiembros() {
  const container = document.getElementById('lista-miembros');
  container.innerHTML = '';
  const snapshot = await db.collection('miembros').get();

  snapshot.forEach(doc => {
    const member = doc.data();
    const div = document.createElement('div');
    div.style.border = "1px solid #222";
    div.style.padding = "10px";
    div.style.marginBottom = "10px";
    div.setAttribute('data-id', doc.id);

    div.innerHTML = `
      <img src="${member.foto || 'assets/default.jpg'}"
           alt="${member.nombre}"
           style="width:50px; height:50px; border-radius:50%; margin-right:10px;">
      <strong>${member.nombre}</strong> - ${member.rol}<br>
      Tel: ${member.telefono || 'N/A'}<br>
      Email: ${member.email || 'N/A'}
      <div style="margin-top: 5px;">
        <button class="btn-edit" data-id="${doc.id}">Editar</button>
        <button class="btn-delete" data-id="${doc.id}">Eliminar</button>
      </div>
    `;
    container.appendChild(div);
  });

  // Botones Editar / Eliminar
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const memberId = e.target.getAttribute('data-id');
      const docSnap = await db.collection('miembros').doc(memberId).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        document.getElementById('edit-member-id').value = memberId;
        document.getElementById('edit-nombre-miembro').value = data.nombre;
        document.getElementById('edit-rol-miembro').value = data.rol;
        document.getElementById('edit-telefono-miembro').value = data.telefono || "";
        document.getElementById('edit-email-miembro').value = data.email || "";
        document.getElementById('edit-member-modal').style.display = 'block';
      }
    });
  });
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const memberId = e.target.getAttribute('data-id');
      if (confirm("¿Estás seguro de eliminar este miembro?")) {
        await db.collection('miembros').doc(memberId).delete();
        cargarMiembros();
      }
    });
  });
}

// Editar miembro (modal)
document.getElementById('form-edit-miembro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const memberId = document.getElementById('edit-member-id').value;
  const nombre = document.getElementById('edit-nombre-miembro').value.trim();
  const rol = document.getElementById('edit-rol-miembro').value.trim();
  const telefono = document.getElementById('edit-telefono-miembro').value.trim();
  const email = document.getElementById('edit-email-miembro').value.trim();

  let fotoURL = null;
  const fileInput = document.getElementById('edit-foto-miembro');
  if (fileInput.files && fileInput.files[0]) {
    try {
      fotoURL = await uploadMemberImage(fileInput.files[0]);
    } catch (error) {
      console.error("Error al subir nueva imagen:", error);
      alert("Error al subir la nueva imagen. Se mantendrá la anterior.");
    }
  }

  const updatedData = { nombre, rol, telefono, email };
  if (fotoURL) updatedData.foto = fotoURL;

  try {
    await db.collection('miembros').doc(memberId).update(updatedData);
    alert("Miembro actualizado correctamente.");
    document.getElementById('edit-member-modal').style.display = 'none';
    cargarMiembros();
  } catch (error) {
    console.error("Error al actualizar miembro: ", error);
    alert("Error al actualizar el miembro.");
  }
});

// Cancelar edición
document.getElementById('cancel-edit-member').addEventListener('click', () => {
  document.getElementById('edit-member-modal').style.display = 'none';
});


/* -----------------------------------
    LÓGICA DE FECHAS ENSAYO / DISPONIBILIDAD
----------------------------------- */

async function cargarMiembrosSelect() {
  const select = document.getElementById('miembro-votante');
  select.innerHTML = '<option value="">-- Selecciona --</option>';
  const snapshot = await db.collection('miembros').get();
  snapshot.forEach(doc => {
    const member = doc.data();
    const option = document.createElement('option');
    option.value = doc.id;
    option.textContent = member.nombre;
    select.appendChild(option);
  });
}

async function cargarFechasDisponiblesVotacion() {
  const container = document.getElementById('opciones-fechas');
  container.innerHTML = '';
  const snapshot = await db.collection('fechasDisponibles').get();
  snapshot.forEach(doc => {
    const fecha = doc.id;
    const div = document.createElement('div');
    div.setAttribute('data-fecha', fecha);
    div.style.marginBottom = "10px";
    div.innerHTML = `
      <strong>${fecha}</strong>:
      <label><input type="radio" name="vote_${fecha}" value="si" required> Sí</label>
      <label style="margin-left: 10px;"><input type="radio" name="vote_${fecha}" value="no" required> No</label>
    `;
    container.appendChild(div);
  });
}

document.getElementById('form-fechas').addEventListener('submit', async function(e) {
  e.preventDefault();
  const miembro = document.getElementById('miembro-votante').value;
  if (!miembro) {
    alert('Selecciona tu miembro.');
    return;
  }
  const container = document.getElementById('opciones-fechas');
  const voteDivs = container.querySelectorAll('div[data-fecha]');
  const votes = {};

  voteDivs.forEach(div => {
    const fecha = div.getAttribute('data-fecha');
    const selected = div.querySelector(`input[name="vote_${fecha}"]:checked`);
    if (selected) {
      votes[fecha] = selected.value;
    }
  });

  if (Object.keys(votes).length === 0) {
    alert("Debes emitir tu voto en al menos una fecha.");
    return;
  }
  await enviarDisponibilidad(miembro, votes);
  e.target.reset();
});

async function enviarDisponibilidad(miembro, votes) {
  for (const fecha in votes) {
    const voteValue = votes[fecha];
    const docRef = db.collection('fechasDisponibles').doc(fecha);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      let currentVotes = docSnap.data().votos || [];
      const index = currentVotes.findIndex(vote => vote.miembro === miembro);
      if (index >= 0) {
        currentVotes[index].voto = voteValue;
      } else {
        currentVotes.push({ miembro, voto: voteValue });
      }
      await docRef.update({ votos: currentVotes });
    } else {
      await db.collection('fechasDisponibles').doc(fecha).set({
        votos: [{ miembro, voto: voteValue }]
      });
    }
  }
  alert("Disponibilidad registrada.");
  mostrarResultadosDisponibilidad();
}

async function mostrarResultadosDisponibilidad() {
  const lista = document.getElementById('lista-resultados');
  lista.innerHTML = '';
  const snapshot = await db.collection('fechasDisponibles').get();

  snapshot.forEach(doc => {
    const data = doc.data();
    const li = document.createElement('li');
    let text = `${doc.id}: `;
    if (data.votos && data.votos.length > 0) {
      data.votos.forEach(vote => {
        text += ` [${vote.miembro}: ${vote.voto}] `;
      });
    } else {
      text += "Sin votos";
    }
    li.textContent = text;
    lista.appendChild(li);
  });
  document.getElementById('resultados-disponibilidad').style.display = 'block';
}

/* -----------------------------------
    Panel de Administración de Fechas
----------------------------------- */
document.getElementById('login-btn-fechas').addEventListener('click', () => {
  const clave = document.getElementById('admin-pass-fechas').value.trim();
  if (clave === CLAVE_ADMIN_FECHAS) {
    document.getElementById('panel-fechas').style.display = 'block';
    document.getElementById('login-admin-fechas').style.display = 'none';
    cargarFechasAdmin();
  } else {
    alert('Clave incorrecta.');
  }
});

document.getElementById('agregar-fecha').addEventListener('click', async () => {
  const nueva = document.getElementById('nueva-fecha').value.trim();
  if (!nueva) return;
  try {
    await db.collection('fechasDisponibles').doc(nueva).set({ votos: [] });
    document.getElementById('nueva-fecha').value = '';
    cargarFechasDisponiblesVotacion();
    cargarFechasAdmin();
  } catch (error) {
    console.error("Error al agregar fecha: ", error);
    alert("Error al agregar fecha.");
  }
});

async function cargarFechasAdmin() {
  const ul = document.getElementById('fechas-activas');
  ul.innerHTML = '';
  const snapshot = await db.collection('fechasDisponibles').get();
  snapshot.forEach(doc => {
    const li = document.createElement('li');
    li.textContent = doc.id;

    const btn = document.createElement('button');
    btn.textContent = 'Eliminar';
    btn.style.marginLeft = '10px';
    btn.style.background = 'red';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    btn.onclick = async () => {
      await db.collection('fechasDisponibles').doc(doc.id).delete();
      cargarFechasDisponiblesVotacion();
      cargarFechasAdmin();
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}


/* -----------------------------------
    LÓGICA DE SETLISTS (Fetch, PDF, etc.)
----------------------------------- */
function parseDurationToSeconds(str) {
  if (!str) return 0;
  if (str.includes(':')) {
    const [min, sec] = str.split(':').map(n => parseInt(n, 10));
    return (min * 60) + (sec || 0);
  }
  const secs = parseInt(str, 10);
  return isNaN(secs) ? 0 : secs;
}

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

function cleanString(str) {
  if (!str) return '';
  let cleaned = str.replace(/[^\x00-\xFF]/g, '');
  return cleaned.trim();
}

// Primer Setlist
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
    document.getElementById('setlist-body').innerHTML =
      '<tr><td colspan="5">Error al cargar el primer setlist.</td></tr>';
    return [];
  }
}

async function descargarPDFprimerSetlist() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'A4' });
  doc.setFont('helvetica', 'normal');

  const songs = await cargarPrimerSetlist();
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
    styles: {
      halign: 'left', fontSize: 10, cellPadding: 5
    },
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

document.getElementById('download-btn').addEventListener('click', descargarPDFprimerSetlist);


// Segundo Setlist
function loadConfigFromLocalStorage() {
  const savedURL = localStorage.getItem('urlSegundoSetlist');
  if (savedURL) urlSegundoSetlist = savedURL;
  const savedTitle = localStorage.getItem('secondSetlistConcertTitle');
  if (savedTitle) secondSetlistConcertTitle = savedTitle;
}

function saveConfigToLocalStorage(url, title) {
  localStorage.setItem('urlSegundoSetlist', url);
  localStorage.setItem('secondSetlistConcertTitle', title);
}

function displayConcertTitle() {
  document.getElementById('concert-title').textContent = secondSetlistConcertTitle;
}

function getSecondSetlistURL() {
  return urlSegundoSetlist;
}

async function cargarSegundoSetlist() {
  try {
    displayConcertTitle();
    const url = getSecondSetlistURL();
    const res = await fetch(url);
    const data = await res.json();

    const songs = data.filter(item => item.type === 'song');
    const tbody = document.getElementById('second-body');
    tbody.innerHTML = '';

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
      tbody.appendChild(row);
    });

    document.getElementById('url-actual').textContent = url;
    document.getElementById('total-time-2').textContent =
      'Tiempo total del set: ' + formatSecondsHMSorMMSS(totalSecs);

    return songs;
  } catch (err) {
    console.error('Error al cargar el segundo setlist:', err);
    document.getElementById('second-body').innerHTML =
      '<tr><td colspan="5">Error al cargar el segundo setlist.</td></tr>';
    return [];
  }
}

document.getElementById('guardar-config').addEventListener('click', () => {
  const feed = document.getElementById('feed-url').value.trim();
  const title = document.getElementById('concert-title-input').value.trim();

  // Reconstruye la URL si no contiene "http"
  let fullURL = feed;
  if (!feed.startsWith('http')) {
    fullURL = 'https://www.bandhelper.com/feed/set_list/' + feed;
  }
  urlSegundoSetlist = fullURL;
  secondSetlistConcertTitle = title;
  saveConfigToLocalStorage(fullURL, title);
  alert('Configuración guardada.');
});

document.getElementById('download-btn-2').addEventListener('click', descargarPDFsegundoSetlist);

async function descargarPDFsegundoSetlist() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'A4' });
  doc.setFont('helvetica', 'normal');

  const songs = await cargarSegundoSetlist();
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
    styles: {
      halign: 'left', fontSize: 10, cellPadding: 5
    },
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
