/**
 * EduSafe - background.js (service worker)
 *
 * Responsabilidades:
 * 1. Construir y actualizar reglas dinámicas de declarativeNetRequest
 *    a partir de la lista negra de URLs y de palabras clave configuradas
 *    por el responsable (chrome.storage.local).
 * 2. Redirigir las solicitudes bloqueadas a blocked.html, pasando el
 *    motivo y el sitio (dominio o palabra clave) como parámetros.
 * 3. Escuchar coincidencias de reglas (onRuleMatchedDebug) para disparar
 *    notificaciones educativas y registrar estadísticas locales.
 */

const RULE_ID_OFFSET_DOMAIN = 1000;   // IDs 1000-1999 para dominios
const RULE_ID_OFFSET_KEYWORD = 2000;  // IDs 2000-2999 para palabras clave

// ---------- Utilidades de almacenamiento ----------

async function getConfig() {
  const data = await chrome.storage.local.get([
    "blacklist",
    "keywords",
    "notificationsEnabled",
    "blockStats",
  ]);
  return {
    blacklist: data.blacklist || [],
    keywords: data.keywords || [],
    notificationsEnabled: data.notificationsEnabled !== false,
    blockStats: data.blockStats || {}, // { "YYYY-MM-DD": count }
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function registrarBloqueo(motivo, url) {
  const { blockStats } = await getConfig();
  const key = todayKey();
  blockStats[key] = (blockStats[key] || 0) + 1;
  await chrome.storage.local.set({ blockStats });

  // Historial simple (sin datos personales, solo dominio + motivo + hora)
  const { history } = await chrome.storage.local.get(["history"]);
  const list = history || [];
  list.unshift({
    ts: Date.now(),
    domain: safeHostname(url),
    motivo,
  });
  await chrome.storage.local.set({ history: list.slice(0, 100) });
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "desconocido";
  }
}

// ---------- Construcción de reglas declarativeNetRequest ----------

async function reconstruirReglas() {
  const { blacklist, keywords } = await getConfig();

  const reglasDominio = blacklist.map((dominio, i) => ({
    id: RULE_ID_OFFSET_DOMAIN + i,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        extensionPath: `/blocked.html?motivo=dominio&sitio=${encodeURIComponent(dominio)}`,
      },
    },
    condition: {
      requestDomains: [dominio],
      resourceTypes: ["main_frame"],
    },
  }));

  const reglasPalabraClave = keywords.map((palabra, i) => ({
    id: RULE_ID_OFFSET_KEYWORD + i,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        extensionPath: `/blocked.html?motivo=palabra_clave&sitio=${encodeURIComponent(palabra)}`,
      },
    },
    condition: {
      urlFilter: `*${palabra}*`,
      resourceTypes: ["main_frame"],
    },
  }));

  const nuevasReglas = [...reglasDominio, ...reglasPalabraClave];

  const existentes = await chrome.declarativeNetRequest.getDynamicRules();
  const idsExistentes = existentes.map((r) => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: idsExistentes,
    addRules: nuevasReglas,
  });
}

// ---------- Notificaciones ----------

async function mostrarNotificacion(motivo, sitio) {
  const { notificationsEnabled } = await getConfig();
  if (!notificationsEnabled) return;

  const mensajes = {
    dominio: `Se bloqueó el acceso a "${sitio}" según la configuración familiar.`,
    palabra_clave: `Se bloqueó una página porque contenía la palabra clave "${sitio}".`,
  };

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png", // Asegúrate de tener este icono con el nuevo diseño
    title: "Acceso bloqueado por EduSafe",
    message: mensajes[motivo] || "Se bloqueó el acceso a este sitio.",
    priority: 1,
  });
}

// ---------- Listeners ----------

chrome.runtime.onInstalled.addListener(async () => {
  const config = await getConfig();
  if (!("blacklist" in config)) {
    await chrome.storage.local.set({ blacklist: [], keywords: [] });
  }
  await reconstruirReglas();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.blacklist || changes.keywords)) {
    reconstruirReglas();
  }
});

// onRuleMatchedDebug está disponible en modo desarrollador
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const ruleId = info.rule.ruleId;
    const esDominio = ruleId >= RULE_ID_OFFSET_DOMAIN && ruleId < RULE_ID_OFFSET_KEYWORD;
    const motivo = esDominio ? "dominio" : "palabra_clave";
    const url = info.request.url;

    await registrarBloqueo(motivo, url);
    await mostrarNotificacion(motivo, safeHostname(url));
  });
}