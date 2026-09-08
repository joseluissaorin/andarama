# Historial de cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto se versiona con [SemVer](https://semver.org/lang/es/). Mientras no haya una 1.0, el formato `tour.json` sí garantiza compatibilidad hacia atrás mediante migradores: lo exportado se sigue abriendo.

## [Sin publicar]

### Corregido tras la primera ronda de pruebas

- **El tesoro rompía el guardado y la publicación.** Ni la API ni el validador conocían el tipo «treasure»: el primer tesoro hacía fallar el guardado automático en silencio (nada de lo posterior llegaba al servidor) y publicar dejaba la versión anterior, sin los hotspots nuevos. Ahora se acepta, se ve en la vista previa y el editor avisa en rojo cuando algo no se guarda, y el diálogo de publicar lista los errores que lo impiden.
- **Los recorridos del quiosco no se parecían al tour.** El editor guardaba la permanencia como `seconds` y el visor leía `dwell`: cada parada era un salto sin pausa. Además se entraba en cada escena por su vista por defecto. Ahora se entra por el paso que une las dos escenas, con su orientación de llegada, se espera lo indicado y se mira hacia la salida antes de cruzar.
- **El quiosco ya no repite sin fin por defecto.** Se ve una vez, termina en la escena inicial y espera con «Verlo otra vez». Solo se repite si algún recorrido tiene «Repetir en bucle», que los nuevos traen apagado.
- **Las proyecciones (little planet, ojo de pez, Panini, arquitectónica) conservan los hotspots.** Cada marcador se recoloca donde el shader dibuja su dirección, en vez de esconderse. El menú explica en una línea qué es cada proyección.
- **La compuerta del quiz es una compuerta.** Al entrar en una escena con una pregunta de compuerta sin acertar, los pasos se apagan y no sacan de la escena; al pulsarlos se abre la pregunta. Antes solo actuaba después de fallar.
- **El importador de cámara ordena por nombre** (con los números como números, que es la numeración de la cámara) y permite elegir nombre o fecha, ascendente o descendente. El arrastre para reordenar se quedaba en nada: ahora la fila se suelta donde se indica y el orden pasa a manual.
- **YouTube acepta la dirección del vídeo**, no solo el ID: `youtu.be/…`, `watch?v=…`, `shorts/…` se convierten solos, y `t=90` se recoge como segundo de inicio. Lo mismo con Vimeo.
- **El polígono se ve mientras se dibuja** (vértices numerados, aristas y la línea hasta el ratón), el panel explica para qué sirve una zona y añade la acción «abrir otro hotspot de esta escena».
- **La etiqueta flotante tiene un solo texto**: el de la burbuja, que es también el que se ve al pasar el ratón. Ya no sale un «Etiqueta» de relleno al pulsar.
- **Web/iframe**: la vista previa del Studio bloqueaba por política de seguridad cualquier web externa; ahora se permite. El panel ofrece siempre «Abrir en una pestaña nueva», porque muchas webs se niegan a cargar dentro de otra.
- **El comparador de escenas** abre las dos escenas lado a lado dentro del propio panel, sincronizadas, sin cargar dos tours enteros con su cromo; funciona también en la vista previa del editor.
- El texto largo de un panel se desplaza correctamente en cualquier navegador.

### Añadido

