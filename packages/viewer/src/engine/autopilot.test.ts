import { describe, expect, it, vi } from "vitest";
import { Autopilot, type AutopilotChangeReason, type AutopilotHost } from "./autopilot";
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

// Paradas sin permanencia: en las pruebas no hay nada que mirar
const ruta = (id: string, escenas: string[], extra: Partial<AutopilotRoute> = {}): AutopilotRoute =>
  ({ id, title: id, steps: escenas.map((s) => ({ scene: s, dwell: 0 })), ...extra }) as AutopilotRoute;

describe("autopilot del quiosco", () => {
  it("con bucle, encadena todos los recorridos y vuelve al primero", async () => {
    const { host, visitadas } = hostFalso();
    const ap = new Autopilot(host);
    void ap.startChain([ruta("r1", ["a"]), ruta("r2", ["c"])], { loop: true });
    await vi.waitFor(() => expect(visitadas.length).toBeGreaterThanOrEqual(3), { timeout: 4000 });
    ap.stop();
    // a (r1), c (r2), a (r1 otra vez): la cadena da la vuelta
    expect(visitadas.slice(0, 3)).toEqual(["a", "c", "a"]);
  });

  it("sin bucle, la cadena se ve una vez y avisa de que ha terminado", async () => {
    const { host, visitadas } = hostFalso();
    const ap = new Autopilot(host);
    const razones: AutopilotChangeReason[] = [];
    ap.onChange = (_active, _id, reason) => razones.push(reason);
    await ap.startChain([ruta("r1", ["a"]), ruta("r2", ["c"])]);
    expect(visitadas).toEqual(["a", "c"]);
    // La primera ruta acaba en «siguiente»; solo la última dice «terminado»
    expect(razones).toEqual(["start", "next", "start", "finished"]);
    expect(ap.active).toBe(false);
  });

  it("mira hacia la puerta antes de saltar a la escena siguiente", async () => {
    const { host, giros } = hostFalso();
    const ap = new Autopilot(host);
    void ap.start(ruta("r1", ["a", "b"]));
    await vi.waitFor(() => expect(giros.length).toBe(1), { timeout: 4000 });
    ap.stop();
    expect(giros[0]).toBeCloseTo(1.5, 5);
  });

  it("una ruta sin paso hacia la siguiente no gira a ciegas", async () => {
    const { host, giros, visitadas } = hostFalso();
    const ap = new Autopilot(host);
    void ap.start(ruta("r1", ["a", "z"]));
    await vi.waitFor(() => expect(visitadas).toEqual(["a", "z"]), { timeout: 4000 });
    ap.stop();
    expect(giros).toEqual([]);
  });

  it("cada parada espera su permanencia antes de seguir", async () => {
    const { host, visitadas } = hostFalso();
    const ap = new Autopilot(host);
    const t0 = Date.now();
    await ap.start({ id: "r", title: "r", steps: [{ scene: "a", dwell: 0.2 }, { scene: "z", dwell: 0 }] } as AutopilotRoute);
    expect(visitadas).toEqual(["a", "z"]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(180);
  });

  it("al tocar la pantalla se para y no se reanuda sola salvo que la ruta lo pida", async () => {
    const { host } = hostFalso();
    const ap = new Autopilot(host);
    void ap.start(ruta("r1", ["a", "b"], { loop: true }));
    await vi.waitFor(() => expect(ap.active).toBe(true));
    ap.pauseForInteraction();
    expect(ap.active).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(ap.active).toBe(false);
    ap.stop();
  });
});
