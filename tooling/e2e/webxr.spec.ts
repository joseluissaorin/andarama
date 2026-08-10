import { expect, test, type Page } from "@playwright/test";

/**
 * WebXR sin gafas: se inyecta un `navigator.xr` falso que se comporta como el
 * de un visor autonomo (Quest y similares) —sesión immersive-vr, capa WebGL,
 * espacio de referencia, manos con las 25 articulaciones del módulo de
 * seguimiento de manos y pinza pulgar-índice—. Así se puede comprobar de
 * verdad, en un navegador real, que el motor entra en sesión, dibuja
 * fotogramas, ve las manos, apunta a los hotspots y los acciona.
 *
 * Depende del tour publicado por studio.spec.ts (se ejecuta después, en el
 * mismo servidor de pruebas).
 */

test.describe.configure({ mode: "serial" });

/** Estado compartido con el navegador para pilotar la sesión simulada. */
interface XrMockState {
  frames: number;
  sessionOptions: unknown;
  ended: boolean;
  /** Dirección a la que apunta la mano derecha (radianes). */
  aim: { yaw: number; pitch: number };
  /** Distancia pulgar-índice en metros: < 0,022 cierra la pinza. */
  pinch: number;
  jointsRead: number;
}

interface VrState {
  active: boolean;
  mode: string | null;
  hands: boolean;
  openHotspotId: string | null;
  hotspots: number;
}

declare global {
  interface Window {
    __xr: XrMockState;
    ULL360?: { instance?: { viewer: { vrState: () => VrState; exitVr: () => void } } };
  }
}

