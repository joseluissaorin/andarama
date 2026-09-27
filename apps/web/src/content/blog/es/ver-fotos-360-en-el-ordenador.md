---
title: "Cómo ver fotos 360 en el ordenador sin instalar nada"
description: "Cómo ver fotos 360 en el PC sin instalar nada: un visor 360 online en el navegador, con pantalla completa y gafas. Y las alternativas de escritorio."
lang: es
slug: ver-fotos-360-en-el-ordenador
cluster: herramientas
fecha: 2026-09-16
autor: jose-luis-saorin
faq:
  - q: "¿Necesito un programa para ver fotos 360 en el PC?"
    a: "No. Un visor 360 online como el de Andarama funciona en Chrome, Firefox, Safari o Edge, en Windows, macOS y Linux, sin instalar nada y sin subir la foto a ningún servidor."
  - q: "¿Por qué mi foto 360 se ve estirada en el visor de Windows o en Vista Previa?"
    a: "Porque esos programas muestran el fichero tal cual, que es una proyección equirectangular: una esfera aplanada en un rectángulo 2:1. Solo un visor 360 la vuelve a envolver sobre la esfera."
  - q: "¿Puedo ver fotos 360 con gafas de realidad virtual desde el ordenador?"
    a: "Si tienes un casco conectado al PC con SteamVR y usas Chrome o Edge, el botón de gafas del visor de Andarama abre la sesión WebXR. También puedes abrir la misma página desde el navegador de unas Meta Quest, Pico o Vision Pro."
  - q: "¿Cómo comparto una foto 360 por enlace?"
    a: "Un visor local no genera enlaces: la foto no sale de tu ordenador. Para compartirla por enlace hay que subirla a algún servicio; con Andarama se publica sola o dentro de un recorrido y se inserta en cualquier web."
---

Para ver una foto 360 en el ordenador no hace falta instalar nada: basta abrirla en un **visor 360 online** que la envuelva sobre una esfera dentro del navegador. El [visor 360 gratuito de Andarama](/herramientas/visor-360-online/) lo hace con JPG y PNG equirectangulares, en cualquier navegador moderno, sin subir la imagen a ningún servidor y con botones de pantalla completa y de gafas. Esta guía explica por qué la foto se ve mal en el visor de siempre, cómo usar el visor web y qué otras opciones hay en Windows, macOS y Linux.

## Por qué el visor de fotos del sistema no sirve

Una foto 360 se guarda en proyección equirectangular: los 360 grados de giro a lo ancho y los 180 de arriba abajo a lo alto, en un rectángulo de proporción 2:1. El visor de fotos de Windows, la Vista Previa de macOS o cualquier programa de imagen normal la enseñan tal cual, así que se ve estirada, con el cielo y el suelo deformados y las líneas rectas curvadas. No es que la foto esté mal: es que necesita un visor que la vuelva a poner sobre la esfera. Si quieres entender el formato con calma, tenemos un artículo sobre [qué es una foto equirectangular](/blog/foto-equirectangular/).

## Opción 1: el visor 360 online (sin instalar nada)

Es el camino más corto y el que recomendamos para el uso diario:

1. Abre el [visor 360 online](/herramientas/visor-360-online/) en el navegador.
2. Pulsa «Elegir una foto 360» o arrastra el fichero sobre la zona punteada. Sirven los JPG y PNG que producen las Insta360, las Ricoh Theta, la GoPro Max, las apps de panorama del móvil y los programas de cosido.
3. Arrastra con el ratón para girar, usa la rueda para acercar y alejar, o las flechas del teclado.
4. El botón de pantalla completa llena el monitor. El de gafas abre la sesión de realidad virtual si el navegador tiene WebXR.

Lo importante: **la foto no se sube**. El navegador la decodifica y el motor WebGL la pinta en tu tarjeta gráfica. Sirve con fotos privadas, con material de un cliente o con panoramas que todavía no se pueden publicar. Y como no hay subida, no hay espera: una foto de 8K se abre en un par de segundos.

El visor es el mismo motor que usa Andarama en sus recorridos, así que lo que ves es exactamente lo que vería un visitante de un tour.

### Límites

El único límite es la memoria del navegador. Fotos de 8192 × 4096 se abren sin problema en cualquier ordenador; por encima de 16K de ancho el visor la reduce automáticamente para que la tarjeta gráfica pueda con ella. Y no guarda nada: al cerrar la pestaña, la foto desaparece del visor, que es lo que se espera de una herramienta local.

