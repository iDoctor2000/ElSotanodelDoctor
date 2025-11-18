// setlistWorker.js
self.onmessage = async function(e) {
  const { configEntry, tbodyId, totalTimeId, defaultErrorMessage } = e.data;

  const parseDuration = str => { /* ← copia aquí la función parseDuration completa que ya tienes */ };
  const toMMSS = s => { /* ← copia aquí toMMSS */ };
  const toHHMM = s => { /* ← copia aquí toHHMM */ };
  const decodeHtmlEntities = text => { const t=document.createElement('textarea'); t.innerHTML=text; return t.value; };

  try {
    if (!configEntry.url || configEntry.url.includes('URL_POR_CONFIGURAR')) {
      throw new Error("URL no configurada");
    }
    const response = await fetch(configEntry.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawData = await response.json();
    const dataToProcess = Array.isArray(rawData) ? rawData : rawData.items || [];

    // ← Aquí pegas TODO el procesamiento que tenías dentro de cargarSetlistGenerico
    // (desde processedItems hasta el final, pero SIN tocar el DOM)
    // Solo cambia las líneas de DOM por postMessage al final

    let totalSecondsOverall = 0;
    let songCount = 0;
    const htmlRows = [];
    // ... todo tu bucle de processedItems, setlistStructure, etc.
    // (exactamente igual, solo que en vez de tbody.insertAdjacentHTML usas htmlRows.push(`<tr>...</tr>`))

    // Al final:
    self.postMessage({
      success: true,
      tbodyId,
      totalTimeId,
      html: htmlRows.join(''),
      totalTimeText: "Tiempo total del set: " + toHHMM(totalSecondsOverall)
    });

  } catch (err) {
    self.postMessage({
      success: false,
      tbodyId,
      totalTimeId,
      error: defaultErrorMessage + ". " + err.message
    });
  }
};
