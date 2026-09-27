import { describe, expect, it } from "vitest";
import { resolveStartView } from "./startView";

/**
 * «Usar vista actual» guarda la vista inicial de la escena, pero el visor
 * arrancaba siempre con la vista por defecto: el docente la fijaba, publicaba
 * y el recorrido seguía abriéndose mirando a otro sitio.
 */
const tour = {
  start: { scene: "a" },
  scenes: [
    { id: "a", initialView: { yaw: 1.2, pitch: -0.1, fov: 1.1 } },
    { id: "b", initialView: { yaw: -2, pitch: 0.2, fov: 1.3 } },
    { id: "c" },
  ],
} as never;

describe("resolveStartView", () => {
  it("arranca con la vista inicial de la escena de inicio", () => {
    expect(resolveStartView(tour, {})).toEqual({ yaw: 1.2, pitch: -0.1, fov: 1.1 });
  });

  it("un enlace a otra escena usa la vista inicial de esa escena", () => {
    expect(resolveStartView(tour, { sceneId: "b" })).toEqual({ yaw: -2, pitch: 0.2, fov: 1.3 });
  });

  it("la vista del enlace manda y completa lo que falte", () => {
    expect(resolveStartView(tour, { sceneId: "b", view: { yaw: 0.5 } })).toEqual({ yaw: 0.5, pitch: 0.2, fov: 1.3 });
  });

  it("la vista fijada para el tour gana en la escena inicial", () => {
    const conVista = { ...(tour as object), start: { scene: "a", view: { yaw: 3, pitch: 0, fov: 1 } } } as never;
    expect(resolveStartView(conVista, {})).toEqual({ yaw: 3, pitch: 0, fov: 1 });
    // pero no en otra escena
    expect(resolveStartView(conVista, { sceneId: "b" })).toEqual({ yaw: -2, pitch: 0.2, fov: 1.3 });
  });

  it("sin vista guardada, la vista por defecto", () => {
    const v = resolveStartView(tour, { sceneId: "c" });
    expect(typeof v.yaw).toBe("number");
    expect(typeof v.fov).toBe("number");
  });
});
