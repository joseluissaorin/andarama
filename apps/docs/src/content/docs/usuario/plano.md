---
title: Plano del recorrido
description: "Cómo añadir el plano de planta, colocar cada escena encima y qué ve el visitante en el visor publicado: un botón de mapa con puntos pulsables, radar y selector de plantas."
---

El **plano del recorrido** es un dibujo de la planta con un punto por escena.
En el recorrido publicado, el visitante lo abre con un botón de mapa, ve dónde
está y salta a cualquier sala pulsando su punto. No hace falta un plano de
arquitecto: sirve un dibujo, una captura o una foto de la planta.

## Dónde está

Hay dos caminos y llevan al mismo sitio:

- En la **lista de escenas**, abajo, el botón **Plano del recorrido**. Cuando el
  recorrido ya tiene plano, el botón lleva la marca **listo**.
- En la pestaña **Grafo**, el modo **Plano** de la barra superior.

Si el recorrido todavía no tiene plano, se abre una pantalla con los tres pasos
y el botón **Añadir plano**.

## Los tres pasos

1. **Sube la imagen del plano.** Pulsa **Añadir plano** y elige la imagen en la
   biblioteca de medios. El plano pertenece a un
   [área](/docs/usuario/grafo/#áreas-la-planta-la-zona-y-la-categoría-son-lo-mismo):
   si el recorrido ya tiene áreas, elige en el desplegable a cuál se lo pones;
   si no tiene ninguna, se crea una al añadirlo.
2. **Arrastra cada escena a su sitio.** Las escenas que aún no están colocadas
   salen en una lista abajo a la izquierda del lienzo: arrástralas sobre el
   plano. Arrastrar un punto fuera del plano lo descoloca y lo devuelve a la
   lista.
3. **Publica.** En el visor aparece un botón de mapa abajo a la izquierda que
   abre el plano con sus puntos.

El enlace **¿Cómo se hace?** de esa pantalla lleva a esta documentación.

## El radar

Con una escena seleccionada en el modo Plano aparece un **cono**. Girándolo
indicas hacia dónde mira el panorama sobre el plano. En el visor, ese cono
sale sobre el punto de la escena en la que está el visitante y gira mientras
mira alrededor, como el radar de un mapa de museo.

Si no lo giras, el cono se dibuja igual, pero puede no coincidir con lo que se
ve: merece la pena ajustarlo en las escenas principales.

## Varias plantas

Cada área con plano es una **planta**. Con dos o más plantas:

- En el editor, el selector de la barra del modo Plano cambia de una a otra.
- En el visor, el panel del plano muestra un botón por planta, ordenadas por su
  **nivel** (−1, 0, 1…), que se fija en el panel de áreas.
- Al cambiar a una escena de otra planta, el plano del visor cambia solo a esa
  planta.

## Qué ve el visitante

- Un **botón de mapa abajo a la izquierda** abre y cierra el panel del plano.
- Cada escena colocada es un **punto pulsable** con el nombre de la escena: al
  pulsarlo, el visor salta a ella.
- El punto de la escena actual queda marcado, con el **radar** encima.
- Si el recorrido tiene además escenas con coordenadas y el mapa geográfico
  activado, el panel lleva un botón para alternar entre el plano y el mapa.

El plano viaja también en los paquetes exportados, porque forma parte del
`tour.json`.

## Calibrar y otras opciones

Las opciones avanzadas del plano (calibrar la escala con un tramo de medida
conocida, quitar el plano, enfocar un área, la cifra de pasos que salen de cada
planta) están explicadas en [El lienzo del tour](/docs/usuario/grafo/#modo-plano).
