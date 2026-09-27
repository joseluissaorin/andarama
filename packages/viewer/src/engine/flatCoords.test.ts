import { describe, expect, it } from "vitest";
import { anglesToFlat, anglesToViewCoords, flatToAngles, viewCoordsToAngles } from "./flatCoords";

/**
 * En una escena gigapíxel 2D los hotspots se quedaban clavados en el centro:
 * la vista plana devuelve {x, y} y el arrastre leía yaw/pitch indefinidos.
 */
describe("coordenadas de escenas planas", () => {
  it("el centro de la imagen es 0/0, como los hotspots antiguos", () => {
    expect(flatToAngles({ x: 0.5, y: 0.5 })).toEqual({ yaw: 0, pitch: 0 });
    expect(anglesToFlat({ yaw: 0, pitch: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it("ida y vuelta sin pérdida", () => {
    for (const p of [{ x: 0.1, y: 0.9 }, { x: 0.75, y: 0.25 }, { x: 0, y: 1 }]) {
      const back = anglesToFlat(flatToAngles(p));
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it("lo que devuelve la vista se traduce según el tipo de escena", () => {
    expect(viewCoordsToAngles({ x: 1, y: 0.5 }, true)).toEqual({ yaw: Math.PI, pitch: 0 });
    expect(viewCoordsToAngles({ yaw: 0.3, pitch: -0.2 }, false)).toEqual({ yaw: 0.3, pitch: -0.2 });
    // En una escena plana no hay yaw: antes se guardaba undefined
    expect(viewCoordsToAngles({ yaw: undefined, pitch: undefined }, true)).toBeNull();
    expect(viewCoordsToAngles(null, false)).toBeNull();
    expect(anglesToViewCoords({ yaw: -Math.PI, pitch: Math.PI / 2 }, true)).toEqual({ x: 0, y: 1 });
  });
});
