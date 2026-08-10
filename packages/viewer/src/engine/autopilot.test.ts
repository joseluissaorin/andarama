import { describe, expect, it, vi } from "vitest";
import { Autopilot, type AutopilotHost } from "./autopilot";
import type { AutopilotRoute } from "@andarama/schema";

/**
 * El quiosco: encadenar todos los recorridos y mirar a la puerta antes de
 * cruzarla. Sin esto, un quiosco enseñaba solo el primer recorrido y saltaba
 * de escena sin decir por dónde.
 */
function hostFalso(): { host: AutopilotHost; visitadas: string[]; giros: number[] } {
  const visitadas: string[] = [];
  const giros: number[] = [];
  const host: AutopilotHost = {
    goToScene: async (id) => { visitadas.push(id); },
    rotateBy: async () => {},
    openHotspotPanel: () => {},
    closePanels: () => {},
    currentSceneId: () => visitadas[visitadas.length - 1] ?? null,
    doorYawTo: (sceneId) => (sceneId === "b" ? 1.5 : null),
    turnTo: async (yaw) => { giros.push(yaw); },
  };
  return { host, visitadas, giros };
}

const ruta = (id: string, escenas: string[]): AutopilotRoute =>
  ({ id, title: id, steps: escenas.map((s) => ({ scene: s })) }) as AutopilotRoute;

describe("autopilot del quiosco", () => {
  it("encadena todos los recorridos y vuelve al primero", async () => {
    const { host, visitadas } = hostFalso();
    const ap = new Autopilot(host);
    void ap.startChain([ruta("r1", ["a"]), ruta("r2", ["c"])]);
    await vi.waitFor(() => expect(visitadas.length).toBeGreaterThanOrEqual(3), { timeout: 2000 });
    ap.stop();
    // a (r1), c (r2), a (r1 otra vez): la cadena da la vuelta
    expect(visitadas.slice(0, 3)).toEqual(["a", "c", "a"]);
  });

  it("mira hacia la puerta antes de saltar a la escena siguiente", async () => {
    const { host, giros } = hostFalso();
    const ap = new Autopilot(host);
    void ap.start(ruta("r1", ["a", "b"]));
    await vi.waitFor(() => expect(giros.length).toBe(1), { timeout: 2000 });
    ap.stop();
    expect(giros[0]).toBeCloseTo(1.5, 5);
  });

  it("una ruta sin paso hacia la siguiente no gira a ciegas", async () => {
    const { host, giros, visitadas } = hostFalso();
    const ap = new Autopilot(host);
    void ap.start(ruta("r1", ["a", "z"]));
    await vi.waitFor(() => expect(visitadas).toEqual(["a", "z"]), { timeout: 2000 });
    ap.stop();
    expect(giros).toEqual([]);
  });
});
