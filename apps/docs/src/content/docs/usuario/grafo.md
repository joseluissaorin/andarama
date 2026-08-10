---
title: El grafo de escenas
description: Conectar escenas con un editor de nodos rápido, con miniaturas, puertos y auto-orden.
---

La pestaña **Grafo** muestra el tour como un editor de nodos: cada escena es una tarjeta con su miniatura y las conexiones son curvas entre puertos. Las flechas discontinuas son las que definen los hotspots de navegación dentro de las escenas; las continuas son conexiones explícitas del grafo.

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
| Conectar dos escenas | Arrastrar desde el **puerto derecho** (violeta) de una escena hasta otra |
| Editar una conexión | Clic sobre la curva → inspector lateral (modo de entrada, eliminar) |
| Eliminar una conexión | Supr con la conexión seleccionada |
| Abrir una escena | Doble clic en el nodo |
| Menú contextual | Clic derecho en un nodo (abrir, marcar como inicio) |
| Zoom | Rueda del ratón (anclado al cursor) |
| Mover el lienzo | Alt+arrastrar, botón central o el minimapa |
| Encuadrar todo | Tecla **F** o doble clic en el vacío |
| Ordenar automáticamente | Botón de varita: coloca las escenas por niveles desde la escena de inicio |

## Detalles útiles

- El **minimapa** de la esquina es interactivo: haz clic o arrastra sobre él para moverte por un grafo grande.
- El aviso de **escenas sin conexión** de la barra superior detecta escenas inalcanzables desde el inicio; ordénalas y conéctalas para que ningún visitante se quede fuera.
- Las flechas definidas por hotspots de navegación no se editan aquí: selecciónalas y usa **Editar el hotspot** para saltar directamente a él en la pestaña Escenas.
- El **modo de entrada** de cada conexión controla la orientación al llegar: fija, relativa al origen o mirando hacia atrás.
