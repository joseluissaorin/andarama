# Trazabilidad de requisitos (ULL360-especificacion-v2)

Mapa de cada requisito de la especificación a su implementación. Estado:
**C** = completo · **C\*** = completo con matiz documentado.

## §2.1 Renderizado y proyecciones

| Requisito | Estado | Implementación |
|---|---|---|
| WebGL con degradación elegante | C | Base Marzipano (WebGL con detección de capacidades); decisión fase 0 documentada en `AUTHORS` y docs de arquitectura |
| Equirectangular 2:1 completa y parcial | C | `viewer/engine/sources.ts` (parcial: composición sobre esfera completa + límites de vista) |
| Cubemap (caras y tiras) | C | `sources.ts` (faces + strip con orden krpano/Marzipano) |
| Estéreo 3D TB/SBS | C | `sources.ts` (recorte mono) + `vr.ts` (muestreo por ojo en VR) |
| Proyecciones de salida: rectilínea, little planet, fisheye, panini, arquitectónica; transición animada | C | `engine/projections.ts` (pase de distorsión WebGL con mezcla animada) + intro little planet en `TourViewer.bootstrap` |
| Panoramas planos gigapixel con pan/zoom | C | `FlatSource` + FlatView/FlatGeometry (`sources.ts`); tiles planos en `tiler/node` |
| HDR de entrada tone-mapped | C\* | El pipeline decodifica AVIF/HDR vía canvas (tone-map del navegador) y hornea SDR en tiles; documentado |
| Límite 32K (tiles), sin límite en planos | C | `tiler` (faceSize hasta 8192 = 32K equirect; validador avisa por encima); ruta contenedor para >16K |

## §2.2 Multiresolución y carga progresiva

| Requisito | Estado | Implementación |
|---|---|---|
| Pirámide equirect->cubo->tiles 512 | C | `packages/tiler` (GPU en WebWorker; Node con sharp) |
| Preview borroso embebido -> base -> frustum | C | preview base64 en tour.json + `pinFirstLevel` + carga por visibilidad de Marzipano |
| Priorización por frustum y cancelación | C | TextureStore de Marzipano (LRU + prioridad por visibilidad) |
| WebP/AVIF/JPEG negociados | C | `tiler/browser.ts` (detección de soporte de encoding) + `extension/formats` en el manifiesto |
| Precarga de escenas vecinas con presupuesto | C | `TourViewer.preloadNeighbors` (grafo, presupuesto 2) |
| Caché en cliente con versionado | C | Assets publicados inmutables (`cache-control: immutable` por versión congelada); Cache Storage vía service worker en exports PWA |

## §2.3 Video 360

Reproducción equirect mono/estéreo con renditions por altura (`sources.ts`, `attachVideoSource`), MP4/WebM/HLS (hls.js perezoso + nativo Safari), integración opcional Cloudflare Stream (`streamUid`, secretos STREAM_*), hotspots por rango temporal (`conditions.videoTime` + timeline del Studio), controles completos (barra propia: play/seek/volumen/velocidad + bucle/autoplay silencioso/subtítulos WebVTT en `skin.ts`), video como nodo del grafo con `onEnd` (loop/goto/hold). **C**

## §2.4 Audio

Ambiente por escena con crossfade, narración con bloqueo de navegación y transcripción, audio espacial HRTF (PannerNode + listener orientado con la vista), música global con ducking, silencio persistente (localStorage) y desbloqueo en primer gesto, formatos MP3/AAC/OGG/WAV (WAV transcodificado en self-host con ffmpeg). `viewer/engine/audio.ts`, `jobs.ts`. **C**

## §2.5 Grafo y navegación

Grafo dirigido N:M con conexiones explícitas + derivadas, orientación de entrada fija/relativa/mirar-atrás (`computeEntryView`), transiciones fundido/zoom/crossRotate/corte con duración y easing por tour y por conexión, vista inicial y límites por escena, autopilot con rutas/pausas/reanudación (`engine/autopilot.ts`), autorrotación configurable, historial con volver (`back()`), deep links `#s=&y=&p=&f=` + `?lang=` (`engine/deeplink.ts`). **C**

