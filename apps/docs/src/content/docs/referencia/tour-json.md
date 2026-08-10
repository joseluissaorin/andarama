---
title: Formato tour.json
---

`tour.json` es el contrato central entre editor, visor, exportador y API. El **JSON Schema** completo se publica en el paquete `@ull360/schema` (`schema/tour-1.json`) con `$id` `https://ull360.dev/schema/tour-1.json`.

El esquema está **versionado**: `@ull360/schema` incluye migradores automáticos entre versiones, de modo que los tours antiguos siempre abren.

## Extracto ilustrativo

```jsonc
{
  "$schema": "https://ull360.dev/schema/tour-1.json",
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
    "watermark": { "image": "a/media/logo-ull.svg", "link": "https://www.ull.es" }
  }
}
```

## Notas del formato

- Todas las cadenas visibles son **localizables**: un literal (idioma por defecto) o un mapa `{ "es": "...", "en": "..." }` con fallback.
- Los ángulos van en **radianes** (yaw en [-PI, PI], pitch en [-PI/2, PI/2], fov vertical en (0, PI)).
- Las fuentes de escena soportan `multires`, `equirect` (completa o **parcial**), `cubemap` (caras o tira), `flat` (gigapixel 2D) y `video` (renditions + HLS + estéreo TB/SBS).
- Las rutas relativas `a/...` se resuelven contra el mapa de assets congelado de la publicación; en paquetes exportados apuntan a ficheros locales.
- El validador semántico (`validateTour`) comprueba unicidad de IDs, existencia de destinos, alcanzabilidad de escenas y textos alternativos, además de la validación estructural del JSON Schema.
