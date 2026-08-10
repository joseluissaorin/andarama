---
title: El lienzo del tour
description: Un solo lienzo con cuatro modos —esquema, plano, mapa y autopilot— y las áreas que agrupan las escenas.
---

La pestaña **Grafo** es el lienzo del tour: cada escena es un nodo y cada flecha
es un paso del recorrido. El mismo lienzo se mira de cuatro maneras, y la barra
superior cambia de una a otra:

| Modo | Qué dibuja | Qué significa la posición del nodo |
|---|---|---|
| **Escenas** | El grafo libre, con las áreas como marcos | Solo ordena la vista |
| **Plano** | El plano de planta del área, debajo | **Es** el marcador que verá el visitante en su minimapa |
| **Mapa** | OpenStreetMap, debajo | **Es** la latitud y la longitud de la escena |
| **Autopilot** | Los recorridos guiados, numerados | La del esquema |

Antes el plano era una pestaña aparte y una misma sala se colocaba dos veces
—una en el grafo y otra en el plano— sin que ninguna supiera de la otra. Ahora
es un modo del lienzo: donde sueltas el nodo es donde estará el marcador.

## Áreas: la planta, la zona y la categoría son lo mismo

Un **área** agrupa escenas y les da nombre y color. Con eso hace tres cosas a la
vez:

- Dibuja un **marco** alrededor de sus nodos en el modo Esquema.
- Es la **categoría** con la que el visitante ve agrupado el menú de escenas.
- Si le pones un **plano**, es una **planta**: aparece en el minimapa del visor
  y en su selector de nivel.

Se gestionan en el panel del botón de capas de la barra superior:

- **Nueva área** y **Añadir zona** —una zona vive dentro de una planta, como
  «Planta 0 › Ala oeste»—.
- Nombre, color y **nivel** (−1, 0, 1…), que ordena el selector de plantas.
- **Añadir plano**: elige una imagen de la biblioteca. Al ponerlo, el lienzo
  salta al modo Plano encuadrado sobre la planta entera.
- **Calibrar**: marca dos puntos de un tramo que conozcas y escribe cuántos
  metros mide. Desde entonces el editor sabe distancias reales del plano.
- **Enfocar**: selecciona las escenas del área y encuadra el lienzo sobre ellas.

Para meter una escena en un área: arrástrala dentro del marco, elígela en su
menú contextual, o cámbiala en las propiedades de la escena. Renombrar el área
renombra la categoría de todas sus escenas de una vez.

Los tours anteriores se convierten solos la primera vez que se abre el lienzo:
cada plano pasa a ser un área con plano —conservando su identificador, así que
las escenas ya colocadas siguen en su sitio— y cada categoría suelta, un área
sin plano.

## Una arista es un hotspot de navegación

En el grafo no hay datos propios: cada flecha **es** el hotspot de navegación
que la produce. Lo que se dibuja aquí es exactamente lo que el visitante podrá
pulsar dentro del panorama, y al revés.

- **Arrastrar del puerto de un nodo a otro** crea el paso. Con «Crear también la
  vuelta» marcado —lo está por defecto— se crea además el paso recíproco, que es
  lo que hace funcionar el modo de entrada «mirar atrás».
- El marcador nace en una **posición provisional**, delante de la vista inicial y
  algo por debajo del horizonte, y se dibuja con línea discontinua mientras siga
  ahí. Ábrelo en el panorama y arrástralo a su sitio.
- La **etiqueta del paso** se ve sobre la flecha, sin tener que seleccionarla.
- Los pasos que **cruzan de área** se dibujan en ámbar: son las escaleras, los
  ascensores y las puertas de tu edificio.
- **Sentido único a propósito**: si un paso no debe tener vuelta —una salida de
  emergencia, un mirador al que se baja por otro sitio—, márcalo en el inspector
  y el aviso deja de darte la lata.
- **Suprimir** borra la flecha, es decir, borra el hotspot.

## Modo Plano

- El plano se encuadra entero al entrar.
- Las escenas que aún no están colocadas salen en una lista abajo a la
  izquierda: **arrástralas al plano** para colocarlas.
- Arrastrar un marcador **fuera** del plano lo descoloca y lo devuelve a esa
  lista.
- Con un marcador seleccionado aparece el **cono del radar**. Girándolo fijas el
  norte del panorama respecto al plano: es la orientación con la que el visitante
  verá girar el cono mientras mira alrededor.
