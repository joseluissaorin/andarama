---
title: "Búsqueda del tesoro virtual para el aula: cómo montarla en 360"
description: "Una búsqueda del tesoro virtual en fotos 360: objetos escondidos con contador, pistas y premio final. Cómo montarla en una hora y ocho variantes por edad."
lang: es
slug: busqueda-del-tesoro-virtual
cluster: docencia
fecha: 2026-10-02
autor: jose-luis-saorin
faq:
  - q: "¿Qué diferencia hay entre una búsqueda del tesoro y un escape room?"
    a: "La búsqueda del tesoro es abierta: se recorren las escenas libremente y se van encontrando objetos. El escape room encadena enigmas que abren salas. La primera es más sencilla de montar y funciona con los más pequeños."
  - q: "¿Cómo se esconde un objeto en una foto 360?"
    a: "Con el hotspot Tesoro: se coloca donde se quiera, se le cambia el icono por algo discreto o se le quita el fondo circular y se reduce el tamaño. El visor lleva la cuenta de los encontrados."
  - q: "¿Los alumnos pueden hacer trampas viendo la lista de hotspots?"
    a: "El visor no enseña una lista de tesoros; solo el contador. La versión accesible en texto sí lista el contenido de cada escena, así que para el juego conviene no destacarla."
  - q: "¿Se puede jugar en casa?"
    a: "Sí. Es un enlace, y el alumnado no necesita cuenta para abrir y jugar un recorrido, así que cada alumno entra desde casa con cualquier navegador."
---

Una **búsqueda del tesoro virtual** es un recorrido por fotos 360 en el que hay objetos escondidos por las escenas y el alumnado tiene que encontrarlos todos, ayudado por pistas que aparecen aquí y allá. Es la actividad inmersiva más fácil de montar (una hora con las fotos hechas), funciona desde tercero de Primaria y no necesita gafas: se juega en la pizarra, en tabletas o en el móvil. Aquí está cómo se monta con Andarama y ocho variantes según la edad y la asignatura.

## Por qué funciona

Buscar algo escondido en una imagen que se puede girar es intrínsecamente entretenido: hay que mirar arriba, detrás, dentro. Si además cada objeto lleva una pequeña explicación al encontrarlo y hay un contador visible que marca «4 de 7», la motivación se mantiene sola. A diferencia del [escape room](/blog/escape-room-digital/), no hay enigmas que bloqueen: el recorrido es abierto, y eso lo hace más apto para los pequeños y para grupos con ritmos distintos.

## Lo que hace falta

