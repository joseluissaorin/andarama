import { describe, expect, it } from "vitest";
import { arrivalNeedsReturn, arrivalsOf, resolveArrivalView, setArrivalMode, setArrivalView } from "./arrivals";
import type { EditorSnapshot, HotspotRow, SceneRow } from "../stores";

/**
 * La orientación de llegada es de cada camino, no de la escena. Estas pruebas
 * fijan que llegar al mismo sitio desde dos sitios distintos puede tener dos
 * vistas distintas, y que lo que enseña el editor es lo que hará el visor.
 */

function scene(id: string, title = id, initial?: { yaw: number; pitch: number; fov?: number }): SceneRow {
  return {
    id,
    projectId: "p",
    sort: 0,
    title,
    type: "image",
    mediaId: null,
    sourceJson: null,
    initialViewJson: initial != null ? JSON.stringify(initial) : null,
    limitsJson: null,
    audioJson: null,
    mapJson: null,
    metaJson: "{}",
  };
}

function paso(id: string, from: string, to: string, yaw: number, entry?: Record<string, unknown>): HotspotRow {
  return {
    id,
    sceneId: from,
    type: "navigation",
    positionJson: JSON.stringify({ yaw, pitch: -0.1 }),
    styleJson: null,
    contentJson: JSON.stringify({ target: to, ...(entry != null ? { entry } : {}) }),
    conditionsJson: null,
    sort: 0,
  };
}

/** Cadena 1 - 2 - 3 con sus pasos de ida y vuelta. */
function cadena(): EditorSnapshot {
  return {
    scenes: [scene("s1", "Entrada", { yaw: 0.2, pitch: 0, fov: 1.2 }), scene("s2", "Salón"), scene("s3", "Cocina")],
    hotspots: [
      paso("h12", "s1", "s2", 0.5),
      paso("h21", "s2", "s1", 2.0),
      paso("h23", "s2", "s3", -1.2),
      paso("h32", "s3", "s2", 1.4),
    ],
    settings: { startScene: "s1" },
  };
}

describe("llegadas de una escena", () => {
  it("una escena intermedia tiene la vista por defecto y una llegada por camino", () => {
    const arr = arrivalsOf(cadena(), "s2");
    expect(arr[0]).toMatchObject({ kind: "start", isStart: false });
    expect(arr.slice(1).map((a) => a.fromTitle)).toEqual(["Entrada", "Cocina"]);
  });

  it("en la escena inicial esa primera fila es además el arranque del tour", () => {
    const arr = arrivalsOf(cadena(), "s1");
    expect(arr[0]).toMatchObject({ kind: "start", isStart: true });
    expect(arr[0]!.view).toMatchObject({ yaw: 0.2 });
    expect(arr[1]).toMatchObject({ kind: "step", fromTitle: "Salón" });
  });

  it("una escena sin caminos conserva su vista por defecto", () => {
    const draft = cadena();
    draft.hotspots = [];
    expect(arrivalsOf(draft, "s2").map((a) => a.kind)).toEqual(["start"]);
  });

  it("el modo por defecto de un paso sin entrada es seguir el camino", () => {
    expect(arrivalsOf(cadena(), "s2")[1]!.mode).toBe("forward");
  });
});