- Los marcadores mantienen su tamaño al ampliar, como en cualquier mapa.
- La cifra ámbar de un marcador cuenta los pasos que **salen de esta planta**.
- Con varias plantas, el selector de la barra cambia de una a otra.

## Modo Mapa

El mismo gesto sobre OpenStreetMap: arrastra una escena de la lista al mapa y
queda escrita su latitud y su longitud, que es lo que usa el mapa geográfico del
visor. Si el tour aún no tiene coordenadas, el lienzo arranca con el mundo
entero; si ya las tiene, encuadra sobre ellas.

## Modo Autopilot

Se pulsa una escena tras otra para encadenar el recorrido, que se dibuja
numerado y en otro color. Las paradas se reordenan **arrastrándolas** en la
lista, con sus segundos de permanencia y la opción de repetir en bucle.

## Reconectar en vez de rehacer

Cambiar a dónde lleva un paso no obliga a borrarlo: al seleccionar la flecha
aparecen dos agarres, uno en cada extremo, y arrastrarlos la reconecta
conservando la etiqueta, el icono, la orientación de entrada y la transición.

- Arrastrando el **extremo del destino**, el marcador se queda donde está —el
  sitio del que se sale no ha cambiado— y solo cambia a dónde lleva.
- Arrastrando el **extremo del origen**, el paso se traslada a otra escena, se
  recoloca y vuelve a marcarse como «sin colocar».
- Soltar en el vacío no borra nada: para eso está el aspa roja de la flecha.

## Lo que se ve de un vistazo

Cada nodo lleva puntos de estado en su esquina: **sin panorama**, **sin texto
alternativo** —que el validador reclama al publicar—, **con marcadores sin
colocar**, **escena oculta**, **con hotspots que no son de navegación** y **con
audio**. El contador de avisos de la barra resume lo que está roto: pasos sin
destino, destinos borrados, pasos sin vuelta, marcadores sin colocar y escenas
inalcanzables; cada aviso explica qué pasa, señala dónde y ofrece el arreglo.

## Interacciones

| Acción | Cómo |
|---|---|
| Mover un nodo | Arrastrarlo, con imán a la rejilla y guías con los vecinos |
| Mover varios | Recuadro (arrastrar en el vacío) o Mayús+clic, y arrastrar |
| Quitar del recuadro | Ctrl/Cmd mientras se hace el recuadro |
| Conectar dos escenas | Arrastrar desde el **borde derecho** de una escena hasta otra |
| Cancelar la conexión | **Esc** durante el arrastre |
| **Reconectar** | Con la flecha seleccionada, arrastrar uno de sus **extremos** |
| Editar un paso | Clic sobre la flecha → inspector lateral |
| Editar varios pasos | Mayús+clic en varias flechas → transición o sentido único en bloque |
| Eliminar un paso | Supr con la flecha seleccionada |
| Renombrar una escena | **F2**, o el menú contextual |
| Duplicar o eliminar una escena | Menú contextual (clic derecho) |
| Cambiar de área | Arrastrar el nodo dentro de un marco, o el menú contextual |
| Alinear y repartir | Con dos o más nodos seleccionados, la barra de alineación |
| Buscar una escena | **Ctrl/Cmd+F**, e Intro salta a la primera |
| Encuadrar todo | **F**, o doble clic en el vacío |
| Encuadrar la selección | **.** |
| Zoom | Rueda del ratón, o **dos dedos** |
| Mover el lienzo | Alt+arrastrar, botón central, **un dedo** o el minimapa |
| Imán a la rejilla | **G** |
| Ordenar automáticamente | **L**, o el botón de varita: coloca cada área en su banda |
| Recorrer con el teclado | **Tab** entre nodos, **Intro** abre la escena |
| Conectar con el teclado | **C** desde el nodo con el foco, luego Intro en el destino |
| Mover con el teclado | Flechas (con Mayús, más fino) |
| Añadir escenas | Arrastrar panoramas de la biblioteca sobre el lienzo |

## Detalles útiles

- El **minimapa** de la esquina dibuja también las aristas y los marcos de área,
  y es interactivo.
- El **encuadre se recuerda** por proyecto y por modo: volver a entrar no te
  devuelve a la esquina.
- Debajo del lienzo hay una **tabla equivalente** para lectores de pantalla con
  cada escena, su área y los pasos que salen de ella.
- La disposición de los nodos se guarda con el tour, así que la ves igual desde
  cualquier equipo, y **deshacer** también revierte los movimientos.
