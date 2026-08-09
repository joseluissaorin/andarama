# ULL360 — Especificación Funcional y Técnica

**Versión:** 2.0 (borrador)
**Fecha:** 9 de agosto de 2026
**Producto:** ULL360 — Plataforma de Tours Virtuales 360°
**Institución:** Universidad de La Laguna (ULL)
**Naturaleza:** Código abierto, self-hosteable, con despliegue de referencia en Cloudflare

---

## 1. Resumen ejecutivo

### 1.1 Descripción

ULL360 es una plataforma web de código abierto para crear, publicar y distribuir tours virtuales 360° interactivos. Se compone de tres piezas:

1. **ULL360 Studio** — editor visual en el navegador (SPA) para construir tours sin conocimientos técnicos.
2. **ULL360 Viewer** — motor de visualización WebGL embebible y exportable como paquete HTML estático autocontenido.
3. **ULL360 API** — backend ligero (gestión de proyectos, usuarios, medios, procesado, analítica, colaboración en tiempo real).

El diseño persigue dos objetivos de despliegue simultáneos y no negociables:

- **Despliegue "un comando" en Cloudflare**: toda la plataforma (frontend, API, base de datos, almacenamiento, colas, tiempo real, analítica) corre sobre el stack de Cloudflare (Workers, D1, R2, KV, Durable Objects, Queues, Workers Analytics Engine), dentro del free tier para usos pequeños/medios.
- **Self-hosting trivial**: una única imagen Docker (Node.js + SQLite + sistema de ficheros) que replica el comportamiento de Cloudflare mediante una capa de adaptadores. `docker compose up` debe ser suficiente.

### 1.2 Objetivo de paridad funcional

La especificación toma como referencia las plataformas líderes del sector y define ULL360 para alcanzar paridad en las capacidades relevantes para el ámbito académico:

| Capacidad | 3DVista | Pano2VR | krpano | Kuula | Marzipano | **ULL360 (objetivo)** |
|---|---|---|---|---|---|---|
| Panoramas multiresolución (tiles) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ hasta 32K |
| Vídeo 360 (incl. streaming adaptativo) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Hotspots multimedia ricos | ✅ | ✅ | ✅ | Parcial | ❌ (DIY) | ✅ (15+ tipos) |
| Planos de planta con radar | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Mapa geográfico (GPS) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (OSM/Leaflet) |
| Modo VR (WebXR / estéreo) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Tours guiados en vivo (multiusuario) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (Durable Objects) |
| Quiz / gamificación | ✅ | ❌ | Parcial | ❌ | ❌ | ✅ |
| Exportación HTML estático | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Editor web colaborativo | ❌ (desktop) | ❌ (desktop) | ❌ | ✅ | ❌ | ✅ |
| Analítica integrada | ✅ | Parcial | ❌ | ✅ | ❌ | ✅ |
| Multiidioma de contenido | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Integración LMS (LTI/SCORM) | Parcial | ❌ | ❌ | ❌ | ❌ | ✅ (LTI 1.3 + SCORM) |
| Código abierto | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

La integración LTI 1.3/SCORM es un diferenciador deliberado: permite incrustar tours (con seguimiento de progreso y calificación de quizzes) directamente en el Aula Virtual de la ULL (Moodle).

### 1.3 Usuarios objetivo

- PDI y PAS de la ULL; departamentos e institutos de investigación.
- Servicios de comunicación, patrimonio, museos y espacios culturales universitarios.
- Docentes que integran tours en asignaturas (prácticas virtuales de laboratorio, visitas de campo, patrimonio).
- Comunidad open source externa (el proyecto debe ser útil fuera de la ULL sin cambios de código).

---

## 2. Requisitos funcionales — Motor de visualización (Viewer)

### 2.1 Renderizado y proyecciones

**Prioridad: Crítica**

- Render WebGL 2 con fallback WebGL 1; detección de capacidades y degradación elegante (CSS3D/canvas como último recurso).
- Proyecciones de entrada: equirectangular 2:1 (completa y **parcial** —panoramas que no cubren la esfera completa—), cubemap (6 caras, tiras horizontales/verticales, formato krpano/Marzipano), estéreo 3D top-bottom y side-by-side.
- Proyecciones de salida (cámara): rectilínea (estándar), **little planet** (estereográfica), fisheye, panini y arquitectónica; transición animada entre proyecciones (efecto de intro "little planet → normal").
- Panoramas planos (gigapíxel 2D no esféricos) con pan/zoom tipo mapa, para reproducir obras, documentos o fachadas en altísima resolución.
- Soporte HDR de entrada (procesado a tone-mapped en pipeline) y corrección gamma correcta.
- Límite de resolución: 32K × 16K (32768 × 16384) vía sistema de tiles; sin límite práctico en panoramas planos gigapíxel.

### 2.2 Multiresolución y carga progresiva

**Prioridad: Crítica**

- Pipeline de tiles piramidal (estilo Marzipano/krpano): conversión equirectangular → cubo → niveles de zoom → tiles de 512 px.
- Carga progresiva: preview borroso (≤ 64 px por cara, embebido en el JSON como base64 o archivo mínimo) → nivel base → tiles del frustum visible.
- Priorización de descarga por visibilidad (frustum culling) y cancelación de peticiones obsoletas.
- Formatos por tile: WebP (preferente), AVIF (opcional), JPEG (fallback universal); negociación por `Accept` o detección en cliente.
- Precarga configurable de escenas vecinas (grafo de conexiones) con presupuesto de red.
- Caché en cliente (Cache Storage API) con versionado por hash de contenido.

### 2.3 Vídeo 360°

**Prioridad: Alta**

