import { describe, expect, it } from "vitest";
import { planetSample } from "./littlePlanet.js";

/**
 * La proyección se prueba sin DOM: `planetSample` es la matemática pura que
 * usa la tabla de correspondencia, así que basta comprobar que los puntos
 * notables del disco caen donde deben en el equirect.
 */
describe("little planet", () => {
  const W = 512;
  const H = 256;

  it("el centro del disco es el nadir", () => {
    const s = planetSample(0, 0, W, H);
    expect(s).not.toBeNull();
    // Última fila: pitch = -90°
    expect(s!.y).toBe(H - 1);
  });

  it("el horizonte cae en el radio esperado", () => {
    // r * RADIUS = tan(45°) = 1 → r = 1/1,9
    const s = planetSample(1 / 1.9, 0, W, H);
    expect(s).not.toBeNull();
    // pitch 0 → mitad vertical de la imagen
    expect(Math.abs(s!.y - H / 2)).toBeLessThanOrEqual(1);
  });

  it("fuera del disco no hay muestra", () => {
    expect(planetSample(0.9, 0.9, W, H)).toBeNull();
  });

  it("el frente del panorama queda arriba del disco", () => {
    // Arriba del disco es v negativo en coordenadas de pantalla; con v = -r
    // el yaw es 0 y en equirect eso es el centro horizontal.
    const s = planetSample(0, -0.5, W, H);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.x - W / 2)).toBeLessThanOrEqual(1);
  });

  it("izquierda y derecha del disco son lados opuestos del panorama", () => {
    const izq = planetSample(-0.5, 0, W, H)!;
    const der = planetSample(0.5, 0, W, H)!;
    expect(Math.abs(izq.x - der.x)).toBeGreaterThan(W / 4);
  });
});
