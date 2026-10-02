---
title: Preguntas frecuentes del profesorado
description: Respuestas cortas a lo que más pregunta el profesorado sobre comentarios, visitas guiadas, exportación, Moodle, la insignia, los hotspots de acción y polígono, y qué ofrece Andarama para el aula.
---

Respuestas cortas, con un enlace a la guía completa de cada tema.

## ¿Para qué sirven los comentarios?

Son **notas internas del equipo** que edita el recorrido: «falta el texto
alternativo de la sala 3», «¿cambiamos esta foto?». Se escriben en la pestaña
**Comentarios** del editor y:

- se asocian al recorrido entero o a una **escena concreta**, y al pulsar el
  nombre de la escena el editor te lleva a ella;
- admiten **respuestas en hilo**;
- se marcan como **resueltos** cuando se ha corregido lo que pedían (y se
  pueden reabrir);
- **no los ve nunca el visitante**: no salen en el recorrido publicado ni en
  los paquetes exportados;
- **no envían correos**: conviene mirar la pestaña al abrir el proyecto.

No sirven para que el alumnado comente el recorrido. Más en
[Comentarios del equipo](/docs/usuario/comentarios/).

## ¿Qué diferencia hay entre la visita guiada y compartir pantalla?

Al compartir pantalla, el alumnado ve un vídeo comprimido de tu pantalla. En la
**visita guiada en vivo**, cada alumno abre el recorrido en su propio
navegador, a calidad completa, y su vista **sigue la tuya**: cambias de escena,
giras, haces zoom o abres un panel, y lo mismo pasa en su pantalla. Gasta mucho
menos ancho de banda, la imagen es nítida y cada alumno puede soltarse para
explorar y volver a seguirte con un botón.

Lo que no hace es transmitir la voz: la voz va por Meet, Teams o Zoom, como en
cualquier clase en línea, y en esa reunión pegas el enlace de asistentes. El
alumnado no necesita cuenta. Paso a paso en
[Visita guiada con Meet o Teams](/docs/usuario/en-vivo/).

## ¿Qué hace cada opción de exportar?

El diálogo **Exportar** genera en tu navegador un paquete que funciona sin
Andarama detrás. Lo que significa cada opción:

| Opción | Qué hace |
|---|---|
| **Paquete estándar (ZIP)** | El recorrido entero para subirlo a cualquier alojamiento web. Hay que servirlo desde un servidor: con doble clic no funciona |
| **Incluir descargas (PDF, imágenes)** | Muestra el botón de descarga en los hotspots de imagen y PDF. Desactivarlo solo oculta el botón: los ficheros siguen dentro y el paquete pesa lo mismo |
| **HTML único** | Un solo `index.html` que se abre con doble clic: para mandarlo por correo o dejarlo en una memoria USB. Funciona bien por debajo de unos 100 MB, que suelen ser entre 10 y 15 panoramas sin vídeo. No está disponible si alguna escena está teselada (fotos muy grandes) |
| **Service worker offline (PWA / kiosco)** | El recorrido sigue funcionando sin conexión después de abrirlo una vez, y se puede instalar como aplicación. Necesita HTTPS y no se combina con el HTML único |
| **Endpoint de analítica propio** | Solo si tu centro tiene un servidor que recoja estadísticas. Vacío, el paquete no envía datos a nadie. Casi todo el profesorado debe dejarlo vacío |
| **Paquete SCORM** | Para subirlo a Moodle como actividad SCORM: registra si se ha completado y la nota. Se puede combinar con el HTML único. En andarama.com, del plan Formación |
| **Modo kiosco** | Para una pantalla en un vestíbulo: encadena los recorridos guiados (autopilot) y vuelve a la escena inicial cuando nadie lo toca |

El propio diálogo lo resume en **¿Qué opción elijo?**: servidor propio, ZIP
estándar; un solo fichero para enviar, HTML único; Moodle con nota, SCORM o LTI
1.3. Todo en [Exportar](/docs/usuario/exportar/).

## Para Moodle, ¿iframe, web component, LTI o SCORM?

Depende de una pregunta: **¿necesitas la nota en el libro de calificaciones?**

| Opción | Nota en Moodle | Se actualiza al republicar | Cuándo |
|---|---|---|---|
| **Código de embebido (iframe)** | No | Sí | Para verlo dentro de una página del curso. Lo puede pegar cualquier docente |
| **Web component** | No | Sí | Hace lo mismo que el iframe con una etiqueta más corta, pero necesita poder añadir un `<script>`, que Moodle casi nunca permite. En Moodle, mejor el iframe |
| **LTI 1.3** | Sí | Sí | La nota vuelve sola al libro de calificaciones. La administración de Moodle lo configura una vez; en andarama.com, con el plan Formación |
| **Paquete SCORM** | Sí | No: hay que volver a subirlo | La nota sin configurar nada en el sitio. En andarama.com, con el plan Formación |

