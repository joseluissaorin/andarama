---
title: Variables, contador y polígono
description: Cómo funcionan las variables del recorrido, el hotspot contador/estado, las condiciones de visibilidad y el hotspot polígono, con el ejemplo de una puerta con llave.
---

Las **variables** son la memoria del recorrido durante una visita: si se ha
cogido una llave, cuántas pistas se llevan, si es de día o de noche. El
hotspot **contador/estado** las cambia; las **condiciones** de cualquier
hotspot las leen para mostrarlo u ocultarlo. Con esas tres piezas se
construyen puertas que se abren al encontrar una llave, rutas que dependen de
lo que se ha hecho o un [escape room](/docs/usuario/escape-room/).

## Las variables

Se declaran en **Ajustes del tour**, bloque **Recorridos guiados / Variables
iniciales**, como un objeto JSON con el valor de partida de cada una:

```json
{"puerta_abierta": false, "puntos": 0, "momento": "dia"}
```

Admiten tres tipos de valor: verdadero/falso (`true`, `false`), números y
texto. Si el JSON tiene un error, el campo no se guarda.

:::note[Qué no hacen]
- **No se ven en pantalla.** No hay un marcador de puntos visible para el
  visitante.
- **No se guardan entre visitas.** Al recargar la página, todas vuelven a su
  valor inicial.
- **No suman a la nota del quiz.** La nota sale solo de las preguntas.
:::

## El hotspot contador/estado

El contador/estado no muestra nada por sí mismo: **cambia variables cuando se
pulsa**. En su pestaña **Contenido**, **Añadir opción** crea una acción con
tres campos: la variable, la operación y, si hace falta, el valor.

| Operación | Qué hace | Ejemplo |
|---|---|---|
| `set` | Pone la variable al valor que escribas | `puerta_abierta` `set` `true` |
| `inc` | Suma 1 (si la variable no era un número, parte de 0) | `puntos` `inc` |
| `dec` | Resta 1 | `puntos` `dec` |
| `toggle` | Alterna verdadero y falso | `momento_noche` `toggle` |

En el valor de `set`, `true` y `false` se guardan como verdadero y falso, y
las cifras como números; cualquier otra cosa, como texto. Un mismo hotspot
puede llevar varias acciones, que se aplican en orden.

Además, **Escena destino** permite que, tras aplicar las acciones, el visitante
salte a otra escena: coger la llave y aparecer en el pasillo, por ejemplo. Si
en la escena hay un quiz con compuerta pendiente, el salto pasa por la
compuerta y se abre la pregunta: el contador no abre preguntas por sí mismo.

## Las condiciones

Cualquier hotspot puede mostrarse u ocultarse según las variables desde su
pestaña **Condiciones**, campo **Condiciones de variables**. Se escribe una
lista JSON; el hotspot se ve solo si se cumplen todas:

```json
[{"var": "puerta_abierta", "op": "truthy"}]
```

| Operador | Se cumple si la variable… |
|---|---|
| `truthy` | es verdadera, un número distinto de 0 o un texto no vacío |
| `falsy` | no existe, es falsa, 0 o texto vacío |
| `eq` / `ne` | es igual / distinta a `value` |
| `gt` / `gte` | es mayor / mayor o igual que `value` (solo números) |
| `lt` / `lte` | es menor / menor o igual que `value` (solo números) |

Ejemplo con valor: `[{"var": "puntos", "op": "gte", "value": 3}]`.

Los hotspots aparecen y desaparecen al momento, en cuanto cambia la variable,
sin recargar la escena. En la misma pestaña se puede condicionar también por
idioma y, en escenas de vídeo, por tramo de tiempo.

## Ejemplo: una puerta con llave

1. En **Variables iniciales**: `{"llave": false}`.
2. En la sala, un **contador/estado** con icono de llave y la acción `llave`
   `set` `true`. En sus **Condiciones**: `[{"var": "llave", "op": "falsy"}]`,
   para que desaparezca al cogerla.
3. En el paso de **navegación** hacia la sala siguiente, **Condiciones**:
   `[{"var": "llave", "op": "truthy"}]`. La puerta no se ve hasta tener la llave.
4. Opcional: un hotspot de **texto** en el mismo sitio que la puerta, «Está
   cerrada con llave», con la condición `falsy`. Así el visitante sabe que ahí
   hay algo.

Pruébalo en la pestaña **Previsualizar**, donde se juega como lo hará el
visitante. En el panorama del editor, un hotspot con condiciones puede no verse
mientras la variable tenga su valor inicial; sigue estando en la lista de
hotspots de la escena, desde donde se selecciona.

## Variables que pone el visor

El visor crea dos familias de variables por su cuenta:

- `quiz_<id>` pasa a `true` cuando se acierta la pregunta de ese quiz.
- `found_<id>` pasa a `true` cuando se encuentra ese tesoro.

Sirven para condiciones como «esta puerta aparece al acertar la pregunta». El
`<id>` es el identificador interno del hotspot, que hoy el editor no muestra:
hay que buscarlo en el `tour.json` de un paquete exportado. Para la mayoría de
juegos es más cómodo un contador/estado con una variable de nombre propio.

## El hotspot polígono

El polígono convierte una zona de la foto (una puerta, un cuadro, una pieza de
una máquina) en una **superficie pulsable con su forma exacta**, en lugar de un
punto.

- **Dibujarlo**: elige **Polígono** en la paleta, pulsa los vértices sobre el
  panorama y cierra con doble clic. Se ve mientras se dibuja. **Redibujar el
  contorno** lo rehace.
- **Estilo**: **Relleno**, **Borde**, **Opacidad (%)** y **Relleno al pasar**
  (el color cuando el ratón está encima).
- **Acción** al pulsarlo:
  - llevar a otra escena,
  - abrir una web,
  - **abrir otro hotspot de esta escena** (un texto, una imagen, un quiz),
  - o nada: solo se resalta.

El polígono admite condiciones como cualquier hotspot, así que puede aparecer
solo cuando se cumple algo.

:::note
El visor sabe cambiar variables directamente desde un polígono, pero el editor
todavía no ofrece esa acción. Mientras tanto, la acción **Abrir otro hotspot de
esta escena** puede apuntar a un contador/estado: al pulsar el polígono se
aplican las acciones de ese contador.
:::

Más detalles de cada campo en la [referencia de widgets](/docs/referencia/widgets/).
