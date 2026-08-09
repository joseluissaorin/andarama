# Trazabilidad de requisitos (ULL360-especificacion-v2)

Mapa de cada requisito de la especificacion a su implementacion. Estado:
**C** = completo · **C\*** = completo con matiz documentado.

## §2.1 Renderizado y proyecciones

| Requisito | Estado | Implementacion |
|---|---|---|
| WebGL con degradacion elegante | C | Base Marzipano (WebGL con deteccion de capacidades); decision fase 0 documentada en `AUTHORS` y docs de arquitectura |
| Equirectangular 2:1 completa y parcial | C | `viewer/engine/sources.ts` (parcial: composicion sobre esfera completa + limites de vista) |
| Cubemap (caras y tiras) | C | `sources.ts` (faces + strip con orden krpano/Marzipano) |
| Estereo 3D TB/SBS | C | `sources.ts` (recorte mono) + `vr.ts` (muestreo por ojo en VR) |
| Proyecciones de salida: rectilinea, little planet, fisheye, panini, arquitectonica; transicion animada | C | `engine/projections.ts` (pase de distorsion WebGL con mezcla animada) + intro little planet en `TourViewer.bootstrap` |
| Panoramas planos gigapixel con pan/zoom | C | `FlatSource` + FlatView/FlatGeometry (`sources.ts`); tiles planos en `tiler/node` |
| HDR de entrada tone-mapped | C\* | El pipeline decodifica AVIF/HDR via canvas (tone-map del navegador) y hornea SDR en tiles; documentado |
| Limite 32K (tiles), sin limite en planos | C | `tiler` (faceSize hasta 8192 = 32K equirect; validador avisa por encima); ruta contenedor para >16K |

## §2.2 Multiresolucion y carga progresiva

| Requisito | Estado | Implementacion |
|---|---|---|
| Piramide equirect->cubo->tiles 512 | C | `packages/tiler` (GPU en WebWorker; Node con sharp) |
| Preview borroso embebido -> base -> frustum | C | preview base64 en tour.json + `pinFirstLevel` + carga por visibilidad de Marzipano |
| Priorizacion por frustum y cancelacion | C | TextureStore de Marzipano (LRU + prioridad por visibilidad) |
| WebP/AVIF/JPEG negociados | C | `tiler/browser.ts` (deteccion de soporte de encoding) + `extension/formats` en el manifiesto |
| Precarga de escenas vecinas con presupuesto | C | `TourViewer.preloadNeighbors` (grafo, presupuesto 2) |
| Cache en cliente con versionado | C | Assets publicados inmutables (`cache-control: immutable` por version congelada); Cache Storage via service worker en exports PWA |

## §2.3 Video 360

Reproduccion equirect mono/estereo con renditions por altura (`sources.ts`, `attachVideoSource`), MP4/WebM/HLS (hls.js perezoso + nativo Safari), integracion opcional Cloudflare Stream (`streamUid`, secretos STREAM_*), hotspots por rango temporal (`conditions.videoTime` + timeline del Studio), controles completos (barra propia: play/seek/volumen/velocidad + bucle/autoplay silencioso/subtitulos WebVTT en `skin.ts`), video como nodo del grafo con `onEnd` (loop/goto/hold). **C**

## §2.4 Audio

Ambiente por escena con crossfade, narracion con bloqueo de navegacion y transcripcion, audio espacial HRTF (PannerNode + listener orientado con la vista), musica global con ducking, silencio persistente (localStorage) y desbloqueo en primer gesto, formatos MP3/AAC/OGG/WAV (WAV transcodificado en self-host con ffmpeg). `viewer/engine/audio.ts`, `jobs.ts`. **C**

## §2.5 Grafo y navegacion

Grafo dirigido N:M con conexiones explicitas + derivadas, orientacion de entrada fija/relativa/mirar-atras (`computeEntryView`), transiciones fundido/zoom/crossRotate/corte con duracion y easing por tour y por conexion, vista inicial y limites por escena, autopilot con rutas/pausas/reanudacion (`engine/autopilot.ts`), autorrotacion configurable, historial con volver (`back()`), deep links `#s=&y=&p=&f=` + `?lang=` (`engine/deeplink.ts`). **C**

## §2.6 Controles

Raton (drag/inercia/rueda/doble clic), tactil (pan/pinch), teclado completo (flechas, +/-, WASD, Tab/Enter/Esc nativos por ser botones DOM), gamepad opcional (`startGamepadLoop`), giroscopio con permiso iOS combinable con arrastre (`engine/gyro.ts`), sensibilidad/inercia/inversion configurables (`controls` en tour.json), cursores e indicadores hover/pulso. **C**

## §2.7 VR / WebXR

Sesion immersive-vr con render estereo propio, seleccion por mirada (temporizador con anillo de progreso) y por mandos (select), cardboard SBS+giroscopio sin WebXR, hotspots agrandados con teletransporte y boton de salida accesible, exports conservan VR (renderer autocontenido en el bundle). `viewer/engine/vr.ts`. **C**

