---
title: "Cómo hacer un pequeño planeta (little planet) con una foto 360"
description: "El little planet es la proyección estereográfica de una foto 360. Cómo hacer un pequeño planeta gratis en el navegador y qué fotos funcionan mejor."
lang: es
slug: little-planet
cluster: herramientas
fecha: 2026-09-18
autor: jose-luis-saorin
faq:
  - q: "¿Qué es un little planet o tiny planet?"
    a: "Es una foto 360 proyectada desde el cénit sobre un plano (proyección estereográfica). El suelo queda en el centro del disco, los edificios crecen hacia fuera y el cielo envuelve el borde, como un planeta diminuto."
  - q: "¿Necesito una cámara 360 para hacer un pequeño planeta?"
    a: "Hace falta una foto equirectangular completa, que es lo que da una cámara 360. Con un panorama del móvil que no cubra el cielo y el suelo, el centro y el borde del planeta saldrán vacíos o repetidos."
  - q: "¿Puedo hacerlo con el cielo en el centro (efecto túnel)?"
    a: "La herramienta de Andarama hace de momento el planeta clásico, con el suelo en el centro. La variante túnel, con el cielo en el centro, está en la lista de cosas por añadir."
  - q: "¿A qué resolución puedo descargarlo?"
    a: "Entre 512 y 4096 píxeles de lado, en PNG y sin marca de agua. Con una foto de 8K, el planeta de 4096 px sale nítido."
---

Un **pequeño planeta** (o *little planet*, o *tiny planet*) es lo que sale cuando una foto 360 se proyecta sobre un plano desde el punto más alto de la esfera: el suelo se concentra en el centro de un disco, los edificios y los árboles crecen hacia fuera como si fueran radios y el cielo envuelve el borde. Para hacer uno no hace falta Photoshop ni instalar nada: la [herramienta de pequeño planeta de Andarama](/herramientas/pequeno-planeta/) lo calcula en el navegador a partir de cualquier foto equirectangular y lo descarga en PNG. Esta guía explica cómo funciona, qué fotos dan mejor resultado y qué ajustes marcan la diferencia.

## Qué es exactamente un little planet

Una foto 360 se guarda como proyección equirectangular: un rectángulo 2:1 con la esfera aplanada (lo explicamos en [qué es una foto equirectangular](/blog/foto-equirectangular/)). El little planet es otra manera de aplanar la misma esfera: la **proyección estereográfica**, la que usaban los cartógrafos para dibujar los polos.

Se toma la esfera, se apoya sobre un plano por el nadir (el punto bajo la cámara) y se proyecta cada punto desde el cénit (el punto sobre la cámara) hacia el plano. Con eso:

- El **nadir** queda en el centro del disco.
- El **horizonte** se convierte en un círculo a media distancia.
- El **cénit** se va al infinito, así que el cielo ocupa todo el borde exterior y se diluye.

El resultado es una imagen circular en la que todo lo que rodeaba la cámara cabe de una vez. Es la manera más fotogénica de resumir una foto 360 en una sola imagen cuadrada, y por eso funciona tan bien en Instagram, en portadas y en miniaturas. Andarama lo usa para eso mismo: al pasar el ratón sobre un panorama en la biblioteca de medios, lo enseña como pequeño planeta, porque en un vistazo se reconoce la sala mejor que con un recorte rectangular.

## Cómo hacerlo en tres pasos

1. Abre la [herramienta de pequeño planeta](/herramientas/pequeno-planeta/) y elige una foto equirectangular (JPG o PNG de proporción 2:1). Vale cualquier foto de Insta360, Ricoh Theta, GoPro Max o de un programa de cosido.
2. Ajusta el **giro** para decidir qué parte de la escena queda arriba, y la **apertura** para acercar o alejar el horizonte. El planeta se recalcula al instante.
3. Elige el **tamaño de salida** (de 512 a 4096 píxeles de lado), el **fondo** (transparente, blanco, negro o papel) y pulsa «Descargar el planeta en PNG».

