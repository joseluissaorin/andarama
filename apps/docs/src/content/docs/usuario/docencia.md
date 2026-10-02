---
title: "Docencia: quiz, SCORM y LTI"
description: Quiz con nota mínima, informe y certificado, búsqueda del tesoro, variables, y cómo llevar la nota al aula virtual.
---

Andarama sirve para convertir un recorrido en una actividad: preguntas con
nota, objetos que encontrar, puertas que se abren al resolver algo. El
alumnado no necesita cuenta: juega con el enlace, embebido en el aula virtual
o desde un paquete exportado.

## Quiz

- Cada hotspot de **quiz** lleva **una o varias preguntas**: enunciado, tipo
  (única, múltiple o verdadero/falso), opciones, feedback y puntos de cada
  una, más los intentos (0 = ilimitados) del marcador. El botón **Añadir
  pregunta** suma otra al mismo marcador; cada pregunta se puede plegar,
  duplicar, subir, bajar o eliminar. El visitante las responde de una en una
  («Pregunta 2 de 5») y al final ve cuántas ha acertado. También se pueden
  repartir marcadores por la escena o el recorrido: el informe final suma
  todas las preguntas.
- La **compuerta** (**Compuerta (no avanzar sin acertar)**) retiene al
  visitante en la escena hasta que supera el quiz del marcador: acertar todas
  sus preguntas o, si se ha puesto una **Nota mínima (%)**, llegar a ese
  porcentaje de sus puntos. Los pasos se ven apagados y, al pulsarlos, se abre
  el quiz con el aviso «Responde correctamente para poder avanzar». Fallar no
  abre la compuerta mientras queden intentos; con intentos limitados, agotarlos
  en todas las preguntas del marcador sí deja salir, aunque cuentan como
  falladas en la nota. Si hay varios marcadores con compuerta en la misma
  escena, hay que superarlos todos.
- En **Ajustes del tour › Cuestionarios**:
  - **Puntuación mínima (%)** para aprobar.
  - **Informe final**: al responder todas las preguntas del recorrido, un
    resumen con la puntuación y si se ha aprobado.
  - **Certificado de finalización**: en el informe, quien aprueba escribe su
    nombre y descarga un PDF.
  - **Pedir el nombre al enviar el resultado**: antes de enviarlo, el visor
    pide el nombre del alumno.

Al responder todas las preguntas del recorrido publicado, el resultado de cada
visitante (puntuación, si aprueba y, si se ha pedido, su nombre) llega al
servidor y se descarga como CSV desde **Analítica › Resultados de quiz**. No
hay código de clase ni agrupación por grupos: cada envío es una fila. Los
paquetes exportados no envían nada. Para tener la nota en el libro de
calificaciones del aula virtual, usa el
[paquete SCORM](#scorm-la-nota-en-el-aula-virtual).

## Búsqueda del tesoro

Se coloca el hotspot **Tesoro** en las escenas que se quiera y el visor lleva
la cuenta de los encontrados. Cada tesoro puede mostrar un texto al
encontrarlo, y en **Ajustes del tour › Búsqueda del tesoro** se escribe el
título del juego y el mensaje al completarlo. Se ve como una gema; para
esconderlo de verdad se cambia el icono o se quita el fondo circular en
«Estilo».

Cada tesoro puede llevar una **Pista**. Mientras quede algún tesoro por
encontrar en la escena, el contador de arriba ofrece un botón **Pista** que
muestra la del siguiente tesoro pendiente, sin revelar dónde está. Al
encontrarlos todos, el contador lo dice con el mensaje final del juego y se
queda a la vista.

Un tesoro también puede llevar **Compuerta (no salir de la escena sin
encontrarlo)**: nadie sale de la escena hasta encontrarlo y, al intentarlo, se
muestra su pista. Los formularios tienen la misma opción.

## Variables y escape room

Los hotspots de **contador/estado** cambian variables del recorrido, y las
**condiciones** de cualquier hotspot las leen: puertas que se abren al
encontrar una llave, rutas que dependen de lo que se ha hecho, cambio de día a
noche. Con eso, los tesoros y el quiz con compuerta se construye un escape
room completo.

- [Variables, contador y polígono](/docs/usuario/variables/): cómo funcionan,
  con el ejemplo de la puerta con llave.
- [Cómo hacer un escape room](/docs/usuario/escape-room/): paso a paso, con un
  ejemplo de tres salas.

Las narraciones de una escena también pueden **bloquear la navegación** hasta
terminar (útil en prácticas guiadas).

## SCORM: la nota en el aula virtual

Para que la nota llegue a Moodle o a cualquier plataforma compatible, exporta
el recorrido como **paquete SCORM 1.2 o 2004 (3.ª edición)**. El paquete
reporta:

- `completion_status` al visitar todas las escenas o responder todas las
  preguntas.
- `score.raw`, `score.min` y `score.max`, y `success_status` según la
  puntuación mínima configurada.

En andarama.com, el paquete SCORM es del plan Formación; en una instalación
propia está siempre disponible. No funciona combinado con «HTML único». Las
opciones de exportación están en [Exportar](/docs/usuario/exportar/), y los
pasos en Moodle en [Insertar en Moodle](/docs/usuario/moodle/).

## LTI 1.3

Andarama es una herramienta LTI 1.3 Advantage con **Deep Linking** (el docente
elige el recorrido desde Moodle) y **Assignment and Grade Services** (la nota
del quiz vuelve sola al libro de calificaciones). El recorrido no se copia en
Moodle: al republicarlo, el curso ve la versión nueva. Está comprobado de punta
a punta con Moodle 4.5 LTS.

La configuración la hace el **administrador de la organización** en **Ajustes de la organización → LTI: Moodle y otros LMS** (en andarama.com
hace falta un plan que incluya LTI, como Formación); el operador de la
instancia también puede dar de alta plataformas desde **Administración → LTI**.
Cada plataforma pertenece a una organización: el selector de Deep Linking solo
ofrece sus recorridos publicados, y se rechazan los lanzamientos con un
`deployment_id` distinto del registrado. Los pasos completos están en
[Insertar en Moodle](/docs/usuario/moodle/#5-lti-13).

## Sin nota: enlace o iframe

Para una salida virtual sin evaluación basta con pegar el enlace o el código de
embebido en una página del curso: véase [Embeber un tour](/docs/usuario/embeber/).
Y para una clase en directo, el profesor puede guiar al grupo por el recorrido
con una [visita guiada con Meet o Teams](/docs/usuario/en-vivo/).
