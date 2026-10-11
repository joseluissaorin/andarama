import { describe, expect, it, vi } from "vitest";
import type { Hotspot } from "@andarama/schema";

// El giroscopio arrastra Marzipano, que necesita un navegador: aquí no hace falta.
vi.mock("./gyro.js", () => ({ DeviceOrientationControlMethod: { requestPermission: async () => true } }));

import { VRManager, type VrCallbacks, type VrEnvironment, type VrHotspot, type VrNavigationBlock } from "./vr.js";
import { FADE_IN_MS, FADE_OUT_MS } from "./xr/transition.js";
import { GazeDwell, GAZE_GRACE_MS, GAZE_STICKY_FACTOR, gazeHitRadius } from "./xr/gaze.js";
import { isPhysicalPointer, isTrackedPointer, XrInput } from "./xr/input.js";
import { fitTextureSize, MAX_ENV_TEXTURE } from "./xr/render.js";
import { embedThumbnail, panelImageUrls, youtubeId, type VrPdfDocument } from "./xr/panel.js";
import {
  angleDiff,
  arrivalYawOffset,
  dirFromYawPitch,
  matTranslateYawScale,
  panoToWorldYaw,
  raySphere,
  yawPitchFromDir,
  type Vec3,
} from "./xr/math.js";

/**
 * Fallos del modo inmersivo vistos en dispositivos reales (2-10-2026): la vista
 * de llegada no se respetaba al saltar, las compuertas se saltaban en VR, la
 * mirada en Android fallaba con el móvil en la mano y en Meta Quest la
 * panorámica grande no se subía a la GPU.
 */

const vaciarMicrotareas = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function hotspot(id: string, type: string, extra: Partial<VrHotspot> = {}): VrHotspot {
  return {
    id,
    yaw: 0,
    pitch: 0,
    label: id,
    type,
    hotspot: { id, type, yaw: 0, pitch: 0 } as unknown as Hotspot,
    ...extra,
  };
}

interface Montaje {
  vr: VRManager;
  navegaciones: { target: string; hotspot?: Hotspot }[];
  vista: { yaw: number; pitch: number };
  bloqueo: { valor: VrNavigationBlock | null };
}

function montar(hotspots: VrHotspot[], llegadas: Record<string, number> = {}): Montaje {
  const navegaciones: Montaje["navegaciones"] = [];
  const vista = { yaw: 0, pitch: 0 };
  const bloqueo: Montaje["bloqueo"] = { valor: null };
  const env: VrEnvironment = { element: {} as TexImageSource, stereo: "mono", dynamic: false };
  const callbacks: VrCallbacks = {
    getEnvironment: async () => env,
    getHotspots: () => hotspots,
    onNavigate: async (target, hs) => {
      navegaciones.push({ target, hotspot: hs });
      // El visor plano aplica la vista de llegada del paso (computeEntryView)
      vista.yaw = llegadas[target] ?? 0;
    },
    navigationBlock: () => bloqueo.valor,
    onDirectAction: () => {},
    onQuizAnswer: () => {},
    onExternalRequest: () => {},
    onExit: () => {},
    getViewYawPitch: () => ({ ...vista }),
    text: (v) => String(v ?? ""),
    url: (v) => v,
    t: (k) => k,
  };
  const vr = new VRManager({} as HTMLElement, callbacks);
  return { vr, navegaciones, vista, bloqueo };
}

/** Acceso a lo privado: el bucle real necesita WebGL. */
type Interno = {
  activateHotspot(hs: VrHotspot): void;
  transition: { frame(now: number): number };
  resolveArrival(headYaw: number): void;
  hotspotCenter(hs: VrHotspot): Vec3;
};
const interno = (vr: VRManager): Interno => vr as unknown as Interno;

async function saltar(m: Montaje, hs: VrHotspot, headYaw: number): Promise<void> {
  const i = interno(m.vr);
  i.activateHotspot(hs);
  await vaciarMicrotareas();
  // Fundido a negro completo: se aplica la escena nueva en este fotograma
  i.transition.frame(0);
  i.transition.frame(FADE_OUT_MS + 1);
  i.resolveArrival(headYaw);
  // Fundido de vuelta terminado: el modo VR admite el siguiente salto
  i.transition.frame(FADE_OUT_MS + FADE_IN_MS + 10);
}

