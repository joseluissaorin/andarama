---
title: "Marzipano: qué es, para qué sirve y qué le falta"
description: "Marzipano es la librería de código abierto de Google para visores 360. Qué hace bien, qué exige programar y qué añade Andarama, que la usa como motor."
lang: es
slug: marzipano
cluster: competidores
fecha: 2026-10-14
autor: jose-luis-saorin
plantilla: vs
competidor: marzipano
faq:
  - q: "¿Marzipano es gratis?"
    a: "Sí. Es una librería de código abierto con licencia Apache 2.0, sin planes, sin cuentas y sin límites. No hay empresa que venda soporte; lo que hay es el código y su documentación."
  - q: "¿Puedo hacer un tour con Marzipano sin programar?"
    a: "Con la Marzipano Tool, una aplicación web, se suben panoramas y se descarga un tour estático con navegación básica. Para hotspots ricos, idiomas, quiz, plano o realidad virtual hay que programar sobre la librería."
  - q: "¿Qué relación tiene Andarama con Marzipano?"
    a: "El motor 360 de Andarama está construido sobre Marzipano, con capas propias encima (teselado, proyecciones, WebXR, hotspots, audio espacial). Andarama añade el editor, la publicación y la docencia; el visor exportado sigue siendo un fichero estático."
  - q: "¿Marzipano tiene realidad virtual?"
    a: "No tiene modo WebXR. Hay ejemplos de pantalla partida para cartón en su repositorio, pero no una sesión inmersiva con manos o mandos; eso lo añade Andarama en su capa."
---

**Marzipano** es una librería JavaScript de código abierto, publicada por Google con licencia Apache 2.0, para construir visores de fotos 360 en el navegador. Es rápida, ligera, soporta panoramas equirectangulares y en caras de cubo con multirresolución, y es gratis sin condiciones. Lo que no es: un editor. Para algo más que enlazar panoramas hay que programar, no tiene realidad virtual WebXR, ni analítica, ni quiz, ni SCORM, y no hay empresa detrás que dé soporte. Andarama usa Marzipano como base de su motor y añade encima el editor y todo lo demás; por eso la comparación honesta es «Marzipano con editor», y por eso hay casos en los que Marzipano a secas es mejor.

Un aviso antes de seguir: la ficha de Marzipano que sale en la tabla lleva `verificado: false`. Al no tener planes ni precios no hay nada que comprobar en una página de tarifas, pero sus capacidades las hemos anotado de memoria y de la documentación pública, no de una revisión reciente; si algo ha cambiado, agradecemos el aviso.

## Qué hace bien Marzipano

- **Renderiza panoramas** en WebGL con muy buen rendimiento, incluidos los de caras de cubo troceadas en niveles de zoom (multirresolución), que es lo que permite ver fotos de decenas de miles de píxeles sin cargarlas enteras.
- **API clara**: escenas, vistas, geometrías, fuentes de teselas, hotspots como elementos HTML anclados a una dirección. Con un poco de JavaScript se construye un visor a medida en una tarde.
- **Sin dependencias ni servidor**: un fichero JS y las imágenes. Se sirve desde cualquier hosting estático.
- **Licencia Apache 2.0**: se puede usar en productos comerciales sin obligación de publicar el código propio.
- **Marzipano Tool**: una aplicación web para subir panoramas, colocar enlaces entre ellos y descargar un tour estático. Para un tour básico no hace falta escribir nada.

En resumen: si eres desarrollador y quieres un visor 360 dentro de tu propia aplicación, Marzipano es una de las mejores opciones que existen, y es gratis.

## Qué le falta

Lo que sigue no es una crítica: Marzipano es una librería, y las librerías no tienen editor. Pero es lo que se echa en falta cuando se intenta usarla como producto.

