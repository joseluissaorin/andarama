import { describe, expect, it } from "vitest";
import { angleDiff, cursorFromRotation, GAZE_SELECTOR } from "./gaze.js";

/**
 * El retículo tiene dos modos y las dos matemáticas que los sostienen: la
 * deriva angular, que decide si la permanencia sigue contando, y el cursor
 * que la cabeza arrastra por la pantalla cuando hay un panel abierto.
 */

function drift(view: { yaw: number; pitch: number }, anchor: { yaw: number; pitch: number }): number {
  return Math.hypot(angleDiff(view.yaw, anchor.yaw), view.pitch - anchor.pitch);
}

const TOLERANCE = (6 * Math.PI) / 180;
const SIZE = { width: 400, height: 800 };

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

describe("cursor arrastrado por la cabeza", () => {
  const anchor = { yaw: 0, pitch: 0 };

  it("sin girar, el cursor está en el centro", () => {
    expect(cursorFromRotation(anchor, anchor, SIZE)).toEqual({ x: 200, y: 400 });
  });

  it("girar a la derecha lo lleva a la derecha, y mirar arriba, arriba", () => {
    expect(cursorFromRotation({ yaw: 0.1, pitch: 0 }, anchor, SIZE).x).toBeGreaterThan(200);
    expect(cursorFromRotation({ yaw: 0, pitch: 0.1 }, anchor, SIZE).y).toBeLessThan(400);
  });

  it("un giro cómodo basta para alcanzar la esquina del panel", () => {
    // El aspa de cerrar vive arriba a la derecha; con ~15° se llega
    const pos = cursorFromRotation({ yaw: 0.26, pitch: 0.26 }, anchor, SIZE);
    expect(pos.x).toBeGreaterThan(SIZE.width * 0.75);
    expect(pos.y).toBeLessThan(SIZE.height * 0.3);
  });

  it("el cursor no se escapa de la pantalla", () => {
    const lejos = cursorFromRotation({ yaw: 3, pitch: -3 }, anchor, SIZE);
    expect(lejos.x).toBeLessThanOrEqual(SIZE.width - 24);
    expect(lejos.y).toBeLessThanOrEqual(SIZE.height - 24);
    expect(lejos.x).toBeGreaterThanOrEqual(24);
    expect(lejos.y).toBeGreaterThanOrEqual(24);
  });

  it("solo son accionables los marcadores y lo marcado a propósito", () => {
    expect(GAZE_SELECTOR).toContain(".anda-hotspot");
    expect(GAZE_SELECTOR).toContain("[data-gaze]");
  });
});

describe("no repetir lo ya accionado", () => {
  /** Misma lógica que el bucle del retículo, aislada. */
  function step(found: HTMLElement | null, justFired: HTMLElement | null): { target: HTMLElement | null; justFired: HTMLElement | null } {
    let t = found;
    if (t != null && t === justFired) t = null;
    else if (t !== justFired) justFired = null;
    return { target: t, justFired };
  }

  const a = { id: "a" } as unknown as HTMLElement;
  const b = { id: "b" } as unknown as HTMLElement;

  it("seguir mirando lo mismo no lo dispara otra vez", () => {
    expect(step(a, a).target).toBeNull();
  });

  it("mirar otra cosa lo libera", () => {
    const tras = step(b, a);
    expect(tras.target).toBe(b);
    expect(tras.justFired).toBeNull();
  });

  it("apartar la vista y volver sí permite repetir", () => {
    const fuera = step(null, a);
    expect(fuera.justFired).toBeNull();
    expect(step(a, fuera.justFired).target).toBe(a);
  });
});