describe("VR: vista de llegada tras un salto", () => {
  it("el desfase pone la vista de llegada justo delante de la cabeza", () => {
    for (const [llegada, cabeza] of [
      [1.2, 0],
      [-2.8, 2.5],
      [0, -1],
      [3.1, -3.1],
    ] as const) {
      const offset = arrivalYawOffset(llegada, cabeza);
      expect(angleDiff(panoToWorldYaw(llegada, offset), cabeza)).toBeCloseTo(0, 9);
      // La esfera gira igual que los hotspots: el punto de llegada de la
      // panorámica (u = 0,5 + yaw/2π) cae en la dirección de la cabeza.
      const m = matTranslateYawScale([0, 0, 0], offset, 1);
      const d = dirFromYawPitch(llegada, 0.3);
      const girado: Vec3 = [m[0]! * d[0] + m[8]! * d[2], d[1], m[2]! * d[0] + m[10]! * d[2]];
      const esperado = dirFromYawPitch(cabeza, 0.3);
      for (let k = 0; k < 3; k++) expect(girado[k]).toBeCloseTo(esperado[k]!, 6);
    }
  });

  it("el salto pasa el hotspot pulsado y gira la escena hacia su llegada", async () => {
    const puerta = hotspot("puerta", "navigation", { target: "patio", yaw: 0.4 });
    const m = montar([puerta], { patio: 2 });
    // La cabeza mira a yaw −0,5 cuando llega la escena nueva
    await saltar(m, puerta, -0.5);
    expect(m.navegaciones).toHaveLength(1);
    expect(m.navegaciones[0]!.target).toBe("patio");
    expect(m.navegaciones[0]!.hotspot).toBe(puerta.hotspot);
    expect(m.vr.yawOffset).toBeCloseTo(2.5, 9);
    // Un hotspot de la escena nueva situado en la vista de llegada aparece
    // delante de la cabeza, no donde estaría sin girar.
    const enLlegada = hotspot("x", "text", { yaw: 2, pitch: 0 });
    const centro = interno(m.vr).hotspotCenter(enLlegada);
    expect(angleDiff(yawPitchFromDir(centro).yaw, -0.5)).toBeCloseTo(0, 6);
  });

  it("cada salto recalcula el desfase con la cabeza de ese momento", async () => {
    const ida = hotspot("ida", "navigation", { target: "b" });
    const m = montar([ida], { b: 1 });
    await saltar(m, ida, 0);
    expect(m.vr.yawOffset).toBeCloseTo(1, 9);
    // Vuelta a la escena con la cabeza girada 90°
    await saltar(m, { ...ida, target: "b" }, Math.PI / 2);
    expect(m.vr.yawOffset).toBeCloseTo(1 - Math.PI / 2, 9);
  });
});

describe("VR: compuertas", () => {
  it("con una pregunta pendiente no salta, lo dice dentro de la escena y abre la pregunta", async () => {
    const puerta = hotspot("puerta", "navigation", { target: "patio" });
    const pregunta = hotspot("q1", "quiz");
    const m = montar([puerta, pregunta]);
    m.bloqueo.valor = { message: "Responde correctamente para poder avanzar", hotspotId: "q1", reason: "quiz" };
    interno(m.vr).activateHotspot(puerta);
    await vaciarMicrotareas();
    expect(m.navegaciones).toHaveLength(0);
    expect(m.vr.noticeText).toBe("Responde correctamente para poder avanzar");
    expect(m.vr.openHotspotId).toBe("q1");
  });

  it("con un tesoro pendiente avisa pero no lo destapa", async () => {
    const puerta = hotspot("puerta", "navigation", { target: "patio" });
    const m = montar([puerta, hotspot("t1", "treasure")]);
    m.bloqueo.valor = { message: "Encuentra el tesoro de esta escena para poder avanzar", hotspotId: "t1", reason: "treasure" };
    interno(m.vr).activateHotspot(puerta);
    await vaciarMicrotareas();
    expect(m.navegaciones).toHaveLength(0);
    expect(m.vr.noticeText).toContain("tesoro");
    expect(m.vr.openHotspotId).toBeNull();
  });

  it("sin compuertas pendientes salta y quita el aviso", async () => {
    const puerta = hotspot("puerta", "navigation", { target: "patio" });
    const m = montar([puerta]);
    m.bloqueo.valor = { message: "Envía el formulario de esta escena para poder avanzar", reason: "form" };
    interno(m.vr).activateHotspot(puerta);
    m.bloqueo.valor = null;
    interno(m.vr).activateHotspot(puerta);
    await vaciarMicrotareas();
    expect(m.navegaciones.map((n) => n.target)).toEqual(["patio"]);
    expect(m.vr.noticeText).toBeNull();
  });
});