La foto no sale de tu ordenador: el cálculo se hace píxel a píxel en el navegador con la misma rutina que usa la biblioteca de Andarama. El PNG es tuyo, sin marca de agua.

## Qué hacen el giro y la apertura

Los dos controles cambian mucho el resultado, así que merece la pena entenderlos:

| Control | Qué cambia | Cuándo tocarlo |
|---|---|---|
| Giro | Rota la esfera sobre el eje vertical antes de proyectar | Para poner el edificio principal arriba, o centrar una calle en la vertical |
| Apertura | La distancia del punto de proyección; equivale a acercar o alejar el horizonte | Apertura pequeña: planeta compacto con mucho cielo. Apertura grande: el suelo ocupa casi todo el disco |
| Tamaño | Los píxeles del PNG final | 2048 para redes, 4096 para imprimir o recortar |
| Fondo | Lo que rellena las esquinas fuera del disco | Transparente para montarlo sobre otro diseño |

Un consejo práctico: prueba primero con la apertura al mínimo y sube poco a poco. Hay un punto, distinto para cada foto, en el que el horizonte forma un círculo limpio y los elementos altos «salen» del planeta sin tocar el borde; ese suele ser el bueno.

## Qué fotos dan los mejores planetas

No todas las fotos 360 funcionan igual. Las que mejor quedan comparten unas cuantas cosas:

- **Nadir limpio.** El centro del disco es justo el suelo bajo la cámara. Si ahí está el trípode, la mano o una sombra rara, será lo primero que se vea. Los monópodes finos que la cámara elimina en el cosido o el parche de nadir (una utilidad que Andarama aplica en la biblioteca de medios) resuelven el problema.
- **Horizonte despejado y cielo interesante.** Plazas, patios, playas, cumbres, azoteas. Un cielo con nubes da un borde con textura; un cielo blanco plano se funde con el fondo.
- **Elementos altos repartidos alrededor.** Árboles, farolas, torres: se convierten en los radios del planeta y le dan estructura. Una calle estrecha, en cambio, produce dos muros que se cierran.
- **Foto nivelada.** La proyección exagera cualquier inclinación: si el horizonte está torcido en la equirectangular, el círculo del planeta saldrá ovalado. Corrígelo antes con el nivelado de tu programa de cosido.

Los interiores también funcionan, con un aire distinto: el suelo se convierte en un disco de parqué o baldosa y las paredes y el techo se abren alrededor. Es un formato estupendo para presentar una sala de museo o un aula en una miniatura.

## Efectos que se pueden conseguir

- **Planeta clásico**: suelo en el centro, cielo fuera. Es lo que hace la herramienta.
- **Túnel** (o *inverted planet*): el cielo en el centro y el suelo alrededor. Se consigue proyectando desde el nadir en lugar del cénit. La herramienta no lo hace todavía; está apuntado.
- **Planeta panorámico**: un giro de la esfera antes de proyectar para que el «arriba» del planeta sea una calle o una fachada concreta. Es lo que hace el control de giro.

## Para qué se usa

Aparte del gusto por la imagen, el little planet tiene usos muy concretos:

- **Miniaturas de recorridos**: una portada que enseña la sala entera. En Andarama, la tarjeta social de un tour publicado usa la vista real de la escena inicial, y la biblioteca muestra los planetas al pasar el ratón.
- **Redes sociales**: imagen cuadrada, lista para Instagram, sin recortar nada.
- **Docencia**: para explicar qué es una proyección, un pequeño planeta y su equirectangular lado a lado valen más que cualquier definición.
- **Impresión**: a 4096 px se imprime un cuadrado de 30 cm con buena calidad.

## Y dentro del recorrido

El visor de Andarama también puede **cambiar de proyección en vivo**: además de la vista normal, ofrece el pequeño planeta, el ojo de pez y la proyección Panini sobre cualquier escena del tour. Es decir, no hace falta preparar un PNG para que el visitante vea el planeta: puede pasar a esa vista, girarla y volver. Si te interesa mostrar tus fotos así dentro de un recorrido, con textos y enlaces entre escenas, el [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) tarda un cuarto de hora.