- Reproducción equirectangular mono y estéreo (TB/SBS); hasta 8K donde el dispositivo lo soporte, con selección automática de renditions.
- Fuentes: MP4 progresivo (H.264/H.265), WebM (VP9/AV1) y **HLS adaptativo** (hls.js; nativo en Safari). En despliegue Cloudflare, integración opcional con **Cloudflare Stream** para transcodificación y ABR automáticos.
- Hotspots sincronizados por línea de tiempo (aparecen/desaparecen en rangos de tiempo).
- Controles: play/pausa, seek, volumen, velocidad, bucle, autoplay silenciado (cumpliendo políticas de autoplay de los navegadores), subtítulos WebVTT.
- Escenas de vídeo como nodos del grafo igual que las de imagen (transición al terminar configurable: bucle, saltar a escena X, quedarse en último frame).

### 2.4 Audio

**Prioridad: Alta**

- Audio ambiente por escena (bucle, volumen, fundido cruzado entre escenas).
- Narración por escena (una vez, con opción de bloquear navegación hasta terminar — útil en docencia).
- **Audio espacial/posicional** (Web Audio API + HRTF): fuentes de sonido ancladas a direcciones de la esfera cuyo volumen/paneo depende de hacia dónde mira el usuario.
- Audio global del tour (música de fondo) con ducking automático durante narraciones.
- Botón global de silencio persistente; cumplimiento de políticas de autoplay (desbloqueo en primer gesto).
- Formatos: MP3, AAC/M4A, OGG, WAV (WAV se transcodifica en ingesta).

### 2.5 Grafo de escenas y navegación

**Prioridad: Crítica**

- Estructura de grafo dirigido: escenas ilimitadas, conexiones N:M, bucles, múltiples puntos de entrada, rutas sugeridas opcionales.
- Orientación de entrada por conexión (yaw/pitch/FOV destino), con tres modos: fija, relativa (mantener el rumbo del usuario) y "mirar hacia atrás" (entrada orientada hacia la escena de origen, para continuidad espacial).
- Transiciones entre escenas: fundido, zoom-in hacia el hotspot, crossfade con rotación, corte; duración y easing configurables por tour y por conexión.
- Vista inicial por escena (yaw/pitch/FOV) y límites de vista opcionales (restricción de pitch/yaw/FOV min-max, esencial para panoramas parciales).
- **Autopilot / visita automática**: recorrido autónomo por una ruta definida (rotación, pausa en hotspots, salto de escena), con pausa al interactuar y reanudación tras inactividad.
- Rotación automática configurable (velocidad, retardo de inactividad, dirección).
- Historial de navegación con "volver a la escena anterior".
- **Deep links**: URL refleja escena y orientación (`#s=aulario&y=120&p=-5&f=70`); cargar una URL restaura exactamente esa vista. Base de la compartición y del SEO.

### 2.6 Controles e interacción

**Prioridad: Crítica**

- Ratón (drag/inercia, rueda para zoom, doble clic para zoom), táctil (1 dedo pan, pinch zoom), teclado completo (flechas, +/-, tab por hotspots, Enter para activar, Esc para cerrar), gamepad (opcional).
- Giroscopio en móviles (con petición de permiso iOS) combinable con arrastre táctil.
- Sensibilidad, inercia e inversión de ejes configurables por el autor y por el usuario final.
- Cursor contextual e indicadores de interactividad (hover states, pulso en hotspots).

### 2.7 Modo VR / WebXR

**Prioridad: Alta**

- Sesión inmersiva WebXR (`immersive-vr`) para visores (Quest, Pico, etc.): render estéreo, selección por mirada (gaze + temporizador) y por mandos (ray casting sobre hotspots).
- Modo cardboard (estéreo side-by-side + giroscopio) para móviles sin WebXR.
- UI específica VR: hotspots de navegación agrandados, teletransporte entre escenas, salida accesible.
- Los tours exportados conservan el modo VR sin dependencias de servidor.

### 2.8 Tipos de hotspot (paridad ampliada)

**Prioridad: Crítica**

Todos los hotspots comparten: posición esférica (yaw/pitch), icono/estilo (biblioteca incluida + SVG propio), etiqueta con visibilidad configurable, tamaño con/sin escala por distancia, condiciones de visibilidad (por idioma, por variable de estado, por rango temporal en vídeo), y acción al hacer clic.

| # | Tipo | Descripción |
|---|---|---|
| 1 | **Navegación** | Salto a otra escena con orientación de entrada; variante "flecha de suelo" direccional estilo Street View |
| 2 | **Texto** | Panel con texto enriquecido (títulos, listas, enlaces, tablas); Markdown en el editor |
| 3 | **Imagen** | Lightbox con zoom profundo (imagen tileada si es gigapíxel), pie de foto, descarga opcional |
| 4 | **Galería** | Carrusel de imágenes con títulos/descripciones individuales y miniaturas |
| 5 | **Vídeo archivo** | Vídeo plano (no 360) en lightbox o **incrustado en la escena como pantalla proyectada** sobre un polígono |
| 6 | **YouTube/Vimeo/PeerTube** | Embed con parámetros de reproducción; sin cookies (nocookie) por defecto |
| 7 | **Audio** | Reproductor puntual o fuente de audio espacial anclada |
| 8 | **PDF** | Visor integrado (PDF.js) con paginación, zoom, descarga opcional |
| 9 | **Modelo 3D** | glTF/GLB (preferente), OBJ, STL vía `<model-viewer>`/three.js: órbita, zoom, AR opcional en móviles (Scene Viewer/Quick Look) |
| 10 | **Web/iframe** | Página externa con sandbox y permisos configurables |
| 11 | **Formulario** | Campos texto/email/teléfono/selección/checkbox/textarea; envío a la API, a un webhook o a email; protección anti-spam (Turnstile) |
| 12 | **Comparador** | Dos imágenes con deslizador (antes/después); variante que compara **dos panoramas completos** de la misma escena (p. ej. edificio en 1990 vs hoy) |
| 13 | **Quiz** | Pregunta de opción única/múltiple/verdadero-falso con feedback, puntuación acumulada y compuerta opcional (no avanzar sin acertar) |
| 14 | **Polígono / área** | Región poligonal dibujada sobre la esfera (resaltar una fachada, una máquina, una obra) con relleno/borde y cualquier acción de las anteriores |
| 15 | **Tooltip / etiqueta** | Texto flotante permanente o al pasar el cursor, sin panel |
| 16 | **Enlace externo** | Abre URL en pestaña nueva; variantes tel:/mailto: |
| 17 | **Contador/estado** | Hotspot que modifica variables del tour (puertas que se abren, luz día/noche cambiando de escena) — base de interactividad avanzada |

