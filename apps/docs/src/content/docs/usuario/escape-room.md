---
title: Cómo hacer un escape room
description: Paso a paso para montar un escape room en un recorrido 360 con variables, contadores, condiciones, tesoros y quiz con compuerta, con un ejemplo de tres salas.
---

Un escape room en Andarama es un recorrido en el que no se puede salir de cada
sala sin resolver algo. No hay una plantilla de escape room dentro del
producto: se construye a mano con piezas que ya existen, y con ellas sale un
juego completo.

| Pieza | Qué aporta al juego | Dónde se explica |
|---|---|---|
| **Quiz con compuerta** | No se sale de la sala sin acertar la pregunta | [Docencia](/docs/usuario/docencia/) |
| **Tesoro** | Objetos escondidos que hay que encontrar | [Docencia](/docs/usuario/docencia/) |
| **Contador/estado** | Cambia variables al pulsarlo: coger una llave, sumar un punto | [Variables, contador y polígono](/docs/usuario/variables/) |
| **Condiciones** | Un hotspot aparece o desaparece según las variables: la puerta que solo se ve con la llave | [Variables, contador y polígono](/docs/usuario/variables/) |
| **Informe y certificado** | Nota final, nota mínima y certificado en PDF | Esta página, paso 6 |

El alumnado no necesita cuenta: juega con el enlace del recorrido, embebido en
el aula virtual o desde un paquete exportado.

## El ejemplo: tres salas

Vamos a montar «La biblioteca cerrada», con tres escenas:

1. **Sala de lectura**: hay que encontrar una llave para abrir la puerta del archivo.
2. **Archivo**: hay que encontrar tres documentos escondidos y responder una pregunta sobre ellos.
3. **Salida**: una última pregunta; al acertarla, informe final y certificado.

Antes de empezar, crea las tres escenas y enlázalas en el
[lienzo del tour](/docs/usuario/grafo/) como un recorrido normal: sala de
lectura, archivo y salida. Después iremos cerrando puertas.

## Paso 1: declara las variables

En **Ajustes del tour**, bloque **Recorridos guiados / Variables iniciales**,
escribe las variables del juego con su valor de partida, en JSON:

```json
{"llave": false, "pistas": 0}
```

- `llave` dirá si el visitante ha cogido la llave.
- `pistas` es un contador numérico que usaremos en el archivo.

Si el JSON tiene un error, el campo no se guarda: revisa las comillas y las
comas. Las variables viven solo durante la visita; al recargar la página,
vuelven a estos valores.

## Paso 2: la llave (contador/estado)

En la sala de lectura, añade un hotspot **Contador / estado** donde quieras
esconder la llave (dentro de un cajón, sobre una estantería). Cámbiale el icono
por una llave en **Estilo**.

En **Contenido**, pulsa **Añadir opción** para crear una acción:

| Variable | Operación | Valor |
|---|---|---|
| `llave` | `set` | `true` |

Para que la llave desaparezca al cogerla, en su pestaña **Condiciones**, campo
**Condiciones de variables**, escribe:

```json
[{"var": "llave", "op": "falsy"}]
```

Es decir: la llave solo se ve mientras `llave` sea falsa.

## Paso 3: la puerta que solo se abre con la llave

Selecciona el paso de navegación de la sala de lectura al archivo y, en su
pestaña **Condiciones**, escribe:

```json
[{"var": "llave", "op": "truthy"}]
```

La puerta no se ve hasta que el visitante coge la llave; en ese momento aparece,
sin recargar nada. Si prefieres que la puerta esté siempre a la vista pero no
lleve a ningún sitio, pon dos hotspots en el mismo punto: uno de texto («Está
cerrada con llave») con la condición `falsy` y el de navegación con la
condición `truthy`.

## Paso 4: los documentos del archivo (tesoros y contador)

En el archivo, esconde tres hotspots **Tesoro**. Con poner uno ya hay búsqueda
del tesoro: el visor lleva la cuenta en un contador arriba y cada tesoro
muestra el texto de **Qué se lee al encontrarlo**, que es donde va el
fragmento de información que hará falta para la pregunta. Se ven como una
gema; para esconderlos de verdad, cambia el icono o quita el fondo circular en
**Estilo**.

