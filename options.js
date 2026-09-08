// ---------- Navegación entre secciones ----------

function seccionInicial() {
  const params = new URLSearchParams(window.location.search);
  return params.get("section") || "inicio";
}

function mostrarSeccion(nombre) {
  document.querySelectorAll(".seccion").forEach((s) => (s.hidden = true));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("activo"));
  document.getElementById(`sec-${nombre}`).hidden = false;
  document.querySelector(`.nav-item[data-section="${nombre}"]`).classList.add("activo");
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => mostrarSeccion(btn.dataset.section));
});

// ---------- Estado ----------

async function getState() {
  const data = await chrome.storage.local.get([
    "blacklist",
    "keywords",
    "notificationsEnabled",
    "customMessages",
    "history",
    "blockStats",
  ]);
  return {
    blacklist: data.blacklist || [],
    keywords: data.keywords || [],
    notificationsEnabled: data.notificationsEnabled !== false,
    customMessages: data.customMessages || [],
    history: data.history || [],
    blockStats: data.blockStats || {},
  };
}

function normalizarDominio(valor) {
  return valor.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function renderLista(ul, items, onEliminar) {
  ul.innerHTML = "";
  if (items.length === 0) {
    ul.innerHTML = '<li style="justify-content:center; color: var(--color-text-faint);">Vacío por ahora</li>';
    return;
  }
  items.forEach((item, index) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    // Añadir un icono pequeño (opcional)
    const icono = document.createElement("span");
    icono.textContent = "•";
    icono.style.marginRight = "8px";
    icono.style.color = "var(--color-secondary)";
    span.appendChild(icono);
    span.appendChild(document.createTextNode(item));
    const btn = document.createElement("button");
    btn.textContent = "🗑️";
    btn.title = "Quitar";
    btn.addEventListener("click", () => onEliminar(index));
    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function refrescarUI() {
  const state = await getState();

  renderLista(document.getElementById("listaDominios"), state.blacklist, eliminarDominio);
  renderLista(document.getElementById("listaPalabras"), state.keywords, eliminarPalabra);

  document.getElementById("chkNotificacionesSec").checked = state.notificationsEnabled;

  document.getElementById("statHoy").textContent = state.blockStats[todayKey()] || 0;

  const histUl = document.getElementById("listaHistorial");
  histUl.innerHTML = "";
  if (state.history.length === 0) {
    histUl.innerHTML = '<li style="justify-content:center; color: var(--color-text-faint);">Todavía no hay bloqueos registrados</li>';
  } else {
    state.history.slice(0, 15).forEach((h) => {
      const li = document.createElement("li");
      const fecha = new Date(h.ts).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });
      li.innerHTML = `<span>${h.domain} <small style="color:var(--color-text-faint);">(${h.motivo === "dominio" ? "sitio" : "palabra clave"})</small></span><span style="color:var(--color-text-faint);font-size:12px;">${fecha}</span>`;
      histUl.appendChild(li);
    });
  }

  const resp = await fetch(chrome.runtime.getURL("messages.json"));
  const base = await resp.json();
  const msgUl = document.getElementById("listaMensajes");
  msgUl.innerHTML = "";
  base.forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m}</span><span style="color:var(--color-text-faint);font-size:11px;">predeterminado</span>`;
    msgUl.appendChild(li);
  });
  state.customMessages.forEach((m, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = m;
    const btn = document.createElement("button");
    btn.textContent = "🗑️";
    btn.addEventListener("click", () => eliminarMensaje(i));
    li.appendChild(span);
    li.appendChild(btn);
    msgUl.appendChild(li);
  });
}

// ---------- Sitios ----------

async function agregarDominio() {
  const input = document.getElementById("inputDominio");
  const dominio = normalizarDominio(input.value);
  if (!dominio) return;
  const { blacklist } = await getState();
  if (!blacklist.includes(dominio)) {
    blacklist.push(dominio);
    await chrome.storage.local.set({ blacklist });
  }
  input.value = "";
  await refrescarUI();
}

async function eliminarDominio(index) {
  const { blacklist } = await getState();
  blacklist.splice(index, 1);
  await chrome.storage.local.set({ blacklist });
  await refrescarUI();
}

// ---------- Palabras clave ----------

async function agregarPalabra() {
  const input = document.getElementById("inputPalabra");
  const palabra = input.value.trim().toLowerCase();
  if (!palabra) return;
  const { keywords } = await getState();
  if (!keywords.includes(palabra)) {
    keywords.push(palabra);
    await chrome.storage.local.set({ keywords });
  }
  input.value = "";
  await refrescarUI();
}

async function eliminarPalabra(index) {
  const { keywords } = await getState();
  keywords.splice(index, 1);
  await chrome.storage.local.set({ keywords });
  await refrescarUI();
}

// ---------- Mensajes educativos personalizados ----------

async function agregarMensaje() {
  const input = document.getElementById("inputMensaje");
  const texto = input.value.trim();
  if (!texto) return;
  const { customMessages } = await getState();
  customMessages.push(texto);
  await chrome.storage.local.set({ customMessages });
  input.value = "";
  await refrescarUI();
}

async function eliminarMensaje(index) {
  const { customMessages } = await getState();
  customMessages.splice(index, 1);
  await chrome.storage.local.set({ customMessages });
  await refrescarUI();
}

// ---------- Notificaciones ----------

async function toggleNotificaciones() {
  const activo = document.getElementById("chkNotificacionesSec").checked;
  await chrome.storage.local.set({ notificationsEnabled: activo });
}

// ---------- Exportar / Importar ----------

async function exportarConfiguracion() {
  const state = await getState();
  const exportable = {
    blacklist: state.blacklist,
    keywords: state.keywords,
    notificationsEnabled: state.notificationsEnabled,
    customMessages: state.customMessages,
  };
  const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "edusafe-config.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importarConfiguracion(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await chrome.storage.local.set({
        blacklist: Array.isArray(data.blacklist) ? data.blacklist : [],
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        notificationsEnabled: data.notificationsEnabled !== false,
        customMessages: Array.isArray(data.customMessages) ? data.customMessages : [],
      });
      await refrescarUI();
      alert("Configuración importada correctamente.");
    } catch (err) {
      alert("El archivo seleccionado no es una configuración válida de EduSafe.");
    }
  };
  reader.readAsText(file);
}

// ---------- Asistencia inteligente (vía servidor proxy) ----------

// URL del servidor que despliegues (cambiar por la tuya)
const SERVIDOR_URL = "https://edusafee.onrender.com/";

async function consultarGemini(termino) {
  try {
    const resp = await fetch(SERVIDOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: termino })
    });
    if (!resp.ok) {
      const err = await resp.json();
      return { ok: false, error: err.error || "Error en el servidor" };
    }
    const data = await resp.json();
    return { ok: true, sugerencias: data.suggestions || [] };
  } catch (e) {
    return { ok: false, error: "No se pudo conectar con el servidor de sugerencias. Verifica tu conexión." };
  }
}

// Verificar estado del servidor (opcional)
async function verificarServidor() {
  const estado = document.getElementById("estadoServidor");
  if (!estado) return;
  try {
    // Usamos la ruta /health en lugar de /api/suggest con HEAD
    const resp = await fetch(SERVIDOR_URL.replace('/api/suggest', '/health'), {
      method: "GET"
    });
    if (resp.ok) {
      estado.innerHTML = "● Conectado al servidor";
      estado.style.color = "#27AE60";
    } else {
      estado.innerHTML = "⚠️ Servidor no disponible";
      estado.style.color = "#E67E22";
    }
  } catch {
    estado.innerHTML = "⚠️ No se pudo contactar al servidor";
    estado.style.color = "#C0392B";
  }
}

function pintarSugerencias(ul, sugerencias, tipo) {
  ul.innerHTML = "";
  if (sugerencias.length === 0) {
    ul.innerHTML = '<li style="justify-content:center; color: var(--color-text-faint);">Sin sugerencias disponibles.</li>';
    return;
  }
  sugerencias.forEach((s) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = s;
    const btn = document.createElement("button");
    btn.textContent = "Aceptar";
    btn.className = "aceptar";
    btn.addEventListener("click", async () => {
      if (tipo === "sitio") {
        const { blacklist } = await getState();
        const dominio = normalizarDominio(s);
        if (!blacklist.includes(dominio)) {
          blacklist.push(dominio);
          await chrome.storage.local.set({ blacklist });
        }
      } else {
        const { keywords } = await getState();
        const palabra = s.trim().toLowerCase();
        if (!keywords.includes(palabra)) {
          keywords.push(palabra);
          await chrome.storage.local.set({ keywords });
        }
      }
      await refrescarUI();
      li.remove();
    });
    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function sugerirSitio() {
  const termino = document.getElementById("inputSugerenciaSitio").value.trim();
  const ul = document.getElementById("listaSugerenciasSitio");
  if (!termino) return;
  ul.innerHTML = '<li style="justify-content:center; color: var(--color-text-faint);">Buscando sugerencias...</li>';
  const resultado = await consultarGemini(termino);
  if (!resultado.ok) {
    ul.innerHTML = `<li style="color: var(--color-danger);">⚠️ ${resultado.error}</li>`;
    return;
  }
  pintarSugerencias(ul, resultado.sugerencias, "sitio");
}

async function sugerirPalabra() {
  const termino = document.getElementById("inputSugerenciaPalabra").value.trim();
  const ul = document.getElementById("listaSugerenciasPalabra");
  if (!termino) return;
  ul.innerHTML = '<li style="justify-content:center; color: var(--color-text-faint);">Buscando sugerencias...</li>';
  const resultado = await consultarGemini(termino);
  if (!resultado.ok) {
    ul.innerHTML = `<li style="color: var(--color-danger);">⚠️ ${resultado.error}</li>`;
    return;
  }
  pintarSugerencias(ul, resultado.sugerencias, "palabra");
}

// ---------- Listeners ----------

document.getElementById("btnAgregarDominio").addEventListener("click", agregarDominio);
document.getElementById("btnAgregarPalabra").addEventListener("click", agregarPalabra);
document.getElementById("btnAgregarMensaje").addEventListener("click", agregarMensaje);
document.getElementById("chkNotificacionesSec").addEventListener("change", toggleNotificaciones);
document.getElementById("btnExportar").addEventListener("click", exportarConfiguracion);
document.getElementById("btnSugerirSitio").addEventListener("click", sugerirSitio);
document.getElementById("btnSugerirPalabra").addEventListener("click", sugerirPalabra);

document.getElementById("btnImportar").addEventListener("click", () => {
  document.getElementById("inputImportar").click();
});
document.getElementById("inputImportar").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importarConfiguracion(file);
});

mostrarSeccion(seccionInicial());
refrescarUI();
verificarServidor();