### 2.9 Interfaz del visor (skin)

**Prioridad: Crítica**

- Componentes activables por tour: barra de título, botón de menú de escenas, carrusel de miniaturas, brújula, indicador de carga, controles de zoom, giroscopio, VR, pantalla completa, compartir, silencio, ayuda de controles, selector de idioma, logotipo con enlace.
- **Menú de escenas** con agrupación por categorías, búsqueda por texto y miniaturas.
- **Plano de planta / mapa**: imagen de plano con marcadores de escena y **radar de orientación** (cono que gira con la vista); soporte multi-planta con selector de nivel; alternativa de mapa geográfico (Leaflet + OpenStreetMap) con coordenadas GPS por escena.
- Pantalla de bienvenida configurable (portada, título, botón de inicio, instrucciones de control) y pantalla final con CTA.
- Temas: claro/oscuro/auto, color primario, tipografía, radio de esquinas; tema institucional ULL incluido; CSS propio opcional por tour.
- Marca de agua / nadir patch (parche en el nadir con logo, ocultando el trípode).
- Diseño responsive completo; safe areas iOS; modo horizontal/vertical.

### 2.10 Multiidioma de contenido

**Prioridad: Alta**

- Todo texto visible (títulos, descripciones, hotspots, menús, formularios, quizzes) es traducible por tour; idiomas ilimitados con idioma por defecto y fallback.
- Selector de idioma en el visor; el idioma se refleja en la URL (`?lang=en`) y persiste.
- Interfaz del visor con cadenas localizadas (es, en incluidas de serie; ficheros JSON de traducción contribuibles).
- Los medios pueden variar por idioma (p. ej. narración en español/inglés).

### 2.11 Accesibilidad (WCAG 2.1 AA)

**Prioridad: Crítica**

- Navegación completa por teclado con orden de foco lógico e indicadores visibles; atajos documentados.
- Roles ARIA y anuncios de cambio de escena para lectores de pantalla; texto alternativo obligatorio por escena y por hotspot (el editor lo exige y puede sugerirlo con Workers AI, siempre revisable).
- `prefers-reduced-motion`: desactiva autorrotación, transiciones animadas y parallax.
- Contraste AA en la UI; tamaños táctiles ≥ 44 px; subtítulos en vídeo y transcripciones de audio adjuntables.
- **Modo de contenido accesible**: vista alternativa lineal (lista de escenas con descripciones, imágenes y contenidos de hotspots en HTML semántico) generada automáticamente — también beneficia al SEO.

### 2.12 Compartición, SEO y embebido

**Prioridad: Alta**

- URLs públicas por tour (`/t/{slug}`) con deep links de escena/vista.
- Metadatos Open Graph/Twitter Card con captura de la vista inicial (generada en el pipeline).
- Embed responsivo por iframe con generador de código en el Studio; API postMessage para controlar el visor embebido (cambiar escena, orientación, escuchar eventos) — necesaria para LTI y para integraciones de terceros.
- Código QR por tour/escena generado en el Studio.
- Sitemap y HTML pre-renderizado del modo accesible para indexación.

### 2.13 Protección de acceso al tour publicado

**Prioridad: Alta**

- Visibilidad: público, no listado (solo con enlace), protegido por contraseña, restringido a usuarios autenticados de la organización, o restringido por dominios de embebido (allowlist de `Referer`/`frame-ancestors`).
- Fecha de expiración/publicación programada opcional.

### 2.14 Analítica

**Prioridad: Media**

- Recogida propia sin cookies (agregada, anónima, compatible RGPD): visitas, escenas vistas, tiempo por escena, interacciones con hotspots, dispositivo, origen. En Cloudflare: **Workers Analytics Engine**; en self-host: tabla SQLite.
- Panel en el Studio: embudo de escenas, hotspots más usados, mapa de calor de orientaciones por escena (a dónde mira la gente).
- Resultados de formularios y quizzes exportables (CSV).
- Integración opcional GA4/Matomo mediante campo de configuración (desactivada por defecto).

### 2.15 Tours guiados en vivo

**Prioridad: Media**

- Sala en tiempo real donde un guía controla la vista (escena + orientación) de N asistentes; los asistentes pueden "soltarse" y volver a sincronizar.
- Puntero del guía visible; chat de texto opcional; sin audio propio (se asume videollamada externa en paralelo, documentando el patrón con Meet/Teams).
- Implementación: WebSockets sobre **Durable Objects** (Cloudflare) / servidor WS integrado (self-host). Códigos de sala efímeros.

### 2.16 Gamificación y docencia

**Prioridad: Media**

