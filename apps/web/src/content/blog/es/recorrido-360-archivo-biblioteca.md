---
title: "Recorrido 360 para un archivo o una biblioteca: guía práctica"
description: "Visita virtual de una biblioteca o un archivo: depósitos cerrados, documentos en gigapíxel, PDF anclados, quiosco y accesibilidad. Costes y pasos."
lang: es
slug: recorrido-360-archivo-biblioteca
cluster: verticales
fecha: 2026-10-10
autor: jose-luis-saorin
faq:
  - q: "¿Para qué sirve una visita virtual de una biblioteca si la gente puede venir?"
    a: "Para enseñar lo que no se puede visitar (depósitos, cámaras de conservación, fondos reservados), para la acogida de usuarios nuevos y para la docencia: una clase de paleografía o de historia del libro puede entrar en el archivo sin moverlo."
  - q: "¿Cómo se muestra un documento con detalle?"
    a: "Como escena gigapíxel 2D: la digitalización en alta resolución se recorre con zoom tipo mapa, con anotaciones ancladas sobre el propio folio. Y los PDF completos se enlazan con un hotspot."
  - q: "¿Puede el recorrido funcionar en una pantalla del vestíbulo?"
    a: "Sí, en modo quiosco: recorre el edificio solo, cualquiera puede tomar el mando y vuelve a empezar tras un minuto sin actividad. El paquete PWA funciona sin conexión."
  - q: "¿Cumple con la accesibilidad exigida a las webs públicas?"
    a: "Andarama genera una versión accesible en texto de cada recorrido, exige texto alternativo en escenas y hotspots, respeta la preferencia de movimiento reducido y no usa cookies. La conformidad final depende también de los contenidos que se añadan."
---

Un **recorrido 360 de una biblioteca o un archivo** sirve sobre todo para enseñar lo que no se puede visitar: los depósitos, las cámaras de conservación, el fondo antiguo bajo llave, y para poner al alcance de una clase un documento que no debe salir de su caja. Se hace con fotos 360 de los espacios, digitalizaciones en alta resolución como escenas gigapíxel con anotaciones, documentos enlazados en PDF, un plano por planta y una versión accesible en texto. Esta guía cubre el planteamiento, los pasos, los costes y lo que distingue a un archivo de un museo a la hora de montarlo.

## Qué tiene de particular un archivo o una biblioteca

Comparado con la [visita virtual de un museo](/blog/visita-virtual-museo/), aquí cambian tres cosas:

- **Lo importante suele estar cerrado.** Los depósitos y las salas de conservación no reciben visitas; el recorrido 360 es la única manera de enseñarlos sin riesgo para los fondos.
- **La pieza es un documento**, no un objeto en una vitrina: un folio, un mapa, un incunable, un plano. Hay que poder leerlo con zoom, no solo verlo en la sala.
- **El público es mixto**: ciudadanía curiosa, investigadores que quieren saber qué hay antes de pedir cita, estudiantes de una asignatura, y usuarios nuevos que necesitan saber dónde está el mostrador de préstamo.

## Estructura del recorrido

Una estructura que funciona en la mayoría de los casos:

| Bloque | Escenas | Contenido |
|---|---|---|
| **Acogida** | Vestíbulo, mostrador, sala de lectura, catálogo | Horarios, cómo hacerse el carné, cómo pedir un documento; hotspots de enlace a la web y al catálogo |
| **Depósitos** | Dos o tres puntos por depósito, la cámara de conservación, el taller de restauración | Texto sobre qué se guarda, cómo se conserva (temperatura, humedad), audio de la persona responsable |
| **Piezas** | Una escena gigapíxel por documento destacado | Anotaciones sobre el propio folio, transcripción en un hotspot de texto, PDF completo enlazado |
| **Docencia** | Las escenas anteriores con quiz | Preguntas de paleografía, de historia del libro o de archivística, con nota |