En resumen: **para verlo, iframe; para la nota, LTI 1.3** si tu Moodle lo
permite, y si no, **SCORM**. El diálogo **Compartir** del editor enlaza la guía
paso a paso: [Insertar en Moodle](/docs/usuario/moodle/).

## ¿Por qué mi recorrido lleva «Hecho con Andarama»?

La insignia depende del **plan con el que se publica**: la llevan los
recorridos publicados en andarama.com con la prueba gratuita y con los planes
Andar, Aula y Paseo; no la llevan Excursión, Formación y De por vida, ni los
paquetes exportados, ni las instalaciones propias.

Se decide **en el momento de publicar**. Si cambias de plan, **vuelve a
publicar** el recorrido para que aparezca o desaparezca; por eso dos recorridos
publicados en momentos distintos pueden llevarla uno sí y otro no.

Su texto se puede cambiar en **Ajustes del tour › Componentes de interfaz ›
Texto de la insignia** (el enlace sigue llevando a andarama.com). Más en
[La insignia](/docs/usuario/insignia/).

## ¿Qué es el hotspot «Acción (variables)»?

Es el que antes se llamaba «Contador / estado». No se ve nada al pulsarlo:
**cambia variables del recorrido** (poner a un valor, sumar, restar, alternar
verdadero y falso) y, si quieres, lleva a otra escena. Las **condiciones** de
cualquier otro hotspot leen esas variables para mostrarlo u ocultarlo. Así se
hace una llave que, al cogerla, hace aparecer la puerta del siguiente aula.

Las variables se declaran en **Ajustes del tour**; las acciones y las
condiciones se configuran con filas, sin escribir JSON. Más en
[Variables, acción y polígono](/docs/usuario/variables/).

## ¿Y el hotspot polígono?

Convierte una **zona de la foto con su forma exacta** (una puerta, un cuadro,
una pieza de una máquina) en algo que se puede pulsar, en lugar de un punto. Se
dibuja vértice a vértice sobre el panorama y, al pulsarlo, lleva a otra
escena, abre una web, abre otro hotspot de la escena (un texto, un quiz) o
solo se resalta. Es útil para que el alumnado señale una parte concreta de lo
que ve. Más en
[Variables, acción y polígono](/docs/usuario/variables/#el-hotspot-polígono).

## ¿Qué ofrece Andarama para el aula?

Un mapa de lo que hay, todo en todos los planes salvo donde se indica:

| Quiero… | Pieza | Guía |
|---|---|---|
| Empezar con algo hecho | Plantillas del grupo **Educación**: escape room, quiz evaluable y búsqueda del tesoro | [Docencia](/docs/usuario/docencia/#empezar-con-una-plantilla) |
| Preguntas con nota | Hotspot **Quiz**, puntuación mínima, informe final y certificado en PDF | [Docencia](/docs/usuario/docencia/#quiz) |
| Que no avancen sin entender algo | **Compuerta** en preguntas, tesoros y formularios; narración que bloquea la navegación | [Docencia](/docs/usuario/docencia/) |
| Buscar objetos | Hotspot **Tesoro**, con pista y contador | [Docencia](/docs/usuario/docencia/#búsqueda-del-tesoro) |
| Un juego con llaves y puertas | **Acción (variables)** y **condiciones** | [Cómo hacer un escape room](/docs/usuario/escape-room/) |
| Ver los resultados | **Analítica › Resultados de quiz**, descargable en CSV | [Docencia](/docs/usuario/docencia/#quiz) |
| La nota en Moodle | **LTI 1.3** o **SCORM** (en andarama.com, plan Formación) | [Insertar en Moodle](/docs/usuario/moodle/) |
| Dar clase en directo | **Visita guiada en vivo** con Meet, Teams o Zoom | [Visita guiada](/docs/usuario/en-vivo/) |
| Situarse en el edificio | **Plano del recorrido** con puntos y radar | [Plano del recorrido](/docs/usuario/plano/) |
| Usar gafas o un visor de cartón | **Realidad virtual**, con mirada en el modo cartón | [Realidad virtual](/docs/usuario/realidad-virtual/) |
| Trabajar con otros docentes | **Equipo**, **Personas** y **comentarios** | [Trabajar en equipo](/docs/usuario/equipo/) |
| Alumnado con lector de pantalla | Texto alternativo en cada escena y **versión accesible** en texto | [Escenas y hotspots](/docs/usuario/escenas/) |

El alumnado no necesita cuenta en ningún caso: entra con el enlace, desde el
aula virtual o desde un paquete exportado.