/** Instala el `navigator.xr` simulado antes de que cargue el visor. */
async function installXrMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { frames: 0, sessionOptions: null as unknown, ended: false, aim: { yaw: 0, pitch: 0 }, pinch: 0.06, jointsRead: 0 };
    window.__xr = state;

    // Nombres exactos del módulo XRHand (25 articulaciones por mano).
    const JOINTS = [
      "wrist",
      "thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip",
      "index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip",
      "middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip",
      "ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip",
      "pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip",
    ];

    const identity = (): Float32Array => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    /** Matriz columna-mayor cuyo -Z apunta a (yaw, pitch), origen en `pos`. */
    const aimMatrix = (yaw: number, pitch: number, pos: number[]): Float32Array => {
      const dir = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
      const m = identity();
      m[8] = -dir[0]!;
      m[9] = -dir[1]!;
      m[10] = -dir[2]!;
      m[12] = pos[0]!;
      m[13] = pos[1]!;
      m[14] = pos[2]!;
      return m;
    };

    const projection = new Float32Array([1.19, 0, 0, 0, 0, 1.73, 0, 0, 0, 0, -1.0008, -1, 0, 0, -0.1, 0]);

    class FakeHand {
      private spaces = new Map<string, { joint: string }>();
      constructor() {
        for (const name of JOINTS) this.spaces.set(name, { joint: name });
      }
      get(name: string): { joint: string } | undefined {
        return this.spaces.get(name);
      }
      get size(): number {
        return this.spaces.size;
      }
    }

    const handSource = {
      handedness: "right",
      targetRayMode: "tracked-pointer",
      targetRaySpace: { space: "ray" },
      gripSpace: { space: "grip" },
      hand: new FakeHand(),
    };

    class FakeSession extends EventTarget {
      inputSources = [handSource];
      renderState: Record<string, unknown> = {};
      private callbacks: FrameRequestCallback[] = [];
      updateRenderState(s: Record<string, unknown>): void {
        this.renderState = { ...this.renderState, ...s };
      }
      async requestReferenceSpace(type: string): Promise<{ type: string }> {
        if (type === "local") return { type };
        throw new Error("no soportado");
      }
      requestAnimationFrame(cb: FrameRequestCallback): number {
        this.callbacks.push(cb);
        return window.requestAnimationFrame((t) => {
          const pending = this.callbacks.shift();
          if (pending == null || state.ended) return;
          state.frames++;
          pending(t, makeFrame() as unknown as XRFrame);
        });
      }
      async end(): Promise<void> {
        state.ended = true;
        this.dispatchEvent(new Event("end"));
      }
    }

    const session = new FakeSession();

    const makeFrame = (): Record<string, unknown> => ({
      session,
      getViewerPose: () => ({
        transform: { matrix: identity() },
        views: [
          { eye: "left", projectionMatrix: projection, transform: { inverse: { matrix: identity() } } },
          { eye: "right", projectionMatrix: projection, transform: { inverse: { matrix: identity() } } },
        ],
      }),
      getPose: (space: { space: string }) =>
        space.space === "ray"
          ? { transform: { matrix: aimMatrix(state.aim.yaw, state.aim.pitch, [0, 0, 0]) } }
          : { transform: { matrix: aimMatrix(0, 0, [0.2, -0.3, -0.3]) } },
      fillPoses: (spaces: { joint: string }[], _ref: unknown, out: Float32Array) => {
        state.jointsRead = spaces.length;
        for (let i = 0; i < spaces.length; i++) {
          const m = identity();
          // Mano a la derecha y algo por debajo de la vista; el pulgar y el
          // índice se acercan segun `state.pinch` para simular la pinza.
          m[12] = 0.2;
          m[13] = -0.3 + i * 0.001;
          m[14] = -0.35;
          if (spaces[i]!.joint === "thumb-tip") m[13] = -0.3;
          if (spaces[i]!.joint === "index-finger-tip") m[13] = -0.3 + state.pinch;
          out.set(m, i * 16);
        }
        return true;
      },
      fillJointRadii: (spaces: unknown[], out: Float32Array) => {
        out.fill(0.008, 0, spaces.length);
        return true;
      },
    });

    class FakeXRWebGLLayer {
      framebuffer: WebGLFramebuffer | null = null;
      constructor(_session: unknown, _gl: WebGLRenderingContext) {}
      getViewport(view: { eye: string }): { x: number; y: number; width: number; height: number } {
        return { x: view.eye === "right" ? 512 : 0, y: 0, width: 512, height: 512 };
      }
    }
    (window as unknown as Record<string, unknown>).XRWebGLLayer = FakeXRWebGLLayer;
    // Sin dispositivo XR real, Chromium rechaza makeXRCompatible: forma parte
    // del dispositivo simulado hacer que resuelva.
    (WebGLRenderingContext.prototype as unknown as Record<string, unknown>).makeXRCompatible = async (): Promise<void> => {};

    // navigator.xr es un accesor de solo lectura del prototipo: asignarlo
    // directamente falla en silencio, hay que definir la propiedad propia.
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async (mode: string) => mode === "immersive-vr",
        async requestSession(_mode: string, options: unknown) {
          state.sessionOptions = options;
          state.ended = false;
          return session;
        },
        addEventListener: () => {},
      },
    });
  });
}

test("VR: entra en sesión immersive-vr y dibuja fotogramas estéreo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await installXrMock(page);
  await page.goto("/t/tour-e2e");
  await expect(page.locator(".ull360-viewer canvas").first()).toBeVisible({ timeout: 30_000 });

  await page.locator('button[aria-label="Modo VR"]').click();

  await expect
    .poll(async () => page.evaluate(() => window.__xr.frames), { timeout: 15_000, message: () => errors.join("\n") })
    .toBeGreaterThan(5);

  const info = await page.evaluate(() => ({
    options: window.__xr.sessionOptions,
    joints: window.__xr.jointsRead,
    state: window.ULL360!.instance!.viewer.vrState(),
  }));
  // hand-tracking se pide como opcional: la sesión arranca aunque no exista.
  expect((info.options as { optionalFeatures: string[] }).optionalFeatures).toContain("hand-tracking");
  expect((info.options as { optionalFeatures: string[] }).optionalFeatures).toContain("local-floor");
  expect(info.joints).toBe(25);
  expect(info.state.mode).toBe("xr");
  expect(info.state.active).toBe(true);
  expect(info.state.hands).toBe(true);
  expect(info.state.hotspots).toBeGreaterThan(0);
});

