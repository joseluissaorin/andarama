---
title: Comprobar la realidad virtual en tus dispositivos
description: Lista de comprobación para Meta Quest, iPhone con visor de cartón y Android con Chrome, tras los arreglos de septiembre de 2026.
---

Esta página es una lista de comprobación para quien pruebe Andarama con gafas o
con un móvil en un visor de cartón. Recoge los tres fallos que el equipo docente
encontró en dispositivos reales y lo que debería pasar ahora. Las pruebas
automáticas cubren la geometría y el orden de las operaciones, pero **no pueden
sustituir a unas gafas puestas**: sin esta comprobación, los arreglos no están
confirmados.

## Antes de empezar

Prepara un tour de prueba y publícalo:

- [ ] Al menos **dos escenas** unidas por hotspots de navegación en los dos
      sentidos.
- [ ] En la primera escena, tres hotspots de contenido (un texto, por ejemplo)
      a alturas distintas: uno **bien por encima** del horizonte (mirando al
      techo), uno **en el horizonte** y uno **bien por debajo** (mirando al
      suelo). Pon a cada uno un nombre que diga dónde está: «Arriba»,
      «Horizonte», «Abajo».
- [ ] Un hotspot de enlace y otro de galería con varias imágenes.
- [ ] El tour se abre por **HTTPS** (la dirección pública `/t/…`). Por `http://`
      las gafas no ofrecen el modo inmersivo.

Para cada prueba, apunta el dispositivo, el navegador y su versión.

## Meta Quest (navegador del Quest, modo inmersivo)

Fallo anterior: al pulsar un hotspot de navegación parecía que saltaba y se
veían los hotspots de la escena siguiente, pero la panorámica seguía siendo la
anterior hasta salir del modo VR.

- [ ] Pulsa **Modo VR**. Entra en la sesión inmersiva y se ven las manos o los
      mandos.
- [ ] Apunta a un hotspot de navegación y pellizca (o aprieta el gatillo). La
      vista **funde a negro** brevemente y aparece la **panorámica nueva** con
      **sus** hotspots, sin salir de la sesión.
- [ ] Durante el fundido no se ven hotspots flotando sobre la panorámica vieja.
- [ ] Vuelve a la primera escena desde dentro de las gafas y salta de nuevo
      varias veces seguidas: todos los saltos funcionan (antes, tras el
      primero, los demás se ignoraban).
- [ ] Si el tour tiene una escena de vídeo 360, salta a ella: el vídeo se ve y
      se mueve dentro de la sesión.
- [ ] Con las manos quietas o fuera de la vista, **mirar** fijamente un
      hotspot **no** lo acciona: en el Quest se acciona con las manos o los
      mandos, no con la mirada.
- [ ] Los tres hotspots «Arriba», «Horizonte» y «Abajo» están donde se ven en
      el visor plano del ordenador.

## iPhone con visor de cartón (Safari)

Fallo anterior: en el modo VR los hotspots de navegación y de contenido salían
desplazados; uno que estaba un poco por debajo de la vista aparecía un poco por
encima.

- [ ] Abre el tour en Safari y activa antes el **giroscopio** (el botón del
      móvil): aparece el retículo plano.
- [ ] Pulsa **Modo VR** y acepta el permiso de movimiento. La pantalla se parte
      en dos. El retículo plano **desaparece**: solo queda un punto en el
      centro de cada ojo.
- [ ] Busca «Arriba», «Horizonte» y «Abajo»: cada uno está **a la misma altura
      y en la misma dirección** que en el visor plano. «Arriba» se ve al
      levantar la cabeza, «Abajo» al bajarla.
- [ ] Un hotspot de navegación está sobre la puerta o el paso que marca en la
      foto, no por encima ni por debajo.
- [ ] Sostén la mirada sobre un hotspot: el anillo se completa en **1,5
      segundos** aproximadamente y se acciona.
- [ ] Sigue mirando el enlace después de accionarlo: **no** se repite. Aparta
      la vista y vuelve: se puede accionar otra vez.
- [ ] Salta de escena: funde a negro y aparece la escena nueva con sus
      hotspots en su sitio.
- [ ] Sal del modo VR: si el giroscopio seguía activo, el retículo plano vuelve.

## Android con Chrome (visor de cartón)

Fallo anterior: aparecía una flecha en vez del punto; el hotspot se ponía lila
al apuntarlo, pero no saltaba.

- [ ] Abre el tour en Chrome y pulsa **Modo VR**. Chrome abre su modo inmersivo
      (puede pedir que coloques el móvil en el visor).
- [ ] En el centro de la vista hay un **punto con un anillo**, no una flecha ni
      un rayo.
- [ ] Mira un hotspot de navegación: se pone lila y el anillo **se va
      llenando**. Al completarse (unos **1,5 segundos**), **salta** a la escena
      siguiente, con fundido a negro.
- [ ] Pulsa el botón del visor (o toca la pantalla) mirando un hotspot: se
      acciona **al instante**, sin esperar al anillo, y no se repite después
      por permanencia.
- [ ] Abre un texto: el panel aparece delante. Mira el aspa y sostén la
      mirada: el panel se cierra.
- [ ] En la galería, mirar «siguiente» avanza **una** imagen; para avanzar
      otra hay que apartar la vista y volver.
- [ ] «Arriba», «Horizonte» y «Abajo» están donde se ven en el visor plano.

## Qué está comprobado solo por pruebas automáticas

Las pruebas del visor (`packages/viewer/src/engine/xr/dispositivos.test.ts`)
confirman, sin dispositivo:

- que cada hotspot en el modo VR apunta al mismo píxel de la panorámica que en
  el visor plano, y que el centro de la vista plana cae en el centro de cada
  ojo;
- que la selección por mirada acciona tras la permanencia, no se repite sobre
  lo ya accionado y se reinicia al cambiar de objetivo o mover la cabeza;
- que la mirada de Chrome no se trata como un mando con rayo;
- que el cambio de escena en VR se completa solo con el bucle de la sesión
  inmersiva, con los temporizadores y el `requestAnimationFrame` de la ventana
  parados (un doble de prueba de `XRSession`).

No está comprobado: que el navegador del Quest, Safari y Chrome se comporten
como suponen esas pruebas. En particular, qué fuentes de entrada declara Chrome
en Android dentro de su modo Cardboard, y que el Quest no reanude el
`requestAnimationFrame` de la ventana por su cuenta. Eso solo lo dice esta lista.

## Si algo falla

Anota el paso, el dispositivo, el navegador y la versión, y si puedes, una foto
o un vídeo de la pantalla. En el Quest, la grabación del propio sistema basta.
