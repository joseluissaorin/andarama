/**
 * Mercator web para el modo Mapa del lienzo.
 *
 * El visor ya sabe pintar OpenStreetMap con las coordenadas de cada escena,
 * pero en el editor esas coordenadas se tecleaban a mano en un par de campos
 * numéricos. Con esto el mismo lienzo del grafo dibuja el mapa real debajo y
 * arrastrar un nodo escribe su latitud y su longitud.
 *
 * Convenio: el «mundo» del lienzo en modo mapa son píxeles de Mercator al zoom
 * de referencia REFERENCE_ZOOM, así que las funciones de pan y zoom del grafo
 * valen tal cual.
 */

export const TILE_SIZE = 256;
/** Zoom en cuyo espacio de píxeles vive el mundo del lienzo. */
export const REFERENCE_ZOOM = 16;
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = "© colaboradores de OpenStreetMap";
/** Latitud máxima representable en Mercator. */
const MAX_LAT = 85.05112878;

export function lngToWorldX(lng: number, zoom = REFERENCE_ZOOM): number {
  return ((lng + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

export function latToWorldY(lat: number, zoom = REFERENCE_ZOOM): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = 0.5 - Math.log((1 + Math.sin(rad)) / (1 - Math.sin(rad))) / (4 * Math.PI);
  return y * TILE_SIZE * 2 ** zoom;
}

export function worldXToLng(x: number, zoom = REFERENCE_ZOOM): number {
  return (x / (TILE_SIZE * 2 ** zoom)) * 360 - 180;
}

export function worldYToLat(y: number, zoom = REFERENCE_ZOOM): number {
  const n = Math.PI - 2 * Math.PI * (y / (TILE_SIZE * 2 ** zoom));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Zoom de teselas adecuado para la escala actual del lienzo. */
export function tileZoomFor(scale: number, min = 2, max = 19): number {
  const z = Math.round(REFERENCE_ZOOM + Math.log2(scale <= 0 ? 1 : scale));
  return Math.max(min, Math.min(max, z));
}

export interface TileRef {
  x: number;
  y: number;
  z: number;
  /** Posición y tamaño en coordenadas de mundo del lienzo. */
  wx: number;
  wy: number;
  size: number;
}

/**
 * Teselas que cubren el rectángulo visible, con su sitio en el mundo. Se
 * limita el número por si alguien aleja hasta ver el planeta entero: pedir mil
 * imágenes a OpenStreetMap para dibujar un mapamundi diminuto es de mala
 * vecindad, y además va lento.
 */
export function tilesForView(
  worldRect: { x0: number; y0: number; x1: number; y1: number },
  scale: number,
  maxTiles = 160,
): TileRef[] {
  const z = tileZoomFor(scale);
  const factor = 2 ** (REFERENCE_ZOOM - z);
  const tileWorld = TILE_SIZE * factor;
  const count = 2 ** z;
  const x0 = Math.floor(worldRect.x0 / tileWorld);
  const x1 = Math.floor(worldRect.x1 / tileWorld);
  const y0 = Math.floor(worldRect.y0 / tileWorld);
  const y1 = Math.floor(worldRect.y1 / tileWorld);
  const tiles: TileRef[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = x0; tx <= x1; tx++) {
      // El mundo da la vuelta en horizontal: -1 es la última columna
      const wrapped = ((tx % count) + count) % count;
      tiles.push({ x: wrapped, y: ty, z, wx: tx * tileWorld, wy: ty * tileWorld, size: tileWorld });
      if (tiles.length >= maxTiles) return tiles;
    }
  }
  return tiles;
}

export function tileUrl(template: string, tile: { x: number; y: number; z: number }): string {
  return template
    .replaceAll("{z}", String(tile.z))
    .replaceAll("{x}", String(tile.x))
    .replaceAll("{y}", String(tile.y))
    .replaceAll("{s}", "a");
}

/** Metros por píxel de mundo a una latitud dada (para la escala del mapa). */
export function metersPerWorldPixel(lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** REFERENCE_ZOOM;
}

/** Encuadre que contiene todos los puntos, con margen. */
export function fitGeoBounds(
  points: { lat: number; lng: number }[],
  viewport: { width: number; height: number },
  padding = 80,
): { ox: number; oy: number; scale: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => lngToWorldX(p.lng));
  const ys = points.map((p) => latToWorldY(p.lat));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = x1 - x0;
  const h = y1 - y0;
  // Con un solo punto no hay nada que encuadrar: encajarlo daría el zoom
  // máximo y se vería el tejado. Se usa una escala de calle.
  const scale =
    w < 2 && h < 2
      ? 2
      : Math.min(4, Math.max(1e-5, Math.min((viewport.width - padding * 2) / Math.max(w, 1), (viewport.height - padding * 2) / Math.max(h, 1))));
  return {
    scale,
    ox: viewport.width / 2 - ((x0 + x1) / 2) * scale,
    oy: viewport.height / 2 - ((y0 + y1) / 2) * scale,
  };
}