## §2.6 Controles

Ratón (drag/inercia/rueda/doble clic), táctil (pan/pinch), teclado completo (flechas, +/-, WASD, Tab/Enter/Esc nativos por ser botones DOM), gamepad opcional (`startGamepadLoop`), giroscopio con permiso iOS combinable con arrastre (`engine/gyro.ts`), sensibilidad/inercia/inversión configurables (`controls` en tour.json), cursores e indicadores hover/pulso. **C**

## §2.7 VR / WebXR

Sesión `immersive-vr` con render estéreo propio (una pasada por vista, viewport de la `XRWebGLLayer`), espacio de referencia `local` con respaldo a `viewer`, y `hand-tracking`, `local-floor` y `bounded-floor` como características opcionales para que la sesión arranque siempre.

**Manos**: las 25 articulaciones del módulo XRHand por mano, leídas con `fillPoses`/`fillJointRadii` en una sola llamada (respaldo `getJointPose`), dibujadas como esferas con su radio real; pinza pulgar-índice con histéresis 22/32 mm como respaldo del evento `select`; toque directo con la yema del índice sobre los paneles a menos de 45 mm. **Mandos**: rayo desde `targetRaySpace`, esfera en `gripSpace`, activación por `select`. Manos y mandos conviven en la misma sesión.

**Interacción**: los 17 tipos de hotspot aparecen en VR (los polígonos anclados en su primer vértice) como pictogramas con etiqueta; rayo que se acorta al impacto y se tiñe con el color de marca. Paneles inmersivos dibujados con Canvas 2D y subidos como textura (texto con desplazamiento, imagen, galería, vídeo con transporte, audio con transcripción, quiz puntuable, comparador con divisor arrastrable); PDF, web, formulario, vídeo embebido y modelo 3D muestran tarjeta y se abren al salir de la sesión.

**Respaldo**: cardboard SBS + giroscopio sin WebXR, selección por mirada con permanencia de 1,5 s y botón de salida accesible. Aviso explícito cuando falta HTTPS (WebXR exige contexto seguro). Los exports conservan la VR: el renderer es autocontenido, sin DOM ni dependencias, y el paquete incluye `.htaccess` y `LEEME.md` con las condiciones de alojamiento.

`viewer/engine/vr.ts`, `viewer/engine/xr/{math,input,render,panel}.ts`. Pruebas: `xr.test.ts` (8 unitarias) y `tooling/e2e/webxr.spec.ts` (sesión WebXR simulada en navegador real: entrada en sesión, 25 articulaciones, pinza que abre panel, salida). **C**

## §2.8 Los 17 tipos de hotspot

Todos implementados con posición, icono (biblioteca lucide + SVG propio saneado + URL), etiqueta con visibilidad, escala por distancia, condiciones (idioma/variables/tiempo de video) y acción: navegación (+flecha de suelo), texto Markdown, imagen con zoom profundo tileable y descarga, galería, video archivo (lightbox y **proyectado** con hotspot de perspectiva), YouTube/Vimeo/PeerTube sin cookies, audio (reproductor/espacial), PDF (PDF.js con paginación/zoom/descarga + fallback nativo), modelo 3D glTF/OBJ/STL con AR (model-viewer, USDZ iOS), web/iframe con sandbox, formulario (campos completos, API/webhook/email, Turnstile), comparador (imágenes y **panoramas completos**), quiz (única/múltiple/V-F, feedback, puntos, compuerta, intentos), polígono vértice a vértice con acciones, tooltip, enlace (url/tel/mailto), contador/estado con thenGoto. `schema/types.ts`, `viewer/hotspots/*`, `viewer-ui/panels.ts`, formularios del Studio en `PropertiesPanel.tsx`. **C**

