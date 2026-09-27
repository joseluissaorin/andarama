import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dirFromYawPitch, marzipanoToVr, viewMatrix, yawPitchFromDir, type Vec3 } from "./math.js";
import { spherePoint } from "./render.js";
import { GazeDwell } from "./gaze.js";
import { XrInput, isTrackedPointer } from "./input.js";
import { FADE_OUT_MS, SceneTransition, switchMarzipanoScene, type SceneSwitcher } from "./transition.js";

/**
 * Pruebas de los tres fallos que el equipo docente vio en dispositivos reales
 * (iPhone con cartón, Android con Chrome y Meta Quest). Aquí solo se puede
 * comprobar la matemática y el orden de las cosas; la prueba de verdad es la
 * lista de apps/docs/.../usuario/comprobar-realidad-virtual.md, con las gafas puestas.
 */

const cerca = (a: Vec3, b: Vec3, tol = 1e-6): void => {
  for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, -Math.log10(tol));
};

/** Dirección en el visor plano, con la fórmula de Marzipano (projections.ts). */
function direccionMarzipano(yaw: number, pitch: number): Vec3 {
  // Marzipano: +Z al frente y y = -sin(pitch). El mundo VR mira a -Z.
  const x = Math.cos(pitch) * Math.sin(yaw);
  const y = -Math.sin(pitch);
  const z = Math.cos(pitch) * Math.cos(yaw);
  return [x, y, -z];
}

/** Aplica la parte de rotación de una matriz 4x4 columna-mayor. */
function rotar(m: Float32Array, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2],
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2],
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2],
  ];
}

const MUESTRAS = [
  { yaw: 0, pitch: 0.3 },
  { yaw: 0.8, pitch: -0.5 },
  { yaw: -2.1, pitch: 0.9 },
  { yaw: 3, pitch: -1.2 },
  { yaw: 1.4, pitch: 0.05 },
];

describe("iPhone con cartón: hotspots en el mismo sitio que en el visor plano", () => {
  it("la dirección VR de un hotspot coincide con la de Marzipano", () => {
    for (const h of MUESTRAS) {
      const vr = marzipanoToVr(h);
      cerca(dirFromYawPitch(vr.yaw, vr.pitch), direccionMarzipano(h.yaw, h.pitch));
    }
  });

  it("el hotspot cae sobre el mismo píxel de la panorámica que pinta la esfera VR", () => {
    for (const h of MUESTRAS) {
      // Equirectangular de Marzipano: u = 0,5 en yaw 0; pitch positivo, más abajo
      const u = (((0.5 + h.yaw / (2 * Math.PI)) % 1) + 1) % 1;
      const v = 0.5 + h.pitch / Math.PI;
      const pixel = spherePoint(u, v, 1, true);
      const vr = marzipanoToVr(h);
      cerca(dirFromYawPitch(vr.yaw, vr.pitch), pixel, 1e-5);
    }
  });

  it("sin el cambio de signo el hotspot salía reflejado respecto al horizonte (regresión)", () => {
    const h = { yaw: 0.4, pitch: 0.3 }; // un poco por debajo del horizonte
    const antes = dirFromYawPitch(h.yaw, h.pitch);
    const ahora = dirFromYawPitch(marzipanoToVr(h).yaw, marzipanoToVr(h).pitch);
    expect(antes[1]).toBeGreaterThan(0); // salía por encima
    expect(ahora[1]).toBeLessThan(0); // ahora, por debajo, como en pantalla
  });

  it("un hotspot en el centro de la vista plana queda en el centro de cada ojo", () => {
    const vista = { yaw: 1.1, pitch: 0.35 };
    const camara = marzipanoToVr(vista);
    const vm = viewMatrix(camara.yaw, camara.pitch);
    const hs = marzipanoToVr(vista);
    cerca(rotar(vm, dirFromYawPitch(hs.yaw, hs.pitch)), [0, 0, -1], 1e-5);
    // Uno algo más abajo en el editor sale algo más abajo en las gafas
    const abajo = marzipanoToVr({ yaw: vista.yaw, pitch: vista.pitch + 0.2 });
    expect(rotar(vm, dirFromYawPitch(abajo.yaw, abajo.pitch))[1]).toBeLessThan(0);
  });

  it("yawPitchFromDir invierte dirFromYawPitch", () => {
    for (const h of MUESTRAS) {
      const back = yawPitchFromDir(dirFromYawPitch(h.yaw, h.pitch));
      expect(back.yaw).toBeCloseTo(h.yaw, 6);
      expect(back.pitch).toBeCloseTo(h.pitch, 6);
    }
  });
});

