---
title: Visitas guiadas en vivo
---

Un **guía** puede controlar la escena y la orientación de la vista de N asistentes en tiempo real.

1. Publica el tour.
2. En el editor, pulsa el icono de emisión (**Visita guiada en vivo**) y **Crear sala**: obtendrás dos enlaces con código de sala efímero.
3. Comparte el **enlace de asistentes**; abre tú el **enlace de guía** (privado, contiene tu clave de guía).
4. Todo lo que hagas (cambiar de escena, girar la vista, hacer zoom) se replica en los asistentes. Con `Alt + clic` marcas un **puntero** visible para todos. Hay **chat de texto** integrado.
5. Los asistentes pueden **soltarse** para explorar libremente y volver a sincronizar cuando quieran.

**Audio**: la plataforma no transmite audio propio. El patrón recomendado es abrir en paralelo una videollamada (Google Meet o Teams) para la voz, y compartir allí el enlace de asistentes. Así cada participante mueve su propia vista sincronizada en lugar de ver un video del escritorio del guía (mucho menos ancho de banda y calidad perfecta).

Implementación: WebSockets sobre Durable Objects en Cloudflare o el servidor ws integrado en self-host. Las salas son efímeras: desaparecen cuando el guía se va.
