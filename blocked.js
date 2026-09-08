(async function () {
  const params = new URLSearchParams(window.location.search);
  const motivo = params.get("motivo");
  const sitio = params.get("sitio") || "";

  // Diccionario de mensajes contextuales por dominio/palabra
  const mensajesContextuales = {
    // Redes sociales
    'facebook': 'En Facebook, evita compartir información personal como tu dirección o número de teléfono. Ajusta la privacidad de tus publicaciones.',
    'instagram': 'Instagram muestra tu vida pública. Piensa dos veces antes de publicar fotos o ubicaciones que puedan revelar demasiado sobre ti.',
    'tiktok': 'En TikTok, los desafíos y tendencias pueden ser divertidos, pero no todos son seguros. No compartas datos personales ni aceptes retos peligrosos.',
    'twitter': 'En Twitter (X), los mensajes cortos pueden malinterpretarse. No respondas a provocaciones y bloquea a usuarios que te acosen.',
    'youtube': 'YouTube tiene contenido para todas las edades, pero también puede mostrar videos inapropiados. Usa el modo restringido y no hagas clic en enlaces sospechosos en los comentarios.',
    'whatsapp': 'En WhatsApp no aceptes mensajes ni llamadas de desconocidos. No reenvíes cadenas ni información falsa. Bloquea a quienes te acosen.',
    'telegram': 'En Telegram, los canales y grupos pueden contener contenido inapropiado. No compartas tu número con desconocidos.',
    // Chats anónimos
    'omegle': 'Omegle y chats anónimos son peligrosos porque no sabes quién está al otro lado. Nunca des información personal ni aceptes encuentros en persona.',
    'chatroulette': 'Los chats de video aleatorios pueden exponerte a contenido perturbador. Es mejor evitarlos por completo.',
    // Contenido adulto / apuestas
    'porn': 'El contenido para adultos puede distorsionar tu percepción de la sexualidad y las relaciones. Además, muchos sitios contienen malware.',
    'apuesta': 'Las apuestas en línea son ilegales para menores y pueden generar adicción. No arriesgues tu dinero ni tu futuro.',
    'casino': 'Los casinos online están diseñados para que pierdas. Mantente alejado de ellos.',
    'lotería': 'Las loterías y juegos de azar en línea no son para menores. Pueden generar problemas económicos.',
    // Phishing / estafas
    'phishing': 'Este sitio podría ser un intento de phishing. No introduzcas contraseñas ni datos bancarios. Verifica siempre la URL oficial.',
    'descargar': 'Descargar archivos de sitios no oficiales puede infectar tu dispositivo con virus. Usa solo tiendas de aplicaciones confiables.',
    'pirata': 'Los sitios de descargas piratas suelen contener malware y violan derechos de autor. Es mejor evitarlos.',
    // Otros
    'violencia': 'El contenido violento puede afectar tu salud mental. Si ves algo que te incomoda, habla con un adulto.',
    'drogas': 'La promoción de drogas en internet es peligrosa. No sigas a cuentas que las promocionen.',
    'default': 'Protege tu privacidad: no compartas contraseñas ni datos personales en sitios sospechosos. Si algo te parece extraño, habla con un adulto.'
  };

  // Función para obtener el mensaje según el sitio
  function obtenerMensajeContextual(sitio) {
    const dominio = sitio.toLowerCase();
    for (const [clave, mensaje] of Object.entries(mensajesContextuales)) {
      if (dominio.includes(clave)) {
        return mensaje;
      }
    }
    return mensajesContextuales['default'];
  }

  // Intentar cargar mensajes de messages.json (genéricos) y combinarlos
  let mensajeFinal = obtenerMensajeContextual(sitio);

  // Si el mensaje es el default, intentamos mostrar uno aleatorio de los genéricos
  if (mensajeFinal === mensajesContextuales['default']) {
    try {
      const resp = await fetch(chrome.runtime.getURL("messages.json"));
      const base = await resp.json();
      const aleatorio = base[Math.floor(Math.random() * base.length)];
      mensajeFinal = aleatorio;
    } catch (e) {
      // Si falla, mantenemos el default
    }
  }

  document.getElementById("mensajeEducativo").textContent = mensajeFinal;

  // Detalle del motivo
  const capitalizada = sitio ? sitio.charAt(0).toUpperCase() + sitio.slice(1) : "Contenido restringido";
  const detalles = {
    dominio: `Razón: el sitio "${sitio}" está en la lista de restricciones.`,
    palabra_clave: `Razón: la página contenía la palabra clave "${sitio}".`,
  };
  document.getElementById("detalleMotivo").textContent = detalles[motivo] || "Razón: contenido restringido.";
  document.getElementById("categoria").textContent = motivo === "palabra_clave" ? `${capitalizada}:` : "Sitio restringido:";
})();