## Opción 2: programas de escritorio

Si prefieres un programa instalado, cada fabricante de cámaras tiene el suyo, y hay visores generales:

| Programa | Sistemas | Para qué sirve |
|---|---|---|
| Insta360 Studio | Windows, macOS | Abrir, coser y exportar las fotos y vídeos de las Insta360 |
| Ricoh Theta (app de escritorio) | Windows, macOS | Ver y convertir las fotos de las Theta |
| GoPro Player | Windows, macOS | Ver y exportar el material de la GoPro Max |
| Visores de vídeo (VLC, por ejemplo) | Windows, macOS, Linux | Reproducen vídeo 360 con navegación; para fotos son incómodos |

Ventaja: conviven con la tarjeta de memoria de la cámara y hacen el cosido de los ficheros en bruto. Inconveniente: hay que instalarlos, pesan, y en Linux la oferta oficial es escasa. Para simplemente **mirar** una foto ya cosida, el visor web es más rápido.

## Opción 3: en el móvil

Google Fotos y la galería de muchos Android reconocen los metadatos XMP GPano de la foto y ofrecen la vista 360 con giroscopio. En iPhone, la app Fotos no la envuelve: se ve plana. La misma [página del visor](/herramientas/visor-360-online/) funciona en el navegador del móvil y permite girar la vista moviendo el teléfono.

## Ver fotos 360 con gafas

Hay dos caminos, y los dos pasan por el mismo botón del visor:

- **Gafas autónomas** (Meta Quest 2, 3, 3S y Pro; Pico 4; Vision Pro con Safari): abre la dirección del visor en el navegador de las gafas, elige la foto y pulsa el botón de gafas. La foto envuelve la habitación entera.
- **Casco conectado al PC** (SteamVR con Chrome o Edge): la misma página, desde el ordenador.

WebXR solo existe en contextos seguros, es decir, en páginas servidas por HTTPS; el visor lo cumple. En un móvil sin WebXR, el visor no ofrece la sesión inmersiva, pero sí el giro con el giroscopio. La [guía de realidad virtual de Andarama](https://docs.andarama.com/usuario/realidad-virtual/) explica qué gafas y navegadores funcionan.

## Fotos que no se ven bien: causas frecuentes

- **Se ve una franja negra arriba o abajo.** La foto no cubre los 180 grados verticales (es un panorama parcial). El visor la abre igual, pero dejará esa franja. Las cámaras 360 de verdad no tienen este problema; las apps de panorama del móvil, sí.
- **La imagen aparece cortada por la mitad o con un salto.** El fichero no es equirectangular, o le falta la mitad. Comprueba que el ancho sea el doble del alto.
- **Se ve borrosa.** Poca resolución: por debajo de 4096 × 2048 cualquier foto 360 se ve blanda al mirarla envuelta, porque los píxeles se reparten por toda la esfera.
- **El horizonte está torcido.** La cámara no estaba nivelada. Se corrige con la utilidad de nivelado (roll/pitch) de los programas de cosido, o en la biblioteca de medios de Andarama, que aplica el nivelado sin destruir el original.

## Cuando quieres algo más que mirar

Un visor abre una foto y ya. En cuanto quieres **compartirla por enlace**, insertarla en una web, enlazar varias fotos con flechas o poner un texto sobre un cuadro, hace falta publicarla en algún sitio. Ese es el trabajo de un editor de recorridos:

- Subes las fotos, y el propio navegador las trocea en teselas para que carguen rápido.
- Enlazas las escenas en un grafo (cada flecha es un paso entre dos salas).
- Publicas y obtienes una dirección, un código QR y el código para insertarlo en tu web o en WordPress.

En Andarama esto se hace en un cuarto de hora con el [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/), y la cuenta de prueba dura catorce días sin tarjeta. Si prefieres no depender de nadie, el programa es de código abierto y hay un [ejecutable de escritorio](https://docs.andarama.com/despliegue/escritorio/) que se abre con doble clic y guarda todo en tu ordenador.

## En resumen

- Para **ver** una foto 360 en el ordenador: el [visor 360 online](/herramientas/visor-360-online/), sin instalar nada y sin subirla.
- Para **coser** el material en bruto de la cámara: el programa del fabricante.
- Para **compartir** o **enlazar** varias fotos: un editor de recorridos como Andarama.
