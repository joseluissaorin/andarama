import { describe, expect, it } from "vitest";
import { createNavHotspot, deleteEdge, graphEdges, graphIssues, readAutopilot, reconnectEdge, temporaryPlacement, writeAutopilot } from "./graphModel";
import type { EditorSnapshot, SceneRow } from "../stores";

/**
 * El grafo ya no tiene datos propios: una arista es un hotspot de navegación.
 * Estas pruebas fijan esa equivalencia, que es lo que evita volver a tener un
 * grafo decorativo.
 */

function scene(id: string, title = id): SceneRow {
  return {
    id,
    projectId: "p",
    sort: 0,
    title,
    type: "image",
    mediaId: null,
    sourceJson: null,
    initialViewJson: null,
    limitsJson: null,
    audioJson: null,
    mapJson: null,
    metaJson: "{}",
  };
}

function snapshot(scenes: SceneRow[]): EditorSnapshot {
  return { scenes, hotspots: [], settings: {} };
}

describe("grafo basado en hotspots", () => {
  it("arrastrar crea un hotspot de navegación con destino", () => {
    const draft = snapshot([scene("a"), scene("b", "Sala B")]);
    const id = createNavHotspot(draft, "a", "b");
    expect(id).not.toBeNull();
    expect(draft.hotspots).toHaveLength(1);
    const content = JSON.parse(draft.hotspots[0]!.contentJson) as { target: string; label: string; unplaced: boolean };
    expect(content.target).toBe("b");
    expect(content.label).toBe("Sala B");
    expect(content.unplaced).toBe(true);
  });

  it("el hotspot nuevo aparece en una posición concreta, no en el limbo", () => {
    const draft = snapshot([scene("a"), scene("b")]);
    createNavHotspot(draft, "a", "b");
    const pos = JSON.parse(draft.hotspots[0]!.positionJson) as { yaw: number; pitch: number };
    expect(Number.isFinite(pos.yaw)).toBe(true);
    expect(pos.pitch).toBeLessThan(0);
  });

  it("no duplica el paso si ya existe", () => {
    const draft = snapshot([scene("a"), scene("b")]);
    createNavHotspot(draft, "a", "b");
    expect(createNavHotspot(draft, "a", "b")).toBeNull();
    expect(draft.hotspots).toHaveLength(1);
  });

  it("dos pasos desde la misma escena no se colocan encima", () => {
    const draft = snapshot([scene("a"), scene("b"), scene("c")]);
    createNavHotspot(draft, "a", "b");
    createNavHotspot(draft, "a", "c");
    const yaws = draft.hotspots.map((h) => (JSON.parse(h.positionJson) as { yaw: number }).yaw);
    expect(Math.abs(yaws[0]! - yaws[1]!)).toBeGreaterThan(0.3);
  });

  it("las aristas salen de los hotspots y borrarlas los borra", () => {
    const draft = snapshot([scene("a"), scene("b")]);
    const id = createNavHotspot(draft, "a", "b")!;
    expect(graphEdges(draft)).toHaveLength(1);
    deleteEdge(draft, id);
    expect(graphEdges(draft)).toHaveLength(0);
    expect(draft.hotspots).toHaveLength(0);
  });

  it("un hotspot sin destino no dibuja arista pero sí avisa", () => {
    const draft = snapshot([scene("a")]);
    draft.hotspots.push({
      id: "h1",
      sceneId: "a",
      type: "navigation",
      positionJson: "{}",
      styleJson: null,
      contentJson: JSON.stringify({ target: "" }),
      conditionsJson: null,
      sort: 0,
    });
    expect(graphEdges(draft)).toHaveLength(0);
    expect(graphIssues(draft, [], new Set()).some((i) => i.kind === "no-target")).toBe(true);
  });

  it("detecta destinos rotos y pasos sin vuelta", () => {
    const draft = snapshot([scene("a"), scene("b")]);
    createNavHotspot(draft, "a", "b");
    const edges = graphEdges(draft);
    const issues = graphIssues(draft, edges, new Set());
    expect(issues.some((i) => i.kind === "no-return")).toBe(true);
    createNavHotspot(draft, "b", "a");
    expect(graphIssues(draft, graphEdges(draft), new Set()).some((i) => i.kind === "no-return")).toBe(false);
  });

  it("la posición provisional evita la vista inicial ocupada", () => {
    const s = scene("a");
    s.initialViewJson = JSON.stringify({ yaw: 1, pitch: 0, fov: 1.2 });
    const place = temporaryPlacement(s, []);
    expect(place.yaw).toBeCloseTo(1, 5);
  });

  it("las rutas de autopilot se leen y escriben en los ajustes", () => {
    const settings: Record<string, unknown> = {};
    writeAutopilot(settings, [{ id: "r1", title: "Visita", steps: [{ scene: "a", seconds: 5 }], loop: true }]);
    expect(readAutopilot(settings)).toEqual([{ id: "r1", title: "Visita", steps: [{ scene: "a", seconds: 5 }], loop: true }]);
    writeAutopilot(settings, [{ id: "r1", title: "Visita", steps: [] }]);
    expect(settings.autopilot).toBeUndefined();
  });
});