describe("Android con Chrome: selección por mirada", () => {
  it("acciona tras la permanencia (1,5 s) y el anillo avanza mientras tanto", () => {
    const dwell = new GazeDwell(1500, 0.1);
    expect(dwell.update("puerta", 0, 0, 0)).toBe(false);
    expect(dwell.update("puerta", 0, 0, 750)).toBe(false);
    expect(dwell.progress).toBeCloseTo(0.5, 5);
    expect(dwell.update("puerta", 0, 0, 1499)).toBe(false);
    expect(dwell.update("puerta", 0, 0, 1500)).toBe(true);
    expect(dwell.progress).toBe(0);
  });

  it("no repite mientras se sigue mirando lo ya accionado; se rearma al apartar la vista", () => {
    const dwell = new GazeDwell(1500, 0.1);
    dwell.update("enlace", 0, 0, 0);
    expect(dwell.update("enlace", 0, 0, 1600)).toBe(true);
    for (let t = 1700; t < 6000; t += 100) expect(dwell.update("enlace", 0, 0, t)).toBe(false);
    dwell.update(null, 0.5, 0, 6100);
    dwell.update("enlace", 0, 0, 6200);
    expect(dwell.update("enlace", 0, 0, 7700)).toBe(true);
  });

  it("cambiar de objetivo o mover la cabeza más del margen reinicia el contador", () => {
    const dwell = new GazeDwell(1500, 0.1);
    dwell.update("a", 0, 0, 0);
    dwell.update("b", 0, 0, 1000);
    expect(dwell.update("b", 0, 0, 2000)).toBe(false);
    expect(dwell.update("b", 0, 0, 2500)).toBe(true);

    dwell.update("c", 0, 0, 3000);
    dwell.update("c", 0.3, 0, 4000); // giro de cabeza
    expect(dwell.update("c", 0.3, 0, 5000)).toBe(false);
    expect(dwell.update("c", 0.3, 0, 5500)).toBe(true);
  });

  it("un toque (botón del visor) vacía el anillo y la permanencia no lo repite", () => {
    const dwell = new GazeDwell(1500, 0.1);
    dwell.update("panel", 0, 0, 0);
    dwell.update("panel", 0, 0, 1000);
    dwell.consume("panel");
    expect(dwell.progress).toBe(0);
    expect(dwell.update("panel", 0, 0, 3000)).toBe(false);
  });

  it("la mirada de Chrome no cuenta como mando: sin rayo ni flecha", () => {
    const identidad = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const frame = { getPose: () => ({ transform: { matrix: identidad } }) };
    const session = {
      inputSources: [
        { targetRayMode: "gaze", handedness: "none", targetRaySpace: {} },
        { targetRayMode: "tracked-pointer", handedness: "right", targetRaySpace: {}, gripSpace: {} },
      ],
    };
    const pointers = new XrInput().read(frame, {}, session);
    expect(pointers.map((p) => p.targetRayMode)).toEqual(["gaze", "tracked-pointer"]);
    expect(pointers.filter((p) => isTrackedPointer(p))).toHaveLength(1);
    expect(isTrackedPointer({ targetRayMode: "screen" })).toBe(false);
  });
});