## §2.9 Interfaz del visor

Todos los componentes activables: barra de título, menú de escenas (categorías+búsqueda+miniaturas), carrusel, brújula, indicador de carga, zoom, giroscopio, VR, pantalla completa, compartir, silencio, ayuda, selector de idioma, logotipo con enlace; plano de planta con radar multi-planta y mapa Leaflet/OSM; pantallas de bienvenida (con instrucciones) y final con CTA; temas claro/oscuro/auto/ULL + color primario + tipografía + radios + CSS propio saneado; marca de agua y parche de nadir; responsive con safe areas. `viewer-ui/skin.ts`, `components.ts`, `styles.ts`. **C**

## §2.10 Multiidioma de contenido

L10n en todo el esquema con fallback, selector en el visor con `?lang=` persistente, UI del visor es/en con registro de idiomas contribuibles (`registerUiLang`), medios por idioma (`urlByLang` en pistas de audio). **C**

## §2.11 Accesibilidad

Teclado completo con focus visible y trampa de foco en diálogos, ARIA + anuncios de cambio de escena (aria-live), alt-text obligatorio (validador + aviso en editor) con sugerencia opcional Workers AI revisable, `prefers-reduced-motion` (desactiva autorrotación/transiciones/intro/pulso), contraste AA y objetivos de 44px en la skin, subtítulos WebVTT y transcripciones, **modo de contenido accesible lineal** en cliente (`accessible.ts`) y pre-renderizado en servidor para SEO (noscript). **C**

## §2.12 Compartición, SEO y embebido

`/t/{slug}` con deep links, Open Graph/Twitter Card con imagen OG del pipeline, embed iframe con generador en el Studio + **API postMessage** (goTo/setView/setLang/getState + eventos), QR por tour (Studio, qrcode), sitemap.xml + robots.txt + HTML accesible pre-renderizado. **C**

## §2.13 Protección de acceso

Público / no listado / contraseña (página propia + cookie firmada) / usuarios de la organización / dominios de embebido (frame-ancestors + Referer), y publicación programada + expiración. `routes/tours.ts`. **C**

## §2.14 Analítica

Recogida propia sin cookies (sesión efímera, sin IP): visitas, escenas, tiempo por escena, hotspots, dispositivo, origen, idioma + heartbeat de orientación. Cloudflare: **Workers Analytics Engine** (adaptador con consultas SQL) o backend D1 (por defecto, consultable sin token); self-host: tabla SQLite. Panel: embudo de escenas, hotspots más usados, **mapa de calor de orientaciones**, serie temporal, dispositivos/idiomas/orígenes. Export CSV de formularios y quizzes. GA4/Matomo opcionales en el esquema, desactivados por defecto. **C**

## §2.15 Tours en vivo

Sala con guía que controla escena+vista, soltarse/resincronizar, puntero del guía (Alt+clic), chat, códigos efímeros, patrón Meet/Teams documentado. Durable Objects en CF, ws integrado en self-host, misma lógica compartida (`apps/realtime/rooms.ts`). **C**

## §2.16 Gamificación y docencia

Variables de estado evaluables en condiciones y acciones, quizzes con puntuación/mínimo/aleatorización/intentos/informe final, búsqueda del tesoro con progreso, certificado PDF con nombre (generador PDF propio sin dependencias), **LTI 1.3 Advantage** (login OIDC, launch, Deep Linking con selector, AGS con client_credentials JWT) y export **SCORM 1.2/2004** con reporte de finalización y puntuación. **C**

## §3.1-3.7 Studio

