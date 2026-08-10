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
