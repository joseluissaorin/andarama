import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_URL,
  fitGeoBounds,
  latToWorldY,
  lngToWorldX,
  metersPerWorldPixel,
  tileUrl,
  tileZoomFor,
  tilesForView,
  worldXToLng,
  worldYToLat,
} from "./geo";

/** La Laguna, que es donde está la ULL. */
const ULL = { lat: 28.4816, lng: -16.3159 };

describe("Mercator web", () => {
  it("ida y vuelta no pierde el sitio", () => {
    const x = lngToWorldX(ULL.lng);
    const y = latToWorldY(ULL.lat);
    expect(worldXToLng(x)).toBeCloseTo(ULL.lng, 9);
    expect(worldYToLat(y)).toBeCloseTo(ULL.lat, 9);
  });

  it("el meridiano cero cae en la mitad del mundo", () => {
    expect(lngToWorldX(0)).toBeCloseTo((256 * 2 ** 16) / 2, 6);
  });

  it("el ecuador cae en la mitad vertical", () => {
    expect(latToWorldY(0)).toBeCloseTo((256 * 2 ** 16) / 2, 6);
  });

  it("el norte está arriba: más latitud, menos y", () => {
    expect(latToWorldY(40)).toBeLessThan(latToWorldY(28));
  });

  it("recorta los polos en vez de irse a infinito", () => {
    expect(Number.isFinite(latToWorldY(90))).toBe(true);
    expect(Number.isFinite(latToWorldY(-90))).toBe(true);
  });
});

describe("teselas", () => {
  it("el zoom sigue a la escala del lienzo", () => {
    expect(tileZoomFor(1)).toBe(16);
    expect(tileZoomFor(2)).toBe(17);
    expect(tileZoomFor(0.5)).toBe(15);
  });

  it("el zoom se mantiene dentro de lo que sirve OpenStreetMap", () => {
    expect(tileZoomFor(1e6)).toBe(19);
    expect(tileZoomFor(1e-9)).toBe(2);
  });

  it("cubre el rectángulo visible", () => {
    const x = lngToWorldX(ULL.lng);
    const y = latToWorldY(ULL.lat);
    const tiles = tilesForView({ x0: x - 300, y0: y - 300, x1: x + 300, y1: y + 300 }, 1);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.some((t) => t.wx <= x && x < t.wx + t.size && t.wy <= y && y < t.wy + t.size)).toBe(true);
  });

  it("no pide un número absurdo de imágenes al alejar del todo", () => {
    const tiles = tilesForView({ x0: 0, y0: 0, x1: 256 * 2 ** 16, y1: 256 * 2 ** 16 }, 1);
    expect(tiles.length).toBeLessThanOrEqual(160);
  });

  it("da la vuelta al mundo en horizontal sin pedir columnas negativas", () => {
    const tiles = tilesForView({ x0: -600, y0: 256 * 2 ** 15, x1: 200, y1: 256 * 2 ** 15 + 100 }, 1);
    expect(tiles.every((t) => t.x >= 0 && t.x < 2 ** t.z)).toBe(true);
  });

  it("no pide filas fuera del mapa", () => {
    const tiles = tilesForView({ x0: 0, y0: -5000, x1: 500, y1: -100 }, 1);
    expect(tiles).toHaveLength(0);
  });

  it("compone la URL de la tesela", () => {
    expect(tileUrl(DEFAULT_TILE_URL, { x: 1, y: 2, z: 3 })).toBe("https://tile.openstreetmap.org/3/1/2.png");
  });
});

describe("encuadre y escala", () => {
  it("centra sobre los puntos dados", () => {
    const fit = fitGeoBounds([ULL, { lat: ULL.lat + 0.002, lng: ULL.lng + 0.002 }], { width: 800, height: 600 })!;
    const cx = (lngToWorldX(ULL.lng) + lngToWorldX(ULL.lng + 0.002)) / 2;
    expect(fit.ox + cx * fit.scale).toBeCloseTo(400, 3);
  });

  it("sin puntos no hay encuadre", () => {
    expect(fitGeoBounds([], { width: 800, height: 600 })).toBeNull();
  });

  it("un solo punto no rompe la escala", () => {
    const fit = fitGeoBounds([ULL], { width: 800, height: 600 })!;
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(fit.scale).toBeGreaterThan(0);
  });

  it("los metros por píxel encogen al alejarse del ecuador", () => {
    expect(metersPerWorldPixel(60)).toBeLessThan(metersPerWorldPixel(0));
  });
});
