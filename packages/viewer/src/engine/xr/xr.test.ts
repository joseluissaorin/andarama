import { describe, expect, it } from "vitest";
import { angleDiff, dirFromYawPitch, matForward, matPosition, rayRect, raySphere, vecDistance, vecNormalize } from "./math.js";
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

describe("permanencia de la mirada", () => {
  it("angleDiff da la vuelta corta también cruzando ±PI", () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2, 6);
    expect(angleDiff(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(-0.1, 6);
    expect(Math.abs(angleDiff(Math.PI, -Math.PI))).toBeLessThanOrEqual(1e-9);
  });

  it("el margen de cabeza tolera un temblor pequeño y no un giro", () => {
    const TOLERANCE = 0.1;
    expect(Math.abs(angleDiff(1.0, 1.02))).toBeLessThan(TOLERANCE);
    expect(Math.abs(angleDiff(1.0, 1.4))).toBeGreaterThan(TOLERANCE);
  });
});

describe("cerrar el panel mirándolo", () => {
  // El panel se ancla a PANEL_DISTANCE de la cabeza, mirando a la vista.
  const DISTANCE = 1.6;
  const WIDTH = 1.6;
  const HEIGHT = (WIDTH * 800) / 1280;

  /** Igual que openPanel: centro delante, «derecha» perpendicular al forward. */
  function anchorFor(forward: [number, number, number]): {
    center: [number, number, number];
    right: [number, number, number];
    up: [number, number, number];
  } {
    const center: [number, number, number] = [forward[0] * DISTANCE, forward[1] * DISTANCE, forward[2] * DISTANCE];
    // Igual que el motor: cross(arriba, -forward)
    const right = vecNormalize([
      1 * -forward[2] - 0 * 0,
      0 * -forward[0] - 0 * -forward[2],
      0 * 0 - 1 * -forward[0],
    ]);
    return { center, right, up: [0, 1, 0] };
  }

  it("el aspa de cerrar cae donde la mirada puede alcanzarla", () => {
    const forward: [number, number, number] = [0, 0, -1];
    const anchor = anchorFor(forward);
    // Zona «close» del panel: esquina superior derecha
    const uClose = (1280 - 132 + 96 / 2) / 1280;
    const vClose = (20 + 56 / 2) / 800;
    // Ángulos para apuntar ahí. Ojo: al girar en horizontal el rayo llega al
    // plano más lejos, así que la altura se amplía por 1/cos(yaw); ignorarlo
    // hace que el rayo pase por encima del aspa.
    const yaw = Math.atan(((uClose - 0.5) * WIDTH) / DISTANCE);
    const pitch = Math.atan((((0.5 - vClose) * HEIGHT) / DISTANCE) * Math.cos(yaw));
    const dir = dirFromYawPitch(yaw, pitch);
    const hit = rayRect({ origin: [0, 0, 0], direction: dir }, anchor.center, anchor.right, anchor.up, WIDTH / 2, HEIGHT / 2);
    expect(hit).not.toBeNull();
    // Dentro de la zona «close», no meramente cerca
    expect(hit!.u).toBeGreaterThan((1280 - 132) / 1280);
    expect(hit!.u).toBeLessThan((1280 - 132 + 96) / 1280);
    expect(hit!.v).toBeGreaterThan(20 / 800);
    expect(hit!.v).toBeLessThan((20 + 56) / 800);
  });

  it("girar hacia el aspa es un gesto cómodo, no un contorsionismo", () => {
    const uClose = (1280 - 132 + 48) / 1280;
    const yawDeg = (Math.atan(((uClose - 0.5) * WIDTH) / DISTANCE) * 180) / Math.PI;
    expect(yawDeg).toBeGreaterThan(10);
    expect(yawDeg).toBeLessThan(35);
  });

  it("mirar al centro del panel no cierra nada", () => {
    const anchor = anchorFor([0, 0, -1]);
    const hit = rayRect({ origin: [0, 0, 0], direction: [0, 0, -1] }, anchor.center, anchor.right, anchor.up, WIDTH / 2, HEIGHT / 2);
    expect(hit).not.toBeNull();
    expect(hit!.u).toBeCloseTo(0.5, 2);
    expect(hit!.v).toBeCloseTo(0.5, 2);
  });
});