describe("qué vista da cada llegada", () => {
  it("seguir el camino entra de espaldas a la puerta por la que se ha venido", () => {
    const draft = cadena();
    const desdeEntrada = arrivalsOf(draft, "s2")[1];
    // La puerta a la Entrada, vista desde el Salón, está en yaw 2.0
    expect(resolveArrivalView(draft, "s2", desdeEntrada!).yaw).toBeCloseTo(2.0 - Math.PI, 5);
  });

  it("mirar atrás entra mirando esa misma puerta", () => {
    const draft = cadena();
    const arr = arrivalsOf(draft, "s2");
    setArrivalMode(draft, "s2", arr[1]!, "lookBack");
    const actualizada = arrivalsOf(draft, "s2")[1]!;
    expect(resolveArrivalView(draft, "s2", actualizada).yaw).toBeCloseTo(2.0, 5);
  });

  it("dos caminos al mismo sitio dan vistas distintas", () => {
    const draft = cadena();
    const [, desdeEntrada, desdeCocina] = arrivalsOf(draft, "s2");
    const a = resolveArrivalView(draft, "s2", desdeEntrada!).yaw;
    const b = resolveArrivalView(draft, "s2", desdeCocina!).yaw;
    expect(Math.abs(a - b)).toBeGreaterThan(0.5);
  });

  it("sin paso de vuelta se usa el opuesto al de ida y se avisa", () => {
    const draft = cadena();
    draft.hotspots = draft.hotspots.filter((h) => h.id !== "h21");
    const desdeEntrada = arrivalsOf(draft, "s2")[1];
    expect(arrivalNeedsReturn(draft, "s2", desdeEntrada!)).toBe(true);
    // El paso de ida está en yaw 0.5 en la Entrada: la puerta cae en 0.5 + π,
    // y entrar de frente es media vuelta más, es decir, 0.5
    expect(resolveArrivalView(draft, "s2", desdeEntrada!).yaw).toBeCloseTo(0.5, 5);
  });
});

describe("guardar la llegada", () => {
  it("guardar una vista deja el paso en modo fijo", () => {
    const draft = cadena();
    const desdeEntrada = arrivalsOf(draft, "s2")[1];
    setArrivalView(draft, "s2", desdeEntrada!, { yaw: 1.111111, pitch: 0.05, fov: 1.3 });
    const actualizada = arrivalsOf(draft, "s2")[1]!;
    expect(actualizada.mode).toBe("fixed");
    expect(actualizada.view).toMatchObject({ yaw: 1.1111, pitch: 0.05, fov: 1.3 });
    expect(resolveArrivalView(draft, "s2", actualizada).yaw).toBeCloseTo(1.1111, 4);
  });

  it("la llegada del arranque escribe la vista inicial de la escena", () => {
    const draft = cadena();
    const arranque = arrivalsOf(draft, "s1")[0];
    setArrivalView(draft, "s1", arranque!, { yaw: -0.75, pitch: 0.1, fov: 1.1 });
    expect(JSON.parse(draft.scenes[0]!.initialViewJson!)).toMatchObject({ yaw: -0.75, pitch: 0.1 });
  });

  it("cambiar de fijo a automático no deja el ángulo viejo colgando", () => {
    const draft = cadena();
    const desdeEntrada = arrivalsOf(draft, "s2")[1];
    setArrivalView(draft, "s2", desdeEntrada!, { yaw: 1.1, pitch: 0 });
    setArrivalMode(draft, "s2", arrivalsOf(draft, "s2")[1]!, "forward");
    const content = JSON.parse(draft.hotspots[0]!.contentJson) as { entry: Record<string, unknown> };
    expect(content.entry.yaw).toBeUndefined();
    expect(content.entry.mode).toBe("forward");
  });

  it("cambiar una llegada no toca la otra", () => {
    const draft = cadena();
    const arr = arrivalsOf(draft, "s2");
    setArrivalView(draft, "s2", arr[1]!, { yaw: 1.1, pitch: 0 });
    const despues = arrivalsOf(draft, "s2");
    expect(despues[1]!.mode).toBe("fixed");
    expect(despues[2]!.mode).toBe("forward");
  });

  it("el yaw guardado se normaliza a [-π, π]", () => {
    const draft = cadena();
    const desdeEntrada = arrivalsOf(draft, "s2")[1];
    setArrivalView(draft, "s2", desdeEntrada!, { yaw: Math.PI * 2.5, pitch: 0 });
    expect(Math.abs(arrivalsOf(draft, "s2")[1]!.view!.yaw)).toBeLessThanOrEqual(Math.PI);
  });
});
