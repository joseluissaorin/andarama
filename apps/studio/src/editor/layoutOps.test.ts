import { describe, expect, it } from "vitest";
import { alignNodes, autoLayoutByArea, boundsOf, distributeNodes, snapToNeighbours } from "./layoutOps";

const SIZE = { w: 100, h: 50 };

describe("alinear", () => {
  const positions = { a: { x: 0, y: 0 }, b: { x: 40, y: 30 }, c: { x: 90, y: 100 } };

  it("a la izquierda deja todos en el borde izquierdo del bloque", () => {
    const next = alignNodes(positions, ["a", "b", "c"], "left", SIZE);
    expect(Object.values(next).map((p) => p.x)).toEqual([0, 0, 0]);
    // No toca el otro eje
    expect(next.c!.y).toBe(100);
  });

  it("a la derecha cuenta el ancho del nodo, no su origen", () => {
    const next = alignNodes(positions, ["a", "b", "c"], "right", SIZE);
    expect(Object.values(next).map((p) => p.x)).toEqual([90, 90, 90]);
  });

  it("centrar en horizontal usa el centro del bloque", () => {
    const next = alignNodes(positions, ["a", "c"], "hcenter", SIZE);
    expect(next.a!.x).toBeCloseTo(45, 5);
    expect(next.c!.x).toBeCloseTo(45, 5);
  });

  it("arriba y abajo trabajan sobre el eje vertical", () => {
    expect(alignNodes(positions, ["a", "b", "c"], "top", SIZE).c!.y).toBe(0);
    expect(alignNodes(positions, ["a", "b", "c"], "bottom", SIZE).a!.y).toBe(100);
  });

  it("con un solo nodo no hace nada", () => {
    expect(alignNodes(positions, ["a"], "left", SIZE)).toBe(positions);
  });
});

describe("repartir", () => {
  it("deja el mismo hueco y no mueve los extremos", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c: { x: 20, y: 0 }, d: { x: 600, y: 0 } };
    const next = distributeNodes(positions, ["a", "b", "c", "d"], "h", SIZE);
    expect(next.a!.x).toBe(0);
    expect(next.d!.x).toBe(600);
    const gaps = [next.b!.x - next.a!.x, next.c!.x - next.b!.x, next.d!.x - next.c!.x];
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeCloseTo(0, 6);
  });

  it("con menos de tres nodos no hay nada que repartir", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    expect(distributeNodes(positions, ["a", "b"], "h", SIZE)).toBe(positions);
  });

  it("reparte también en vertical", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 5 }, c: { x: 0, y: 300 } };
    const next = distributeNodes(positions, ["a", "b", "c"], "v", SIZE);
    expect(next.b!.y).toBeCloseTo(150, 5);
  });
});

describe("imán a los vecinos", () => {
  it("engancha el borde izquierdo cuando está cerca", () => {
    const positions = { fijo: { x: 200, y: 0 }, movido: { x: 197, y: 80 } };
    const snap = snapToNeighbours(positions, ["movido"], ["fijo"], SIZE);
    expect(snap.dx).toBe(3);
    expect(snap.vertical).toEqual([200]);
  });

  it("no engancha nada si está lejos", () => {
    const positions = { fijo: { x: 200, y: 0 }, movido: { x: 40, y: 400 } };
    const snap = snapToNeighbours(positions, ["movido"], ["fijo"], SIZE);
    expect(snap).toMatchObject({ dx: 0, dy: 0, vertical: [], horizontal: [] });
  });

  it("engancha también por el centro", () => {
    const positions = { fijo: { x: 0, y: 0 }, movido: { x: 300, y: 23 } };
    const snap = snapToNeighbours(positions, ["movido"], ["fijo"], SIZE);
    // El centro vertical del fijo está en 25; el del movido, en 48
    expect(snap.dy).toBe(2);
    expect(snap.horizontal).toEqual([25]);
  });
});

describe("auto-orden por áreas", () => {
  const size = { w: 160, h: 90 };

  it("cada área ocupa su banda y las plantas altas van arriba", () => {
    const scenes = [
      { id: "a1", area: "alta" },
      { id: "b1", area: "baja" },
    ];
    const { positions, bands } = autoLayoutByArea(scenes, [], [{ id: "alta", level: 1 }, { id: "baja", level: 0 }], "a1", size);
    expect(bands.map((b) => b.area)).toEqual(["alta", "baja"]);
    expect(positions.a1!.y).toBeLessThan(positions.b1!.y);
  });

  it("dentro de un área las escenas se ordenan por distancia a la inicial", () => {
    const scenes = [
      { id: "a", area: "z" },
      { id: "b", area: "z" },
      { id: "c", area: "z" },
    ];
    const edges = [{ from: "a", to: "b" }, { from: "b", to: "c" }];
    const { positions } = autoLayoutByArea(scenes, edges, [{ id: "z" }], "a", size);
    expect(positions.a!.x).toBeLessThan(positions.b!.x);
    expect(positions.b!.x).toBeLessThan(positions.c!.x);
  });

  it("las escenas sin área acaban en su propia banda al final", () => {
    const scenes = [
      { id: "a", area: "z" },
      { id: "suelta", area: null },
    ];
    const { bands, positions } = autoLayoutByArea(scenes, [], [{ id: "z" }], "a", size);
    expect(bands[bands.length - 1]!.area).toBeNull();
    expect(positions.suelta!.y).toBeGreaterThan(positions.a!.y);
  });

  it("las inalcanzables se apartan a una columna antes de la inicial", () => {
    const scenes = [
      { id: "a", area: null },
      { id: "huerfana", area: null },
    ];
    const { positions } = autoLayoutByArea(scenes, [], [], "a", size);
    expect(positions.huerfana!.x).toBeLessThan(positions.a!.x);
  });

  it("las bandas no se solapan", () => {
    const scenes = [
      { id: "a", area: "x" },
      { id: "b", area: "x" },
      { id: "c", area: "y" },
    ];
    const { bands } = autoLayoutByArea(scenes, [], [{ id: "x", level: 1 }, { id: "y", level: 0 }], "a", size);
    expect(bands[0]!.y1).toBeLessThan(bands[1]!.y0);
  });
});

describe("envolvente", () => {
  it("mide el rectángulo contando el tamaño del nodo", () => {
    expect(boundsOf({ a: { x: 10, y: 20 } }, ["a"], SIZE)).toEqual({ x0: 10, y0: 20, x1: 110, y1: 70 });
  });

  it("sin nodos no hay rectángulo", () => {
    expect(boundsOf({}, ["a"], SIZE)).toBeNull();
  });
});
