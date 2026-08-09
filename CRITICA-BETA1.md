# Crítica honesta del estado actual — hacia la beta 1.0

Auditoría realizada sobre el código y sobre la instancia desplegada (pruebas reales en navegador), el 9 de agosto de 2026. Este documento no maquilla nada: recoge cada debilidad encontrada, su causa raíz con fichero y línea, y la decisión de diseño para corregirla.

## Resumen ejecutivo

La plataforma es funcionalmente amplia (17 tipos de hotspot, multirresolución, LTI, SCORM, export estático, tiempo real) pero el **último 20 %** está sin hacer: hay cuatro bugs de motor que rompen la experiencia (proyecciones, anclaje de hotspots, preview de tiles corrupto, brújula), el editor tiene fallos de sincronización que corrompen datos, la ingesta de medios es un almacén plano sin flujo de trabajo, el grafo es un juguete, la administración es una tabla sin acciones, la mitad de la prosa está escrita sin tildes ni eñes, y el branding no es el oficial de la ULL. Todo lo anterior tiene arreglo conocido y acotado; se detalla a continuación.

---

## 1. Motor del visor: cuatro bugs de raíz

### 1.1 Las proyecciones no funcionan y dejan la vista rota (verificado en producción)

Little planet renderiza un cubo borroso y deformado; al volver a «Normal» la vista queda inutilizable. Causas exactas:

- **Diseño irreparable**: el pase de proyección (`packages/viewer/src/engine/projections.ts`) hace *warp* del fotograma rectilíneo ya renderizado, con un FOV de origen **hardcodeado a 2.4 rad** (`:191`). Un little planet necesita 360°×180° de datos; con 137° la mayor parte del encuadre es relleno oscuro. No puede funcionar, con ninguna escena.
- **Textura volteada**: falta `UNPACK_FLIP_Y_WEBGL` (`projections.ts:119-149`) — la imagen sale del revés en cuanto `uMix > 0`.
- **El FOV nunca se restaura**: `TourViewer.setProjection` (`TourViewer.ts:894-901`) fija `fov = 2.4` al activar y **no guarda el valor previo**; al volver a rectilínea la cámara queda clavada en el gran angular máximo. Eso es la «vista rota».
- **Se apaga solo**: la subida de textura completa en cada frame hunde los FPS y el monitor de rendimiento (`TourViewer.ts:989-992`) desactiva la proyección a los ~4 s… dejando el FOV roto.
- **Canvas sin límite de tamaño**: en pantallas @2x el canvas fuente supera `MAX_TEXTURE_SIZE` en GPUs integradas y `texImage2D` falla en silencio (pantalla negra).
- Los hotspots quedan invisibles pero clicables debajo del warp.

**Decisión**: reescribir el pase para muestrear un **cubemap real** construido con las 6 tiles del nivel base/medio de la pirámide (imágenes estáticas ya publicadas). Con el cubo completo, little planet (estereográfica), ojo de pez, Panini y arquitectónica son matemáticamente correctas a 360°; el arrastre sigue vivo leyendo yaw/pitch de la vista en cada frame; el FOV previo se guarda y restaura; el pase se apaga con fundido, no de golpe.

### 1.2 El anclaje de TODOS los hotspots está roto (causa del desborde de etiquetas)

Marzipano reescribe **en cada frame** `display:block` y `transform:translate(x,y)` sobre el elemento raíz del hotspot (`marzipano/src/Hotspot.js:202-210`, `util/positionAbsolutely.js`). Nuestro CSS (`styles.ts:70-71`) declara `display:flex` y `translate(-50%,-50%)` sobre ese mismo elemento: **ambos están muertos**. Consecuencias:

- El hotspot se ancla por la **esquina superior izquierda**, no por su centro: todo está desplazado abajo-derecha, y el desplazamiento **crece con la longitud de la etiqueta** (hasta ~138 px). Esto es lo que se percibe como «el nombre se sale del botón»: el primitivo está mal, como se sospechaba.
- La etiqueta en `hover` es invisible pero ocupa layout: hasta los hotspots «sin etiqueta» están mal anclados.
- **La visibilidad condicional no funciona**: `markers.ts:219-237` pone `display:none` y Marzipano lo repone a `block` en el siguiente frame. Todo el sistema de variables/estado está anulado.
- `updateScale` escribe `transform` inline y **mata el hover y las flechas de suelo** (`markers.ts:209-216` vs `styles.ts:76,90`).