- Sistema de variables de estado del tour (visitado/no visitado, puntuación, flags) evaluable en condiciones de visibilidad y acciones.
- Quizzes con puntuación, mínimo para aprobar, aleatorización, intentos e informe final.
- Modo "búsqueda del tesoro": lista de objetivos a encontrar con progreso visible.
- Certificado de finalización opcional (PDF generado con nombre del participante).
- **LTI 1.3** (Advantage: Deep Linking + Assignment and Grade Services) para incrustar tours en Moodle con devolución de calificación del quiz; export **SCORM 1.2/2004** del paquete estático con reporte de finalización/puntuación para LMS sin LTI.

---

## 3. Requisitos funcionales — Editor (ULL360 Studio)

### 3.1 Gestión de proyectos y organización

**Prioridad: Crítica**

- Espacios de trabajo (organizaciones) → proyectos (tours) → escenas; carpetas y etiquetas de proyectos.
- Roles por organización: **admin** (todo), **editor** (crear/editar/publicar sus proyectos y los compartidos), **colaborador** (editar proyectos compartidos, no publicar), **lector** (ver borradores). Compartición de proyecto por usuario o por grupo.
- Duplicar tour, plantillas de tour (guardar un tour como plantilla reutilizable), papelera con retención de 30 días.
- Cuotas configurables por organización (almacenamiento, nº de tours) con panel de uso.

### 3.2 Biblioteca de medios

**Prioridad: Crítica**

- Biblioteca por organización con carpetas, búsqueda, filtros por tipo, vista de detalles (dimensiones, peso, uso en tours).
- Subida por arrastrar y soltar, múltiple, con **subida multiparte reanudable directa a R2/almacenamiento** (URLs prefirmadas; el binario nunca pasa por el Worker de la API).
- Deduplicación por hash de contenido; detección de panoramas por metadatos XMP (GPano) y por relación de aspecto.
- Extracción de metadatos EXIF/XMP (incl. GPS → prellenar posición en mapa).
- Validación estricta de tipo real de archivo (sniffing de magic bytes, no solo extensión), límites de tamaño configurables, saneado de SVG subidos.

### 3.3 Pipeline de procesado de imágenes

**Prioridad: Crítica**

Decisión de arquitectura clave para el objetivo Cloudflare (ver §6.5): **el troceado en tiles se ejecuta por defecto en el navegador del editor** (WebWorkers + OffscreenCanvas/WASM), no en el servidor. El cliente genera la pirámide de tiles y los sube directamente al almacenamiento. Ventajas: cero cómputo de servidor (compatible con límites de CPU de Workers), coste cero, escalado natural. El servidor valida el manifiesto resultante.

- Conversión equirectangular → caras de cubo → pirámide multiresolución → tiles WebP/JPEG (y AVIF opcional).
- Generación de: preview embebible, miniatura de escena, imagen OG de compartición.
- Barra de progreso, procesado en segundo plano mientras se sigue editando, cola local persistente (reanudable si se cierra la pestaña, vía IndexedDB).
- **Ruta alternativa de servidor** para automatización/API e imágenes que excedan la memoria del cliente: worker de procesado en contenedor (imagen Docker con libvips/sharp) consumiendo de la cola — en Cloudflare vía **Cloudflare Containers** o un runner externo opcional; en self-host es un proceso más del mismo contenedor.
- Utilidades de imagen: nivelado de horizonte (ajuste de roll/pitch), rotación del punto cero (yaw offset), parche de nadir/cenit, ajuste básico de exposición/saturación. Ediciones no destructivas (se guardan como transformación).
- Transcodificación de vídeo: en Cloudflare, delegada opcionalmente a Cloudflare Stream; sin Stream, se aceptan MP4/WebM ya codificados con validación y recomendaciones (documentar preajustes de ffmpeg); en self-host, transcodificación local opcional con ffmpeg.

### 3.4 Edición de escenas y hotspots

**Prioridad: Crítica**

- Vista previa 360 en vivo = el propio Viewer en modo edición (WYSIWYG real, sin divergencias).
- Colocación de hotspots haciendo clic/arrastrando sobre el panorama; edición de polígonos vértice a vértice sobre la esfera.
- Panel de propiedades contextual por tipo de hotspot; editor de texto enriquecido (Markdown + toolbar).
- Fijar vista inicial con botón "usar vista actual"; igual para orientaciones de entrada de conexiones.
- **Editor del grafo**: lienzo de nodos (escenas) y aristas (conexiones) con minimapa, detección de escenas huérfanas/inaccesibles y creación de conexiones arrastrando entre nodos.
- Editor de plano de planta: subir plano, calibrar, arrastrar escenas al plano, orientar el radar (fijar el norte del panorama).
- Timeline de hotspots para escenas de vídeo.
- Gestión de idiomas: vista de traducción lado a lado con indicador de completitud por idioma; export/import XLIFF/CSV para traducción externa.

### 3.5 Productividad y colaboración

**Prioridad: Alta**

- Deshacer/rehacer ilimitado por sesión; guardado automático con indicador de estado.
- **Historial de versiones**: instantáneas automáticas en cada publicación + manuales con nombre; ver diferencias a nivel de escena/hotspot y restaurar.
- **Presencia y bloqueo blando**: indicador de quién está editando; bloqueo por escena para evitar pisadas (edición concurrente de escenas distintas del mismo tour permitida). Sincronización vía Durable Object del proyecto. (La coedición CRDT en tiempo real de una misma escena queda fuera del alcance v1; la arquitectura la permite a futuro.)
- Comentarios anclados a escenas/hotspots con hilos y estado resuelto/abierto (revisión editorial).
- Atajos de teclado en todo el Studio; paleta de comandos (Ctrl/Cmd+K).
- Interfaz del Studio en español e inglés.