describe("VR: quiz con varias preguntas", () => {
  it("enseña las preguntas de una en una y cada respuesta lleva su pregunta", () => {
    const quiz = hotspot("qm", "quiz", {
      hotspot: {
        id: "qm",
        type: "quiz",
        yaw: 0,
        pitch: 0,
        attempts: 1,
        questions: [
          { id: "p1", question: "Uno", kind: "single", options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
          { id: "p2", question: "Dos", kind: "single", points: 2, options: [{ id: "c", text: "C" }, { id: "d", text: "D", correct: true }] },
        ],
      } as unknown as Hotspot,
    });
    const m = montar([quiz]);
    const respuestas: unknown[][] = [];
    (m.vr as unknown as { callbacks: VrCallbacks }).callbacks.onQuizAnswer = (...args) => {
      respuestas.push(args);
    };
    type ConPanel = Interno & {
      activateZone(zone: { id: string }, u: number): void;
      panelState: { index: number; answered: boolean; selected: Set<string> };
    };
    const i = interno(m.vr) as ConPanel;
    i.activateHotspot(quiz);
    // Sin comprobar todas, el «›» de la última no lleva al resumen
    i.activateZone({ id: "opt:a" }, 0);
    i.activateZone({ id: "check" }, 0);
    i.activateZone({ id: "next" }, 0);
    expect(i.panelState).toMatchObject({ index: 1, answered: false });
    i.activateZone({ id: "next" }, 0);
    expect(i.panelState.index).toBe(1);
    i.activateZone({ id: "opt:c" }, 0);
    i.activateZone({ id: "check" }, 0);
    expect(respuestas).toEqual([
      ["qm", true, 1, ["a"], "p1"],
      ["qm", false, 2, ["c"], "p2"],
    ]);
    // Volver atrás enseña la respuesta comprobada
    i.activateZone({ id: "prev" }, 0);
    expect(i.panelState.answered).toBe(true);
    expect([...i.panelState.selected]).toEqual(["a"]);
    // Con las dos comprobadas, la última lleva al resumen
    i.activateZone({ id: "next" }, 0);
    i.activateZone({ id: "next" }, 0);
    expect(i.panelState.index).toBe(2);
  });

  it("con intentos ilimitados, fallar deja volver a probar y solo llega el acierto", () => {
    const quiz = hotspot("q1", "quiz", {
      hotspot: {
        id: "q1",
        type: "quiz",
        yaw: 0,
        pitch: 0,
        question: "¿?",
        kind: "single",
        options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }],
      } as unknown as Hotspot,
    });
    const m = montar([quiz]);
    const respuestas: unknown[][] = [];
    (m.vr as unknown as { callbacks: VrCallbacks }).callbacks.onQuizAnswer = (...args) => {
      respuestas.push(args);
    };
    const i = interno(m.vr) as Interno & {
      activateZone(zone: { id: string }, u: number): void;
      panelState: { answered: boolean; wrongHint: boolean };
    };
    i.activateHotspot(quiz);
    i.activateZone({ id: "opt:b" }, 0);
    i.activateZone({ id: "check" }, 0);
    expect(i.panelState).toMatchObject({ answered: false, wrongHint: true });
    expect(respuestas).toEqual([]);
    i.activateZone({ id: "opt:a" }, 0);
    i.activateZone({ id: "check" }, 0);
    expect(respuestas).toEqual([["q1", true, 1, ["a"], "q1"]]);
  });
});