**Decisión**: nuevo primitivo. El elemento raíz queda para Marzipano (posicionamiento); dentro, un `div` propio centrado (`translate(-50%,-50%)`, flex columna) con el chip y una **etiqueta posicionada absolutamente bajo el chip** (centrada con `left:50%`), `max-width: min(260px, 42vw)`, hasta dos líneas con elipsis: la anchura del texto ya no puede mover el ancla ni desbordar. Escala por variable CSS (`--u3-hs-scale`) que compone con hover y flechas de suelo. Visibilidad condicional sobre el `div` interno, que Marzipano no toca.

### 1.3 El nivel base de todas las escenas multirres está corrupto (los «tiles visibles»)

`sources.ts:110-112` pasa el preview a Marzipano como `cubeMapPreviewUrl`, que **exige una tira vertical de 6 caras de cubo** en orden `bdflru`. Nuestro tiler genera un **equirectangular 512×256**. Marzipano lo trocea en 6 bandas y las pega como caras del cubo: el nivel base de cada escena es un collage de tiras de cielo y suelo. Además `pinFirstLevel:true` lo fija en memoria como fallback permanente: cada pan rápido o zoom lo saca a pantalla. Y el nivel real más pequeño de la pirámide **nunca se descarga** (ficheros muertos en R2).

Agravantes: la escena se muestra sin esperar al nivel base (`switchScene` arranca el fade al instante), el spinner se apaga con el fade (no con la imagen), y el preload de vecinas compite por las conexiones justo durante la carga de la escena actual.

**Decisión**: eliminar `cubeMapPreviewUrl` (el nivel base real de 512 px son 6 peticiones de ~20 KB); **precargar el nivel base antes del cambio de escena** y mantener la escena anterior visible hasta entonces (el fundido ocurre ya con imagen correcta debajo); spinner ligado a la disponibilidad real; prefetch de vecinas en `requestIdleCallback`; LRU de escenas cargadas (las 200 escenas de un tour grande no pueden vivir pinneadas en memoria). El campo `preview` queda solo para el entorno VR y el poster.

### 1.4 La brújula baila en vez de girar

- Usa el icono `navigation` de lucide (flecha diagonal asimétrica, centroide en (13.7, 10.3) frente al pivote (12,12)): a 22 px, **orbita con radio ~2 px** en vez de girar sobre sí misma (`components.ts:113-122`).
- Sin `transform-origin`/`transform-box` declarados (comportamiento inconsistente entre navegadores).
- El ángulo no se desenrolla: al cruzar ±180° la transición CSS anima **el camino largo** (vuelta entera hacia atrás).
- Ignora el norte real de la escena (`scene.north`) y usa la convención de signo **opuesta** al radar del plano.

**Decisión**: aguja SVG propia perfectamente centrada (rombo norte/sur) dentro de un aro fijo con la «N»; rotación del grupo con `transform-box:view-box`, ángulo acumulado (unwrap), norte real, misma convención que el radar, y clic para reorientar al norte.

---

## 2. Editor: fallos que corrompen datos y una UX que estorba

### 2.1 Lo verificado en producción

