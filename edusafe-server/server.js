/**
 * EduSafe — Servidor proxy para la API de Google Gemini
 *
 * Expone:
 *   POST /api/suggest  → Sugerencias de sitios/palabras clave
 *   GET  /health       → Estado del servidor (usado por la extensión)
 *
 * Deploy gratuito en Render.com (plan Free, Web Service, Node).
 * La API key de Gemini se configura como variable de entorno GEMINI_API_KEY.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ────────────────────────────────────────────────────────────────────
// Permite peticiones desde extensiones de Chrome (chrome-extension://)
// y desde cualquier origen (ajustá ALLOWED_ORIGINS en producción si querés
// restringirlo a tu extension ID específico).
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["*"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (Postman, curl) y extensiones de Chrome
      if (!origin || ALLOWED_ORIGINS.includes("*")) return callback(null, true);
      if (
        ALLOWED_ORIGINS.includes(origin) ||
        origin.startsWith("chrome-extension://")
      ) {
        return callback(null, true);
      }
      callback(new Error("CORS: origen no permitido"));
    },
    methods: ["GET", "POST", "OPTIONS"],
  })
);

app.use(express.json());

// ── Gemini client ────────────────────────────────────────────────────────────
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurada en el servidor.");
  }

  return new GoogleGenAI({ apiKey });
}
// ── Prompt ────────────────────────────────────────────────────────────────────
function buildPrompt(term) {
  return `
Eres un asistente de control parental para una extensión de Chrome llamada EduSafe.
Tu tarea es sugerir, de forma concisa y sin explicaciones, una lista de entre 5 y 8 
dominios web o palabras clave relacionados con el término que te indico, que podrían 
ser inapropiados para menores de edad y que valdría la pena bloquear.

Término: "${term}"

Responde ÚNICAMENTE con un array JSON válido de strings. Sin markdown, sin explicaciones, 
sin texto adicional. Ejemplo de formato esperado:
["ejemplo1.com", "ejemplo2.com", "palabraclave1", "palabraclave2"]

Si el término no está relacionado con contenido potencialmente inapropiado para menores,
responde con un array vacío: []
`.trim();
}

// ── Endpoints ─────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "EduSafe API",
    message: "Servidor funcionando correctamente"
  });
});

// Health check — la extensión lo usa para mostrar el estado de conexión
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "EduSafe API" });
});

// Sugerencias de sitios/palabras clave vía Gemini
app.post("/api/suggest", async (req, res) => {
  const { term } = req.body;

  if (!term || typeof term !== "string" || term.trim().length === 0) {
    return res.status(400).json({ error: "El campo 'term' es requerido y debe ser texto." });
  }

  if (term.trim().length > 100) {
    return res.status(400).json({ error: "El término no puede superar los 100 caracteres." });
  }

  try {
    const genAI = getGeminiClient();

const result = await genAI.models.generateContent({
  model: "gemini-2.5-flash",
  contents: buildPrompt(term.trim()),
});

const raw = result.text.trim();

    // Intentar parsear el JSON que devuelve Gemini
    let suggestions;
    try {
      // Limpiar posibles fences de markdown que Gemini a veces incluye
      const clean = raw.replace(/```json|```/g, "").trim();
      suggestions = JSON.parse(clean);
      if (!Array.isArray(suggestions)) throw new Error("No es un array");
    } catch {
      console.error("Respuesta inesperada de Gemini:", raw);
      return res.status(502).json({
        error: "La IA devolvió una respuesta en formato incorrecto. Intentá de nuevo.",
      });
    }

    // Filtrar: solo strings no vacíos, máximo 10
    const filtered = suggestions
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .slice(0, 10)
      .map((s) => s.trim().toLowerCase());

    return res.json({ suggestions: filtered });
  } catch (err) {
    console.error("Error llamando a Gemini:", err.message);

    if (err.message?.includes("GEMINI_API_KEY")) {
      return res.status(500).json({ error: "El servidor no tiene configurada la API key de Gemini." });
    }
    if (err.message?.includes("API_KEY_INVALID")) {
      return res.status(500).json({ error: "La API key de Gemini es inválida. Verificá la configuración del servidor." });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: "Se superó el límite de solicitudes a Gemini. Intentá en un momento." });
    }

    return res.status(500).json({ error: "Error interno del servidor. Intentá de nuevo en unos segundos." });
  }
});

// Ruta no encontrada
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// ── Inicio ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`EduSafe API corriendo en puerto ${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠  GEMINI_API_KEY no está configurada. Las sugerencias de IA no funcionarán.");
  }
});