describe("Android con cartón: mirada tolerante al temblor", () => {
  it("mover la cabeza sin salir del hotspot no reinicia la permanencia", () => {
    const dwell = new GazeDwell(1500);
    dwell.update("puerta", 0);
    // El móvil tiembla, pero el rayo sigue dentro del hotspot
    for (let t = 100; t < 1500; t += 100) expect(dwell.update("puerta", t)).toBe(false);
    expect(dwell.update("puerta", 1500)).toBe(true);
  });

  it("un parpadeo corto fuera del hotspot no vacía el anillo ni dispara", () => {
    const dwell = new GazeDwell(1500);
    dwell.update("puerta", 0);
    dwell.update("puerta", 900);
    expect(dwell.update(null, 900 + GAZE_GRACE_MS - 20)).toBe(false);
    expect(dwell.progress).toBeGreaterThan(0.5);
    expect(dwell.update("puerta", 1300)).toBe(false);
    expect(dwell.update("puerta", 1500)).toBe(true);
  });

  it("apartar la vista más del margen sí reinicia", () => {
    const dwell = new GazeDwell(1500);
    dwell.update("puerta", 0);
    dwell.update("puerta", 1000);
    dwell.update(null, 1000 + GAZE_GRACE_MS + 50);
    expect(dwell.progress).toBe(0);
    dwell.update("puerta", 1400);
    expect(dwell.update("puerta", 2800)).toBe(false);
    expect(dwell.update("puerta", 2900)).toBe(true);
  });

  it("el hotspot mirado conserva la mirada con un radio mayor (histéresis)", () => {
    const base = 0.55;
    expect(gazeHitRadius(base, false)).toBe(base);
    expect(gazeHitRadius(base, true)).toBeCloseTo(base * GAZE_STICKY_FACTOR, 9);
    // A 6 m, un rayo desviado 0,11 rad (~6,3°) cae fuera del radio normal
    // pero dentro del ampliado: antes se perdía el objetivo con 0,1 rad.
    const centro = dirFromYawPitch(0, 0).map((c) => c * 6) as Vec3;
    const rayo = { origin: [0, 0, 0] as Vec3, direction: dirFromYawPitch(0.11, 0) };
    expect(raySphere(rayo, centro, gazeHitRadius(base, false))).toBeNull();
    expect(raySphere(rayo, centro, gazeHitRadius(base, true))).not.toBeNull();
  });

  it("una fuente sin targetRayMode no apaga la mirada; solo mandos o manos de verdad", () => {
    expect(isTrackedPointer({})).toBe(false);
    expect(isTrackedPointer({ targetRayMode: "tracked-pointer" })).toBe(true);
    expect(isPhysicalPointer({ targetRayMode: "tracked-pointer" })).toBe(false);
    expect(isPhysicalPointer({ targetRayMode: "tracked-pointer", gamepad: {} })).toBe(true);
    expect(isPhysicalPointer({ targetRayMode: "tracked-pointer", hand: {} })).toBe(true);
    expect(isPhysicalPointer({ targetRayMode: "gaze", gamepad: {} })).toBe(false);

    const identidad = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const frame = { getPose: () => ({ transform: { matrix: identidad } }) };
    const pointers = new XrInput().read(frame, {}, {
      inputSources: [{ handedness: "none", targetRaySpace: {} }, { targetRayMode: "gaze", targetRaySpace: {} }],
    });
    expect(pointers.filter((p) => isTrackedPointer(p))).toHaveLength(0);
    expect(pointers.some((p) => p.physical)).toBe(false);
  });
});

describe("Meta Quest: tamaño de la textura del entorno", () => {
  it("reduce a MAX_TEXTURE_SIZE conservando la proporción", () => {
    expect(fitTextureSize(16384, 8192, 8192)).toEqual({ width: 8192, height: 4096, scaled: true });
    expect(fitTextureSize(12000, 6000, 4096)).toEqual({ width: 4096, height: 2048, scaled: true });
    expect(fitTextureSize(8000, 3000, 4096)).toEqual({ width: 4096, height: 1536, scaled: true });
  });

  it("no toca lo que ya cabe", () => {
    expect(fitTextureSize(4096, 2048, 8192)).toEqual({ width: 4096, height: 2048, scaled: false });
    expect(fitTextureSize(8192, 4096, 8192)).toEqual({ width: 8192, height: 4096, scaled: false });
  });

  it("el tope es 8192 aunque el dispositivo admita más", () => {
    expect(MAX_ENV_TEXTURE).toBe(8192);
    const tope = Math.min(16384, MAX_ENV_TEXTURE);
    expect(fitTextureSize(16384, 8192, tope).width).toBe(8192);
  });
});

