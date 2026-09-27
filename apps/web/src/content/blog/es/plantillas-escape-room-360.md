---
title: "Plantillas de escape room 360 para clase: cuatro guiones listos para montar"
description: "Cuatro plantillas de escape room 360 para clase (Historia, Ciencias, Lengua e Inglés) con salas, objetos y enigmas, y cómo montarlas en 20-30 minutos."
lang: es
slug: plantillas-escape-room-360
cluster: docencia
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "¿Estas plantillas se clonan dentro de Andarama?"
    a: "No. Son plantillas de diseño: el guion, las salas, los objetos y los enigmas. El montaje en el Studio se hace a mano con quiz, variables, condiciones y tesoros, y con las fotos listas lleva entre veinte y treinta minutos."
  - q: "¿El alumnado ve cuántas llaves lleva?"
    a: "Las variables no se muestran en pantalla: el progreso se nota porque aparecen puertas y objetos nuevos. Lo que sí se ve es el contador de tesoros encontrados. Si recargan la página, las variables vuelven a su valor inicial."
  - q: "¿Puedo poner dos preguntas que bloqueen la misma sala?"
    a: "Sí. Si una sala tiene varias preguntas con compuerta, hay que acertarlas todas para salir; fallar o agotar los intentos no abre la puerta. Para no alargar la sesión, dos por sala suelen bastar."
  - q: "¿Qué obtiene el alumnado al terminar?"
    a: "Un informe final con los aciertos y la puntuación, comparada con la nota mínima que hayas fijado, y, si lo activas, un certificado de finalización en PDF con su nombre."
---

Una buena **plantilla de escape room 360** no es un fichero que se descarga: es un guion bien pensado, con salas, objetos escondidos y enigmas que exigen lo que se está estudiando. Con el guion claro, montarlo sobre fotos 360 lleva entre veinte y treinta minutos. Aquí tienes cuatro plantillas para clase (Historia, Ciencias, Lengua e Inglés) y, después, los pasos exactos para construirlas en el Studio de Andarama. Un aviso desde el principio: Andarama no trae hoy estas plantillas cargadas para clonar con un botón. Las piezas sí están todas, y el montaje es rápido.

