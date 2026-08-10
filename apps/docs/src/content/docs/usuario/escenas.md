---
title: Escenas y hotspots
---

## Escenas

Cada escena tiene: título, **texto alternativo obligatorio** (accesibilidad), descripción, **área** —que agrupa las escenas en el lienzo, da la categoría del menú y, si tiene plano, es la planta—, vista inicial ("usar vista actual"), límites de vista opcionales (esencial en panoramas parciales), audio (ambiente, narración con bloqueo opcional, fuentes espaciales) y su sitio en el plano o en el mapa, que se colocan desde el lienzo.

Tipos de escena: **Panorama 360** (imagen), **Vídeo 360** y **Gigapixel 2D** (obras, documentos, fachadas con pan/zoom tipo mapa).

## El panel de propiedades

A la derecha. Cuando hay una escena seleccionada muestra sus datos y la lista de
sus hotspots; al pulsar uno, cambia al marcador con una cabecera fija —de qué
escena viene, qué tipo es, borrar— y tres pestañas: **Contenido**, **Aspecto** y
**Condiciones**. Lo que se busca casi siempre está en la primera, sin
desplazarse. El panel se puede **ensanchar** arrastrando su borde izquierdo.

La lista de hotspots de la escena marca los que están **sin colocar** (creados
desde el grafo y aún en su posición provisional) y resalta en el panorama aquel
sobre el que pasas el ratón.

**Añadir hotspot** abre una paleta buscable: se escribe lo que se quiere
(«texto», «puerta», «examen», «3D») y aparece el tipo con una línea explicando
qué hace. Después se pulsa en el panorama para colocarlo.

Un atajo que ahorra mucho: **arrastrar una escena de la lista sobre el
panorama** crea directamente el paso de navegación hacia ella, en el punto donde
se suelta.

## El grafo

La pestaña **Grafo** muestra las escenas como nodos y los pasos de navegación
como flechas: cada flecha *es* un hotspot. Se detalla en
[El grafo de escenas](/docs/usuario/grafo/).

Cada paso define su **orientación de entrada**:

- **Fija**: yaw/pitch/FOV concretos.
- **Relativa**: mantiene el rumbo que llevaba el usuario.
- **Mirar hacia atrás**: entra orientado hacia la escena de origen (continuidad espacial).

## Los 17 tipos de hotspot

Todos comparten posición, etiqueta, texto alternativo, icono (biblioteca SVG o propio), estilo (tamaño, color, pulso, escala con zoom) y **condiciones de visibilidad** (por idioma, por variables de estado, por rango temporal en escenas de vídeo).

1. **Navegación**: salto a otra escena; variante flecha de suelo.
2. **Texto**: panel Markdown (títulos, listas, enlaces, tablas).
3. **Imagen**: lightbox con zoom profundo y descarga opcional.
4. **Galería**: carrusel con títulos y descripciones.
5. **Vídeo (fichero)**: lightbox o pantalla proyectada sobre la escena.
6. **YouTube/Vimeo/PeerTube**: embed sin cookies por defecto.
7. **Audio**: reproductor o fuente espacial anclada.
8. **PDF**: visor integrado con paginación y zoom.
9. **Modelo 3D**: glTF/GLB, OBJ, STL; AR opcional en móviles.
10. **Web/iframe**: página externa con sandbox configurable.
11. **Formulario**: campos varios, envío a la API/webhook/email, anti-spam Turnstile.
12. **Comparador**: dos imágenes con deslizador o dos panoramas completos.
13. **Quiz**: opción única/múltiple/verdadero-falso, feedback, puntos y compuerta.
14. **Polígono**: región dibujada vértice a vértice sobre la esfera con cualquier acción.
15. **Etiqueta flotante**: texto permanente o al pasar el cursor.
16. **Enlace externo**: URL, tel: o mailto:.
17. **Contador/estado**: modifica variables del tour (puertas, día/noche, progreso).

Para colocar un hotspot: pulsa su tipo en el panel derecho y haz clic sobre el panorama. Los polígonos se dibujan clic a clic y se cierran con doble clic.

## Colaboración

- **Guardado automático** con indicador y deshacer/rehacer ilimitado por sesión.
- **Presencia**: ves quién más está editando y qué escena; el primer editor en una escena obtiene un bloqueo blando (los demás pueden editar otras escenas del mismo tour).
- **Comentarios** anclados a escenas con hilos y estado resuelto/abierto.
- **Versiones**: instantáneas automáticas al publicar y manuales con nombre; diferencias a nivel de escena/hotspot y restauración.