describe("Meta Quest: PDF y vídeos de YouTube dentro de las gafas (7-10-2026)", () => {
  type ConPanel = Interno & {
    activateZone(zone: { id: string }, u: number): void;
    panelState: { index: number; scroll: number };
    pdf: { status: string; pages: Map<number, unknown> } | null;
    openHotspot: VrHotspot | null;
  };

  function documento(paginas: number) {
    const dibujadas: number[] = [];
    const doc: VrPdfDocument = {
      numPages: paginas,
      renderPage: async (n: number, ancho: number) => {
        dibujadas.push(n);
        return { width: ancho, height: ancho * 1.41 } as unknown as HTMLCanvasElement;
      },
    };
    return { doc, dibujadas };
  }

  it("el PDF se abre en el panel y se pasa de página con anterior y siguiente", async () => {
    const pdf = hotspot("doc", "pdf", { hotspot: { id: "doc", type: "pdf", yaw: 0, pitch: 0, url: "m/folleto.pdf" } as unknown as Hotspot });
    const m = montar([pdf]);
    const { doc, dibujadas } = documento(3);
    const pedidos: string[] = [];
    const cb = (m.vr as unknown as { callbacks: VrCallbacks }).callbacks;
    cb.url = (v) => `/t/demo/${v}`;
    cb.loadPdf = async (url) => {
      pedidos.push(url);
      return doc;
    };
    const i = interno(m.vr) as ConPanel;
    i.activateHotspot(pdf);
    await vaciarMicrotareas();
    expect(pedidos).toEqual(["/t/demo/m/folleto.pdf"]);
    expect(i.pdf?.status).toBe("ready");
    // La primera página y, por adelantado, la segunda
    expect(dibujadas).toEqual([1, 2]);

    i.activateZone({ id: "scroll-down" }, 0);
    expect(i.panelState.scroll).toBeGreaterThan(0);
    i.activateZone({ id: "next" }, 0);
    // Página nueva: arriba del todo
    expect(i.panelState).toMatchObject({ index: 1, scroll: 0 });
    await vaciarMicrotareas();
    expect(dibujadas).toEqual([1, 2, 3]);
    i.activateZone({ id: "next" }, 0);
    i.activateZone({ id: "next" }, 0);
    expect(i.panelState.index).toBe(2);
    i.activateZone({ id: "prev" }, 0);
    i.activateZone({ id: "prev" }, 0);
    i.activateZone({ id: "prev" }, 0);
    expect(i.panelState.index).toBe(0);
    // Cerrar suelta el documento
    i.activateZone({ id: "close" }, 0);
    expect(i.pdf).toBeNull();
    expect(i.openHotspot).toBeNull();
  });

  it("si el PDF no se puede abrir, el panel lo dice y ofrece verlo fuera", async () => {
    const pdf = hotspot("doc", "pdf", { hotspot: { id: "doc", type: "pdf", yaw: 0, pitch: 0, url: "x.pdf" } as unknown as Hotspot });
    const m = montar([pdf]);
    (m.vr as unknown as { callbacks: VrCallbacks }).callbacks.loadPdf = async () => {
      throw new Error("404");
    };
    const i = interno(m.vr) as ConPanel;
    i.activateHotspot(pdf);
    await vaciarMicrotareas();
    expect(i.pdf?.status).toBe("error");
  });

  it("un vídeo de YouTube ofrece salir de VR y verlo en el recorrido", () => {
    const yt = hotspot("yt", "embedVideo", {
      hotspot: { id: "yt", type: "embedVideo", yaw: 0, pitch: 0, provider: "youtube", videoId: "dQw4w9WgXcQ" } as unknown as Hotspot,
    });
    // La miniatura se pide con un <img>: aquí no hay navegador
    vi.stubGlobal("Image", class {
      complete = false;
      crossOrigin = "";
      src = "";
    });
    const m = montar([yt]);
    const abiertos: string[] = [];
    (m.vr as unknown as { callbacks: VrCallbacks }).callbacks.onOpenAfterExit = (id) => abiertos.push(id);
    // Salir de la sesión necesita WebXR: se cuenta la petición
    let salidas = 0;
    m.vr.exit = () => {
      salidas++;
    };
    const i = interno(m.vr) as ConPanel;
    i.activateHotspot(yt);
    expect(i.openHotspot?.id).toBe("yt");
    i.activateZone({ id: "exit-open" }, 0);
    expect(abiertos).toEqual(["yt"]);
    expect(salidas).toBe(1);
    expect(i.openHotspot).toBeNull();
    vi.unstubAllGlobals();
  });

  it("la miniatura de YouTube sale del id o de cualquier forma de su dirección", () => {
    for (const ref of ["dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/shorts/dQw4w9WgXcQ"]) {
      expect(youtubeId(ref)).toBe("dQw4w9WgXcQ");
    }
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
    const hs = { id: "v", type: "embedVideo", yaw: 0, pitch: 0, provider: "youtube", videoId: "dQw4w9WgXcQ" } as unknown as Hotspot;
    expect(embedThumbnail(hs)).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(panelImageUrls(hs, { url: (u) => u })).toEqual(["https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"]);
    expect(embedThumbnail({ ...hs, provider: "vimeo" } as Hotspot)).toBeNull();
  });
});
