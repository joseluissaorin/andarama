import { describe, expect, it } from "vitest";
import { dirFromYawPitch, matForward, matPosition, rayRect, raySphere, vecDistance, vecNormalize } from "./math.js";
import { HAND_JOINTS } from "./input.js";
import { needsExternalContinuation, isImmersivePanel, stripMarkdown } from "./panel.js";

describe("matemáticas XR", () => {
  it("extrae posición y dirección de una matriz de transformación", () => {
    // Matriz identidad trasladada a (1, 2, 3): mira hacia -Z
    const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]);
    expect(matPosition(m)).toEqual([1, 2, 3]);
    expect(matForward(m)).toEqual([-0, -0, -1]);
  });

  it("interseca un rayo con la esfera de un hotspot", () => {
    const ray = { origin: [0, 0, 0] as [number, number, number], direction: [0, 0, -1] as [number, number, number] };
    const hit = raySphere(ray, [0, 0, -6], 0.55);
    expect(hit).not.toBeNull();
    expect(hit!).toBeCloseTo(5.45, 2);
    // Una esfera a la espalda no se interseca
    expect(raySphere(ray, [0, 0, 6], 0.55)).toBeNull();
    // Un rayo que pasa de largo tampoco
    expect(raySphere({ ...ray, direction: [1, 0, 0] }, [0, 0, -6], 0.55)).toBeNull();
  });

  it("interseca un rayo con el panel y devuelve coordenadas normalizadas", () => {
    const center: [number, number, number] = [0, 0, -2];
    const right: [number, number, number] = [1, 0, 0];
    const up: [number, number, number] = [0, 1, 0];
    const centre = rayRect({ origin: [0, 0, 0], direction: [0, 0, -1] }, center, right, up, 0.8, 0.5);
    expect(centre).not.toBeNull();
    expect(centre!.u).toBeCloseTo(0.5, 5);
    expect(centre!.v).toBeCloseTo(0.5, 5);
    expect(centre!.distance).toBeCloseTo(2, 5);

    // Esquina superior izquierda del panel
    const corner = rayRect(
      { origin: [-0.4, 0.25, 0], direction: [0, 0, -1] },
      center,
      right,
      up,
      0.8,
      0.5,
    );
    expect(corner!.u).toBeCloseTo(0.25, 5);
    expect(corner!.v).toBeCloseTo(0.25, 5);

    // Fuera del rectángulo
    expect(rayRect({ origin: [5, 0, 0], direction: [0, 0, -1] }, center, right, up, 0.8, 0.5)).toBeNull();
  });

  it("convierte yaw/pitch a dirección unitaria con yaw 0 mirando a -Z", () => {
    const forward = dirFromYawPitch(0, 0);
    expect(forward[0]).toBeCloseTo(0, 6);
    expect(forward[2]).toBeCloseTo(-1, 6);
    const up = dirFromYawPitch(0, Math.PI / 2);
    expect(up[1]).toBeCloseTo(1, 6);
    const east = dirFromYawPitch(Math.PI / 2, 0);
    expect(east[0]).toBeCloseTo(1, 6);
    expect(vecNormalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("entrada de manos", () => {
  it("declara las 25 articulaciones del módulo WebXR Hand Input", () => {
    expect(HAND_JOINTS).toHaveLength(25);
    expect(HAND_JOINTS[0]).toBe("wrist");
    expect(HAND_JOINTS).toContain("thumb-tip");
    expect(HAND_JOINTS).toContain("index-finger-tip");
    expect(new Set(HAND_JOINTS).size).toBe(25);
  });

  it("la distancia pulgar-índice discrimina la pinza", () => {
    // Umbrales del detector: cierra por debajo de 22 mm, abre por encima de 32
    const closed = vecDistance([0, 0, 0], [0.015, 0, 0]);
    const open = vecDistance([0, 0, 0], [0.06, 0, 0]);
    expect(closed).toBeLessThan(0.022);
    expect(open).toBeGreaterThan(0.032);
  });
});

describe("paneles inmersivos", () => {
  it("clasifica qué tipos se consumen dentro de VR", () => {
    for (const type of ["text", "image", "gallery", "videoFile", "audio", "quiz", "compare", "tooltip"]) {
      expect(isImmersivePanel(type)).toBe(true);
      expect(needsExternalContinuation(type)).toBe(false);
    }
    for (const type of ["pdf", "web", "form", "embedVideo", "model3d"]) {
      expect(needsExternalContinuation(type)).toBe(true);
      expect(isImmersivePanel(type)).toBe(false);
    }
  });

  it("convierte Markdown a texto legible para el lienzo", () => {
    const md = "# Título\n\nUn **texto** con [enlace](https://ull.es) y `código`.\n\n- uno\n- dos";
    const plain = stripMarkdown(md);
    expect(plain).toContain("Título");
    expect(plain).toContain("Un texto con enlace y código.");
    expect(plain).toContain("• uno");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("](");
  });
});