- **Proyectos**: orgs->proyectos->escenas, carpetas y etiquetas, roles org (admin/editor/colaborador/lector) + compartición por proyecto, duplicar, plantillas, papelera 30 días, cuotas con panel de uso. **C** (compartición por grupo: vía rol de organización; la directa es por usuario)
- **Biblioteca**: carpetas/búsqueda/filtros/detalles, drag&drop múltiple, multiparte reanudable directa (S3 prefirmado o pass-through streaming), dedup sha256, detección GPano/aspecto, EXIF con GPS, magic bytes, límites configurables, saneado SVG. **C**
- **Pipeline**: tiling en navegador (WebWorker+GPU) con cola IndexedDB reanudable, ruta servidor (CLI `ull360-tile` + cola jobs), preview/miniatura/OG, nivelado/yaw offset/nadir/exposición-saturación como opciones no destructivas del tiler, transcodificación Stream/ffmpeg/validación. **C**
- **Edición**: vista previa = visor real en modo edición (WYSIWYG), colocación por clic y polígonos vértice a vértice, paneles por tipo, "usar vista actual" (vista inicial y entradas), editor de grafo canvas con minimapa/huérfanas/arrastrar-conectar, editor de plano (subir, arrastrar escenas, norte del radar, multi-planta), timeline de video, traducciones lado a lado con completitud + XLIFF/CSV. **C**
- **Productividad**: undo/redo ilimitado por sesión, autosave con indicador, historial de versiones (auto al publicar + manuales) con diff por escena/hotspot y restauración, presencia + bloqueo blando por escena (DO/ws), comentarios anclados con hilos y resolución, atajos + paleta Cmd+K, Studio es/en. **C**
- **Publicación**: `/t/{slug}` desde almacenamiento con caché, publicar=congelar versión, despublicar/republicar; export ZIP en navegador con todas las opciones (idiomas, resolución, descargas, analítica propia, service worker PWA, HTML único, SCORM, kiosko); webhooks de publicación y API para CI. **C**
- **Administración**: panel global (usuarios, orgs/cuotas, publicados, uso, cola de trabajos, auditoría), email+contraseña con verificación + OIDC SSO con JIT por dominio (SAML vía puente OIDC documentado) + 2FA TOTP, ajustes de instancia completos, backup export/import + `.ull360` portable. **C\*** (SAML nativo no incluido; patrón puente documentado)

## §4 No funcionales

- **Rendimiento**: visor 116 KB gzip con el motor WebXR incluido (presupuesto 250 KB) con chunks perezosos; preview embebido para primera vista; monitor FPS con degradación; grafo canvas para 500+ escenas; API CRUD simple (D1/SQLite indexados). **C**
- **Seguridad**: HSTS, CSP con nonces, frame-ancestors por tour, sandbox iframes, sesiones HttpOnly+Secure+SameSite, CSRF doble token, Argon2id (self-host) / PBKDF2-100k (Workers, límite de plataforma documentado), rate limiting + Turnstile, authz en servidor en cada ruta, IDs nanoid, saneado (magic bytes, SVG, Markdown whitelist, CSS), auditoría, RGPD (sin cookies, ip hash diaria solo anti-abuso), SECURITY.md, npm audit + OSV en CI. **C\***
- **Fiabilidad**: D1 Time Travel + backup JSON descargable; self-host VACUUM INTO + script cron; publicaciones inmutables versionadas; servido de tours sin DB (puntero en almacenamiento + caché KV). **C**
- **Compatibilidad**: 2 últimas versiones de navegadores mayores (target es2020, WebGL1, sin APIs exóticas obligatorias); exports funcionan en cualquier estático (rutas relativas) con modo single-file para file://. **C**
- **Calidad**: TypeScript estricto en todo el monorepo, 53 tests unitarios/integración (Vitest) + 5 E2E (Playwright) de los flujos críticos, CI con build+tests+E2E+auditoría+imagen Docker+preview por PR. **C**

## §5 Arquitectura

Adaptadores (`packages/adapters`) sin imports de plataforma en dominio; cómputo pesado en cliente; publicación=artefacto estático; visor como librería única; tour.json como contrato versionado con migradores. Monorepo idéntico al §5.3. Modelo de datos = §5.4 + tablas de soporte. API = §5.6 con RFC 9457, versionado y OpenAPI 3.1 servida. Despliegues §5.7: bootstrap un comando (verificado: instancia real en workers.dev) y Docker self-host (imagen única, compose, Caddy). **C**