En **Ajustes del tour › Búsqueda del tesoro** puedes darle título al juego y
escribir el **Mensaje al completar**, que el contador muestra, y deja a la
vista, al encontrar el último tesoro del recorrido. Si rellenas la **Pista** de
cada tesoro, el contador ofrece un botón **Pista** que la enseña sin revelar
dónde está el objeto; y con **Compuerta (no salir de la escena sin
encontrarlo)**, nadie sale de la sala sin haberlo encontrado.

Si además quieres contar las pistas de una sala en una variable (por ejemplo,
para que una puerta aparezca con dos de tres), usa contadores/estado con la
operación `inc` en lugar de tesoros, y en la puerta una condición numérica:

```json
[{"var": "pistas", "op": "gte", "value": 2}]
```

Cada contador que sume debería ocultarse a sí mismo al pulsarlo, igual que la
llave, para que no se pueda sumar dos veces en el mismo sitio.

## Paso 5: la pregunta con compuerta

En el archivo, añade un hotspot **Quiz** con la pregunta sobre los documentos:
enunciado, tipo (única, múltiple o verdadero/falso), opciones, feedback,
puntos e intentos (0 = ilimitados). Activa **Compuerta (no avanzar sin
acertar)**.

Con la compuerta, nadie sale de esa escena hasta acertar la pregunta: los
pasos se ven apagados y, al pulsarlos, se abre la pregunta con el aviso
«Responde correctamente para poder avanzar». Fallar no abre la compuerta
mientras queden intentos (con intentos ilimitados, hay que acertar); si los
intentos son limitados y se agotan, la compuerta se abre y la pregunta cuenta
como fallada. Si pones varias preguntas con compuerta en la misma sala, hay
que superarlas todas.
La compuerta frena cualquier salida, también la de un contador o un polígono
que lleve a otra escena.

En la sala de salida, pon la última pregunta, también con compuerta si hay
algo más allá.

## Paso 6: nota mínima, informe y certificado

En **Ajustes del tour › Cuestionarios**:

- **Puntuación mínima (%)**: por ejemplo, 50. Es el porcentaje de puntos que
  hay que sumar para aprobar.
- **Informe final**: al responder todas las preguntas del recorrido aparece un
  resumen con la puntuación y si se ha aprobado.
- **Certificado de finalización**: en ese informe, quien haya aprobado (o todo
  el mundo, si no hay nota mínima) escribe su nombre y descarga un PDF.

El informe suma todas las preguntas del recorrido, no solo las de la última
sala. Si alguna pregunta está oculta por una condición y el visitante no llega
a verla, el informe no saldrá.

## Paso 7: prueba el juego

Abre la pestaña **Previsualizar** y juega de principio a fin como lo haría el
alumnado. Comprueba que la llave desaparece al cogerla, que la puerta aparece,
que no puedes salir del archivo sin acertar y que el certificado sale con tu
nombre. En el editor las compuertas no actúan: hay que probarlo en la
previsualización o en el enlace publicado.

## Para que cuente en el aula virtual

Al terminar, el resultado de cada alumno llega a **Analítica › Resultados de
quiz**, desde donde se descarga en CSV (con su nombre si activas **Pedir el
nombre al enviar el resultado** en Ajustes del tour). Si necesitas que llegue
al libro de calificaciones de Moodle, exporta el recorrido como
[paquete SCORM](/docs/usuario/exportar/): el aula virtual registra si se ha
completado y la puntuación frente a la nota mínima. Los pasos están en
[Insertar en Moodle](/docs/usuario/moodle/).

## Límites que conviene conocer

:::caution[Lo que hoy no hace]
- **Las variables no se ven en pantalla** ni se guardan entre visitas: si el
  alumno recarga la página, empieza de cero.
- **No hay cuenta atrás** ni temporizador de juego.
- **Las condiciones y las variables se escriben en JSON.** No hay todavía un
  editor visual.
:::

Para ideas de enigmas y de cómo encajarlos en una clase, mira el artículo
[escape room educativo: ideas](https://andarama.com/blog/escape-room-educativo-ideas/).
