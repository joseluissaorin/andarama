---
title: Visita guiada en directo con Meet o Teams
description: Un guía mueve el recorrido y los asistentes lo siguen en su propio navegador; la voz va por Meet, Teams o Zoom.
---

Un **guía** controla la escena y la orientación de la vista de todos los
asistentes en tiempo real. Cada asistente ve el recorrido en su propio
navegador, a calidad completa, en lugar de un vídeo de la pantalla del guía.
Los asistentes no necesitan cuenta en Andarama.

## Crear la sala

1. Publica el recorrido (la visita en directo usa la versión publicada).
2. En el editor, pulsa el icono de emisión (**Visita guiada en vivo**) y
   **Crear sala**. Obtendrás dos enlaces con un código de sala efímero:
   - **Enlace de guía (privado)**: lleva tu clave de guía. Ábrelo tú y no lo
     compartas: quien lo tenga puede mover la vista de todos.
   - **Enlace para asistentes**: el que se reparte.
3. Todo lo que hagas en el enlace de guía (cambiar de escena, girar la vista,
   hacer zoom) se replica en los asistentes. Con `Alt + clic` marcas un
   **puntero** visible para todos. Hay **chat de texto** integrado.
4. Cada asistente puede pulsar **Explorar libremente** para soltarse y mirar
   por su cuenta, y **Seguir al guía** para volver a tu vista.

La sala es efímera: cuando el guía se va, se cierra y los asistentes ven «La
visita guiada ha terminado».

## Con Meet o Teams (o Zoom)

Andarama no transmite audio: la voz va por la videollamada de siempre. El
montaje es este:

1. Abre una reunión de **Google Meet**, **Microsoft Teams** o **Zoom** para la
   voz, como cualquier clase en línea.
2. Pega en el chat de la reunión el **enlace para asistentes**.
3. Abre tú el **enlace de guía** en otra pestaña o ventana. No hace falta
   compartir pantalla.
4. Habla por la reunión mientras mueves el recorrido: cuando cambias de escena,
   giras la vista o haces zoom, los asistentes te siguen en su propio
   navegador, con la imagen a calidad completa y sin los cortes de compartir
   pantalla.

Cada alumno puede soltarse para explorar y volver a seguirte con un botón. Con
`Alt + clic` señalas un punto que ven todos, y el chat de texto de Andarama
sirve para preguntas rápidas sin interrumpir la reunión.

:::note[Lo que no se sincroniza]
La apertura de hotspots (un texto, una imagen, un vídeo) y el audio del
recorrido no se replican: si quieres que todos lean un panel, pídeles que lo
abran. Por eso hace falta la videollamada para la voz.
:::

¿Por qué no compartir pantalla y ya? Porque así cada participante mueve su
propia vista sincronizada: mucho menos ancho de banda, imagen nítida en lugar
de un vídeo comprimido y la posibilidad de que cada uno se detenga en lo que le
interese.

## Consejos

- Prueba la sala antes con un segundo dispositivo como asistente.
- Si usas una sola pantalla, deja la reunión en una ventana pequeña y el enlace
  de guía a pantalla completa.
- Para clases, combina la visita con un
  [quiz o un escape room](/docs/usuario/escape-room/) que el alumnado haga
  después por su cuenta.

Implementación: WebSockets sobre Durable Objects en Cloudflare o el servidor
ws integrado en una instalación propia.