describe("reconectar aristas", () => {
  function conPaso(): { draft: EditorSnapshot; id: string } {
    const draft = snapshot([scene("a", "Entrada"), scene("b", "Sala B"), scene("c", "Sala C")]);
    const id = createNavHotspot(draft, "a", "b")!;
    // Se da por colocado: así se ve si mover el origen lo vuelve a marcar
    const h = draft.hotspots.find((x) => x.id === id)!;
    const content = JSON.parse(h.contentJson) as Record<string, unknown>;
    delete content.unplaced;
    h.contentJson = JSON.stringify(content);
    h.positionJson = JSON.stringify({ yaw: 1.23, pitch: 0.1 });
    return { draft, id };
  }

  it("mover el destino conserva el marcador y su posición", () => {
    const { draft, id } = conPaso();
    expect(reconnectEdge(draft, id, { to: "c" })).toBe("ok");
    const h = draft.hotspots.find((x) => x.id === id)!;
    const content = JSON.parse(h.contentJson) as { target: string; label: string; unplaced?: boolean };
    expect(content.target).toBe("c");
    expect(h.sceneId).toBe("a");
    expect(JSON.parse(h.positionJson).yaw).toBeCloseTo(1.23, 5);
    expect(content.unplaced).toBeUndefined();
  });

  it("la etiqueta sigue al destino si no se había tocado a mano", () => {
    const { draft, id } = conPaso();
    reconnectEdge(draft, id, { to: "c" });
    expect((JSON.parse(draft.hotspots[0]!.contentJson) as { label: string }).label).toBe("Sala C");
  });

  it("una etiqueta escrita a mano se respeta", () => {
    const { draft, id } = conPaso();
    const h = draft.hotspots.find((x) => x.id === id)!;
    h.contentJson = JSON.stringify({ ...JSON.parse(h.contentJson), label: "Por aquí" });
    reconnectEdge(draft, id, { to: "c" });
    expect((JSON.parse(h.contentJson) as { label: string }).label).toBe("Por aquí");
  });

  it("mover el origen traslada el hotspot y lo deja sin colocar", () => {
    const { draft, id } = conPaso();
    expect(reconnectEdge(draft, id, { from: "c" })).toBe("ok");
    const h = draft.hotspots.find((x) => x.id === id)!;
    expect(h.sceneId).toBe("c");
    // La posición era un punto del otro panorama: no vale
    expect(JSON.parse(h.positionJson).yaw).not.toBeCloseTo(1.23, 5);
    expect((JSON.parse(h.contentJson) as { unplaced?: boolean }).unplaced).toBe(true);
  });

  it("conserva el modo de entrada y la transición al reconectar", () => {
    const { draft, id } = conPaso();
    const h = draft.hotspots.find((x) => x.id === id)!;
    h.contentJson = JSON.stringify({ ...JSON.parse(h.contentJson), entry: { mode: "lookBack" }, transition: { kind: "zoom" } });
    reconnectEdge(draft, id, { to: "c" });
    const content = JSON.parse(h.contentJson) as { entry: { mode: string }; transition: { kind: string } };
    expect(content.entry.mode).toBe("lookBack");
    expect(content.transition.kind).toBe("zoom");
  });

  it("no deja una escena apuntándose a sí misma", () => {
    const { draft, id } = conPaso();
    expect(reconnectEdge(draft, id, { to: "a" })).toBe("same");
  });

  it("no duplica un paso que ya existe", () => {
    const { draft, id } = conPaso();
    createNavHotspot(draft, "a", "c");
    expect(reconnectEdge(draft, id, { to: "c" })).toBe("duplicate");
    expect(graphEdges(draft)).toHaveLength(2);
  });

  it("reconectar a una escena inexistente no toca nada", () => {
    const { draft, id } = conPaso();
    expect(reconnectEdge(draft, id, { to: "zzz" })).toBe("missing");
    expect((JSON.parse(draft.hotspots[0]!.contentJson) as { target: string }).target).toBe("b");
  });
});