- **Clic en un hotspot de navegación en la vista previa NAVEGA** (verificado): el lienzo pasa a otra escena pero el raíl y el panel siguen editando la anterior. Tres fuentes de verdad desincronizadas. Colocar un hotspot después **lo escribe en la escena equivocada** con coordenadas de otra escena: corrupción silenciosa (`ScenesView.tsx:245-295` + `TourViewer.ts:592-594`).
- **Fuga de listeners**: cada autoguardado remonta el visor y añade otro listener de colocación sin quitar el anterior (`ScenesView.tsx:274,302,348-350`). Tras N guardados, un clic crea N+1 hotspots duplicados.
- **Cada tecla destruye el panorama**: el autosave (900 ms) dispara recompilación + desmontaje + remontaje del visor: se pierde el encuadre, el zoom y cualquier panel abierto.
- **Botones pisados** (verificado en captura): los cuatro chips flotantes del editor (z-40) caen exactamente sobre los docks del visor embebido (z-17…32) porque comparten contexto de apilado: «Usar vista actual» tapa la bandeja de miniaturas y el dock derecho; «Incidencias» tapa el dock izquierdo y el minimapa; el chip de compilación tapa el logo; el de colocación choca con la píldora del título.
- **`editMode` es cosmético**: apaga 3 cosas y deja topbar, menú de escenas, miniaturas, compartir, VR, pantalla completa, brújula, atajos y `postMessage`. El editor embebe un tour publicado completo que compite con el propio editor.
- **Los hotspots no se pueden mover**: ni arrastre ni campos yaw/pitch. Un hotspot mal colocado se borra y se rehace perdiendo su contenido.
- **Cambiar de escena cuesta**: la lista solo existe en la pestaña «Escenas», sin buscador, sin atajos anterior/siguiente, sin drag para reordenar (chevrons solo en hover), sin duplicar; la pestaña y la escena activa no están en la URL.
- Editores diminutos: todo cabe en 288 px útiles; el markdown de un panel de museo se redacta en un `Textarea rows={4}`; las condiciones se escriben **en JSON a mano**; los límites de vista muestran `pitchMin`/`yawMax` crudos; 17 tipos de hotspot en una pared de botones idénticos.
- Bugs concretos: el editor de acción de polígono escribe `"[object Object]"` y destruye la acción (`PropertiesPanel.tsx:589`); `StateEditor` no tiene campo `value` (con `op:"set"` es inservible); `parseInt` sin guarda mete `null` en el JSON; el selector de modelo 3D omite `gltf`; el modo «pantalla proyectada» de vídeo no tiene editor de esquinas (inutilizable).

### 2.2 Decisiones

1. **Modo edición real del visor**: sin chrome (ni topbar, ni menú, ni miniaturas, ni docks, ni compartir/VR), sin `postMessage` ni atajos globales; solo el panorama, los hotspots y una cruceta de colocación. El editor pone su propia barra (estado de guardado/compilación, incidencias, «Usar vista actual») **fuera** del lienzo: nada puede pisarse.
2. **Clic = editar**: en modo edición, `activateHotspot` no ejecuta ningún efecto (ni navegar, ni abrir URL, ni mutar estado): siempre emite selección. Los hotspots se **arrastran** para reposicionar y el panel añade yaw/pitch numéricos.
3. **Sincronía única**: la escena seleccionada es una sola; el visor no puede cambiarla por su cuenta.
4. **Sin remontajes**: los cambios de contenido actualizan los marcadores en caliente conservando el encuadre; solo cambiar de panorama remonta.
5. **Raíl de escenas siempre presente** con buscador, arrastre para reordenar, duplicar, menú contextual y atajos (↑/↓ o Cmd+←/→); escena y pestaña en la URL.
6. **Iconos por hotspot**: selector de icono (biblioteca lucide curada) para todos los tipos; en navegación, iconos que aclaran el destino (puerta, escaleras arriba/abajo, ascensor, exterior, sala…).
7. **Editores grandes**: botón «Ampliar» en cada campo largo → diálogo ancho con editor Markdown con previsualización; editores dedicados (galería, formulario, quiz, esquinas de vídeo proyectado) en diálogo ancho.
8. Corregir todos los bugs puntuales del panel y añadir los campos del schema sin UI (labelVisibility, tooltip, transition, autoplay/loop/muted/subtítulos, volumen/radio, usdz/poster/gltf, sandbox/allow, título/éxito/etiqueta de formulario, etiquetas del comparador, estilo del polígono, newTab, thenEntry/value…).

---

## 3. Grafo: de juguete a editor de nodos

Estado actual (`GraphView.tsx`): canvas 2D con pan/zoom y arrastre básicos; sin selección múltiple, sin teclado (inaccesible), sin menú contextual, sin crear nodos, sin doble clic para abrir escena, sin reconectar aristas, sin encuadrar (F), sin snapping ni auto-layout, minimapa no interactivo, nodos sin miniatura, aristas sin etiqueta y superpuestas en pares A↔B, colores hardcodeados ilegibles en oscuro, repintado completo en cada tecla del editor, y las aristas derivadas de hotspots se seleccionan pero no muestran inspector (callejón sin salida). El tooltip de ayuda se solapa con el primer nodo (verificado en captura).

