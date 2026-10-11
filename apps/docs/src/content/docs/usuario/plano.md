---
title: Plano del recorrido
description: "Cómo añadir el plano de planta, colocar cada escena encima y qué ve el visitante en el visor publicado: un botón de mapa (o la tecla M) que lo muestra y lo oculta, puntos pulsables que se pueden ocultar, radar, selector de plantas, plano ampliable y minimapa abierto al empezar."
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
   biblioteca de medios, o pulsa **Subir** en esa misma ventana: la imagen que
   subes desde ahí queda puesta como plano sin tener que buscarla. El plano
   pertenece a un
   [área](/docs/usuario/grafo/#áreas-la-planta-la-zona-y-la-categoría-son-lo-mismo):
   si el recorrido ya tiene áreas, elige en el desplegable a cuál se lo pones;
   si no tiene ninguna, se crea una al añadirlo.
2. **Coloca cada escena en su sitio.** Las escenas que aún no están colocadas
   salen en la lista **Sin colocar**, abajo a la izquierda del lienzo. Hay dos
   maneras de ponerlas:
   - **Arrastrarlas** desde la lista hasta su sitio en el plano.
   - **Pulsar su nombre y después el sitio** en el plano. Arriba sale un aviso
     con la escena que llevas «en la mano»; **Cancelar** o la tecla Esc la
     sueltan sin colocarla.

   Con el teclado, Intro sobre una escena de la lista la pone en el centro del
   plano ya seleccionada, y las flechas la llevan a su sitio (con Mayúsculas,
   de poco en poco). Arrastrar un punto fuera del plano lo descoloca y lo
   devuelve a la lista.
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
  El panel sale justo encima del botón, que sigue a la vista y queda resaltado
  mientras el plano está abierto: se pulsa otra vez para ocultarlo.
- El **aspa** de la cabecera del panel también lo cierra.
- La casilla **Mostrar puntos**, debajo del plano, quita y vuelve a poner los
  puntos de las escenas, para ver el dibujo limpio. El visor recuerda la
  elección en ese navegador.
- El botón **Ampliar el plano** de la cabecera del panel lo agranda casi a toda
  la pantalla, útil en el móvil o con planos detallados. Al saltar a una
  escena, vuelve solo al tamaño de minimapa.
- Cada escena colocada es un **punto pulsable** con el nombre de la escena: al
  pulsarlo, el visor salta a ella. Alrededor de cada punto hay una zona de
  toque más grande que el propio punto, para acertar con el dedo.
- El punto de la escena actual queda marcado, con el **radar** encima.
- Si el recorrido tiene además escenas con coordenadas y el mapa geográfico
  activado, el panel lleva un botón para alternar entre el plano y el mapa.

En el plano solo salen las escenas. Los puntos de información, los vídeos y el
resto de hotspots se colocan dentro de cada panorama, no sobre el plano.

El plano viaja también en los paquetes exportados, porque forma parte del
`tour.json`.

## Con el teclado

- La tecla **M** muestra y oculta el plano desde cualquier sitio del visor
  (salvo mientras se escribe en un campo). Al abrirlo con el teclado, el foco
  va al punto de la escena en la que estás.
- **Tab** recorre los puntos; **Intro** o **Espacio** saltan a esa escena.
- **Esc** cierra el plano y devuelve el foco al botón del mapa.
- El botón del mapa anuncia a los lectores de pantalla si el plano está abierto
  o cerrado, y el panel se presenta como la región «Plano».

La ayuda del visor (el botón de la interrogación) recuerda la tecla M en los
recorridos que tienen plano.

## Plano abierto al empezar

Por defecto el plano empieza cerrado. Para que el visitante lo tenga a la vista
desde el principio, como un minimapa, activa **Plano abierto al empezar** en
**Ajustes del tour › Componentes de interfaz**. En pantallas estrechas, como
la de un móvil, empieza cerrado igualmente para no tapar el panorama, y se
abre con el botón del mapa.

## Calibrar y otras opciones

Las opciones avanzadas del plano (calibrar la escala con un tramo de medida
conocida, quitar el plano, enfocar un área, la cifra de pasos que salen de cada
planta) están explicadas en [El lienzo del tour](/docs/usuario/grafo/#modo-plano).