test("VR: la pinza sobre un hotspot abre su panel inmersivo", async ({ page }) => {
  await installXrMock(page);
  // Apuntar la mano al hotspot de texto del tour de pruebas.
  const tour = (await (await page.request.get("/t/tour-e2e/tour.json")).json()) as {
    scenes: { hotspots: { id: string; yaw: number; pitch: number; type: string }[] }[];
  };
  const hs = tour.scenes[0]!.hotspots[0]!;
  await page.goto("/t/tour-e2e");
  await expect(page.locator(".ull360-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.locator('button[aria-label="Modo VR"]').click();
  await expect.poll(async () => page.evaluate(() => window.__xr.frames), { timeout: 15_000 }).toBeGreaterThan(5);

  await page.evaluate(({ yaw, pitch }) => {
    window.__xr.aim = { yaw, pitch };
  }, hs);
  // Unos fotogramas apuntando y después se cierra la pinza.
  await expect.poll(async () => page.evaluate(() => window.__xr.frames), { timeout: 10_000 }).toBeGreaterThan(15);
  await page.evaluate(() => {
    window.__xr.pinch = 0.01;
  });

  await expect
    .poll(async () => page.evaluate(() => window.ULL360!.instance!.viewer.vrState().openHotspotId), { timeout: 10_000 })
    .toBe(hs.id);

  // Abrir la pinza no cierra el panel: la interacción es discreta.
  await page.evaluate(() => {
    window.__xr.pinch = 0.06;
  });
  await expect
    .poll(async () => page.evaluate(() => window.ULL360!.instance!.viewer.vrState().openHotspotId), { timeout: 5_000 })
    .toBe(hs.id);

  // Y apuntando al aspa se cierra: sin esto el panel sería una trampa.
  const cierre = await page.evaluate(() => {
    // Ángulos hacia la esquina superior derecha del panel, donde vive el
    // botón de cerrar (mismas medidas que el motor).
    const DISTANCE = 1.6;
    const WIDTH = 1.6;
    const HEIGHT = (WIDTH * 800) / 1280;
    const u = (1280 - 132 + 48) / 1280;
    const v = (20 + 28) / 800;
    const yaw = Math.atan(((u - 0.5) * WIDTH) / DISTANCE);
    // Al girar, el rayo llega al plano más lejos: la altura se amplía por
    // 1/cos(yaw) y sin corregirlo se pasa por encima del botón.
    return { yaw, pitch: Math.atan((((0.5 - v) * HEIGHT) / DISTANCE) * Math.cos(yaw)) };
  });
  await page.evaluate((aim) => {
    window.__xr.aim = aim;
  }, cierre);
  const antes = await page.evaluate(() => window.__xr.frames);
  await expect.poll(async () => page.evaluate(() => window.__xr.frames), { timeout: 10_000 }).toBeGreaterThan(antes + 8);
  await page.evaluate(() => {
    window.__xr.pinch = 0.01;
  });
  await expect
    .poll(async () => page.evaluate(() => window.ULL360!.instance!.viewer.vrState().openHotspotId), { timeout: 10_000 })
    .toBeNull();
});

test("VR: salir de la sesión devuelve el visor plano", async ({ page }) => {
  await installXrMock(page);
  await page.goto("/t/tour-e2e");
  await expect(page.locator(".ull360-viewer canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.locator('button[aria-label="Modo VR"]').click();
  await expect.poll(async () => page.evaluate(() => window.__xr.frames), { timeout: 15_000 }).toBeGreaterThan(5);

  await page.evaluate(() => window.ULL360!.instance!.viewer.exitVr());
  await expect
    .poll(async () => page.evaluate(() => window.ULL360!.instance!.viewer.vrState().active), { timeout: 5_000 })
    .toBe(false);
  await expect(page.locator(".ull360-viewer canvas").first()).toBeVisible();
});