**Decisión**: reescritura con el patrón Blender: lienzo SVG con pan (arrastre de fondo/espacio), zoom a cursor, **nodos con miniatura real de la escena** y puertos de entrada/salida, crear conexión arrastrando desde el puerto con bezier fantasma, pares A↔B con curvas separadas y etiqueta del modo de entrada, selección múltiple (marquee + Shift), mover en grupo, `Supr` borra, `F` encuadra, doble clic abre la escena en el editor, menú contextual (crear conexión, fijar inicio, duplicar escena, borrar), auto-layout jerárquico opcional, minimapa clicable, tema claro/oscuro con variables. Teclado completo y `aria` real.

---

## 4. Ingesta de medios: de almacén plano a flujo de trabajo

Estado actual: subida correcta (multipart, dedupe, progreso) pero **sin renombrar** (no existe `PATCH /media/:id`), **sin ordenar** (ni servidor ni UI), **sin carpetas en la UI** (la API las soporta), **sin vínculo medio↔proyecto** (no existe `projectId`), sin selección múltiple ni lotes, filtro que dispara una petición por tecla, y **borrado sin confirmación que destruye binarios de R2 aunque una escena los use** (rompe tours publicados de forma irreversible).

**Decisión** (el flujo de cámara 360 como ciudadano de primera):

1. **Importador por lotes**: soltar 50 fotos → cola con concurrencia y progreso por ítem; orden automático por fecha EXIF; renombrado inline (clic en el nombre) y **por patrón** («Planta 1 — {n}»); reordenación por arrastre; asignación a un tour.
2. **Colocación sobre el plano durante la ingesta**: paso opcional del importador que muestra el plano y va pidiendo un clic por foto (en orden), dejando el grafo casi dibujado.
3. **Crear escenas desde la selección**: un botón convierte N medios ordenados en N escenas (con opción «conectar en secuencia»).
4. **Biblioteca por tour**: columna `projectId` en `media` (+migración), filtro/agrupación por tour en la biblioteca y en el selector del editor.
5. **Borrado seguro**: el servidor rechaza borrar un medio referenciado (lista qué escenas lo usan); la UI pide confirmación siempre.
6. API: `PATCH /media/:id` (nombre, carpeta, proyecto), orden en el listado, paginación.

---

## 5. Administración: de tabla muda a panel útil

Estado actual: resumen con 6 números sueltos; **no se pueden crear usuarios ni organizaciones**; borrar usuario existe en la API y no tiene botón; publicaciones y auditoría solo lectura sin filtros; webhooks sin activar/desactivar ni prueba; **ninguna mutación tiene `catch`** (los errores se tragan en silencio); `parseInt` produce 400 invisibles; la descarga de copia usa HTML inválido que falla en varios navegadores.

**Decisión**: alta de usuarios (con invitación por email o contraseña temporal) y de organizaciones desde el panel; borrar/desactivar con confirmación; buscador en usuarios/orgs/publicaciones/auditoría; despublicar desde publicaciones; reintento y filtro por estado en la cola; webhooks con conmutador y envío de prueba; toasts de error en todas las mutaciones; el resumen se convierte en dashboard: tarjetas + almacenamiento por organización (barras), últimas publicaciones con enlace, actividad reciente (auditoría), salud de la cola. Todos los campos del schema de ajustes con UI.

---

## 6. Widgets: paridad con HTML5Widgets y funcionamiento real

Referencia (github.com/joseluissaorin/HTML5Widgets): galería de imágenes (grid/carrusel/masonry/lightbox), formularios interactivos (única/múltiple con puntuación), visor PDF, modelos 3D (OBJ, STL, USDZ, GLB/GLTF), reproductor de audio (con listas), YouTube embebido (privacidad), comparador antes/después, web embebida (sandbox seguro).