- **Cuentas y planes con Clerk en la instancia alojada.** Con `CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` la puerta la pone Clerk (registro, contraseña, passkeys) y Clerk Billing cobra los planes Andar (2 $ al mes, 1 recorrido), Paseo (20 $ al mes, 10), Excursión (500 $ al año, 500) y De por vida (1000 $ una vez, 1000), todos con política de uso razonable. La cuota de cada organización sale del plan de quien responde de ella; el administrador puede conceder planes a mano. El plan gratuito sigue siendo instalárselo en casa: sin esas claves nada cambia. Página **Plan** en el Studio, sección de precios en la portada y migración `0007_clerk_billing`. Lo que el navegador carga por URL (miniaturas, tiles, descargas, iframes de inserción) usa una cookie de lectura de doce horas acuñada a cambio del token.
- **Renombrar el tour**: pulsando su nombre en la cabecera del editor, o desde el menú de la tarjeta en «Proyectos».
- **Código de inserción (HTML) en el hotspot Web**: el «embed» de Sketchfab, Genially, Google Maps, H5P… Si es un iframe se usa directamente; si trae scripts, se sirve como documento aparte aislado (`embed/{id}.html`, también en los paquetes exportados).
- **Texto**: barra de formato Markdown (negrita, cursiva, título, lista, enlace), vista previa en el editor ampliado, título del panel y tamaño de letra.
- **Quiz**: botón «Añadir otra pregunta» y explicación de que cada marcador es una pregunta; el formulario y el comparador de escenas también explican qué hacen y a dónde van los datos.
- Ajuste **Botón de visita automática** para quitar el «play» de abajo a la izquierda.
- **Modo de apertura en la publicación**: al publicar se elige si el enlace abre el recorrido normal o el modo quiosco, y el otro enlace queda siempre a mano con `?kiosk=1` o `?kiosk=0`. El quiosco dejó de ser cosa exclusiva del ZIP exportado: una pantalla de vestíbulo puede apuntar a la URL de siempre.
- Giro del icono de los hotspots (`style.icon.rotation`): deslizador, número y ocho ángulos de un toque. Gira el dibujo y no el fondo circular, que es lo que permite apuntar una flecha a un pasillo concreto.
- Botón de salto bajo el hotspot de navegación elegido: lleva a la escena de destino aterrizando con la orientación de esa llegada.
- Botón de copiar junto al enlace recién publicado.
- La criatura cruza el editor de vez en cuando, sin tocar nada y sin aparecer si el sistema pide menos movimiento.
- Materiales del repositorio para publicarlo como proyecto abierto: portada y tarjeta social generadas, formularios de issue, CodeQL, Dependabot y guía de contribución ampliada.

### Cambiado

- El relieve del botón principal pasa a ser la gramática visual de todo el Studio: barras con filo de luz, pestañas sobre raíl hundido, fichas y bloques con sombra corta. Los tokens viven en el sistema de diseño.
- El lienzo sin escenas explica qué hacer en vez de reutilizar el texto del tablero de proyectos.
- «Elegir panorama» enseña la foto en lugar del identificador del medio.

### Corregido

- La barra de vídeo se creaba oculta pero la hoja de estilos le daba `display: flex`: quedaba una pastilla negra vacía sobre las miniaturas en todas las escenas de foto.
- Al remontar el visor tras cada guardado, la carga en vuelo seguía hablando con un Marzipano ya destruido y salía un aviso rojo en el editor.
- Las subidas directas se firman contra el origen que las pide, de modo que subir desde `app.andarama.com` ya no choca con CORS.

## [0.1.0] Beta, agosto de 2026

Primera versión completa, desplegada en [andarama.com](https://andarama.com).

- Studio: editor de escenas con vista previa WYSIWYG, grafo del recorrido con áreas y autopilot, biblioteca de medios con previsualización 360, traducciones, analítica, comentarios y versiones.
- Diecisiete tipos de hotspot, todos accionables también dentro de las gafas.
- Visor WebGL multirresolución con vídeo 360, audio espacial, proyecciones, brújula, plano y giroscopio.
- Realidad virtual con WebXR (manos de 25 articulaciones y mandos) y modo cartón para móviles sin WebXR.
- Publicación con enlace público, incrustado, dominio propio, contraseña y caducidad; exportación a ZIP estático, HTML único, SCORM 1.2 y 2004, quiosco y PWA.
- Despliegue en Cloudflare con un comando y self-host con una imagen Docker.
- Renombrado de ULL360 a Andarama, con identidad propia.
