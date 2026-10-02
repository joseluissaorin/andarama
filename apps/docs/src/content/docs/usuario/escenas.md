---
title: Escenas y hotspots
description: Cómo se llega a cada escena, el panel de propiedades, los tipos de hotspot y las herramientas del editor para trabajar en equipo.
---

## Cómo se llega a una escena

La orientación con la que se entra en una sala **no es de la sala**: es de cada
camino que lleva hasta ella. Entrar en el salón desde el pasillo y entrar desde
la cocina son dos llegadas distintas y pueden mirar a sitios distintos.

Por eso se deciden **estando en el destino**, en el panel «Cómo se llega aquí»,
que es lo primero de las propiedades de la escena. Cada fila es una manera de
llegar —la vista por defecto y una por cada paso que entra— con su brújula,
que dice de un vistazo hacia dónde se entra. El botón de reproducir gira el
panorama hasta esa llegada: la ves antes de decidir.

Cada llegada elige entre cinco, y la fila dice con palabras qué vista se usará:

| Opción | Qué hace | Cuándo |
|---|---|---|
| **Vista por defecto** | Entras con la vista por defecto de la escena, la de la primera fila | La más sencilla: una sola vista que sirve para todos los caminos. Es la de los pasos nuevos |
| **Seguir el camino** | Entras de espaldas a la puerta por la que has venido y sigues de frente | El natural de un recorrido a pie |
| **Esta vista** | Una vista propia solo para ese camino: gira el panorama y pulsa «Usar vista actual» | Cuando hay algo concreto que enseñar al entrar por ahí |
| **Mirar atrás** | Entras mirando la puerta por la que has venido | Para volver sobre tus pasos sin desorientarte |
| **Seguir mirando igual** | Mantiene la dirección en la que miraba el visitante; con el norte calibrado en el plano, el rumbo **real** | Si las fotos están alineadas |

La primera fila es la **vista por defecto de la escena**: se ajusta girando el
panorama y pulsando **Usar vista actual**. Es la vista con la que empieza el
recorrido cuando esta es la escena inicial, la que usan todos los caminos en
«Vista por defecto» y la que queda cuando una llegada no puede calcularse.

Los pasos que se crean desde el grafo o arrastrando una escena sobre el
panorama entran con **Vista por defecto**; los pasos que ya existían conservan
el modo que tenían. «Seguir el camino» y «mirar atrás» se calculan a partir del
paso de vuelta: si falta, se avisa en la propia fila, porque sin él la
orientación es una suposición.

