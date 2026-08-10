---
title: El grafo de escenas
description: Conectar escenas con un editor de nodos rápido, con miniaturas, puertos y auto-orden.
---

La pestaña **Grafo** muestra el tour como un editor de nodos: cada escena es una tarjeta con su miniatura y las conexiones son curvas entre puertos. Las flechas discontinuas son las que definen los hotspots de navegación dentro de las escenas; las continuas son conexiones explícitas del grafo.

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
