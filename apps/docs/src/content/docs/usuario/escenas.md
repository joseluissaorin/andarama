---
title: Escenas y hotspots
---

## Escenas

Cada escena tiene: titulo, **texto alternativo obligatorio** (accesibilidad), descripcion, categoria (para agrupar en el menu), vista inicial ("usar vista actual"), limites de vista opcionales (esencial en panoramas parciales), audio (ambiente, narracion con bloqueo opcional, fuentes espaciales) y posicion en plano o coordenadas GPS.

Tipos de escena: **Panorama 360** (imagen), **Video 360** y **Gigapixel 2D** (obras, documentos, fachadas con pan/zoom tipo mapa).

## El grafo

La pestana **Grafo** muestra las escenas como nodos y las conexiones como aristas (las derivadas de hotspots de navegacion aparecen discontinuas). Puedes arrastrar nodos, crear conexiones arrastrando desde el asa de un nodo a otro, y ver de un vistazo las **escenas huerfanas** (no alcanzables desde la escena inicial). El minimapa ayuda con tours grandes.

Cada conexion define su **orientacion de entrada**:

- **Fija**: yaw/pitch/FOV concretos.
- **Relativa**: mantiene el rumbo que llevaba el usuario.
- **Mirar hacia atras**: entra orientado hacia la escena de origen (continuidad espacial).

## Los 17 tipos de hotspot

Todos comparten posicion, etiqueta, texto alternativo, icono (biblioteca SVG o propio), estilo (tamano, color, pulso, escala con zoom) y **condiciones de visibilidad** (por idioma, por variables de estado, por rango temporal en escenas de video).

1. **Navegacion**: salto a otra escena; variante flecha de suelo.
2. **Texto**: panel Markdown (titulos, listas, enlaces, tablas).
3. **Imagen**: lightbox con zoom profundo y descarga opcional.
4. **Galeria**: carrusel con titulos y descripciones.
5. **Video (fichero)**: lightbox o pantalla proyectada sobre la escena.
6. **YouTube/Vimeo/PeerTube**: embed sin cookies por defecto.
7. **Audio**: reproductor o fuente espacial anclada.
8. **PDF**: visor integrado con paginacion y zoom.
9. **Modelo 3D**: glTF/GLB, OBJ, STL; AR opcional en moviles.
10. **Web/iframe**: pagina externa con sandbox configurable.
11. **Formulario**: campos varios, envio a la API/webhook/email, anti-spam Turnstile.
12. **Comparador**: dos imagenes con deslizador o dos panoramas completos.
13. **Quiz**: opcion unica/multiple/verdadero-falso, feedback, puntos y compuerta.
14. **Poligono**: region dibujada vertice a vertice sobre la esfera con cualquier accion.
15. **Etiqueta flotante**: texto permanente o al pasar el cursor.
16. **Enlace externo**: URL, tel: o mailto:.
17. **Contador/estado**: modifica variables del tour (puertas, dia/noche, progreso).

Para colocar un hotspot: pulsa su tipo en el panel derecho y haz clic sobre el panorama. Los poligonos se dibujan clic a clic y se cierran con doble clic.

## Colaboracion

- **Guardado automatico** con indicador y deshacer/rehacer ilimitado por sesion.
- **Presencia**: ves quien mas esta editando y que escena; el primer editor en una escena obtiene un bloqueo blando (los demas pueden editar otras escenas del mismo tour).
- **Comentarios** anclados a escenas con hilos y estado resuelto/abierto.
- **Versiones**: instantaneas automaticas al publicar y manuales con nombre; diferencias a nivel de escena/hotspot y restauracion.