:::note[La dirección del navegador no pisa la vista]
Mientras se mira alrededor, el visor va escribiendo en la dirección la escena y
la orientación (`#s=…&y=…&p=…`). Al recargar la página, esa orientación **no**
sustituye a la vista por defecto: el visor solo vuelve a la escena. La
orientación del enlace solo se aplica cuando lleva el marcador `v=1`, que es lo
que añade el botón **Compartir** del visor para enseñar a alguien justo lo que
estás mirando. Más detalles en
[Publicar y compartir](/docs/usuario/publicar/#enlaces-a-una-escena-y-a-una-vista).
:::

## Escenas

Cada escena tiene: título, **texto alternativo obligatorio** (accesibilidad), descripción, **área** —que agrupa las escenas en el lienzo, da la categoría del menú y, si tiene plano, es la planta—, vista inicial ("usar vista actual"), límites de vista opcionales (esencial en panoramas parciales), audio (ambiente, narración con bloqueo opcional, fuentes espaciales) y su sitio en el plano o en el mapa, que se colocan desde el lienzo.

Tipos de escena: **Panorama 360** (imagen), **Vídeo 360** y **Gigapixel 2D** (obras, documentos, fachadas con pan/zoom tipo mapa).

## El panel de propiedades

A la derecha. Cuando hay una escena seleccionada muestra sus datos y la lista de
sus hotspots; al pulsar uno, cambia al marcador con una cabecera fija —de qué
escena viene, qué tipo es, borrar— y tres pestañas: **Contenido**, **Estilo** y
**Condiciones**. Lo que se busca casi siempre está en la primera, sin
desplazarse. El panel se puede **ensanchar** arrastrando su borde izquierdo.

Las secciones del panel salen **plegadas**, salvo «Cómo se llega aquí» y el
contenido del marcador, para que se recorra de un vistazo. Cada sección
**recuerda** si la dejaste abierta o cerrada. Junto a los hotspots más
complejos (acción, quiz, tesoro, polígono, formulario, condiciones) hay un
enlace **¿Cómo se hace?** que abre la guía correspondiente de esta
documentación.

### Probar un hotspot

Al seleccionar en el panorama un hotspot con contenido (un texto, una imagen,
una galería, un quiz), aparece sobre él un botón **Probar**: abre el contenido
tal como lo verá el visitante, con los últimos cambios guardados. Así se
comprueba un texto largo o una pregunta sin salir del editor ni abrir la
previsualización.

### Renombrar una escena y su foto

Al cambiar el nombre de una escena, en la lista o en el grafo, el editor
ofrece renombrar también la foto en la biblioteca («¿Renombrar también la
foto?»). Es opcional: si eliges **No, dejarla como está**, la foto conserva su
nombre.

### El sonido mientras editas

Si la escena tiene audio, el botón del altavoz de la barra del panorama lleva
el texto **Silenciar**. Solo afecta al editor, no al recorrido publicado, y se
recuerda en ese navegador. Más en [Música y audio](/docs/usuario/audio/#silenciar-mientras-editas).

La lista de hotspots de la escena marca los que están **sin colocar** (creados
desde el grafo y aún en su posición provisional) y resalta en el panorama aquel
sobre el que pasas el ratón.

**Añadir hotspot** abre una paleta buscable: se escribe lo que se quiere
(«texto», «puerta», «examen», «3D») y aparece el tipo con una línea explicando
qué hace. Después se pulsa en el panorama para colocarlo.

Un atajo que ahorra mucho: **arrastrar una escena de la lista sobre el
panorama** crea directamente el paso de navegación hacia ella, en el punto donde
se suelta.

## El grafo

La pestaña **Grafo** muestra las escenas como nodos y los pasos de navegación
como flechas: cada flecha *es* un hotspot. Se detalla en
[El grafo de escenas](/docs/usuario/grafo/).

Cada paso define su **orientación de llegada**, con las cinco opciones de
[Cómo se llega a una escena](#cómo-se-llega-a-una-escena): vista por defecto,
seguir el camino, esta vista, mirar atrás y seguir mirando igual.

## Los 18 tipos de hotspot

Todos comparten posición, etiqueta, texto alternativo, icono (biblioteca SVG o propio), estilo (tamaño, color, giro del dibujo, pulso, escala con zoom) y **condiciones de visibilidad** (por idioma, por variables de estado, por rango temporal en escenas de vídeo).

1. **Navegación**: salto a otra escena; variante flecha de suelo.
2. **Texto**: panel Markdown (títulos, listas, enlaces, tablas), con barra de formato (negrita, cursiva, título, lista, enlace), vista previa en el editor ampliado, título propio y tamaño de letra.
3. **Imagen**: lightbox con zoom profundo y descarga opcional.
4. **Galería**: carrusel con títulos y descripciones.
5. **Vídeo (fichero)**: lightbox o pantalla proyectada sobre la escena.
6. **YouTube/Vimeo/PeerTube**: embed sin cookies por defecto. Se pega la dirección tal cual (`youtu.be/…`, `watch?v=…`, `shorts/…`) y el ID se saca solo; si la dirección lleva `t=90`, ese es el segundo de inicio.
7. **Audio**: reproductor o fuente espacial anclada.
8. **PDF**: visor integrado con paginación y zoom.
9. **Modelo 3D**: glTF/GLB, OBJ, STL; AR opcional en móviles.
10. **Web/iframe**: página externa con sandbox configurable, o un **código de inserción** (el «embed» de Sketchfab, Genially, Google Maps, H5P…). Un iframe suelto se usa directamente; un código con scripts se sirve en un documento aparte aislado. Muchas webs no permiten mostrarse dentro de otra: el panel ofrece siempre «Abrir en una pestaña nueva».
11. **Formulario**: campos varios, envío a la API/webhook/email, anti-spam Turnstile.
12. **Comparador**: dos imágenes con deslizador, o dos escenas del tour lado a lado y sincronizadas (un antes y después de la misma sala).
13. **Quiz**: una pregunta por marcador (única/múltiple/verdadero-falso), feedback, puntos y compuerta que retiene en la escena hasta acertar.
14. **Polígono (zona)**: región dibujada vértice a vértice sobre la esfera; se ve mientras se dibuja. Al pulsarla lleva a otra escena, abre una web o abre otro hotspot de la escena. Véase [Variables, acción y polígono](/docs/usuario/variables/#el-hotspot-polígono).
15. **Etiqueta flotante**: un texto que se ve al pasar el cursor y, al pulsar, en una burbuja fija sobre el marcador.
16. **Enlace externo**: URL, tel: o mailto:.
17. **Acción (variables)**, antes «Contador / estado»: no se ve nada; al pulsarlo cambia variables del tour (puertas, día/noche, progreso) y puede llevar a otra escena. Véase [Variables, acción y polígono](/docs/usuario/variables/) y [Cómo hacer un escape room](/docs/usuario/escape-room/).
18. **Tesoro**: objeto escondido para una búsqueda del tesoro, con texto al encontrarlo, pista y compuerta opcional. Véase [Docencia](/docs/usuario/docencia/#búsqueda-del-tesoro).

Para colocar un hotspot: pulsa su tipo en el panel derecho y haz clic sobre el panorama. Los polígonos se dibujan clic a clic y se cierran con doble clic.

### Las etiquetas en el móvil

La etiqueta de un marcador se corta con puntos suspensivos si es muy larga.
En el visor, **pulsar una etiqueta cortada** abre su texto entero en una
burbuja que se puede desplazar. En las pantallas táctiles, donde no hay «pasar
el ratón», las etiquetas que en el ordenador salen al pasar el ratón se
muestran **siempre**, en una sola línea; por eso conviene que sean cortas. El
editor avisa cuando una etiqueta es demasiado larga para el móvil: si el texto
es largo, ponlo en un hotspot de Texto y deja en la etiqueta un título corto.

## Colaboración

- **Guardado automático** con indicador y deshacer/rehacer ilimitado por sesión.
- **Presencia**: ves quién más está editando y qué escena; el primer editor en una escena obtiene un bloqueo blando (los demás pueden editar otras escenas del mismo tour). Véase [Trabajar en equipo](/docs/usuario/equipo/).
- **Comentarios** anclados a escenas con hilos y estado resuelto/abierto. Véase [Comentarios del equipo](/docs/usuario/comentarios/).
- **Versiones**: instantáneas automáticas al publicar y manuales con nombre; diferencias a nivel de escena/hotspot y restauración.
