import { describe, expect, it } from "vitest";
import { projectToScreen } from "./projections";

/**
 * La inversa del shader de proyecciones: con ella los hotspots se recolocan
 * en el little planet, el ojo de pez, Panini y la arquitectónica en vez de
 * esconderse. Se comprueba lo que se puede razonar sin dibujar: el centro, la
 * lateralidad y lo que queda a la espalda.
 */
const vista = { yaw: 0, pitch: 0, fov: 1.2 };
const ASPECT = 16 / 9;

describe("projectToScreen", () => {
  it("lo que se mira de frente cae en el centro (ojo de pez, Panini, arquitectónica)", () => {
    for (const mode of ["fisheye", "pannini", "architectural"] as const) {
      const p = projectToScreen(mode, vista, ASPECT, { yaw: 0, pitch: 0 });
      expect(p, mode).not.toBeNull();
      expect(p!.x).toBeCloseTo(0.5, 5);
      expect(p!.y).toBeCloseTo(0.5, 5);
    }
  });

  it("en el little planet el centro es el nadir (pitch +π/2 de Marzipano): el suelo", () => {
    const p = projectToScreen("littlePlanet", vista, ASPECT, { yaw: 0, pitch: Math.PI / 2 });
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(0.5, 5);
    expect(p!.y).toBeCloseTo(0.5, 5);
  });

  it("la derecha queda a la derecha y arriba queda arriba", () => {
    for (const mode of ["fisheye", "pannini", "architectural"] as const) {
      const derecha = projectToScreen(mode, vista, ASPECT, { yaw: 0.3, pitch: 0 })!;
      const arriba = projectToScreen(mode, vista, ASPECT, { yaw: 0, pitch: -0.3 })!;
      expect(derecha.x, mode).toBeGreaterThan(0.5);
      expect(Math.abs(derecha.y - 0.5), mode).toBeLessThan(1e-6);
      expect(arriba.y, mode).toBeLessThan(0.5);
      expect(Math.abs(arriba.x - 0.5), mode).toBeLessThan(1e-6);
    }
  });

  it("mirar hacia abajo (pitch positivo de Marzipano) sube el horizonte en pantalla", () => {
    const abajo = projectToScreen("fisheye", { ...vista, pitch: 0.5 }, ASPECT, { yaw: 0, pitch: 0 })!;
    expect(abajo.y).toBeLessThan(0.5);
    expect(Math.abs(abajo.x - 0.5)).toBeLessThan(1e-6);
  });

  it("girar la vista mueve el marcador en sentido contrario", () => {
    const quieto = projectToScreen("fisheye", vista, ASPECT, { yaw: 0.3, pitch: 0 })!;
    const girado = projectToScreen("fisheye", { ...vista, yaw: 0.3 }, ASPECT, { yaw: 0.3, pitch: 0 })!;
    expect(girado.x).toBeCloseTo(0.5, 5);
    expect(girado.x).toBeLessThan(quieto.x);
  });

  it("lo que queda a la espalda no se dibuja en Panini ni en la arquitectónica", () => {
    expect(projectToScreen("pannini", vista, ASPECT, { yaw: Math.PI, pitch: 0 })).toBeNull();
    expect(projectToScreen("architectural", vista, ASPECT, { yaw: Math.PI, pitch: 0 })).toBeNull();
  });

  it("la rectilínea no la resuelve este módulo (la pone Marzipano)", () => {
    expect(projectToScreen("rectilinear", vista, ASPECT, { yaw: 0, pitch: 0 })).toBeNull();
  });
});