### 3.6 Publicación y exportación

**Prioridad: Crítica**

- **Publicar en la plataforma**: URL pública `/t/{slug}` servida desde el propio despliegue (R2 + caché de borde). Publicar = congelar una versión; el borrador sigue editable. Despublicar y republicar versiones anteriores.
- **Exportar paquete estático (ZIP)**: carpeta autocontenida (index.html + viewer JS/CSS + tour.json + tiles + medios) sin ninguna dependencia externa ni llamada de red a terceros; funciona por FTP en cualquier hosting, en un `python -m http.server`, o abriendo `index.html` (con la salvedad documentada de restricciones `file://`, para lo cual se incluye un modo single-file).
  - Opciones de export: idiomas incluidos, resolución máxima de tiles, incluir/excluir descargas de PDF, con/sin analítica (endpoint propio configurable), con/sin service worker offline (PWA instalable — útil en museos/kioscos sin red).
  - Modo **HTML único** (todo inline en base64) para tours pequeños.
  - Export **SCORM** (§2.16) y export **kiosko** (autopilot + reinicio por inactividad + bloqueo de salida).
- Generación del ZIP en el navegador (streaming, sin límite de Workers) o en el worker de contenedor para automatización.
- Webhooks de publicación (notificar a sistemas externos) y API para publicar desde CI.

### 3.7 Administración de la instancia

**Prioridad: Alta**

- Panel de administración global: usuarios, organizaciones, cuotas, tours publicados, uso de almacenamiento, cola de trabajos, registros de auditoría (quién publicó/borró qué y cuándo).
- Autenticación: email+contraseña (con verificación), y **OIDC/SAML** para SSO institucional (la ULL podrá conectar su IdP); creación JIT de cuentas por dominio permitido; 2FA TOTP opcional.
- Ajustes de instancia: nombre, logo, idiomas por defecto, política de registro (abierto/por invitación/por dominio), límites de subida, retención de papelera, textos legales (privacidad/cookies).
- Copias de seguridad: export/import completo de instancia (DB + manifiestos; los medios se sincronizan por herramienta de almacenamiento) y export/import de un tour individual como archivo `.ull360` (portabilidad entre instancias).

---

## 4. Requisitos no funcionales

### 4.1 Rendimiento (presupuestos medibles)

- Primera vista útil de un tour publicado (preview visible e interactivo) **< 1,5 s** en 4G rápida / **< 3 s** en 3G buena; Lighthouse Performance ≥ 90 en móvil para la página del visor.
- 60 FPS en dispositivos de gama media (2022+); nunca < 30 FPS; monitor de FPS interno con degradación automática (reducir resolución de render/pixel ratio).
- Peso del runtime del visor **< 250 KB gzip** (sin contar medios); code-splitting de funciones opcionales (VR, PDF.js, hls.js, model-viewer se cargan bajo demanda).
- Studio: interacción fluida con tours de 500+ escenas (virtualización de listas, grafo con render por lienzo).
- API p95 < 200 ms en operaciones CRUD (excluyendo transferencia de medios).

### 4.2 Seguridad

- HTTPS obligatorio; HSTS; CSP estricta (sin `unsafe-inline`; nonces), `frame-ancestors` según configuración de embebido del tour; sandbox estricto en iframes de hotspot web.
- Autenticación con sesiones seguras (cookies HttpOnly+Secure+SameSite), hashing Argon2id, rate limiting en login/registro/formularios (Turnstile en formularios públicos).
- Autorización comprobada en servidor en cada operación (nunca solo en UI); IDs no adivinables (UUIDv7/nanoid).
- Validación/saneado de todo contenido subido y de todo HTML generado (lista blanca en el rich text); protección XSS/CSRF/inyección; dependencias auditadas (CI con `npm audit`/OSV, Renovate).
- Cabeceras de seguridad completas; registros de auditoría; cumplimiento RGPD (mínimos datos, analítica sin cookies por defecto, derecho de supresión, DPA documentado para el despliegue Cloudflare).
- Divulgación responsable: SECURITY.md con canal de contacto.

### 4.3 Fiabilidad y datos

- Copia de seguridad automática: D1 Time Travel (30 días) + export nocturno a R2; en self-host, script de backup de SQLite (litestream opcional) + rsync de medios.
- Publicaciones inmutables (una versión publicada nunca se corrompe por ediciones posteriores).
- Objetivo de disponibilidad del visor público: la ruta de servido de tours publicados no depende de la base de datos (manifiestos congelados en R2/almacenamiento + caché de borde).

### 4.4 Compatibilidad

- Navegadores: 2 últimas versiones de Chrome, Edge, Firefox, Safari (incl. iOS Safari); Android WebView reciente.
- SO: Windows, macOS, Linux, iOS, Android. Sin instalación nativa; PWA opcional.
- El paquete exportado debe funcionar en hostings estáticos arbitrarios (Apache/Nginx/IIS/GitHub Pages/Cloudflare Pages) sin configuración.

### 4.5 Internacionalización, documentación y calidad

- i18n de plataforma con es/en de serie; contribución de idiomas por ficheros JSON.
- Documentación (Docusaurus/Starlight, en `docs/`): manual de usuario (ES), guía de administración, guía de despliegue Cloudflare y self-host, referencia de API (OpenAPI), guía de contribución, tutoriales con tours de ejemplo.
- Calidad: TypeScript estricto en todo el monorepo; tests unitarios (Vitest) y E2E (Playwright) de flujos críticos (crear tour → hotspots → publicar → ver → exportar); tests visuales del visor; CI en GitHub Actions con despliegue de previews por PR.

---

## 5. Arquitectura general