> **Prueba el Aula: 42 $ al año, 14 días gratis sin tarjeta.** [Monta tu primer escape room 360](https://app.andarama.com/register?plan=aula).

Si nunca has hecho uno, empieza por la guía general de [escape room digital para clase](/blog/escape-room-digital/), que explica el diseño (tiempo, grupos, pistas de rescate). Y si buscas un formato más corto, con candados en fila y sin salas, mira el [breakout educativo digital](/blog/breakout-educativo-digital/).

## Plantilla 1. Historia: el archivo del monasterio

**Relato.** Un incendio amenaza el archivo de un monasterio medieval. El grupo tiene que rescatar el privilegio real antes de que llegue el fuego.

**Salas (fotos).** El claustro, la sala capitular, el scriptorium y el archivo. Sirven panoramas libres de Wikimedia Commons de cualquier monasterio.

**Objetos.** Tres sellos de cera escondidos como tesoros por las salas, una llave del archivo en el scriptorium (hotspot contador/estado) y un pergamino con la cronología incompleta (hotspot de imagen).

**Enigmas.**
- En la sala capitular, ordenar cuatro hechos de la Reconquista: quiz con compuerta.
- En el scriptorium, reconocer una letra gótica frente a una carolina en dos imágenes: quiz.
- En el archivo, la cerradura final: ¿en qué año se firmó el privilegio? Cada sello, al encontrarlo, muestra una cifra de la fecha.

## Plantilla 2. Ciencias: el laboratorio contaminado

**Relato.** Una muestra se ha escapado en el laboratorio del centro. Para desactivar la alarma hay que identificar la sustancia.

**Salas.** El pasillo, el laboratorio, el almacén de reactivos y el despacho de la jefa de departamento. Son fotos que puedes hacer tú con una cámara 360 en una hora.

**Objetos.** Unas gafas de seguridad (sin ellas no se entra en el almacén: variable `gafas`), tres fichas de datos de seguridad escondidas como tesoros y un vídeo de una reacción proyectado en la pared.

**Enigmas.**
- Leer los pictogramas de peligro de un frasco: quiz.
- Calcular la concentración de una disolución con los datos de la pizarra: quiz con compuerta.
- Deducir la sustancia a partir del vídeo y las fichas: cerradura final.

## Plantilla 3. Lengua: la casa del poeta

**Relato.** Alguien ha robado el último poema inédito de un autor. Está escondido en su casa natal, y la combinación de la caja fuerte está cifrada en figuras literarias.

**Salas.** El zaguán, la biblioteca, el dormitorio y el jardín. Muchas casas museo tienen visita virtual o panoramas libres; también sirve cualquier casa antigua.

**Objetos.** Tres versos sueltos como tesoros, un audio con el poeta recitando (hotspot de audio) y la llave del dormitorio en la biblioteca (variable `llave`).

**Enigmas.**
- Identificar la metáfora, la anáfora y el hipérbaton en tres versos: tres quiz.
- Medir un endecasílabo y decir dónde carga el acento: quiz con compuerta.
- Ordenar los versos para reconstruir la estrofa: cerradura final.

## Plantilla 4. Inglés: lost in London

**Relato.** Un estudiante de intercambio ha perdido el pasaporte en Londres. El grupo sigue su rastro por la ciudad antes de que salga su vuelo.

**Salas.** Una estación de metro, un museo, un mercado y una cafetería. Hay muchos panoramas libres de Londres en Wikimedia Commons.

**Objetos.** Un billete de metro, un tique de la cafetería y una nota del museo como tesoros; un mensaje de voz del estudiante (audio) y una contraseña que da el camarero (variable `password`).

**Enigmas.**
- Entender un anuncio de megafonía y decir a qué andén ir: quiz con compuerta.
- Completar un diálogo en el mercado con el tiempo verbal correcto: quiz.
- Leer la nota del museo y deducir dónde dejó el pasaporte: cerradura final.

## Cómo montar cualquiera de las cuatro en el Studio

### 1. Escenas y pasos

Crea un tour, sube una foto por sala y conecta las escenas en el grafo. Las salas que empiezan cerradas llevarán una puerta condicionada, así que de momento deja solo los pasos libres.

### 2. Las variables, en Ajustes del tour

En **Ajustes del tour**, en **Variables iniciales**, escribe las variables del juego con su valor de partida en JSON, por ejemplo `{"llave": false}` o `{"llave": false, "gafas": false}`.

### 3. El objeto que cambia la variable

Coloca un hotspot **Contador / estado** donde esté el objeto (la llave en el escritorio, las gafas en el perchero). Añade una acción: `set` pone la variable a un valor (`llave` a verdadero), `inc` y `dec` suman o restan (útil para contar piezas) y `toggle` alterna entre verdadero y falso. Si quieres, el mismo hotspot puede llevar a otra escena al pulsarlo.

### 4. La puerta condicionada

Pon el hotspot de navegación hacia la sala cerrada y, en su pestaña **Condiciones**, escribe cuándo debe aparecer: `[{"var":"llave","op":"truthy"}]`. Hay más operadores: `eq` y `ne` comparan con un valor, `gt`, `gte`, `lt` y `lte` sirven para números (por ejemplo, que aparezca cuando `piezas` sea mayor o igual que 3) y `falsy` hace lo contrario de `truthy`. Truco: pon al objeto la condición `falsy` sobre su propia variable y desaparecerá al cogerlo.

### 5. Los objetos escondidos

Los sellos, fichas o versos son hotspots de **Tesoro**. El visor lleva la cuenta de los encontrados y la muestra arriba, y cada tesoro puede llevar un texto que se lee al encontrarlo: ahí va el fragmento de la solución (una cifra, un verso, un dato). Para esconderlos de verdad, cambia el icono por uno discreto, quita el fondo circular y hazlos pequeños, pero pulsables con el dedo en una tableta.

### 6. El quiz que no deja salir

Cada candado es un hotspot de **Quiz** con **Compuerta** activada: mientras no se acierte, los pasos a otras escenas se ven apagados y, al pulsarlos, se abre la pregunta. Solo se sale acertando: fallar o agotar los intentos no abre la compuerta, y si hay varias preguntas con compuerta en la sala, hay que acertarlas todas. Usa la retroalimentación para dar una pista cuando se falla.

### 7. Nota, informe y certificado

En **Ajustes del tour** fija la **Puntuación mínima**, activa el **Informe final** y, si quieres, el **Certificado de finalización**. Al terminar, cada grupo ve sus aciertos y, si supera la nota, descarga un PDF con su nombre; el resultado llega además a la analítica del recorrido, desde donde lo descargas en CSV (con el nombre del grupo si activas «Pedir el nombre al enviar el resultado»). Todo el detalle está en la [guía de escape room de la documentación](https://docs.andarama.com/usuario/escape-room/) y en la de [variables y condiciones](https://docs.andarama.com/usuario/variables/).

## Lo que conviene saber antes de clase

- **Las variables no se ven.** El alumnado no ve un marcador de «llaves: 1»; nota el progreso porque aparecen puertas y objetos nuevos. Cuéntalo en el relato («cuando tengáis la llave, buscad la puerta»).
- **No se guardan entre visitas.** Si alguien recarga la página, las variables vuelven a su valor inicial. Pide que no cierren la pestaña hasta el final.
- **Aprovecha las pistas de los tesoros.** Si rellenas la pista de cada tesoro, el contador de arriba ofrece un botón «Pista» que la muestra sin revelar dónde está el objeto. Y con la compuerta del tesoro, nadie sale de la sala sin haberlo encontrado.
- **Pruébalo entero** en la pestaña Previsualizar antes de clase, y pásaselo a alguien que no sepa las soluciones.

El alumnado no necesita cuenta: basta el enlace o el código QR. Si te gusta la mecánica de buscar objetos sin candados, mira también la [búsqueda del tesoro virtual](/blog/busqueda-del-tesoro-virtual/), y para todo lo que incluye el plan docente, la página del [plan Aula](/aula/).

> **Prueba el Aula: 42 $ al año, 14 días gratis sin tarjeta.** [Monta estas plantillas de escape room 360](https://app.andarama.com/register?plan=aula).