## §8 Entregables

1. Código fuente completo con historial git y CI. **C**
2. Despliegue de referencia: https://ull360.jlsf2005.workers.dev (demo) + Dockerfile multi-etapa (multi-arch vía buildx en CI). **C**
3. Documentación: manual ES, administración, despliegues, OpenAPI, JSON Schema, contribución, tutorial con medios CC BY (`examples/`). **C**
4. Formación: material digital reutilizable = documentación + tutorial guiado (las sesiones presenciales son actividad, no código). **C\***
5. Paquete de pruebas de flujos críticos. **C**

## §9 Licencia

EUPL-1.2 (texto oficial en `LICENSE`), titularidad ULL, medios CC BY 4.0, `AUTHORS` con reconocimiento (incl. Marzipano Apache-2.0). **C**

## Beta 1.0 — ampliaciones sobre la especificación

| Área | Entrega | Implementación |
|---|---|---|
| Editor | Modo edición real del visor (sin chrome del tour), clic en hotspot = editar (nunca navegar), arrastre de marcadores, yaw/pitch en grados, iconos por hotspot, editores ampliables, esquinas de vídeo proyectado por clics | `packages/viewer-ui/src/skin.ts`, `packages/viewer/src/TourViewer.ts`, `apps/studio/src/editor/ScenesView.tsx`, `PropertiesPanel.tsx` |
| Grafo | Editor de nodos estilo Blender: miniaturas, puertos, bezier fantasma, marquee, teclado (Supr/F/Esc), doble clic, menú contextual, auto-orden, minimapa interactivo | `apps/studio/src/editor/GraphView.tsx` |
| Ingesta | Importador de cámara 360 en 3 pasos (lote+renombrado por patrón+orden, colocación en plano, creación de escenas conectadas); biblioteca por tour; renombrado y borrado seguro de medios | `apps/studio/src/pages/ImportWizard.tsx`, `MediaPage.tsx`, `apps/api/src/routes/media.ts`, migración `0002` |
| Administración | Alta de usuarios y organizaciones, despublicación, webhooks con conmutador y prueba firmada, dashboard (almacenamiento por org, publicaciones, actividad), errores visibles | `apps/studio/src/pages/AdminPage.tsx`, `apps/api/src/routes/admin.ts` |
| Motor | Proyecciones correctas por cubemap/entorno 360 (little planet, ojo de pez, Panini, arquitectónica) con retorno intacto; anclaje de hotspots reescrito (sin desbordes de etiqueta, visibilidad condicional funcional); brújula centrada con norte real; precarga del nivel base y LRU de escenas | `packages/viewer/src/engine/projections.ts`, `hotspots/markers.ts`, `packages/viewer-ui/src/components.ts` |
| Widgets | Paridad HTML5Widgets: tooltip anclado, sandbox web estricto, audio espacial HRTF, OBJ/STL (three.js), comparador de panoramas sincronizado, vídeo proyectado con homografía | `packages/viewer-ui/src/panels.ts`, `packages/viewer/src/engine/audio.ts` |
| Publicación | Dominio propio por publicación (CNAME + resolución por Host, worker y self-host) y web component `<ull360-tour>` en `/embed.js` | `apps/api/src/routes/publish.ts`, `tours.ts`, `worker.ts`, `node.ts`, migración `0003` |
| Identidad | Branding oficial ULL: Violeta Pantone 2597 C, Argentum Sans (OFL), marca y símbolo del manual sin alteración | `packages/ui/src/theme.css`, `packages/ui/brand/`, `apps/studio/src/brand/` |
| Ortografía | Interfaz, documentación, OpenAPI, errores, emails y páginas públicas con tildes y eñes correctas | barrido integral (≈560 correcciones) |