/** Doble de XRSession: solo guarda y dispara los callbacks de fotograma. */
class FakeXRSession {
  private queue: ((time: number, frame: unknown) => void)[] = [];
  requestAnimationFrame(cb: (time: number, frame: unknown) => void): number {
    this.queue.push(cb);
    return this.queue.length;
  }
  tick(time: number): void {
    const cbs = this.queue;
    this.queue = [];
    for (const cb of cbs) cb(time, {});
  }
}

/** Marzipano dentro de una sesión inmersiva del Quest: la transición no acaba nunca. */
const marzipanoCongelado: SceneSwitcher = { switchScene: () => {} };

const vaciarMicrotareas = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("Meta Quest: el salto de escena no depende de los temporizadores de la ventana", () => {
  beforeEach(() => {
    // Relojes falsos que nunca se adelantan, y el rAF de la ventana roto: si
    // algo del salto dependiera de ellos, la prueba se quedaría esperando.
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => {
      throw new Error("requestAnimationFrame de la ventana: suspendido en inmersivo");
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function montar(wait: boolean) {
    const session = new FakeXRSession();
    const aplicados: string[] = [];
    let escena = "vestibulo";
    const transition = new SceneTransition<string>({
      navigate: async (target) => {
        // Lo que hace TourViewer.goTo: confirma la escena y cambia en Marzipano
        escena = target;
        await switchMarzipanoScene(marzipanoCongelado, {}, {}, wait);
      },
      load: async () => `textura:${escena}`,
      apply: (env) => aplicados.push(env),
    });
    const velos: number[] = [];
    const onFrame = (time: number): void => {
      session.requestAnimationFrame(onFrame);
      velos.push(transition.frame(time));
    };
    session.requestAnimationFrame(onFrame);
    return { session, transition, aplicados, velos };
  }

  it("la panorámica nueva se sube en un fotograma de la sesión, tras el fundido a negro", async () => {
    const { session, transition, aplicados, velos } = montar(false);
    void transition.request("patio");
    expect(transition.busy).toBe(true);
    expect(transition.hideHotspots).toBe(true);

    let t = 1000;
    for (let i = 0; i < 60; i++) {
      await vaciarMicrotareas();
      session.tick(t);
      if (aplicados.length > 0 && velos.at(-1)! >= 1) {
        // Cuando se sube la textura el velo está completamente negro
        expect(t - 1000).toBeGreaterThanOrEqual(FADE_OUT_MS);
      }
      t += 16;
    }
    expect(aplicados).toEqual(["textura:patio"]);
    expect(transition.busy).toBe(false);
    expect(transition.hideHotspots).toBe(false);
    expect(velos.at(-1)).toBe(0);
    expect(Math.max(...velos)).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mientras dura el salto se ignoran otros saltos", async () => {
    const { session, transition, aplicados } = montar(false);
    void transition.request("patio");
    void transition.request("claustro");
    for (let t = 0; t < 1200; t += 16) {
      await vaciarMicrotareas();
      session.tick(t);
    }
    expect(aplicados).toEqual(["textura:patio"]);
  });

  it("esperando a Marzipano (lo de antes) la panorámica no cambiaba nunca", async () => {
    const { session, transition, aplicados } = montar(true);
    void transition.request("patio");
    for (let t = 0; t < 3000; t += 16) {
      await vaciarMicrotareas();
      session.tick(t);
    }
    expect(aplicados).toEqual([]);
    expect(transition.busy).toBe(true);
  });

  it("si la escena nueva no carga, el salto termina y no bloquea los siguientes", async () => {
    const errores: unknown[] = [];
    const transition = new SceneTransition<string>({
      navigate: async () => {},
      load: async () => {
        throw new Error("Esta escena no soporta VR");
      },
      apply: () => {},
      onError: (e) => errores.push(e),
    });
    void transition.request("roto");
    await vaciarMicrotareas();
    for (let t = 0; t < 1000; t += 16) transition.frame(t);
    expect(errores).toHaveLength(1);
    expect(transition.busy).toBe(false);
  });
});
