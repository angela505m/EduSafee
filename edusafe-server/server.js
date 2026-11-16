
/**
 * EduSafe — API de Gemini + módulo de correo.
 *
 * Rutas:
 * GET  /api/correo/estado
 * POST /api/otp/send
 * POST /api/otp/verify
 * POST /api/notify
 * POST /api/resumen
 * POST /api/suggest
 * GET  /health
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(x => x.trim()).filter(Boolean)
  : ["*"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes("*")) return callback(null, true);
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      origin.startsWith("chrome-extension://")
    ) return callback(null, true);
    callback(new Error("CORS: origen no permitido"));
  },
  methods: ["GET", "POST", "OPTIONS"],
}));

app.use(express.json({ limit: "25kb" }));

// ======================================================
// GEMINI
// ======================================================

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurada.");
  }

  return new GoogleGenAI({ apiKey });
}

function buildPrompt(term) {
  return `
Eres un asistente de control parental para una extensión de Chrome llamada EduSafe.
Sugiere entre 5 y 8 dominios web o palabras clave que podrían ser inapropiados
para menores y que valdría la pena bloquear.

Término: "${term}"

Responde ÚNICAMENTE con un array JSON válido de strings.
Sin markdown ni explicaciones.

Ejemplo:
["ejemplo1.com", "ejemplo2.com"]

Si el término no está relacionado con contenido potencialmente inapropiado,
responde con un array vacío: []
`.trim();
}

// ======================================================
// CONFIGURACIÓN SMTP - GMAIL
// ======================================================

const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure =
  process.env.SMTP_SECURE === "true" || smtpPort === 465;

let transporter = null;

function getMailTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  if (!Number.isInteger(smtpPort)) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  return transporter;
}

function remitente() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "EduSafe";
}

function emailValido(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
  );
}

function normalizarEmail(value) {
  return value.trim().toLowerCase();
}

function respuestaSmtpNoConfigurado(res) {
  return res.status(503).json({
    codigo: "smtp",
    error: "Falta configurar el servicio SMTP en Render.",
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

async function enviarCorreo({ to, subject, text, html }) {
  const mailer = getMailTransport();

  if (!mailer) {
    const error = new Error("SMTP no configurado");
    error.code = "SMTP_NOT_CONFIGURED";
    throw error;
  }

  return mailer.sendMail({
    from: remitente(),
    to,
    subject,
    text,
    html,
  });
}

// ======================================================
// CÓDIGOS OTP
// ======================================================

const codigos = new Map();
const enviosEmail = new Map();
const enviosIp = new Map();
const accionesPorEmail = new Map();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_INTENTOS = 5;

function hashCodigo(email, codigo) {
  return createHash("sha256")
    .update(`${email}:${codigo}`)
    .digest();
}

function registrarEnvio(
  map,
  key,
  limite,
  intervaloMs,
  minimoEntreMs = 0
) {
  const ahora = Date.now();

  const previos = (map.get(key) || [])
    .filter(t => ahora - t < intervaloMs);

  if (previos.length >= limite) return false;

  if (
    minimoEntreMs &&
    previos.length &&
    ahora - previos[previos.length - 1] < minimoEntreMs
  ) {
    return false;
  }

  previos.push(ahora);
  map.set(key, previos);

  return true;
}

function limpiarCodigosVencidos() {
  const ahora = Date.now();

  for (const [email, item] of codigos) {
    if (item.expiresAt <= ahora) {
      codigos.delete(email);
    }
  }
}

const MOTIVOS_OTP = {
  verificar: "confirmar el correo del responsable",
  cambio: "confirmar un cambio de seguridad en EduSafe",
  cambio_correo: "autorizar el cambio de correo del responsable",
  recuperar: "recuperar la contraseña de EduSafe",
};

// ======================================================
// ESTADO DEL SERVICIO DE CORREO
// ======================================================

app.get("/api/correo/estado", async (_req, res) => {
  const mailer = getMailTransport();

  if (!mailer) {
    return res.json({
      ok: true,
      modulo: true,
      smtp: false,
    });
  }

  try {
    await mailer.verify();

    return res.json({
      ok: true,
      modulo: true,
      smtp: true,
    });
  } catch (err) {
    console.error(
      "Comprobación SMTP fallida:",
      err.code || err.message
    );

    return res.json({
      ok: true,
      modulo: true,
      smtp: false,
    });
  }
});

// ======================================================
// ENVIAR CÓDIGO DE VERIFICACIÓN
// ======================================================

app.post("/api/otp/send", async (req, res) => {
  const emailInput = req.body?.email;
  const motivo = req.body?.motivo;

  if (!emailValido(emailInput)) {
    return res.status(400).json({
      error: "Escribí una dirección de correo válida.",
    });
  }

  if (
    typeof motivo !== "string" ||
    !Object.hasOwn(MOTIVOS_OTP, motivo)
  ) {
    return res.status(400).json({
      error: "El motivo de verificación no es válido.",
    });
  }

  if (!getMailTransport()) {
    return respuestaSmtpNoConfigurado(res);
  }

  const email = normalizarEmail(emailInput);
  const ip = req.ip || req.socket.remoteAddress || "desconocida";

  if (
    !registrarEnvio(
      enviosEmail,
      email,
      5,
      60 * 60 * 1000,
      60 * 1000
    ) ||
    !registrarEnvio(
      enviosIp,
      ip,
      20,
      60 * 60 * 1000
    )
  ) {
    return res.status(429).json({
      error: "Se solicitaron demasiados códigos. Esperá un momento.",
    });
  }

  limpiarCodigosVencidos();

  const codigo = String(
    randomInt(0, 1000000)
  ).padStart(6, "0");

  const motivoTexto = MOTIVOS_OTP[motivo];

  const subject = "Tu código de seguridad de EduSafe";

  const text = `
Tu código de EduSafe es: ${codigo}

Este código sirve para ${motivoTexto}.
Vence en 10 minutos.

Si no solicitaste este código, ignorá este mensaje.
`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#24313b;line-height:1.5">
      <h2 style="color:#176b70">EduSafe</h2>
      <p>Usá este código para ${escapeHtml(motivoTexto)}:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f1f6f6;border-radius:10px;text-align:center">
        ${codigo}
      </div>
      <p>El código vence en <strong>10 minutos</strong>.</p>
      <p style="color:#687780;font-size:13px">
        Si no solicitaste este código, podés ignorar este mensaje.
      </p>
    </div>
  `;

  try {
    await enviarCorreo({
      to: email,
      subject,
      text,
      html,
    });

    codigos.set(email, {
      hash: hashCodigo(email, codigo),
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      motivo,
    });

    return res.json({
      ok: true,
      expiresIn: 600,
    });

  } catch (err) {
    console.error(
      "No se pudo enviar el código:",
      err.code || err.message
    );

    return res.status(502).json({
      error: "No se pudo enviar el correo. Revisá la configuración SMTP en Render.",
    });
  }
});

// ======================================================
// VERIFICAR CÓDIGO
// ======================================================

app.post("/api/otp/verify", (req, res) => {
  const { email: emailInput, codigo } = req.body || {};

  if (
    !emailValido(emailInput) ||
    typeof codigo !== "string" ||
    !/^\d{6}$/.test(codigo.trim())
  ) {
    return res.status(400).json({
      error: "Ingresá un correo válido y un código de 6 dígitos.",
    });
  }

  const email = normalizarEmail(emailInput);
  const item = codigos.get(email);

  if (!item) {
    return res.status(400).json({
      error: "No hay un código vigente. Solicitá uno nuevo.",
    });
  }

  if (item.expiresAt <= Date.now()) {
    codigos.delete(email);

    return res.status(400).json({
      error: "El código venció. Solicitá uno nuevo.",
    });
  }

  const recibido = hashCodigo(email, codigo.trim());

  item.attempts++;

  const correcto =
    item.hash.length === recibido.length &&
    timingSafeEqual(item.hash, recibido);

  if (!correcto) {
    if (item.attempts >= OTP_MAX_INTENTOS) {
      codigos.delete(email);
    }

    return res.status(400).json({
      error: item.attempts >= OTP_MAX_INTENTOS
        ? "Se alcanzó el máximo de intentos. Solicitá un código nuevo."
        : "El código no es correcto.",
    });
  }

  codigos.delete(email);

  return res.json({ ok: true });
});

// ======================================================
// AVISOS DE SEGURIDAD
// ======================================================

const EVENTOS = {
  clave_fallida: {
    subject: "Intentos de acceso en EduSafe",
    detail: "Se registraron varios intentos fallidos al ingresar la contraseña.",
  },

  pin_fallido: {
    subject: "Intentos de PIN en EduSafe",
    detail: "Se registraron varios intentos fallidos al ingresar el PIN.",
  },

  clave_cambiada: {
    subject: "La contraseña de EduSafe fue cambiada",
    detail: "La contraseña del responsable fue cambiada correctamente.",
  },

  correo_cambiado: {
    subject: "El correo de EduSafe fue cambiado",
    detail: "Se modificó el correo del responsable asociado a EduSafe.",
  },

  pin_cambiado: {
    subject: "El PIN de EduSafe fue cambiado",
    detail: "El PIN de seguridad del responsable fue cambiado.",
  },

  clave_restablecida: {
    subject: "La contraseña de EduSafe fue restablecida",
    detail: "La contraseña fue restablecida mediante el proceso de recuperación.",
  },
};

app.post("/api/notify", async (req, res) => {
  const { email: emailInput, evento, datos } = req.body || {};

  if (!emailValido(emailInput)) {
    return res.status(400).json({
      error: "La dirección de correo no es válida.",
    });
  }

  if (
    typeof evento !== "string" ||
    !Object.hasOwn(EVENTOS, evento)
  ) {
    return res.status(400).json({
      error: "El evento de seguridad no está reconocido.",
    });
  }

  if (!getMailTransport()) {
    return respuestaSmtpNoConfigurado(res);
  }

  const email = normalizarEmail(emailInput);

  if (
    !registrarEnvio(
      accionesPorEmail,
      `notify:${email}`,
      10,
      60 * 60 * 1000
    )
  ) {
    return res.status(429).json({
      error: "Se alcanzó el límite temporal de avisos.",
    });
  }

  const item = EVENTOS[evento];

  const intentos =
    Number.isInteger(datos?.intentos) && datos.intentos >= 0
      ? ` Intentos registrados: ${Math.min(datos.intentos, 999)}.`
      : "";

  try {
    await enviarCorreo({
      to: email,
      subject: item.subject,
      text: `${item.detail}${intentos}

Si no reconocés esta actividad, revisá la seguridad de tu cuenta y del dispositivo.`,

      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#24313b;line-height:1.5">
          <h2 style="color:#176b70">Aviso de seguridad de EduSafe</h2>
          <p>${escapeHtml(item.detail)}</p>
          <p>${escapeHtml(intentos)}</p>
          <p>Si no reconocés esta actividad, revisá la seguridad de tu cuenta y del dispositivo.</p>
        </div>
      `,
    });

    return res.json({ ok: true });

  } catch (err) {
    console.error(
      "No se pudo enviar el aviso:",
      err.code || err.message
    );

    return res.status(502).json({
      error: "No se pudo enviar el aviso por correo.",
    });
  }
});

// ======================================================
// RESUMEN SEMANAL
// ======================================================

function prepararResumen(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const entero = n =>
    Number.isInteger(n) && n >= 0 && n <= 1000000;

  if (
    !entero(data.total) ||
    typeof data.desde !== "string" ||
    typeof data.hasta !== "string"
  ) {
    return null;
  }

  if (
    !Array.isArray(data.porDia) ||
    data.porDia.length > 7 ||
    !Array.isArray(data.porCategoria) ||
    data.porCategoria.length > 30
  ) {
    return null;
  }

  const porDia = [];

  for (const d of data.porDia) {
    if (
      !d ||
      typeof d.etiqueta !== "string" ||
      d.etiqueta.length > 30 ||
      !entero(d.n)
    ) return null;

    porDia.push({
      etiqueta: d.etiqueta,
      n: d.n,
    });
  }

  const porCategoria = [];

  for (const c of data.porCategoria) {
    if (
      !c ||
      typeof c.nombre !== "string" ||
      c.nombre.length > 100 ||
      !entero(c.n)
    ) return null;

    porCategoria.push({
      nombre: c.nombre,
      n: c.n,
    });
  }

  return {
    desde: data.desde.slice(0, 32),
    hasta: data.hasta.slice(0, 32),
    total: data.total,
    porDia,
    porCategoria,
    protegido: data.protegido !== false,
  };
}

app.post("/api/resumen", async (req, res) => {
  const {
    email: emailInput,
    resumen: resumenInput,
  } = req.body || {};

  if (!emailValido(emailInput)) {
    return res.status(400).json({
      error: "La dirección de correo no es válida.",
    });
  }

  const resumen = prepararResumen(resumenInput);

  if (!resumen) {
    return res.status(400).json({
      error: "El formato del resumen no es válido.",
    });
  }

  if (!getMailTransport()) {
    return respuestaSmtpNoConfigurado(res);
  }

  const email = normalizarEmail(emailInput);

  if (
    !registrarEnvio(
      accionesPorEmail,
      `resumen:${email}`,
      5,
      60 * 60 * 1000
    )
  ) {
    return res.status(429).json({
      error: "Se alcanzó el límite temporal de resúmenes.",
    });
  }

  const filasDias = resumen.porDia.map(d => `
    <tr>
      <td style="padding:7px;border-bottom:1px solid #e6eeee">
        ${escapeHtml(d.etiqueta)}
      </td>
      <td style="padding:7px;border-bottom:1px solid #e6eeee;text-align:right">
        ${d.n}
      </td>
    </tr>
  `).join("");

  const filasTemas = resumen.porCategoria.map(c => `
    <li>${escapeHtml(c.nombre)}: <strong>${c.n}</strong></li>
  `).join("");

  const estado = resumen.protegido
    ? "La protección figura activada."
    : "La protección figura desactivada.";

  const text = [
    `Resumen semanal de EduSafe (${resumen.desde} - ${resumen.hasta})`,
    `Bloqueos registrados: ${resumen.total}`,
    estado,
    "",
    "Actividad por día:",
    ...resumen.porDia.map(d => `${d.etiqueta}: ${d.n}`),
    "",
    "Temas:",
    ...resumen.porCategoria.map(c => `${c.nombre}: ${c.n}`),
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#24313b;line-height:1.5">
      <h2 style="color:#176b70">Resumen semanal de EduSafe</h2>
      <p>${escapeHtml(resumen.desde)} al ${escapeHtml(resumen.hasta)}</p>
      <p style="font-size:26px;font-weight:bold">${resumen.total} bloqueos</p>
      <p>${escapeHtml(estado)}</p>
      <h3>Actividad por día</h3>
      <table style="width:100%;border-collapse:collapse">${filasDias}</table>
      <h3>Temas</h3>
      <ul>${filasTemas || "<li>Sin datos esta semana</li>"}</ul>
      <p style="font-size:12px;color:#687780">
        Este resumen contiene cantidades y temas, no direcciones de sitios visitados.
      </p>
    </div>
  `;

  try {
    await enviarCorreo({
      to: email,
      subject: "Tu resumen semanal de EduSafe",
      text,
      html,
    });

    return res.json({ ok: true });

  } catch (err) {
    console.error(
      "No se pudo enviar el resumen:",
      err.code || err.message
    );

    return res.status(502).json({
      error: "No se pudo enviar el resumen por correo.",
    });
  }
});

// ======================================================
// RUTAS ORIGINALES DE EDUSAFE
// ======================================================

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "EduSafe API",
    message: "Servidor funcionando correctamente",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "EduSafe API",
  });
});

app.post("/api/suggest", async (req, res) => {
  const { term } = req.body || {};

  if (
    typeof term !== "string" ||
    term.trim().length === 0
  ) {
    return res.status(400).json({
      error: "El campo 'term' es requerido y debe ser texto.",
    });
  }

  if (term.trim().length > 100) {
    return res.status(400).json({
      error: "El término no puede superar los 100 caracteres.",
    });
  }

  try {
    const genAI = getGeminiClient();

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildPrompt(term.trim()),
    });

    const raw = result.text.trim();

    let suggestions;

    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      suggestions = JSON.parse(clean);

      if (!Array.isArray(suggestions)) {
        throw new Error("No es un array");
      }

    } catch {
      console.error("Respuesta inesperada de Gemini:", raw);

      return res.status(502).json({
        error: "La IA devolvió una respuesta en formato incorrecto.",
      });
    }

    const filtered = suggestions
      .filter(s => typeof s === "string" && s.trim().length > 0)
      .slice(0, 10)
      .map(s => s.trim().toLowerCase());

    return res.json({
      suggestions: filtered,
    });

  } catch (err) {
    console.error("Error llamando a Gemini:", err.message);

    if (err.message?.includes("GEMINI_API_KEY")) {
      return res.status(500).json({
        error: "El servidor no tiene configurada la API key de Gemini.",
      });
    }

    if (err.message?.includes("API_KEY_INVALID")) {
      return res.status(500).json({
        error: "La API key de Gemini es inválida.",
      });
    }

    if (err.status === 429) {
      return res.status(429).json({
        error: "Se superó el límite de solicitudes a Gemini.",
      });
    }

    return res.status(500).json({
      error: "Error interno del servidor.",
    });
  }
});

// ======================================================
// 404
// ======================================================

app.use((_req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada.",
  });
});

// ======================================================
// INICIO DEL SERVIDOR
// ======================================================

app.listen(PORT, () => {
  console.log(`EduSafe API corriendo en puerto ${PORT}`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY no está configurada.");
  }

  if (!getMailTransport()) {
    console.warn("SMTP no está configurado.");
  }
});