## §2.8 Los 17 tipos de hotspot

Todos implementados con posicion, icono (biblioteca lucide + SVG propio saneado + URL), etiqueta con visibilidad, escala por distancia, condiciones (idioma/variables/tiempo de video) y accion: navegacion (+flecha de suelo), texto Markdown, imagen con zoom profundo tileable y descarga, galeria, video archivo (lightbox y **proyectado** con hotspot de perspectiva), YouTube/Vimeo/PeerTube sin cookies, audio (reproductor/espacial), PDF (PDF.js con paginacion/zoom/descarga + fallback nativo), modelo 3D glTF/OBJ/STL con AR (model-viewer, USDZ iOS), web/iframe con sandbox, formulario (campos completos, API/webhook/email, Turnstile), comparador (imagenes y **panoramas completos**), quiz (unica/multiple/V-F, feedback, puntos, compuerta, intentos), poligono vertice a vertice con acciones, tooltip, enlace (url/tel/mailto), contador/estado con thenGoto. `schema/types.ts`, `viewer/hotspots/*`, `viewer-ui/panels.ts`, formularios del Studio en `PropertiesPanel.tsx`. **C**

## §2.9 Interfaz del visor

Todos los componentes activables: barra de titulo, menu de escenas (categorias+busqueda+miniaturas), carrusel, brujula, indicador de carga, zoom, giroscopio, VR, pantalla completa, compartir, silencio, ayuda, selector de idioma, logotipo con enlace; plano de planta con radar multi-planta y mapa Leaflet/OSM; pantallas de bienvenida (con instrucciones) y final con CTA; temas claro/oscuro/auto/ULL + color primario + tipografia + radios + CSS propio saneado; marca de agua y parche de nadir; responsive con safe areas. `viewer-ui/skin.ts`, `components.ts`, `styles.ts`. **C**

## §2.10 Multiidioma de contenido

L10n en todo el esquema con fallback, selector en el visor con `?lang=` persistente, UI del visor es/en con registro de idiomas contribuibles (`registerUiLang`), medios por idioma (`urlByLang` en pistas de audio). **C**

## §2.11 Accesibilidad

Teclado completo con focus visible y trampa de foco en dialogos, ARIA + anuncios de cambio de escena (aria-live), alt-text obligatorio (validador + aviso en editor) con sugerencia opcional Workers AI revisable, `prefers-reduced-motion` (desactiva autorrotacion/transiciones/intro/pulso), contraste AA y objetivos de 44px en la skin, subtitulos WebVTT y transcripciones, **modo de contenido accesible lineal** en cliente (`accessible.ts`) y pre-renderizado en servidor para SEO (noscript). **C**

## §2.12 Comparticion, SEO y embebido

`/t/{slug}` con deep links, Open Graph/Twitter Card con imagen OG del pipeline, embed iframe con generador en el Studio + **API postMessage** (goTo/setView/setLang/getState + eventos), QR por tour (Studio, qrcode), sitemap.xml + robots.txt + HTML accesible pre-renderizado. **C**

## §2.13 Proteccion de acceso

Publico / no listado / contrasena (pagina propia + cookie firmada) / usuarios de la organizacion / dominios de embebido (frame-ancestors + Referer), y publicacion programada + expiracion. `routes/tours.ts`. **C**

## §2.14 Analitica

Recogida propia sin cookies (sesion efimera, sin IP): visitas, escenas, tiempo por escena, hotspots, dispositivo, origen, idioma + heartbeat de orientacion. Cloudflare: **Workers Analytics Engine** (adaptador con consultas SQL) o backend D1 (por defecto, consultable sin token); self-host: tabla SQLite. Panel: embudo de escenas, hotspots mas usados, **mapa de calor de orientaciones**, serie temporal, dispositivos/idiomas/origenes. Export CSV de formularios y quizzes. GA4/Matomo opcionales en el esquema, desactivados por defecto. **C**

## §2.15 Tours en vivo

Sala con guia que controla escena+vista, soltarse/resincronizar, puntero del guia (Alt+clic), chat, codigos efimeros, patron Meet/Teams documentado. Durable Objects en CF, ws integrado en self-host, misma logica compartida (`apps/realtime/rooms.ts`). **C**

## §2.16 Gamificacion y docencia

Variables de estado evaluables en condiciones y acciones, quizzes con puntuacion/minimo/aleatorizacion/intentos/informe final, busqueda del tesoro con progreso, certificado PDF con nombre (generador PDF propio sin dependencias), **LTI 1.3 Advantage** (login OIDC, launch, Deep Linking con selector, AGS con client_credentials JWT) y export **SCORM 1.2/2004** con reporte de finalizacion y puntuacion. **C**

## §3.1-3.7 Studio

