# EduSafe — Servidor API

Servidor proxy Node.js que conecta la extensión EduSafe con la API de Google Gemini para generar sugerencias inteligentes de sitios y palabras clave a bloquear.

## Tecnologías

- **Node.js 18+** con ES Modules
- **Express** — servidor HTTP
- **@google/generative-ai** — SDK oficial de Gemini
- **CORS** — para permitir peticiones desde la extensión de Chrome

---

## Deploy gratuito en Render.com (recomendado)

### 1. Subir el código a GitHub

```bash
# En la carpeta edusafe-server/
git init
git add .
git commit -m "EduSafe server inicial"
# Crear un repo en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/edusafe-server.git
git push -u origin main
```

### 2. Crear el servicio en Render

1. Ir a [render.com](https://render.com) → **New** → **Web Service**
2. Conectar con tu cuenta de GitHub y seleccionar el repo `edusafe-server`
3. Configurar el servicio:

| Campo | Valor |
|-------|-------|
| **Name** | `edusafe` |
| **Region** | Oregon (US West) o el más cercano |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | `Free` |

4. Antes de hacer clic en **Create Web Service**, ir a la sección **Environment** y agregar:

| Variable | Valor |
|----------|-------|
| `GEMINI_API_KEY` | Tu clave de Google AI Studio |

5. Hacer clic en **Create Web Service** y esperar el deploy (aprox. 2 minutos).

### 3. Obtener la URL del servidor

Una vez deployado, Render te asigna una URL como:
```
https://edusafe.onrender.com
```

> ⚠️ **Importante:** El plan gratuito de Render "duerme" el servidor tras 15 minutos de inactividad. La primera petición después de ese período tarda ~30 segundos en responder (cold start). Esto es normal y no afecta el funcionamiento.

### 4. Actualizar la extensión

En `options.js` de la extensión, verificar que la URL coincida:
```js
const SERVIDOR_URL = "https://edusafe.onrender.com/api/suggest";
```

---

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env y completar GEMINI_API_KEY

# 3. Iniciar el servidor
npm run dev
```

El servidor corre en `http://localhost:3000`.

Para probarlo:
```bash
curl -X POST http://localhost:3000/api/suggest \
  -H "Content-Type: application/json" \
  -d '{"term": "apuestas"}'
```

Respuesta esperada:
```json
{
  "suggestions": ["bet365.com", "pokerstars.com", "betano.com", "codere.es", "apuestas"]
}
```

---

## Endpoints

### `GET /health`
Verifica que el servidor esté activo.

**Respuesta:**
```json
{ "status": "ok", "service": "EduSafe API" }
```

### `POST /api/suggest`
Obtiene sugerencias de Gemini para bloquear.

**Body:**
```json
{ "term": "apuestas" }
```

**Respuesta exitosa (200):**
```json
{ "suggestions": ["bet365.com", "..."] }
```

**Errores posibles:**
- `400` — `term` faltante, vacío o demasiado largo
- `429` — Límite de Gemini superado
- `500` — API key no configurada o error interno
- `502` — Gemini devolvió respuesta en formato inesperado

---

## Obtener la API Key de Gemini (gratis)

1. Ir a [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Hacer clic en **Create API Key**
3. Copiar la clave y pegarla como variable `GEMINI_API_KEY` en Render

El plan gratuito de Gemini incluye 15 requests por minuto y 1.500 por día, más que suficiente para uso familiar.