### 5.1 Principios de diseño

1. **Cloudflare-nativo, no Cloudflare-cautivo.** Toda dependencia de plataforma pasa por una interfaz de adaptador (`StorageAdapter`, `DatabaseAdapter`, `QueueAdapter`, `RealtimeAdapter`, `AnalyticsAdapter`). El despliegue de referencia usa los servicios de Cloudflare; el self-host usa implementaciones locales. Ningún módulo de dominio importa APIs de Cloudflare directamente.
2. **El cómputo pesado vive en el cliente.** Tiling de imágenes, generación de ZIPs y previsualización se ejecutan en el navegador. El servidor solo coordina, valida y persiste. Esto hace viable el despliegue 100 % Workers (límites de CPU) y el free tier.
3. **Publicación = artefacto estático.** Publicar un tour materializa un manifiesto inmutable + assets en el almacenamiento. Servir un tour es servir ficheros: barato, cacheable, indestructible.
4. **El visor es una librería.** El mismo paquete `@ull360/viewer` alimenta la vista previa del Studio, los tours publicados y los ZIP exportados. Cero divergencia.
5. **Un esquema, una fuente de verdad.** El formato `tour.json` (JSON Schema versionado en `@ull360/schema`) define el contrato entre editor, visor, exportador y API.

### 5.2 Diagrama (despliegue Cloudflare)

```
                                  ┌──────────────────────────────────────────────┐
                                  │                CLOUDFLARE                    │
  Navegador (autor)               │                                              │
 ┌──────────────────┐   HTTPS     │  ┌─ Worker "app" (Hono) ──────────────────┐  │
 │ ULL360 Studio    │────────────▶│  │  · Assets estáticos (Studio + Viewer)  │  │
 │  · Editor SPA    │             │  │  · API REST /api/v1/*  (Hono + Zod)    │  │
 │  · Tiler WASM    │   subida    │  │  · Auth (better-auth / OIDC)           │  │
 │  · Exportador ZIP│──presigned─▶│  │  · Servido de tours /t/{slug}/*        │  │
 └──────────────────┘   multipart │  └───┬─────────┬──────────┬───────────┬───┘  │
                                  │      │         │          │           │      │
  Navegador (visitante)           │   ┌──▼──┐   ┌──▼───┐  ┌───▼────┐  ┌───▼───┐  │
 ┌──────────────────┐             │   │ D1  │   │  R2  │  │   KV   │  │Queues │  │
 │ ULL360 Viewer    │────────────▶│   │ SQL │   │media/│  │ caché  │  │trabajo│  │
 │ /t/{slug}        │  tiles/CDN  │   └─────┘   │tiles/│  │sesión  │  └───┬───┘  │
 └──────────────────┘             │             │ pub/ │  └────────┘      │      │
                                  │             └──────┘                  ▼      │
  Sala en vivo / presencia        │   ┌────────────────────┐   ┌───────────────┐ │
 ─────────WebSocket──────────────▶│   │  Durable Objects   │   │  Contenedor   │ │
                                  │   │ (LiveTour, Project)│   │ de procesado  │ │
                                  │   └────────────────────┘   │ (opcional:    │ │
                                  │   ┌────────────────────┐   │ vips/ffmpeg)  │ │
                                  │   │ Analytics Engine   │   └───────────────┘ │
                                  │   └────────────────────┘                     │
                                  └──────────────────────────────────────────────┘
```

En **self-host**, el mismo código corre como un proceso Node.js (adaptador Hono para Node) en un contenedor Docker: D1→SQLite (fichero), R2→sistema de ficheros o S3 compatible (MinIO), KV→SQLite/memoria, Queues→cola en proceso (persistida en SQLite), Durable Objects→WebSocket server integrado, Analytics Engine→tabla SQLite. Un proceso, un volumen, un puerto.

### 5.3 Monorepo

```
ull360/
├─ apps/
│  ├─ studio/            # Editor SPA (React 18 + Vite + TanStack Query/Router + Zustand)
│  ├─ api/               # Worker Hono: API + auth + servido de tours + assets
│  ├─ realtime/          # Durable Objects (LiveTourRoom, ProjectPresence)
│  └─ docs/              # Documentación (Astro Starlight)
├─ packages/
│  ├─ schema/            # tour.json: tipos TS + JSON Schema + migradores de versión
│  ├─ viewer/            # Motor 360 (TS + WebGL, sin framework; base Marzipano fork/propia)
│  ├─ viewer-ui/         # Skin del visor (Web Components, framework-agnostic)
│  ├─ tiler/             # Tiling en navegador (WebWorkers + WASM) y en Node (sharp/libvips)
│  ├─ exporter/          # Generador de paquetes estáticos/SCORM (browser + Node)
│  ├─ adapters/          # Interfaces + impl. cloudflare/ y node/ (storage, db, queue, rt, analytics)
│  ├─ db/                # Esquema Drizzle ORM + migraciones (D1 y SQLite comparten dialecto)
│  └─ ui/                # Design system del Studio (Radix + Tailwind, tema ULL)
├─ deploy/
│  ├─ cloudflare/        # wrangler.jsonc, script bootstrap, Terraform opcional
│  └─ docker/            # Dockerfile único, docker-compose.yml, Caddyfile (TLS automático)
└─ tooling/              # eslint, tsconfig, playwright, changesets
```

Justificación de elecciones: **Hono** funciona idéntico en Workers y Node (clave para el doble objetivo); **Drizzle** soporta D1 y SQLite con el mismo esquema; **Marzipano** (Apache-2.0) aporta el sistema multires probado — se integra como base del render con capa propia para vídeo, WebXR, polígonos y proyecciones adicionales (o reimplementación equivalente si el fork no compensa; decisión en fase 0 con prototipo).

