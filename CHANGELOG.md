# Historial de cambios

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto se versiona con [SemVer](https://semver.org/lang/es/). Mientras no haya una 1.0, el formato `tour.json` sí garantiza compatibilidad hacia atrás mediante migradores: lo exportado se sigue abriendo.

## [Sin publicar]

### Añadido

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
