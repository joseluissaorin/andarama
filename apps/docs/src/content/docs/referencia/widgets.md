---
title: Referencia de widgets (hotspots)
description: Los 17 tipos de hotspot del visor con todos sus campos y comportamiento.
---

Todos los hotspots comparten: **etiqueta** (con visibilidad al pasar el ratón, siempre o nunca), **texto alternativo** (obligatorio para publicar sin avisos), **posición** (arrastrable en el editor o en grados), **icono** (elegible de la biblioteca, con tamaño, color, fondo circular y pulso), **escala por distancia** y **condiciones de visibilidad** (idioma, variables de estado, ventana temporal en escenas de vídeo).

## Navegación y estructura

| Tipo | Qué hace | Campos propios |
|---|---|---|
| **Navegación** | Salta a otra escena | Escena destino, modo de entrada (fija/relativa/mirar atrás), transición propia, variante flecha de suelo, icono que aclara el destino (puerta, escaleras, exterior…) |
| **Enlace** | Abre una URL, teléfono o email | URL, tipo (`url`/`tel`/`mailto`), pestaña nueva |
| **Estado** | Muta variables del tour | Acciones (`set` con valor, `inc`, `dec`, `toggle`) y salto de escena opcional |
| **Polígono** | Zona activa dibujada sobre el panorama | Contorno redibujable, relleno/borde/opacidad/relleno al pasar, acción (ir a escena, abrir URL, variables, activar otro hotspot) |

## Contenido

| Tipo | Qué hace | Campos propios |
|---|---|---|
| **Texto** | Panel con Markdown | Cuerpo (editor ampliable) |
| **Tooltip** | Burbuja anclada al marcador (no un modal) | Texto, permanente o con autocierre |
| **Imagen** | Lightbox con zoom profundo (rueda, arrastre, pellizco) | Imagen, pie de foto, descarga |
| **Galería** | Carrusel a pantalla | Lista de imágenes con títulos |
| **PDF** | Visor paginado con zoom (PDF.js) | Documento, descarga |
| **Web** | Página embebida | URL, alto, sandbox estricto (por defecto) o permisivo |

## Audiovisual

| Tipo | Qué hace | Campos propios |
|---|---|---|
| **Vídeo (fichero)** | Lightbox o **pantalla proyectada** sobre el panorama (homografía a 4 esquinas definidas con clics) | Vídeo, modo, autoplay/bucle/silencio |
| **Vídeo embebido** | YouTube (sin cookies), Vimeo (DNT) o PeerTube | Proveedor, ID, inicio en segundos, autoplay |
| **Audio** | Reproductor con transcripción, o **fuente espacial** anclada al punto (HRTF; clic reproduce/para) | Audio, modo, volumen, bucle |
| **Modelo 3D** | Visor interactivo, con AR en móviles | GLB/glTF/USDZ (model-viewer) y **OBJ/STL** (three.js), póster, formato |

## Didácticos

| Tipo | Qué hace | Campos propios |
|---|---|---|
| **Pregunta (quiz)** | Única/múltiple/verdadero-falso con puntuación, intentos, feedback y bloqueo de avance | Ver la guía de docencia |
| **Formulario** | Campos configurables con anti-spam Turnstile | Título, mensaje de éxito, texto del botón, destino (API, webhook, email) |
| **Comparador** | Antes/después de dos imágenes con deslizador, o **vista dividida de dos escenas sincronizadas** | Modo, imágenes o escenas, etiquetas |

Los tours exportados como paquete estático conservan todos los widgets; los que necesitan backend (formularios hacia la API) usan el webhook configurado o quedan deshabilitados con aviso.

## Añadir un hotspot

En el panel de propiedades de la escena, **Añadir hotspot** abre una paleta
buscable: se escribe lo que se quiere y aparece el tipo con una línea que
explica qué hace. Busca también por sinónimos y sin tildes, de modo que
«puerta» encuentra Navegación y «examen» encuentra Pregunta. Elegido el tipo,
se pulsa sobre el panorama para colocarlo.

## Comportamiento en realidad virtual

Dentro de una sesión WebXR **todos** los hotspots están presentes y son
accionables con la pinza de la mano o el gatillo del mando. Los que llevan
contenido se abren en un panel inmersivo dibujado por el propio motor:

| Tipo | Dentro de las gafas |
|---|---|
| Navegación | Teletransporte a la escena destino sin salir de la sesión |
| Enlace, estado, polígono | Ejecutan su acción directamente |
| Texto, tooltip | Panel con el texto y desplazamiento |
| Imagen | Panel con la imagen ajustada y su pie |
| Galería | Panel con anterior/siguiente y contador |
| Vídeo (fichero) | Panel con barra de progreso y pausa |
| Audio | Panel con transporte y transcripción |
| Pregunta (quiz) | Opciones pulsables, comprobación y puntuación real |
| Comparador | Divisor arrastrable con la pinza |
| PDF, web, formulario, vídeo embebido, modelo 3D | Tarjeta con el título y la dirección y botón **Abrir al salir de VR**: el visor los abre en una pestaña al terminar la sesión |

Los paneles se dibujan con Canvas 2D y se suben como textura, sin DOM ni
dependencias externas: se comportan igual en un tour publicado y en un paquete
exportado.

Qué tipos están disponibles allí dentro se decide por tour en **Ajustes del
tour › Gafas y modo cartón**: todos, solo la navegación, o una selección por
familias o tipo a tipo. Véase la
[guía de realidad virtual](/docs/usuario/realidad-virtual/).