En Andarama cada bloque es un **área** con su color y, si tiene plano, su planta; el visitante ve el selector de plantas en el minimapa y el menú de escenas agrupado. Las escenas gigapíxel 2D («obras, documentos, fachadas con pan/zoom tipo mapa») son un tipo de escena propio, junto al panorama 360 y al vídeo 360, según la [documentación de escenas](https://docs.andarama.com/usuario/escenas/).

## Los documentos: gigapíxel, PDF y comparador

Es la parte que más valor añade y la que menos se hace bien:

- **Escena gigapíxel**: la digitalización a la resolución que la haya hecho el servicio de reprografía (los archivos ya suelen tener ficheros enormes) se sube y el navegador la trocea en teselas; se recorre con zoom continuo. Encima se anclan hotspots de **texto** con la transcripción de un pasaje, de **etiqueta flotante** para señalar una filigrana o una firma, y de **imagen** con un detalle a otra luz.
- **PDF**: el documento completo, o la ficha catalográfica, se abre en el visor de PDF integrado, con paginación y zoom, sin salir del recorrido.
- **Comparador**: dos imágenes con deslizador para un antes y después de la restauración, o el mismo folio con luz visible y ultravioleta.
- **Audio**: la lectura en voz alta de un fragmento, o la explicación de la archivera, anclada al documento.

Un consejo de conservación: el recorrido virtual **reduce la manipulación** de los originales. Cada consulta que se resuelve mirando la digitalización es una vez menos que el documento sale de su caja. Conviene decirlo al justificar el proyecto.

## Fotografía de los espacios

Los depósitos son estrechos y con luz fluorescente; algunas recomendaciones:

- Cámara 360 de gama media en monópode; en pasillos estrechos, una foto cada cuatro o cinco metros para que la navegación no dé saltos.
- Luces encendidas y tiempo de exposición corto; las cámaras con HDR ayudan en los contrastes entre estantería y ventana.
- Nombrar las fotos por depósito y planta y renombrarlas por patrón en el [importador](https://docs.andarama.com/usuario/importador/), que además coloca cada foto sobre el plano con un clic.
- No fotografiar lo que no deba verse: signaturas de fondos reservados, datos personales en cajas, pantallas encendidas. Un parche de nadir con el logo tapa el trípode; para otras zonas, retocar antes de subir.

## Publicar: web, quiosco y campus virtual

- **Web** de la biblioteca: código de inserción (web component o iframe) en cualquier gestor de contenidos, con el [plugin de WordPress](/wordpress/) si aplica; tarjeta social con la vista de la escena inicial al compartir el enlace.
- **Vestíbulo**: el mismo recorrido en **modo quiosco** en una pantalla, encadenando los recorridos, con el mando para quien toque y vuelta al inicio tras un minuto. Para pantallas sin red, el paquete **PWA** funciona sin conexión. Está en [publicar y compartir](https://docs.andarama.com/usuario/publicar/).
- **Campus virtual**: si la biblioteca es universitaria, las escenas docentes se lanzan desde Moodle por LTI y la nota del quiz vuelve al libro de calificaciones ([guía](/blog/recorrido-360-moodle/)).
- **Enlaces profundos**: cada documento tiene su dirección (`#s=incunable-12`), de modo que la ficha del catálogo puede enlazar directamente a la escena.

## Accesibilidad y privacidad

Las webs de las administraciones públicas tienen obligaciones de accesibilidad, y aquí el 360 suele fallar. Andarama exige texto alternativo en cada escena y cada hotspot (el validador lo reclama al publicar), genera una **versión accesible en texto** del recorrido completo, mantiene el foco visible y objetivos de 44 px, y respeta `prefers-reduced-motion`. La analítica no usa cookies ni guarda direcciones IP, así que no hace falta banner. La conformidad final depende también de los contenidos que se añadan (contraste de las imágenes, transcripciones de los audios).

## Costes

El software es la partida menor: Andarama es de código abierto y se instala gratis en un servidor de la institución (Docker o una cuenta de Cloudflare) o se contrata alojado desde 2 $ al mes por un recorrido hasta el plan Excursión (500 $ al año, sin insignia y con dominio propio) o Formación (con LTI y factura). El grueso del coste es el tiempo de las personas: una jornada de fotos, dos o tres de montaje y textos, y lo que lleve la digitalización de los documentos, que a menudo ya está hecha. La [página de instituciones](/universidades/) resume las opciones de factura, SSO e instancia propia.

## Un primer recorrido en una tarde

Tres fotos (vestíbulo, sala de lectura, un depósito), un documento digitalizado como escena gigapíxel con dos anotaciones y un PDF. Con eso se enseña el proyecto a la dirección y se decide el resto. El [tutorial del primer tour](https://docs.andarama.com/tutoriales/primer-tour/) explica el flujo básico; la cuenta de prueba dura catorce días sin tarjeta y el [ejecutable de escritorio](https://docs.andarama.com/despliegue/escritorio/) permite probarlo sin subir nada a ningún sitio.
