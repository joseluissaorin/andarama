---
title: Visitas guiadas en vivo
---

Un **guia** puede controlar la escena y la orientacion de la vista de N asistentes en tiempo real.

1. Publica el tour.
2. En el editor, pulsa el icono de emision (**Visita guiada en vivo**) y **Crear sala**: obtendras dos enlaces con codigo de sala efimero.
3. Comparte el **enlace de asistentes**; abre tu el **enlace de guia** (privado, contiene tu clave de guia).
4. Todo lo que hagas (cambiar de escena, girar la vista, hacer zoom) se replica en los asistentes. Con `Alt + clic` marcas un **puntero** visible para todos. Hay **chat de texto** integrado.
5. Los asistentes pueden **soltarse** para explorar libremente y volver a sincronizar cuando quieran.

**Audio**: la plataforma no transmite audio propio. El patron recomendado es abrir en paralelo una videollamada (Google Meet o Teams) para la voz, y compartir alli el enlace de asistentes. Asi cada participante mueve su propia vista sincronizada en lugar de ver un video del escritorio del guia (mucho menos ancho de banda y calidad perfecta).

Implementacion: WebSockets sobre Durable Objects en Cloudflare o el servidor ws integrado en self-host. Las salas son efimeras: desaparecen cuando el guia se va.
