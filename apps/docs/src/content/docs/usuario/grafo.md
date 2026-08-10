---
title: El grafo de escenas
description: Conectar escenas con un editor de nodos rápido, con miniaturas, puertos y auto-orden.
---

La pestaña **Grafo** muestra el tour como un editor de nodos: cada escena es una tarjeta con su miniatura y cada flecha es un paso del recorrido. Las flechas discontinuas son pasos que aún están **sin colocar** en el panorama.

## Una arista es un hotspot de navegación

En el grafo no hay datos propios: cada flecha **es** el hotspot de navegación
que la produce. Lo que se dibuja aquí es exactamente lo que el visitante podrá
pulsar dentro del panorama, y al revés.

- **Arrastrar del puerto de un nodo a otro** crea el paso: aparece un hotspot de
  navegación en la escena de origen apuntando al destino. Con «Crear también la
  vuelta» marcado —lo está por defecto— se crea además el paso recíproco, que
  es lo que hace funcionar el modo de entrada «mirar atrás».
- El marcador nace en una **posición provisional** concreta, delante de la vista
  inicial y algo por debajo del horizonte, y se dibuja con línea discontinua
  mientras siga ahí. Ábrelo en el panorama y arrástralo a su sitio: entonces
  deja de estar «sin colocar».
- **Seleccionar la flecha** permite editar el hotspot sin salir del grafo:
  etiqueta, destino, modo de entrada y transición.
- **Suprimir** borra la flecha, es decir, borra el hotspot.
- **Doble clic** en un nodo abre la escena; en la flecha, la escena con ese
  marcador ya seleccionado.

Antes existía una tabla de conexiones aparte que se dibujaba aquí, no generaba
ningún marcador y cuya orientación de entrada no llegaba a leer nadie. Se
eliminó: una sola verdad.

## Traer escenas al grafo

Arrastra un panorama de la biblioteca de medios —o una carpeta entera, o una
selección— sobre el lienzo: cada uno se convierte en una escena y el nodo nace
donde lo has soltado.

## Modo Escenas y modo Autopilot

El selector de la esquina superior izquierda cambia lo que se dibuja, como en
un editor de nodos cuando se pasa de materiales a mundo:

- **Escenas**: los pasos del visitante, es decir, los hotspots de navegación.
- **Autopilot**: los recorridos guiados. Se pulsa una escena tras otra para
  encadenar el recorrido, que se dibuja numerado y en otro color, con los
  segundos de permanencia de cada parada y la opción de repetirlo en bucle.

Así nunca se confunde lo que puede pulsar un visitante con lo que hace la
visita automática.

## Reconectar en vez de rehacer

Cambiar a dónde lleva un paso no obliga a borrarlo: al seleccionar la flecha
aparecen dos agarres, uno en cada extremo, y arrastrarlos la reconecta
conservando la etiqueta, el icono, la orientación de entrada y la transición.

- Arrastrando el **extremo del destino**, el marcador se queda donde está —el
  sitio del que se sale no ha cambiado— y solo cambia a dónde lleva. Si la
  etiqueta era el nombre de la escena anterior, sigue al nuevo destino; si la
  habías escrito a mano, se respeta.
- Arrastrando el **extremo del origen**, el paso se traslada a otra escena.
  Entonces su posición ya no significa nada —era un punto del otro panorama—,
  así que se recoloca y vuelve a marcarse como «sin colocar».
- Soltar en el vacío no borra nada: para eso está el aspa roja de la flecha.
- No se admite que una escena lleve a sí misma ni duplicar un paso que ya
  existe; en ambos casos se avisa y no se toca nada.

## Avisos

El grafo señala lo que está roto, que es donde más ayuda:

- Pasos sin destino o apuntando a escenas borradas.
- Pasos **sin camino de vuelta**.
- Marcadores **sin colocar** en el panorama.
- Escenas **inalcanzables** desde la escena inicial.

## Interacciones

| Acción | Cómo |
|---|---|
| Mover un nodo | Arrastrarlo (con imán a la rejilla) |
| Mover varios | Selección con recuadro (arrastrar en el vacío) o Mayús+clic, y arrastrar |
| Conectar dos escenas | Arrastrar desde el **borde derecho** de una escena hasta otra. Vale todo el borde, no solo el punto violeta: mientras arrastras, el destino candidato se ilumina y el hilo se pega a su puerto |
| Cancelar la conexión | **Esc** durante el arrastre |
| Crear también la vuelta | Casilla de la barra superior, activada por defecto |
| Editar un paso | Clic sobre la flecha → inspector lateral (etiqueta, destino, orientación de entrada, transición) |
| **Reconectar** | Con la flecha seleccionada, arrastrar uno de sus **extremos** a otra escena. El del destino cambia a dónde lleva; el del origen mueve el paso a otra escena |
| Colocarlo en el panorama | Botón **Colocar en el panorama** del inspector, o doble clic en la flecha |
| Eliminar un paso | Supr con la flecha seleccionada (borra su hotspot) |
| Añadir escenas | Arrastrar panoramas de la biblioteca sobre el lienzo |
| Cambiar de material | Selector **Escenas / Autopilot** de la barra superior |
| Abrir una escena | Doble clic en el nodo |
| Menú contextual | Clic derecho en un nodo (abrir, marcar como inicio) |
| Zoom | Rueda del ratón (anclado al cursor) |
| Mover el lienzo | Alt+arrastrar, botón central o el minimapa |
| Encuadrar todo | Tecla **F** o doble clic en el vacío |
| Ordenar automáticamente | Botón de varita: coloca las escenas por niveles desde la escena de inicio |

## Detalles útiles

- El **minimapa** de la esquina es interactivo: haz clic o arrastra sobre él para moverte por un grafo grande.
- El contador de **avisos** de la barra superior resume lo que está roto: pasos sin destino, destinos borrados, pasos sin vuelta, marcadores sin colocar y escenas inalcanzables. Pasa el ratón por encima para verlos.
- El **modo de entrada** de cada paso controla la orientación al llegar: fija, relativa al origen o mirando hacia atrás. «Mirar hacia atrás» necesita que exista el paso de vuelta, que es justo lo que crea la casilla de la barra.
- La disposición de los nodos se guarda con el tour, así que la ves igual desde cualquier equipo.