### 5.4 Modelo de datos (D1/SQLite, esquema resumido)

```sql
users(id, email, name, password_hash?, idp_subject?, role_global, totp?, created_at, ...)
orgs(id, name, slug, quota_bytes, settings_json)
org_members(org_id, user_id, role)                -- admin|editor|collaborator|reader
projects(id, org_id, title, slug, folder?, status, settings_json, created_by, updated_at)
project_members(project_id, user_id, role)
scenes(id, project_id, sort, title, media_id, type, initial_view_json, limits_json, meta_json)
hotspots(id, scene_id, type, position_json, style_json, content_json, conditions_json)
connections(id, from_scene, to_scene, entry_mode, entry_view_json, transition_json)
media(id, org_id, kind, sha256, bytes, width?, height?, duration?, exif_json, r2_key, status)
media_derivatives(media_id, kind, r2_prefix, manifest_json)   -- tiles, preview, thumb, og
versions(id, project_id, number, tour_json_key, created_by, note, created_at)
publications(project_id, version_id, slug, visibility, password_hash?, domains_json,
             publish_at?, expire_at?, lti_json?)
translations(project_id, lang, entity, entity_id, field, value)
comments(id, project_id, scene_id?, hotspot_id?, author, body, resolved, created_at)
form_submissions(id, project_id, hotspot_id, data_json, created_at, ip_hash)
quiz_results(id, project_id, session_id, score, detail_json, lti_launch?, created_at)
jobs(id, org_id, kind, payload_json, status, error?, created_at, updated_at)
audit_log(id, org_id, user_id, action, entity, entity_id, detail_json, at)
api_tokens(id, user_id, name, hash, scopes_json, last_used_at)
```

El **borrador** del tour se edita como filas normalizadas (scenes/hotspots/connections) para permitir bloqueos por escena, comentarios y traducción granular; **publicar** compila esas filas a un `tour.json` inmutable almacenado en R2 (`pub/{slug}/{version}/tour.json`). El visor público nunca consulta la base de datos.

### 5.5 Pipeline de medios (detalle)

1. Studio pide a la API una subida (`POST /media`): la API valida tipo/cuota y devuelve URLs multiparte prefirmadas de R2.
2. El navegador sube el original por multipart (reanudable) y confirma; la API verifica hash y tamaño.
3. Para panoramas, el **tiler del navegador** (WebWorker + WASM, decodificación por franjas para no agotar memoria) genera caras de cubo, pirámide, tiles WebP/JPEG, preview y miniatura, y los sube por lotes con URLs prefirmadas a `tiles/{media}/{nivel}/{cara}/{y}/{x}.webp`; al terminar publica el manifiesto de derivados y la API lo valida (recuento y muestreo de tiles).
4. Imágenes que superen la capacidad del cliente, o subidas hechas por API sin navegador, encolan un trabajo (`jobs` + Queue) que consume el **contenedor de procesado** (misma lógica del paquete `tiler` en Node con libvips). En Cloudflare se despliega como Cloudflare Container asociado al Worker (opcional); en self-host es un hilo del propio proceso.
5. Vídeo: con Cloudflare Stream configurado, la API crea el vídeo por Direct Upload y guarda el UID (reproducción HLS); sin Stream, se acepta MP4/H.264 apto para reproducción progresiva (validación con recomendaciones).

### 5.6 API REST (resumen; OpenAPI 3.1 completa como entregable)

```
POST   /api/v1/auth/{login,logout,register,oidc/...}
GET    /api/v1/me
CRUD   /api/v1/orgs · /orgs/{id}/members · /orgs/{id}/usage
CRUD   /api/v1/projects · /projects/{id}/{scenes,hotspots,connections,comments}
GET/PUT /api/v1/projects/{id}/translations/{lang}
POST   /api/v1/media  (inicia multipart)  · POST /media/{id}/complete · CRUD /media
POST   /api/v1/projects/{id}/compile      (borrador → tour.json de previsualización)
POST   /api/v1/projects/{id}/publish      · GET /projects/{id}/versions · POST /versions/{n}/restore
POST   /api/v1/projects/{id}/export       (parámetros de export; el ZIP se arma en cliente
                                           o se encola en contenedor y se entrega desde R2)
GET    /api/v1/projects/{id}/analytics    · GET /projects/{id}/submissions.csv
POST   /api/v1/lti/{login,launch,deeplink,grade}
GET    /t/{slug}[/...]                    (visor publicado, sirve desde R2 con caché)
POST   /ingest/e                          (eventos de analítica, sin cookies)
WS     /rt/project/{id} · /rt/live/{room} (Durable Objects)
```

Autenticación de API por sesión (Studio) o token personal con scopes (automatización/CI). Errores RFC 9457 (problem+json). Versionado de API por prefijo.

### 5.7 Despliegue

**Cloudflare (referencia):**
```bash
git clone https://github.com/ull/ull360 && cd ull360
pnpm install
pnpm deploy:cloudflare   # script bootstrap interactivo
```
El script crea (vía API de Cloudflare/wrangler): base D1 + migraciones, bucket R2, namespace KV, cola, dataset de Analytics Engine, secretos (se solicitan), y despliega el Worker con assets. Todo queda descrito en `wrangler.jsonc` (infra como código); actualizar = `pnpm deploy:cloudflare` de nuevo. Guía con capturas + vídeo. Objetivo: **de cero a instancia funcionando en menos de 10 minutos** con cuenta gratuita de Cloudflare.