Estado nuestro: los 17 tipos existen, pero — además del bug de anclaje que afecta a todos (§1.2) — hay carencias: `model3d` omite `gltf` en el editor y no soporta OBJ/STL; `audio` espacial no tiene panner real (solo un cálculo al hacer clic) ni listas; `web` usa por defecto `allow-scripts + allow-same-origin`, combinación que **anula el sandbox**; `tooltip` abre un modal a pantalla completa (no es un tooltip); `compare` en modo panoramas son dos botones de navegación, no un comparador; los vídeos proyectados ignoran la homografía de esquinas y no resuelven la URL en exports; los polígonos se deforman al cruzar el borde del encuadre; el mensaje de validación de email de formularios es el equivocado.

**Decisión**: arreglar cada uno — icono `gltf` en editor, OBJ/STL con three.js de carga perezosa, panner posicional real con radio, listas de audio, sandbox seguro por defecto (`allow-same-origin` solo opt-in explícito), tooltip real (burbuja anclada), comparador de panoramas con vista dividida sincronizada, resolveUrl en vídeo, subdivisión de aristas en polígonos, mensajes correctos. Verificación en navegador de los 17, uno a uno, antes de cerrar la tarea.

---

## 7. Branding oficial de la ULL

Descargados los recursos oficiales (obligatorios según el manual): marca y símbolo en SVG (positivo/negativo), **Violeta ULL Pantone 2597 C = #5c068c**, blanco como segundo color, tipografía **Argentum Sans** (OFL; ya convertida a woff2). El tema actual (índigo genérico + Inter) se sustituye por el violeta corporativo con Argentum Sans en el Studio y la documentación, usando los ficheros oficiales sin alteración (normas del manual: nada de sombras, rotaciones ni cambios de color). El visor mantiene su chrome neutro oscuro (correcto sobre foto) con los acentos en violeta.

## 8. Publicación: dominios propios y embed

Hoy solo existe un snippet iframe en «Compartir». Se añade: campo **dominio propio** por publicación (resolución por cabecera `Host` en el worker y en el self-host, con instrucciones DNS/CNAME y guía para `custom domains` de Cloudflare); **web component** `<ull360-tour>` (script único embebible en cualquier HTML, sin iframe manual); ambos snippets en el diálogo de publicación y documentados.

## 9. Ortografía: la deuda completa

La interfaz y la documentación se escribieron sin tildes ni eñes de forma sistemática. Inventario completo hecho (≈450 correcciones): los 16 ficheros de la documentación Starlight (0 líneas acentuadas), `REQUIREMENTS.md` (≈100), `SECURITY.md`, `CONTRIBUTING.md`, `AUTHORS`, el OpenAPI entero, ~25 mensajes de error de la API, los emails transaccionales («Restablecer contrasena»…), las páginas HTML públicas («Este tour esta protegido», «Contrasena incorrecta»), ~70 cadenas hardcodeadas del Studio fuera del i18n, ~12 del visor, los mensajes de validación del schema y la salida del bootstrap. Regla de oro para la corrección: el plural «-ciones» no lleva tilde; no tocar identificadores, claves JSON ni slugs. (El camino de datos sí procesa eñes correctamente: se verificó guardando y recuperando «ñÑáéíóúü» por la API.)

## 10. Documentación

Además de la corrección ortográfica: guías nuevas (importador de cámara 360, plano, grafo, dominios propios, embed y web component, referencia completa de los 17 widgets con todos sus campos), ampliación de las existentes al nuevo flujo del editor, y capturas donde aporten.

---

## Plan de ejecución

| Fase | Contenido | Tareas |
|---|---|---|
| A | Motor del visor: anclaje de hotspots, preview/tiles, brújula, proyecciones por cubemap | #22, #23 |
| B | Modo edición real + rediseño del editor + panel de propiedades completo | #24 |
| C | Grafo nivel Blender | #25 |
| D | Ingesta por lotes + biblioteca por tour + borrado seguro | #26 |
| E | Admin: altas + dashboard útil | #27 |
| F | Widgets: paridad y verificación 1 a 1 | #28 |
| G | Branding ULL + tema | #29 |
| H | Dominios propios + web component | #30 |
| I | Ortografía integral | #31 |
| J | Documentación a fondo | #32 |
| K | Tests ampliados, deploy, verificación en producción, commit | #33 |
