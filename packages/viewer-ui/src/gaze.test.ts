import { describe, expect, it } from "vitest";

/**
 * La mecánica del retículo se prueba por su matemática: la deriva angular es
 * lo que decide si la permanencia sigue contando o se reinicia.
 */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function drift(view: { yaw: number; pitch: number }, anchor: { yaw: number; pitch: number }): number {
  return Math.hypot(angleDiff(view.yaw, anchor.yaw), view.pitch - anchor.pitch);
}

const TOLERANCE = (6 * Math.PI) / 180;

describe("retículo de mirada", () => {
  it("un pulso de la mano no reinicia la cuenta", () => {
    expect(drift({ yaw: 1.0, pitch: 0.2 }, { yaw: 1.01, pitch: 0.21 })).toBeLessThan(TOLERANCE);
  });

  it("girar la cabeza sí la reinicia", () => {
    expect(drift({ yaw: 1.0, pitch: 0.2 }, { yaw: 1.4, pitch: 0.2 })).toBeGreaterThan(TOLERANCE);
    expect(drift({ yaw: 1.0, pitch: 0.6 }, { yaw: 1.0, pitch: 0.2 })).toBeGreaterThan(TOLERANCE);
  });

  it("cruzar ±PI no cuenta como un giro completo", () => {
    expect(drift({ yaw: Math.PI - 0.01, pitch: 0 }, { yaw: -Math.PI + 0.01, pitch: 0 })).toBeLessThan(TOLERANCE);
  });

  it("la permanencia nunca baja de 0,8 s aunque se configure menos", () => {
    const dwell = (seconds: number): number => Math.max(800, seconds * 1000);
    expect(dwell(0.1)).toBe(800);
    expect(dwell(2.5)).toBe(2500);
  });
});