**Self-host (Docker):**
```bash
curl -O https://.../docker-compose.yml && docker compose up -d
```
Una imagen (`ghcr.io/ull/ull360`), un volumen (`/data` con SQLite + medios), variables de entorno documentadas (URL pública, SMTP opcional, OIDC opcional, S3 opcional). Caddy embebido u opcional para TLS automático. Mismo binario sirve Studio, API, visor y realtime. Requisitos mínimos: 1 vCPU / 1 GB RAM. Actualización = cambiar tag y reiniciar (migraciones automáticas con backup previo).

**Matriz de adaptadores:**

| Capacidad | Cloudflare | Self-host |
|---|---|---|
| HTTP/estáticos | Worker + Assets | Node (Hono) + Caddy |
| Base de datos | D1 | SQLite (better-sqlite3) |
| Medios/tiles | R2 (+ caché CDN) | FS local o S3/MinIO |
| Sesiones/caché | KV | SQLite/memoria |
| Colas | Queues | cola en proceso persistida |
| Tiempo real | Durable Objects | ws integrado |
| Analítica | Analytics Engine | tabla SQLite |
| Procesado pesado | navegador + Container opcional | navegador + proceso local |
| Antibots formularios | Turnstile | Turnstile o desactivado |

---

## 6. Formato `tour.json` (extracto ilustrativo)

```jsonc
{
  "$schema": "https://ull360.dev/schema/tour-1.json",
  "version": 1,
  "meta": { "title": {"es": "Campus de Guajara", "en": "Guajara Campus"},
            "defaultLang": "es", "langs": ["es", "en"], "theme": "ull" },
  "start": { "scene": "entrada", "view": {"yaw": 0.4, "pitch": 0, "fov": 1.2},
             "intro": "littlePlanet" },
  "scenes": [{
    "id": "entrada",
    "type": "image",
    "source": { "kind": "multires", "levels": 5, "tileSize": 512,
                "base": "tiles/m_8f2a/", "preview": "tiles/m_8f2a/preview.jpg" },
    "initialView": {"yaw": 0.4, "pitch": 0, "fov": 1.2},
    "audio": {"ambient": "media/patio.mp3", "volume": 0.5},
    "map": {"floorplan": "planta0", "x": 0.31, "y": 0.62, "north": 1.57},
    "hotspots": [{
      "id": "h1", "type": "navigation", "yaw": 1.1, "pitch": -0.1,
      "target": "pasillo", "entry": {"mode": "fixed", "yaw": 0, "pitch": 0, "fov": 1.2},
      "label": {"es": "Ir al pasillo", "en": "Go to hallway"}
    }]
  }],
  "ui": { "sceneMenu": true, "thumbnails": true, "compass": true, "vr": true,
          "share": true, "watermark": {"image": "media/logo-ull.svg", "link": "https://ull.es"} }
}
```

El esquema es versionado; `@ull360/schema` incluye migradores automáticos entre versiones para que tours antiguos siempre abran.

---

## 7. Plan de fases

| Fase | Alcance | Duración orientativa |
|---|---|---|
| **0. Fundaciones** | Monorepo, adaptadores, prototipo de render multires (decisión Marzipano fork vs propio), tiler en navegador, esquema tour.json v1, CI/CD | 6 semanas |
| **1. MVP** | Studio (proyectos, medios, escenas, 8 hotspots básicos, grafo, vista inicial), auth email+OIDC, publicar en plataforma, export ZIP, visor completo imagen, deploy CF + Docker | 12 semanas |
| **2. Paridad núcleo** | Vídeo 360, audio (ambiente/narración/espacial), plano de planta+radar, mapa OSM, VR/WebXR, multiidioma, temas/skin, analítica, protección de acceso, deep links/OG, hotspots restantes | 12 semanas |
| **3. Diferenciación** | Quiz/gamificación, LTI 1.3 + SCORM, tours en vivo, comentarios/versiones/presencia, modo accesible, PWA/kiosko, panel admin completo | 10 semanas |
| **4. Endurecimiento** | Auditoría de seguridad, WCAG AA formal, rendimiento, documentación completa, formación, tours piloto ULL | 6 semanas |

Cada fase termina con una versión desplegable y demo pública. Soporte y mantenimiento: 2 años (correcciones, seguridad, compatibilidad de navegadores), gestionado en el repositorio público (issues + releases).

---

## 8. Entregables

1. **Código fuente completo** en repositorio público (monorepo descrito en §5.3) con historial, CI/CD y releases firmadas.
2. **Despliegues de referencia**: instancia demo pública, plantilla "Deploy to Cloudflare", imagen Docker multi-arch publicada.
3. **Documentación**: manual de usuario (ES), guía de administración, guías de despliegue (Cloudflare y self-host), referencia OpenAPI, JSON Schema del formato de tour, guía de contribución, tutoriales con 3 tours de ejemplo (medios incluidos con licencia libre).
4. **Formación**: sesión de administradores (4 h), sesión de usuarios (4 h), vídeos y material digital reutilizable.
5. **Paquete de pruebas**: suites unitarias/E2E/visuales con cobertura de flujos críticos ≥ 80 %.

---

## 9. Licencia y propiedad intelectual

- Titularidad del código: Universidad de La Laguna.
- Licencia recomendada: **EUPL-1.2** (licencia de la UE, copyleft compatible con AGPL, con valor jurídico en español) o **AGPL-3.0** si se prioriza el ecosistema global; alternativa permisiva **Apache-2.0** si la ULL prefiere maximizar adopción sobre reciprocidad. Decisión a formalizar antes de la fase 1; todas las dependencias deberán ser compatibles (auditoría de licencias en CI).
- Los medios de ejemplo se publican bajo CC BY 4.0. Reconocimiento de autoría de los desarrolladores en `AUTHORS` y en la UI ("Acerca de").