- **Proyectos**: orgs->proyectos->escenas, carpetas y etiquetas, roles org (admin/editor/colaborador/lector) + comparticion por proyecto, duplicar, plantillas, papelera 30 dias, cuotas con panel de uso. **C** (comparticion por grupo: via rol de organizacion; la directa es por usuario)
- **Biblioteca**: carpetas/busqueda/filtros/detalles, drag&drop multiple, multiparte reanudable directa (S3 prefirmado o pass-through streaming), dedup sha256, deteccion GPano/aspecto, EXIF con GPS, magic bytes, limites configurables, saneado SVG. **C**
- **Pipeline**: tiling en navegador (WebWorker+GPU) con cola IndexedDB reanudable, ruta servidor (CLI `ull360-tile` + cola jobs), preview/miniatura/OG, nivelado/yaw offset/nadir/exposicion-saturacion como opciones no destructivas del tiler, transcodificacion Stream/ffmpeg/validacion. **C**
- **Edicion**: vista previa = visor real en modo edicion (WYSIWYG), colocacion por clic y poligonos vertice a vertice, paneles por tipo, "usar vista actual" (vista inicial y entradas), editor de grafo canvas con minimapa/huerfanas/arrastrar-conectar, editor de plano (subir, arrastrar escenas, norte del radar, multi-planta), timeline de video, traducciones lado a lado con completitud + XLIFF/CSV. **C**
- **Productividad**: undo/redo ilimitado por sesion, autosave con indicador, historial de versiones (auto al publicar + manuales) con diff por escena/hotspot y restauracion, presencia + bloqueo blando por escena (DO/ws), comentarios anclados con hilos y resolucion, atajos + paleta Cmd+K, Studio es/en. **C**
- **Publicacion**: `/t/{slug}` desde almacenamiento con cache, publicar=congelar version, despublicar/republicar; export ZIP en navegador con todas las opciones (idiomas, resolucion, descargas, analitica propia, service worker PWA, HTML unico, SCORM, kiosko); webhooks de publicacion y API para CI. **C**
- **Administracion**: panel global (usuarios, orgs/cuotas, publicados, uso, cola de trabajos, auditoria), email+contrasena con verificacion + OIDC SSO con JIT por dominio (SAML via puente OIDC documentado) + 2FA TOTP, ajustes de instancia completos, backup export/import + `.ull360` portable. **C\*** (SAML nativo no incluido; patron puente documentado)

## §4 No funcionales

- **Rendimiento**: visor 99 KB gzip (presupuesto 250 KB) con chunks perezosos; preview embebido para primera vista; monitor FPS con degradacion; grafo canvas para 500+ escenas; API CRUD simple (D1/SQLite indexados). **C**
- **Seguridad**: HSTS, CSP con nonces, frame-ancestors por tour, sandbox iframes, sesiones HttpOnly+Secure+SameSite, CSRF doble token, Argon2id (self-host) / PBKDF2-100k (Workers, limite de plataforma documentado), rate limiting + Turnstile, authz en servidor en cada ruta, IDs nanoid, saneado (magic bytes, SVG, Markdown whitelist, CSS), auditoria, RGPD (sin cookies, ip hash diaria solo anti-abuso), SECURITY.md, npm audit + OSV en CI. **C\***
- **Fiabilidad**: D1 Time Travel + backup JSON descargable; self-host VACUUM INTO + script cron; publicaciones inmutables versionadas; servido de tours sin DB (puntero en almacenamiento + cache KV). **C**
- **Compatibilidad**: 2 ultimas versiones de navegadores mayores (target es2020, WebGL1, sin APIs exoticas obligatorias); exports funcionan en cualquier estatico (rutas relativas) con modo single-file para file://. **C**
- **Calidad**: TypeScript estricto en todo el monorepo, 53 tests unitarios/integracion (Vitest) + 5 E2E (Playwright) de los flujos criticos, CI con build+tests+E2E+auditoria+imagen Docker+preview por PR. **C**

## §5 Arquitectura

Adaptadores (`packages/adapters`) sin imports de plataforma en dominio; computo pesado en cliente; publicacion=artefacto estatico; visor como libreria unica; tour.json como contrato versionado con migradores. Monorepo identico al §5.3. Modelo de datos = §5.4 + tablas de soporte. API = §5.6 con RFC 9457, versionado y OpenAPI 3.1 servida. Despliegues §5.7: bootstrap un comando (verificado: instancia real en workers.dev) y Docker self-host (imagen unica, compose, Caddy). **C**

## §8 Entregables

1. Codigo fuente completo con historial git y CI. **C**
2. Despliegue de referencia: https://ull360.jlsf2005.workers.dev (demo) + Dockerfile multi-etapa (multi-arch via buildx en CI). **C**
3. Documentacion: manual ES, administracion, despliegues, OpenAPI, JSON Schema, contribucion, tutorial con medios CC BY (`examples/`). **C**
4. Formacion: material digital reutilizable = documentacion + tutorial guiado (las sesiones presenciales son actividad, no codigo). **C\***
5. Paquete de pruebas de flujos criticos. **C**

## §9 Licencia

EUPL-1.2 (texto oficial en `LICENSE`), titularidad ULL, medios CC BY 4.0, `AUTHORS` con reconocimiento (incl. Marzipano Apache-2.0). **C**