| Necesidad | Marzipano | Cómo se resuelve |
|---|---|---|
| Editor visual de escenas y hotspots | No (la Tool solo hace navegación básica) | Programar, o usar un producto construido encima |
| Hotspots de texto, imagen, vídeo, audio, PDF, quiz | Solo el anclaje; el contenido lo programas tú | Idem |
| Realidad virtual WebXR | No | Idem |
| Plano de planta, mapa, brújula | No | Idem |
| Idiomas | No | Idem |
| Publicación, enlaces, QR, tarjeta social | No | Tu propio servidor y tu propio código |
| Analítica | No | Añadir la tuya |
| Docencia (quiz con nota, SCORM, LTI) | No | Un producto de docencia |
| Soporte | Comunidad; sin empresa detrás | Contratar a alguien que conozca la librería |

Y hay un detalle práctico: las versiones de Marzipano salen con cuentagotas. Funciona, y funcionará, porque es código estático que no depende de servicios; pero no esperes novedades.

## Marzipano Tool, en detalle

La Tool es lo que la gente suele encontrar cuando busca «marzipano tutorial». Funciona así: se abre la aplicación web, se arrastran las fotos equirectangulares, se crean enlaces entre ellas pulsando sobre el panorama, se ajusta la vista inicial y se descarga un ZIP con el tour: HTML, JS, teselas y datos. Se sube a cualquier servidor y funciona.

Lo que da: navegación entre escenas, hotspots de información con un texto, lista de escenas, pantalla completa, giroscopio y autorrotación. Lo que no da: editar el tour después (hay que rehacerlo o tocar el JSON a mano), contenido más allá de un texto por hotspot, idiomas, plano, realidad virtual, ni ninguna forma de saber quién lo ha visto.

Para una única visita sencilla, gratis y que se sube por FTP, es una buena solución. Para un proyecto que se va a mantener, se queda corta enseguida.

## Andarama: Marzipano con editor (y lo que hay debajo)

El motor 360 de Andarama está construido **sobre Marzipano**, con capas propias: teselado en el navegador, proyecciones (pequeño planeta, ojo de pez, Panini), WebXR con manos y mandos, diecisiete tipos de hotspot dibujados también dentro de las gafas, audio espacial, vídeo 360 y brújula. Encima, el editor con grafo, el plano, las traducciones, la publicación con enlace y QR, la analítica sin cookies, el quiz con nota, el escape room, el SCORM y el LTI.

Lo que se conserva del espíritu de Marzipano es lo importante: el **tour exportado es un fichero estático**. Un ZIP con el HTML, el visor y las teselas que se sube a cualquier hosting y funciona sin Andarama detrás, igual que un tour de la Marzipano Tool. El formato `tour.json` está [documentado](https://docs.andarama.com/referencia/tour-json/) y el programa entero es de código abierto (EUPL-1.2), así que quien quiera leer cómo se usa Marzipano por dentro puede hacerlo.

El precio: gratis instalado (ejecutable de escritorio, Docker o tu cuenta de Cloudflare) o alojado desde 2 $ al mes.

## Cuándo elegir Marzipano a secas

Sé honesto contigo mismo sobre lo que necesitas:

- **Tienes un equipo de desarrollo y quieres un visor dentro de tu aplicación**, con tu propia interfaz y tus propios datos. Marzipano. Andarama sería demasiado.
- **Quieres una licencia permisiva** (Apache) para un producto cerrado. Marzipano. Andarama es EUPL, copyleft: las modificaciones que distribuyas se comparten.
- **Un único tour básico, gratis, por FTP, sin mantenerlo**. La Marzipano Tool cumple.

## Cuándo elegir Andarama

- **No quieres programar** y necesitas editar el tour más de una vez.
- **Contenido rico**: textos, imágenes con zoom, vídeo sobre las paredes, audio, PDF, comparador, idiomas.
- **Realidad virtual** de verdad, en gafas, sin instalar nada.
- **Docencia y formación**: quiz con nota, escape room, LTI con Moodle, SCORM.
- **Publicación y datos**: enlace, QR, inserción, dominio propio, analítica sin cookies.
- **Que siga siendo tuyo**: exportación estática y código abierto, como con Marzipano, pero con editor.

Si vienes de Marzipano y quieres ver qué se siente al tener un editor encima, el [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) tarda un cuarto de hora, y el [ejecutable de escritorio](https://docs.andarama.com/despliegue/escritorio/) no necesita cuenta.
