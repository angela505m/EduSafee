# Documento de Requisitos del Sistema — EduSafe

## 1. Introducción

Este documento especifica los requisitos funcionales y no funcionales de EduSafe,
extensión de navegador para control parental educativo, en base a los objetivos
específicos y al aporte teórico definidos en el artículo de TCC1.

## 2. Alcance

Extensión para navegadores basados en Chromium (Google Chrome, Microsoft Edge),
desarrollada bajo Manifest V3, orientada al bloqueo de contenido con
acompañamiento educativo, sin recolección ni almacenamiento de datos personales
de los usuarios, entregada como paquete descargable para instalación manual en
modo desarrollador (no se publicará en Chrome Web Store durante este TCC).

## 3. Requisitos Funcionales

| ID | Requisito | Objetivo específico relacionado |
|----|-----------|----------------------------------|
| RF01 | El sistema debe permitir a un responsable agregar y eliminar URLs de una lista negra desde un panel de configuración. | Simplificar la configuración parental |
| RF02 | El sistema debe permitir a un responsable agregar y eliminar palabras clave de bloqueo. | Simplificar la configuración parental |
| RF03 | El sistema debe bloquear/redirigir automáticamente las solicitudes que coincidan con la lista negra o las palabras clave configuradas. | Control flexible y personalizable |
| RF04 | Al bloquear una página, el sistema debe mostrar una notificación explicando el motivo del bloqueo. | Fortalecer la autonomía digital mediante transparencia |
| RF05 | El sistema debe mostrar mensajes educativos breves y aleatorios en el popup y tras cada bloqueo. | Capacitar en buenas prácticas digitales |
| RF06 | El sistema debe persistir las configuraciones (listas negras, palabras clave, preferencias) entre sesiones del navegador. | Control flexible y personalizable |
| RF07 | El sistema debe permitir activar/desactivar las notificaciones. | Control flexible y personalizable |
| RF08 | El sistema debe permitir exportar e importar configuraciones. | Control flexible y personalizable |
| RF09 | El sistema debe ofrecer sugerencias de URLs/palabras clave relacionadas mediante la API de Google Gemini, aceptables o descartables por el responsable. | Asistencia inteligente en la configuración |
| RF10 | El popup debe mostrar estadísticas básicas (cantidad de bloqueos del día). | Transparencia |
| RF11 | El sistema debe registrar un historial local de eventos de bloqueo (sin datos personales), visible solo al responsable. | Transparencia / no invasividad |

## 4. Requisitos No Funcionales

| ID | Requisito | Justificación |
|----|-----------|----------------|
| RNF01 | La extensión debe operar íntegramente en el cliente (navegador), sin enviar datos de navegación a servidores propios. | Ley 18.331 (Uruguay) — principio de reserva |
| RNF02 | No se almacenará información personal identificable de adolescentes, padres o responsables. | Ley 18.331 — principio de finalidad |
| RNF03 | Cualquier dato registrado durante pruebas de desarrollo debe anonimizarse mediante funciones hash. | Ley 18.331 — principio de seguridad |
| RNF04 | La extensión debe desarrollarse bajo Manifest V3. | Requisito de plataforma Chrome vigente |
| RNF05 | La interfaz debe ser utilizable sin conocimientos técnicos (heurísticas de Nielsen: coincidencia sistema-mundo real, diseño minimalista). | Objetivo de simplicidad para responsables |
| RNF06 | Las notificaciones deben ser claras, visibles y no invasivas (sin monitoreo oculto). | Hertog et al. (2025) |
| RNF07 | El sistema debe funcionar sin conexión a servidores propios; la única dependencia externa admitida es la API de Gemini para sugerencias (opcional). | Privacidad / Ley 18.331 |
| RNF08 | El código fuente debe entregarse comentado, junto con manual de instalación y uso en español. | Requisito de entrega del TCC |
| RNF09 | Los bloqueos deben aplicarse por coincidencia exacta de dominio (no subcadena parcial) para evitar falsos positivos. | Evitar bloqueos accidentales |

## 5. Requisitos Técnicos / Restricciones de Plataforma

- **RT01**: Manifest V3 no permite bloqueo síncrono vía `chrome.webRequest` (modo "blocking") para extensiones no empresariales. Se debe usar `chrome.declarativeNetRequest` con reglas dinámicas para bloqueo/redirección.
- **RT02**: Para disparar notificaciones ante un bloqueo, se utilizará `chrome.declarativeNetRequest.onRuleMatchedDebug`, disponible cuando la extensión está cargada en modo desarrollador (coherente con la forma de entrega del TCC).
- **RT03**: Persistencia mediante `chrome.storage.local` (sin servidor externo).
- **RT04**: Notificaciones mediante `chrome.notifications`.
- **RT05**: Integración opcional con Google Gemini API mediante clave provista por el propio usuario responsable (no se distribuye clave en el código fuente).

## 6. Casos de Uso Principales

1. **Responsable configura lista negra** → agrega dominio → el sistema valida formato → guarda en `chrome.storage.local`.
2. **Adolescente navega a sitio bloqueado** → la extensión redirige a página educativa → se dispara notificación → se registra evento en historial local.
3. **Adolescente abre el popup** → ve mensaje educativo aleatorio y estadística de bloqueos del día.
4. **Responsable solicita sugerencias inteligentes** → el sistema consulta la API de Gemini con la URL/palabra ingresada → muestra sugerencias → responsable acepta o descarta.

## 7. Matriz de Trazabilidad (Objetivo específico → Requisito → Módulo)

| Objetivo específico | Requisitos | Módulo |
|---|---|---|
| Configuración simple sin conocimientos técnicos | RF01, RF02, RF06, RNF05 | options.html/js |
| Transparencia en bloqueos | RF04, RF11, RNF06 | background.js, blocked.html |
| Capacitación en buenas prácticas | RF05 | messages.json, popup.js |
| Control flexible y personalizable | RF01–RF03, RF06–RF08 | options.js, background.js |
| Mediación parental positiva | RF04, RF05, RF09 | Todo el sistema |
