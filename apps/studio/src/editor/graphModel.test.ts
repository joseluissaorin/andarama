import { describe, expect, it } from "vitest";
import { createNavHotspot, deleteEdge, graphEdges, graphIssues, readAutopilot, temporaryPlacement, writeAutopilot } from "./graphModel";
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
