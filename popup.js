function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function cargarEstadisticas() {
  const { blockStats } = await chrome.storage.local.get(["blockStats"]);
  const stats = blockStats || {};
  document.getElementById("bloqueosHoy").textContent = stats[todayKey()] || 0;
}

async function cargarMensajeEducativo() {
  try {
    const { customMessages } = await chrome.storage.local.get(["customMessages"]);
    const resp = await fetch(chrome.runtime.getURL("messages.json"));
    const base = await resp.json();
    const todos = base.concat(customMessages || []);
    const aleatorio = todos[Math.floor(Math.random() * todos.length)];
    document.getElementById("mensajeDelDia").textContent = aleatorio;
  } catch (e) {
    document.getElementById("mensajeDelDia").textContent =
      "Protege tu privacidad: no compartas contraseñas ni datos personales en sitios sospechosos.";
  }
}

async function cargarNotificaciones() {
  const { notificationsEnabled } = await chrome.storage.local.get(["notificationsEnabled"]);
  document.getElementById("chkNotificaciones").checked = notificationsEnabled !== false;
}

document.getElementById("chkNotificaciones").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ notificationsEnabled: e.target.checked });
});

document.getElementById("btnConfig").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html?section=sitios") });
});

document.getElementById("btnHistorial").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html?section=inicio") });
});

document.getElementById("btnAjustes").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html?section=general") });
});

cargarEstadisticas();
cargarMensajeEducativo();
cargarNotificaciones();