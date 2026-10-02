---
title: Variables, acción y polígono
description: Cómo funcionan las variables del recorrido, el hotspot «Acción (variables)», el editor visual de condiciones y el hotspot polígono, con el ejemplo de una puerta con llave.
---

Las **variables** son la memoria del recorrido durante una visita: si se ha
cogido una llave, cuántas pistas se llevan, si es de día o de noche. El
hotspot **Acción (variables)** las cambia; las **condiciones** de cualquier
hotspot las leen para mostrarlo u ocultarlo. Con esas tres piezas se
construyen puertas que se abren al encontrar una llave, rutas que dependen de
lo que se ha hecho o un [escape room](/docs/usuario/escape-room/).

:::note[Antes se llamaba «Contador / estado»]
El hotspot **Acción (variables)** es el que antes se llamaba «Contador /
estado». Hace lo mismo; ha cambiado el nombre y ahora se configura con filas
en lugar de JSON. Los recorridos que ya lo usaban siguen funcionando igual.
:::

## Las variables

Se declaran en **Ajustes del tour**, bloque **Recorridos guiados / Variables
iniciales**, como un objeto JSON con el valor de partida de cada una:

```json
{"puerta_abierta": false, "puntos": 0, "momento": "dia"}
```

Admiten tres tipos de valor: verdadero/falso (`true`, `false`), números y
texto. Si el JSON tiene un error, el campo no se guarda. Una vez declaradas,
los campos de variable del editor las sugieren al escribir.

:::note[Qué no hacen]
- **No se ven en pantalla.** No hay un marcador de puntos visible para el
  visitante.
- **No se guardan entre visitas.** Al recargar la página, todas vuelven a su
  valor inicial.
- **No suman a la nota del quiz.** La nota sale solo de las preguntas.
:::

## El hotspot «Acción (variables)»

La acción no muestra nada por sí misma: **cambia variables cuando se pulsa** y,
si quieres, lleva a otra escena. En la paleta de **Añadir hotspot** aparece
como **Acción (variables)**; también la encuentras escribiendo «variable»,
«contador» o «condición».

En su pestaña **Contenido**, bajo **Qué cambia al pulsar**, cada fila es un
cambio con tres campos: la variable, la operación y, si hace falta, el valor.
**Añadir un cambio** crea otra fila.

| Operación | Qué hace | Ejemplo |
|---|---|---|
| **Poner a** | Pone la variable al valor que escribas | `puerta_abierta` · Poner a · `true` |
| **Sumar** | Suma el valor (1 si lo dejas vacío). Si la variable no era un número, parte de 0 | `puntos` · Sumar |
| **Restar** | Resta el valor (1 si lo dejas vacío) | `puntos` · Restar · `2` |
| **Alternar** | Cambia verdadero por falso y al revés | `momento_noche` · Alternar |

En el valor, `true` y `false` (también `verdadero` y `falso`) se guardan como
verdadero y falso, y las cifras como números; cualquier otra cosa, como texto.
Un mismo hotspot puede llevar varios cambios, que se aplican en orden.

Encima de las filas, un **resumen** dice en una línea lo que pasará, por
ejemplo «Al pulsar: llave = verdadero → ir a Pasillo». Si todavía no has
añadido nada, dice que no cambia nada.

**Después, ir a la escena** permite que, tras aplicar los cambios, el visitante
salte a otra escena: coger la llave y aparecer en el pasillo, por ejemplo. Si
en la escena hay un quiz con compuerta pendiente, el salto pasa por la
compuerta y se abre la pregunta: la acción no se salta las compuertas.

Los enlaces **¿Cómo se hace?** y **Guía de escape room** del panel llevan a
esta página y a [Cómo hacer un escape room](/docs/usuario/escape-room/).

## Las condiciones

Cualquier hotspot puede mostrarse u ocultarse según las variables desde su
pestaña **Condiciones**, bloque **Condiciones de variables**. Sin ninguna
condición, el hotspot se ve siempre.

**Añadir condición** crea una fila con tres campos:

1. **Variable**: el nombre, con las variables del recorrido como sugerencia.
2. **Operador**: `=`, `≠`, `>`, `<`, `≥`, `≤`, **es verdadera** o **es falsa**.
3. **Valor**: solo para los operadores que comparan. Se escribe igual que en la
   acción: `true` o `false` (también verdadero o falso), números o texto.

Con varias filas, el hotspot se ve solo cuando **se cumplen todas a la vez**
(entre fila y fila, el editor lo recuerda con «y además»). La papelera de cada
fila la borra.

| Operador | Se cumple si la variable… |
|---|---|
| **es verdadera** | es verdadera, un número distinto de 0 o un texto no vacío |
| **es falsa** | no existe, es falsa, 0 o texto vacío |
| `=` / `≠` | es igual / distinta al valor |
| `>` / `≥` | es mayor / mayor o igual que el valor (solo números) |
| `<` / `≤` | es menor / menor o igual que el valor (solo números) |

Los hotspots aparecen y desaparecen al momento, en cuanto cambia la variable,
sin recargar la escena. En la misma pestaña se puede condicionar también por
idioma y, en escenas de vídeo, por tramo de tiempo.

### Avanzado (JSON)

La casilla **Avanzado (JSON)** muestra las mismas condiciones como lista JSON,
que es como se guardan:

```json
[{"var": "puerta_abierta", "op": "truthy"}, {"var": "puntos", "op": "gte", "value": 3}]
```

Los operadores en JSON son `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `truthy` y
`falsy`. Si lo que escribes no se puede leer, o no cabe en filas, el editor lo
avisa y se queda en el modo avanzado hasta que lo corrijas.

## Ejemplo: una puerta con llave

1. En **Variables iniciales**: `{"llave": false}`.
2. En la sala, un hotspot **Acción (variables)** con icono de llave y el cambio
   `llave` · Poner a · `true`. En sus **Condiciones**: `llave` · **es falsa**,
   para que desaparezca al cogerla.
3. En el paso de **navegación** hacia la sala siguiente, **Condiciones**:
   `llave` · **es verdadera**. La puerta no se ve hasta tener la llave.
4. Opcional: un hotspot de **texto** en el mismo sitio que la puerta, «Está
   cerrada con llave», con la condición `llave` · **es falsa**. Así el
   visitante sabe que ahí hay algo.

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
juegos es más cómodo una acción con una variable de nombre propio.

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
esta escena** puede apuntar a un hotspot **Acción (variables)**: al pulsar el
polígono se aplican sus cambios.
:::

Más detalles de cada campo en la [referencia de widgets](/docs/referencia/widgets/).
