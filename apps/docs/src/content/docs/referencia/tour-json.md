---
title: Formato tour.json
---

`tour.json` es el contrato central entre editor, visor, exportador y API. El **JSON Schema** completo se publica en el paquete `@andarama/schema` (`schema/tour-1.json`) con `$id` `https://andarama.com/schema/tour-1.json`.

El esquema está **versionado**: `@andarama/schema` incluye migradores automáticos entre versiones, de modo que los tours antiguos siempre abren.

## Extracto ilustrativo

```jsonc
{
  "$schema": "https://andarama.com/schema/tour-1.json",
  "version": 1,
  "meta": {
    "title": { "es": "Campus de Guajara", "en": "Guajara Campus" },
    "defaultLang": "es",
    "langs": ["es", "en"]
  },
  "start": { "scene": "entrada", "view": { "yaw": 0.4, "pitch": 0, "fov": 1.2 }, "intro": "littlePlanet" },
  "scenes": [{
    "id": "entrada",
    "type": "image",
    "title": { "es": "Entrada" },
    "altText": { "es": "Patio de entrada del edificio" },
    "source": {
      "kind": "multires", "levels": 5, "tileSize": 512, "faceSize": 4096,
      "base": "a/tiles/m_8f2a", "preview": "data:image/jpeg;base64,..."
    },
    "audio": { "ambient": { "url": "a/media/patio.mp3", "volume": 0.5 } },
    "map": { "floorplan": "planta0", "x": 0.31, "y": 0.62, "north": 1.57 },
    "hotspots": [{
      "id": "h1", "type": "navigation", "yaw": 1.1, "pitch": -0.1,
      "target": "pasillo",
      "entry": { "mode": "fixed", "yaw": 0, "pitch": 0, "fov": 1.2 },
      "label": { "es": "Ir al pasillo", "en": "Go to hallway" }
    }]
  }],
  "ui": {
    "sceneMenu": true, "thumbnails": true, "compass": true, "vr": true, "share": true,
    "watermark": { "image": "a/media/logotipo.svg", "link": "https://andarama.com" }
  }
}
```

## Notas del formato

- Todas las cadenas visibles son **localizables**: un literal (idioma por defecto) o un mapa `{ "es": "...", "en": "..." }` con fallback.
- Los ángulos van en **radianes** (yaw en [-PI, PI], pitch en [-PI/2, PI/2], fov vertical en (0, PI)).
- Las fuentes de escena soportan `multires`, `equirect` (completa o **parcial**), `cubemap` (caras o tira), `flat` (gigapixel 2D) y `video` (renditions + HLS + estéreo TB/SBS).
- Las rutas relativas `a/...` se resuelven contra el mapa de assets congelado de la publicación; en paquetes exportados apuntan a ficheros locales.
- El validador semántico (`validateTour`) comprueba unicidad de IDs, existencia de destinos, alcanzabilidad de escenas y textos alternativos, además de la validación estructural del JSON Schema.


## Cambios recientes del formato

- **`connections` ya no existe.** El grafo se deriva íntegramente de los
  hotspots de navegación. Los `tour.json` antiguos que la traigan se siguen
  cargando: el visor simplemente la ignora.
- **`entry.mode` admite `initial`** (nuevo): se entra con la vista por
  defecto de la escena de destino (`scene.initialView`). Es el valor de los
  pasos nuevos creados desde el grafo o arrastrando una escena; un paso sin
  `entry` se comporta igual. Los pasos que ya existían conservan su modo.
- **`entry.mode` admite `forward`**: se entra de espaldas a la puerta por la
  que se ha venido y se sigue de frente, calculado a partir del paso de
  vuelta. Un visor antiguo que no lo conozca cae en la vista inicial de la
  escena.
- **`entry.mode: "relative"` conserva el rumbo real** cuando las dos escenas
  tienen `map.north` calibrado, en vez del ángulo crudo.
- **`floorplans` se compila desde las áreas del borrador.** En el editor, la
  planta, la zona y la categoría son una sola cosa —un **área**—; al publicar,
  las áreas con plano se escriben como `floorplans` (mismo `id`, así que
  `scene.map.floorplan` sigue apuntando a su sitio) y el título del área se
  escribe como `scene.category`. El formato publicado no cambia; lo que cambia
  es de dónde sale. Los borradores anteriores se convierten solos al abrirlos.
- **`vr`** (nuevo): comportamiento en gafas y modo cartón.
  ```json
  {
    "vr": {
      "hotspots": "custom",
      "types": { "pdf": false, "form": false },
      "dwellSeconds": 1.5
    }
  }
  ```
  `hotspots` admite `all`, `navigationOnly` o `custom`; con `custom`, `types`
  lista las excepciones. La navegación está siempre disponible.
  `dwellSeconds` es la permanencia del retículo de mirada.
- **`globalAudio`** (nuevo): música de fondo de todo el recorrido, con
  `url` y `volume` (de 0 a 1). Baja durante las narraciones y se funde a
  silencio en las escenas con sonido propio.
- **`scene.audio.replaceGlobal`** (nuevo): sin indicar, la música de fondo
  cede cuando la escena tiene ambiente o fuentes espaciales; `false` la
  mantiene sonando y `true` la calla aunque la escena no tenga sonido.
- **`ui.logo`**, **`ui.watermark`** y **`ui.nadirPatch`**: logotipo junto al
  título, marca de agua en una esquina y parche de nadir (`image` y `size`)
  propios del recorrido.
- **`ui.badgeText`** (nuevo): texto propio de la insignia «Hecho con
  Andarama», recortado a 80 caracteres. Solo se ve en los planes que muestran
  la insignia, y sigue enlazando a andarama.com.
- **`ui.floorplanOpen`** (nuevo): con `true`, el plano se abre como minimapa
  nada más entrar en pantallas de 720 px de ancho o más; en las más estrechas
  empieza cerrado. Sin indicar, el plano empieza cerrado.
- **Vista en el enlace**: el visor escribe `#s=escena&y=…&p=…&f=…` en la
  dirección mientras se mira alrededor, pero solo aplica la orientación del
  hash si lleva además `v=1`, que es lo que añade el botón de compartir. Sin
  ese marcador, el hash solo elige la escena y se entra con su vista de
  llegada.
