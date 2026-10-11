import { describe, expect, it } from "vitest";
import { shouldOpenFloorplanAtStart } from "./floorplan.js";

describe("plano abierto al empezar", () => {
  const conPlano = { ui: { floorplanOpen: true }, floorplans: [{}] };

  it("se abre solo si el autor lo pide y hay plano", () => {
    expect(shouldOpenFloorplanAtStart(conPlano, 1280)).toBe(true);
    expect(shouldOpenFloorplanAtStart({ ...conPlano, ui: {} }, 1280)).toBe(false);
    expect(shouldOpenFloorplanAtStart({ ...conPlano, floorplans: [] }, 1280)).toBe(false);
    expect(shouldOpenFloorplanAtStart({ ui: { floorplanOpen: true } }, 1280)).toBe(false);
  });

  it("en un móvil empieza cerrado para no tapar el panorama", () => {
    expect(shouldOpenFloorplanAtStart(conPlano, 390)).toBe(false);
    expect(shouldOpenFloorplanAtStart(conPlano, 720)).toBe(true);
  });
});
