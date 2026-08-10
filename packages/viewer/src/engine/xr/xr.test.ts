import { describe, expect, it } from "vitest";
import { billboardModelMatrix, spherePoint } from "./render.js";
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

describe("esfera del entorno", () => {
  const R = 50;

  it("el centro de la imagen queda al frente, mirando a -Z", () => {
    const p = spherePoint(0.5, 0.5, R, true);
    expect(Math.abs(p[0])).toBeLessThan(1e-6);
    expect(Math.abs(p[1])).toBeLessThan(1e-6);
    expect(p[2]).toBeCloseTo(-R, 5);
  });

  it("no está en espejo: a la derecha de la imagen corresponde la derecha real", () => {
    // Un cuarto de vuelta a la derecha (yaw +90°) es u = 0,75 y debe caer en +X
    const p = spherePoint(0.75, 0.5, R, true);
    expect(p[0]).toBeCloseTo(R, 5);
  });

  it("arriba de la imagen es arriba", () => {
    expect(spherePoint(0.5, 0, R, true)[1]).toBeCloseTo(R, 5);
    expect(spherePoint(0.5, 1, R, true)[1]).toBeCloseTo(-R, 5);
  });

  it("la dirección de la esfera coincide con la del resto del motor", () => {
    for (const yaw of [0, 0.7, -1.3, 2.9]) {
      const u = ((0.5 + yaw / (2 * Math.PI)) % 1 + 1) % 1;
      const p = spherePoint(u, 0.5, 1, true);
      const d = dirFromYawPitch(yaw, 0);
      expect(Math.abs(p[0] - d[0])).toBeLessThan(1e-6);
      expect(Math.abs(p[2] - d[2])).toBeLessThan(1e-6);
    }
  });

  it("la esfera exterior (manos y mandos) sigue siendo una esfera del radio pedido", () => {
    for (const [u, v] of [[0, 0.5], [0.25, 0.3], [0.5, 0.5], [0.9, 0.8]]) {
      const p = spherePoint(u!, v!, R, false);
      expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(R, 4);
    }
  });
});

describe("orientación de los billboards", () => {
  /** Esquinas del quad tal y como las define la geometría, con su UV. */
  const CORNERS: { local: [number, number]; u: number; v: number }[] = [
    { local: [-0.5, -0.5], u: 0, v: 1 },
    { local: [0.5, -0.5], u: 1, v: 1 },
    { local: [-0.5, 0.5], u: 0, v: 0 },
    { local: [0.5, 0.5], u: 1, v: 0 },
  ];

  function world(m: Float32Array, x: number, y: number): [number, number, number] {
    return [
      m[0]! * x + m[4]! * y + m[12]!,
      m[1]! * x + m[5]! * y + m[13]!,
      m[2]! * x + m[6]! * y + m[14]!,
    ];
  }

  it("el borde izquierdo de la textura queda a la izquierda de quien mira", () => {
    // Hotspot justo al frente, ojo en el origen
    const m = billboardModelMatrix([0, 0, -6], [0, 0, 0], 1);
    const izq = world(m, ...CORNERS[0]!.local);
    const der = world(m, ...CORNERS[1]!.local);
    expect(izq[0]).toBeLessThan(der[0]);
  });

  it("y arriba de la textura queda arriba", () => {
    const m = billboardModelMatrix([0, 0, -6], [0, 0, 0], 1);
    const abajo = world(m, ...CORNERS[0]!.local);
    const arriba = world(m, ...CORNERS[2]!.local);
    expect(arriba[1]).toBeGreaterThan(abajo[1]);
  });

  it("también con el hotspot a un lado", () => {
    // A la derecha del usuario: el billboard gira, pero el texto no se refleja
    const m = billboardModelMatrix([6, 0, 0], [0, 0, 0], 1);
    const izq = world(m, ...CORNERS[0]!.local);
    const der = world(m, ...CORNERS[1]!.local);
    // Mirando hacia +X (yaw 90°), la derecha del espectador es +Z
    expect(izq[2]).toBeLessThan(der[2]);
  });

  it("el billboard queda perpendicular a la mirada", () => {
    const m = billboardModelMatrix([3, 1, -4], [0, 0, 0], 1);
    const fwd = [m[8]!, m[9]!, m[10]!];
    const haciaElOjo = [-3, -1, 4];
    const n = Math.hypot(...haciaElOjo);
    for (let i = 0; i < 3; i++) expect(Math.abs(fwd[i]! - haciaElOjo[i]! / n)).toBeLessThan(1e-6);
  });
});