- **Fotos 360** de tres a seis espacios: el centro, el mercado, un museo (Wikimedia Commons tiene panorámicas libres), el bosque de la última excursión.
- **Una lista de objetos** que encontrar, con una pista y una explicación para cada uno.
- **Andarama** con el hotspot **Tesoro**, que es exactamente para esto: se coloca en las escenas que se quiera y el visor lleva la cuenta de los encontrados. Lo describe la [documentación de docencia](https://docs.andarama.com/usuario/docencia/).

## Montarla en seis pasos

### 1. Escenas

Crea un tour, sube las fotos y haz una escena por espacio. Conecta las escenas en el grafo con pasos de ida y vuelta para que se pueda ir y volver libremente; la orientación de llegada «seguir el camino» hace que al cambiar de escena se entre mirando hacia delante, como al caminar.

### 2. Esconde los tesoros

Añade un hotspot **Tesoro** por objeto. Por defecto se ve como una gema; para esconderlo de verdad:

- Cambia el icono por algo que encaje en la escena (una llave, una hoja, una estrella) o por uno propio en SVG.
- Quita el fondo circular en «Estilo» y reduce el tamaño.
- Colócalo en sitios que exijan mirar: arriba en una lámpara, abajo junto a una pata de mesa, detrás de la puerta.

Con tres o cuatro tesoros por escena y cinco escenas ya hay una sesión.

### 3. Pon la explicación en el propio tesoro

El objetivo no es solo encontrarlo: es aprender algo al hacerlo. Cada tesoro tiene un campo de **premio** (un texto corto en Markdown que se lee al encontrarlo) y otro de **pista**: mientras quede algún tesoro en la escena, el contador de arriba ofrece un botón «Pista» que la muestra sin revelar dónde está el objeto. Aprovecha el de premio: «Has encontrado el astrolabio. Los navegantes lo usaban para medir la altura del Sol y saber en qué latitud estaban». Si necesitas más, un hotspot de **Texto** o de **Imagen** al lado hace de ficha.

### 4. Reparte pistas

Hotspots de **Etiqueta flotante** con textos ambiguos («aquí alguien guardaba secretos» junto a un cajón), de **Audio** con un mensaje de treinta segundos, o de **Imagen** con una fotografía del objeto buscado. Las pistas cerca del objeto ayudan a los más pequeños; en Secundaria, mejor una sola pista general por escena.

### 5. El premio final

Tres maneras, y se pueden combinar:

- El **mensaje al completar** de la propia búsqueda: el aviso que el visor enseña unos segundos al encontrar el último tesoro. Es lo mínimo y pasa rápido, así que conviene acompañarlo de una de las otras dos.
- Un **quiz** final que solo se puede responder con lo aprendido en los tesoros, con el **certificado** en PDF activado en Ajustes del tour.
- Un cofre que aparece: en lugar de tesoros, se esconden hotspots de **Contador/estado** disfrazados de objeto, cada uno suma uno a una variable, y un hotspot final con **condición de visibilidad** se muestra cuando la variable llega al total. Es la mecánica del [escape room](/blog/escape-room-digital/), y pierde el contador automático, así que solo compensa con los mayores.

### 6. Prueba, publica y comparte

Previsualiza el recorrido entero, publica y comparte el enlace o el código QR. El alumnado no necesita cuenta para jugar: basta el enlace. El [plan Aula](/aula/) cuesta 42 $ al año e incluye cinco recorridos.

## Ocho variantes

| Variante | Nivel | Qué se esconde | Qué se aprende |
|---|---|---|---|
| Los animales del bosque | Primaria | Siluetas de animales en las fotos de la excursión | Fauna local, hábitats |
| El mercado | Primaria | Productos de temporada en los puestos | Alimentación, de dónde viene la comida |
| Las formas geométricas | Primaria | Triángulos, círculos y prismas en la arquitectura del centro | Geometría en el entorno |
| Los instrumentos del laboratorio | ESO | Material de laboratorio con su nombre y su uso | Nombres, funciones, seguridad |
| Las palabras del museo | ESO (Lengua) | Palabras clave escondidas en las salas; al encontrarlas todas se forma una frase | Vocabulario, comprensión |
| Le trésor de la classe | ESO (Francés) | Objetos cuya pista está solo en francés | Comprensión oral y escrita |
| Las partes de la catedral | Bachillerato (Arte) | Elementos arquitectónicos en panorámicas libres de la catedral | Vocabulario técnico del arte |
| Los cinco riesgos | FP y empresa | Situaciones peligrosas en la nave o el taller | Prevención de riesgos; formato usado en [formación](/formacion/) |

La variante de idiomas tiene un aliado en Andarama: cada escena y cada hotspot se traducen, así que la misma búsqueda puede tener versión en dos lenguas con el selector de idioma en el visor.

## Consejos que salen de jugar

- **El contador a la vista.** Es lo que sostiene la actividad. Di al principio cuántos tesoros hay en total.
- **Ni muy fácil ni imposible.** Un tesoro que nadie encuentra en cinco minutos frustra; ajusta el tamaño y la pista después de la primera prueba.
- **Grupos pequeños y un dispositivo por grupo.** Uno gira, otro busca, otro apunta lo aprendido.
- **Un cierre en común.** Los últimos diez minutos, en la pizarra: cada grupo explica un tesoro.
- **Guárdala para el año que viene.** El recorrido queda hecho; solo hay que cambiar los objetos o añadir escenas.

## Con gafas de cartón

Es la actividad ideal para probar unas gafas de cartón: se busca mirando alrededor, y el visor acciona los tesoros con la mirada (un anillo que se completa al sostener la vista). No hace falta más equipamiento; sobre cuándo merecen la pena unas gafas de verdad hemos escrito [realidad virtual en educación sin comprar gafas](/blog/realidad-virtual-educacion/).

## Empezar hoy

Con tres fotos y seis tesoros ya se juega. La cuenta de prueba dura catorce días sin tarjeta; el programa es de código abierto y también se instala en un ordenador del centro. El [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) explica el flujo básico en un cuarto de hora.
