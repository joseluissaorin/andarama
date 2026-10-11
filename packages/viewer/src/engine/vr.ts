import type { Hotspot, QuizHotspot, QuizQuestion } from "@andarama/schema";
import { isQuizAnswerCorrect, quizQuestionPoints, quizQuestions } from "@andarama/schema";
import { XrRenderer, fitForTexture } from "./xr/render.js";
import {
  CubePanorama,
  TileStore,
  chooseCubeLevel,
  cubeLevelSizes,
  cubeLevelTiles,
  loadImageElement,
  vrTargetFaceSize,
  type CubePanoramaStats,
  type VrCubeSource,
} from "./xr/panorama.js";
import { XrInput, isTrackedPointer, type XrPointer } from "./xr/input.js";
import { GazeDwell, gazeHitRadius } from "./xr/gaze.js";
import { SceneTransition } from "./xr/transition.js";
import { cameraQuaternion, rotateAroundWorldY, screenAngle, viewMatrixFromQuat, yawPitchFromQuat, type Quat } from "./xr/orientation.js";
import { DeviceOrientationControlMethod } from "./gyro.js";
import {
  drawPanel,
  newPanelState,
  panelImageUrls,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  PDF_PAGE_WIDTH,
  VIDEO_RECT,
  type PanelContext,
  type PanelPdfView,
  type PanelState,
  type PanelZone,
  type VrPdfDocument,
} from "./xr/panel.js";
import {
  arrivalYawOffset,
  dirFromYawPitch,
  matForward,
  matMultiply,
  matPosition,
  matTranslateScale,
  matTranslateYawScale,
  panoToWorldYaw,
  perspective,
  raySphere,
  rayRect,
  vecAdd,
  vecNormalize,
  vecScale,
  vecSub,
  viewMatrix,
  yawPitchFromDir,
  type Ray,
  type Vec3,
} from "./xr/math.js";

/**
 * Modo inmersivo del visor.
 *
 * - **WebXR** (Meta Quest, Pico, Vive, visores con navegador compatible):
 *   sesión `immersive-vr` con seguimiento de manos opcional. Se dibujan las
 *   dos manos articuladas y el rayo de apuntado de manos y mandos; cualquier
 *   hotspot se activa apuntando y pellizcando (o con el gatillo). El
 *   contenido se abre en un panel flotante dibujado con Canvas 2D.
 *   Si la sesión no tiene mandos ni manos —Chrome en Android con un visor de
 *   cartón, cuya entrada es la mirada—, se dibuja el retículo y se acciona
 *   por permanencia, como en el modo cartón; el botón del visor sigue
 *   valiendo como atajo.
 * - **Cardboard**: estéreo lado a lado con giroscopio para móviles sin WebXR.
 *
 * Convenio de ángulos: aquí el pitch es positivo hacia ARRIBA, al revés que
 * en Marzipano. Quien llama convierte con `marzipanoToVr` (xr/math.ts).
 *
 * No hay dependencias externas ni peticiones al servidor: un tour exportado
 * conserva el modo inmersivo íntegro siempre que se sirva por HTTPS, que es
 * lo que exige WebXR (contexto seguro).
 */

export interface VrHotspot {
  id: string;
  /** Factor de tamaño respecto al botón estándar de 44 px. */
  scale?: number;
  yaw: number;
  /** Convenio VR: positivo hacia arriba (el de Marzipano, cambiado de signo). */
  pitch: number;
  label: string;
  type: string;
  /** Escena destino en los hotspots de navegación. */
  target?: string;
  /** Hotspot completo: lo necesita el panel inmersivo. */
  hotspot: Hotspot;
}

export interface VrEnvironment {
  /**
   * Imagen/lienzo/vídeo equirectangular que se enseña ya. En las panorámicas
   * es la vista previa (pequeña, va dentro del tour.json): algo que ver
   * mientras llega lo bueno. null si no hay nada inmediato.
   */
  element: (TexImageSource & { videoWidth?: number }) | null;
  /** Layout estéreo del contenido. */
  stereo: "mono" | "tb" | "sbs";
  /** true si es vídeo (retexturizar cada fotograma). */
  dynamic: boolean;
  /** Panorámica multirresolución: se pinta el cubo y se refina por teselas (xr/panorama.ts). */
  cube?: VrCubeSource;
  /** Equirectangular a resolución completa que sustituye a `element` cuando llega. */
  fullUrl?: string;
}

/** Lo que conviene tener descargado antes de saltar: las escenas vecinas. */
export type VrPrefetch = { cube: VrCubeSource } | { url: string };

/** Escena lista para pintar: texturas en la GPU y teselas en camino. */
interface PreparedScene {
  env: VrEnvironment;
  renderer: XrRenderer | null;
  /** Esfera equirectangular: vista previa, imagen completa o vídeo. */
  tex: WebGLTexture | null;
  cube: CubePanorama | null;
  disposed: boolean;
}

/** Cuánto se espera en negro, como mucho, a que la escena llegue entera. */
const WAIT_CACHED_MS = 1500;
/** Sin caché, cuánto se espera a la etapa rápida si ya hay vista previa. */
const WAIT_BASE_MS = 700;
/** Sin vista previa no hay nada que enseñar: se espera más. */
const WAIT_NOTHING_MS = 8000;

function within<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([promise, new Promise<void>((r) => setTimeout(r, ms))]);
}

/** Por qué no se puede salir de la escena desde VR (compuerta pendiente). */
export interface VrNavigationBlock {
  /** Texto ya traducido que se enseña dentro de las gafas. */
  message: string;
  /** Hotspot que retiene: si es una pregunta, se abre su panel. */
  hotspotId?: string;
  reason?: string;
}

export interface VrCallbacks {
  getEnvironment(): Promise<VrEnvironment>;
  getHotspots(): VrHotspot[];
  /**
   * Salto de escena. Recibe el hotspot de navegación pulsado para que el
   * destino aplique su vista de llegada (`entry`), como en el visor plano.
   */
  onNavigate(target: string, hotspot?: Hotspot): Promise<void>;
  /**
   * Compuertas pendientes en la escena actual. El salto en VR se hace sin
   * pasar por los bloqueos de `goTo` (lleva `force`), así que se consultan
   * aquí antes de saltar. null si se puede salir.
   */
  navigationBlock?(): VrNavigationBlock | null;
  /** Hotspots que actúan sin panel: enlace, estado, polígono. */
  onDirectAction(hotspot: VrHotspot): void;
  onQuizAnswer(hotspotId: string, correct: boolean, points: number, selected?: string[], questionId?: string): void;
  /** Contenido que se continúa fuera de VR: se abre al terminar la sesión. */
  onExternalRequest(url: string): void;
  /**
   * Abrir el hotspot en el visor plano en cuanto acabe la sesión (vídeos de
   * YouTube, páginas web…). Sin esto se cae a `onExternalRequest`.
   */
  onOpenAfterExit?(hotspotId: string): void;
  /** Escenas a las que se puede saltar desde la actual, para descargarlas antes. */
  getPrefetch?(): VrPrefetch[];
  /** Abre un PDF (pdf.js, carga perezosa) para enseñar sus páginas en el panel. */
  loadPdf?(url: string): Promise<VrPdfDocument>;
  onExit(): void;
  /** Vista del visor plano, ya en el convenio VR (pitch positivo hacia arriba). */
  getViewYawPitch(): { yaw: number; pitch: number };
  text(value: unknown): string;
  url(value: string): string;
  t(key: string, params?: Record<string, string | number>): string;
}

const HOTSPOT_RADIUS = 6;
const HOTSPOT_SIZE = 0.85;
const HOTSPOT_HIT_RADIUS = 0.55;
const PANEL_DISTANCE = 1.6;
const PANEL_WIDTH_M = 1.6;
const PANEL_HEIGHT_M = (PANEL_WIDTH_M * PANEL_HEIGHT) / PANEL_WIDTH;
const TOUCH_DISTANCE = 0.045;
const DEFAULT_DWELL_MS = 1500;
/** Duración del aviso flotante (compuerta pendiente). */
const NOTICE_MS = 3200;
const NOTICE_DISTANCE = 2.4;
const NOTICE_WIDTH_M = 1.5;

/** El tamaño del marcador se respeta, pero acotado: en gafas un cartel enorme molesta. */
function clampScale(scale: number | undefined): number {
  return Math.max(0.6, Math.min(1.8, scale ?? 1));
}

/** Clave estable de un objetivo, para el temporizador de mirada. */
function targetKey(target: PointerTarget): string | null {
  if (target == null) return null;
  return target.kind === "hotspot" ? target.hotspot.id : `zone:${target.zone.id}`;
}

type PointerTarget =
  | { kind: "hotspot"; hotspot: VrHotspot; distance: number }
  | { kind: "panel"; zone: PanelZone; u: number; v: number; distance: number }
  | null;

export class VRManager {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private renderer: XrRenderer | null = null;
  private input = new XrInput();
  private xrSession: any = null;
  private refSpace: any = null;
  private mode: "xr" | "cardboard" | null = null;
  /** Escena que se ve. */
  private scene: PreparedScene | null = null;
  /** Escenas en preparación (para soltarlas si se sale de VR a medias). */
  private preparing = new Set<PreparedScene>();
  /** Teselas descargadas: las de la escena actual y las de sus vecinas. */
  private store = new TileStore();
  private prefetchAbort: AbortController | null = null;
  private iconTex = new Map<string, WebGLTexture>();
  private raf = 0;
  private cardboardYawPitch = { yaw: 0, pitch: 0 };
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private orientationGranted = true;
  private orientationGate: HTMLElement | null = null;
  private exitButton: HTMLButtonElement | null = null;
  /** Cambio de escena con fundido, al ritmo del bucle de la sesión. */
  private transition = new SceneTransition<PreparedScene>({
    navigate: (target) => this.callbacks.onNavigate(target, this.navHotspot),
    load: async () => this.prepareScene(await this.callbacks.getEnvironment()),
    apply: (scene) => this.applyScene(scene),
    onError: (error) => console.warn("[andarama] no se pudo cambiar de escena en VR", error),
  });
  /** Opacidad del velo negro del fundido en el fotograma actual. */
  private fade = 0;
  /** Hotspot de navegación del salto en curso (para la vista de llegada). */
  private navHotspot: Hotspot | undefined;
  /**
   * Giro de la panorámica respecto al mundo (xr/math.ts, `arrivalYawOffset`):
   * un punto con yaw ψ se ve con yaw ψ − desfase. Se recalcula cada vez que
   * se aplica una escena para que el visitante mire la vista de llegada.
   */
  private sceneYawOffset = 0;
  /** Yaw de la panorámica que debe quedar delante en el próximo fotograma. */
  private pendingArrivalYaw: number | null = null;
  /** Aviso flotante (por ejemplo, una compuerta pendiente). */
  private notice: { text: string; until: number | null; dir: Vec3; tex: WebGLTexture | null; aspect: number } | null = null;
  /** Hora del fotograma actual (bucle XR o de la ventana). */
  private frameTime = 0;

  // Panel abierto
  private openHotspot: VrHotspot | null = null;
  private panelState: PanelState = newPanelState();
  private panelCanvas: HTMLCanvasElement | null = null;
  private panelTex: WebGLTexture | null = null;
  private panelZones: PanelZone[] = [];
  private panelAnchor: { center: Vec3; right: Vec3; up: Vec3 } | null = null;
  private panelMedia: HTMLVideoElement | HTMLAudioElement | null = null;
  private panelDirty = true;
  /** Último repintado del panel con medios (la barra de progreso). */
  private panelDrawnAt = 0;
  /** Textura del vídeo del panel, encima del lienzo (no se redibuja el panel por fotograma). */
  private videoTex: WebGLTexture | null = null;
  private videoTime = -1;
  /** El vídeo arrancó sin sonido porque el navegador no dejó reproducirlo con él. */
  private videoMutedByPolicy = false;
  /** Documento PDF del panel abierto y sus páginas ya dibujadas. */
  private pdf: {
    token: object;
    status: "loading" | "ready" | "error";
    doc: VrPdfDocument | null;
    pages: Map<number, HTMLCanvasElement>;
    rendering: number | null;
  } | null = null;

  // Estado de punteros
  private hover = new Map<string, PointerTarget>();
  private images = new Map<string, HTMLImageElement>();
  private headPosition: Vec3 = [0, 0, 0];
  private dwell = new GazeDwell(DEFAULT_DWELL_MS);
  private xrForward: Vec3 | null = null;
  /** Lo que hay bajo la mirada en XR, se use o no la selección por mirada. */
  private xrGazeTarget: PointerTarget = null;
  /**
   * La sesión ha tenido mandos o manos de verdad (con `gamepad` o `hand`, o
   * con un `select` real): entonces no se acciona por mirada.
   */
  private trackedPointerSeen = false;
  /** Orientación completa del móvil en cartón: conserva el balanceo. */
  private cardboardQuat: Quat | null = null;
  private rotateHint: HTMLElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private tapHandler: ((e: Event) => void) | null = null;
  private reticleTex = new Map<string, WebGLTexture>();
  /** Permanencia configurable por tour (`vr.dwellSeconds`). */
  get dwellMs(): number {
    return this.dwell.dwellMs;
  }

  set dwellMs(ms: number) {
    this.dwell.dwellMs = ms;
  }

  onChange: ((active: boolean, mode: "xr" | "cardboard" | null) => void) | null = null;

  constructor(
    private container: HTMLElement,
    private callbacks: VrCallbacks,
  ) {}

  static async xrSupported(): Promise<boolean> {
    const xr = (navigator as any).xr;
    if (xr == null) return false;
    try {
      return await xr.isSessionSupported("immersive-vr");
    } catch {
      return false;
    }
  }

  /** WebXR solo existe en contextos seguros (HTTPS o localhost). */
  static secureContextOk(): boolean {
    return typeof isSecureContext === "undefined" ? true : isSecureContext;
  }

  get active(): boolean {
    return this.mode != null;
  }

  get currentMode(): "xr" | "cardboard" | null {
    return this.mode;
  }

  /** Hotspot cuyo panel inmersivo esta abierto, si lo hay. */
  get openHotspotId(): string | null {
    return this.openHotspot?.id ?? null;
  }

  /** true si el visor esta reportando manos con seguimiento articulado. */
  get handsTracked(): boolean {
    return this.input.handsVisible;
  }

  async enter(): Promise<void> {
    if (this.mode != null) return;
    if (await VRManager.xrSupported()) await this.enterXr();
    else await this.enterCardboard();
  }

  // -----------------------------------------------------------------------
  // Infraestructura GL
  // -----------------------------------------------------------------------

  private setupGl(xrCompatible: boolean): WebGLRenderingContext {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:40;background:#000;";
    this.container.appendChild(this.canvas);
    const gl = this.canvas.getContext("webgl", { xrCompatible, antialias: true } as WebGLContextAttributes) as WebGLRenderingContext;
    this.gl = gl;
    this.renderer = new XrRenderer(gl);
    this.scene = null;
    this.panelCanvas = document.createElement("canvas");
    this.panelTex = this.renderer.createTexture();
    return gl;
  }

  async refreshEnvironment(): Promise<void> {
    if (this.renderer == null) return;
    this.applyScene(await this.prepareScene(await this.callbacks.getEnvironment()));
    this.closePanel();
  }

  /**
   * Prepara una escena sin tocar la que se ve: sube la vista previa, empieza
   * a traer las teselas (o la equirectangular completa) y espera un poco
   * —con la pantalla en negro del fundido— para no enseñar una etapa borrosa
   * que se va a sustituir enseguida:
   * - si todo está ya descargado (escena vecina), hasta que se ve entera;
   * - si no, solo hasta la etapa rápida (nivel 0), y lo demás se refina a la vista.
   */
  private async prepareScene(env: VrEnvironment): Promise<PreparedScene> {
    const r = this.renderer;
    const scene: PreparedScene = { env, renderer: r, tex: null, cube: null, disposed: false };
    if (r == null) return scene;
    this.preparing.add(scene);
    try {
      if (env.element != null) {
        const tex = r.createTexture();
        const source = env.dynamic ? env.element : await fitForTexture(env.element, r.maxTextureSize());
        if (r.upload(tex, source)) scene.tex = tex;
        else r.deleteTexture(tex);
      }
      let full: Promise<void> | null = null;
      let cached = false;
      if (env.cube != null) {
        scene.cube = new CubePanorama(r, env.cube, {
          store: this.store,
          targetFace: this.targetFace(r),
          priorityYaw: this.callbacks.getViewYawPitch().yaw,
        });
        cached = scene.cube.allCached();
        scene.cube.start();
      } else if (env.fullUrl != null && !env.dynamic) {
        cached = this.store.has(env.fullUrl);
        full = this.loadFullEquirect(scene, env.fullUrl);
      }
      const done = scene.cube?.complete ?? full;
      const quick = scene.cube?.baseReady ?? full;
      if (done != null && cached) await within(done, WAIT_CACHED_MS);
      else if (quick != null) await within(quick, scene.tex != null ? WAIT_BASE_MS : WAIT_NOTHING_MS);
    } finally {
      this.preparing.delete(scene);
    }
    return scene;
  }

  private targetFace(r: XrRenderer): number {
    return vrTargetFaceSize(r.maxTextureSize(), this.mode === "cardboard" ? "cardboard" : "xr");
  }

  /**
   * Equirectangular completa: se descarga y decodifica fuera del hilo
   * principal (`createImageBitmap`), se reduce si no cabe en la GPU y
   * sustituye a la vista previa en cuanto está.
   */
  private async loadFullEquirect(scene: PreparedScene, url: string): Promise<void> {
    const r = scene.renderer;
    if (r == null) return;
    try {
      let image: TexImageSource & { close?: () => void };
      try {
        if (typeof createImageBitmap !== "function") throw new Error("sin createImageBitmap");
        image = await createImageBitmap(await this.store.blob(url));
      } catch {
        image = await loadImageElement(url);
      }
      const fitted: TexImageSource & { close?: () => void } = await fitForTexture(image, r.maxTextureSize());
      if (fitted !== image) image.close?.();
      if (scene.disposed) {
        fitted.close?.();
        return;
      }
      const tex = r.createTexture();
      const ok = r.upload(tex, fitted);
      fitted.close?.();
      if (!ok) {
        r.deleteTexture(tex);
        // Meta Quest: si la grande no entra, se queda la vista previa
        console.warn("[andarama] la panorámica no cabe en la GPU; se queda la vista previa");
        return;
      }
      r.deleteTexture(scene.tex);
      scene.tex = tex;
    } catch (error) {
      console.warn("[andarama] no cargó la panorámica para VR; se queda la vista previa", error);
    }
  }

  /**
   * Escena nueva: se suelta la anterior (texturas y teselas pendientes), se
   * fija el desfase de yaw pendiente para mirar la vista de llegada en cuanto
   * se conozca la orientación de la cabeza, y se empiezan a descargar las
   * escenas vecinas.
   */
  private applyScene(scene: PreparedScene): void {
    this.pendingArrivalYaw = this.callbacks.getViewYawPitch().yaw;
    if (scene.renderer !== this.renderer || this.renderer == null) {
      this.disposeScene(scene);
      return;
    }
    const old = this.scene;
    this.scene = scene;
    if (old != null && old !== scene) this.disposeScene(old);
    for (const tex of this.iconTex.values()) this.renderer.deleteTexture(tex);
    this.iconTex.clear();
    this.prefetchNeighbors(scene);
  }

  private disposeScene(scene: PreparedScene): void {
    if (scene.disposed) return;
    scene.disposed = true;
    scene.cube?.dispose();
    if (scene.renderer != null && scene.renderer === this.renderer) scene.renderer.deleteTexture(scene.tex);
    scene.tex = null;
  }

  /**
   * Descarga en segundo plano las escenas a las que se puede saltar, cuando
   * la actual ya está entera (no compiten con ella). Las teselas de escenas
   * que ya no son vecinas se sueltan.
   */
  private prefetchNeighbors(scene: PreparedScene): void {
    this.prefetchAbort?.abort();
    const ctrl = new AbortController();
    this.prefetchAbort = ctrl;
    const r = this.renderer;
    const targets = this.callbacks.getPrefetch?.() ?? [];
    const keep: string[] = [];
    if (scene.env.cube != null) keep.push(`${scene.env.cube.base}/`);
    if (scene.env.fullUrl != null) keep.push(scene.env.fullUrl);
    const urls: string[] = [];
    for (const t of targets) {
      if ("cube" in t) {
        keep.push(`${t.cube.base}/`);
        const level = r != null ? chooseCubeLevel(cubeLevelSizes(t.cube.faceSize, t.cube.levels), this.targetFace(r)) : 0;
        urls.push(...cubeLevelTiles(t.cube, 0).map((x) => x.url));
        if (level > 0) urls.push(...cubeLevelTiles(t.cube, level).map((x) => x.url));
      } else {
        keep.push(t.url);
        urls.push(t.url);
      }
    }
    this.store.keepOnly(keep);
    if (urls.length === 0) return;
    const ready = scene.cube?.complete ?? Promise.resolve();
    void ready.then(() => {
      if (!ctrl.signal.aborted) void this.store.prefetch(urls, ctrl.signal);
    });
  }

  /** Progreso de la panorámica en cubo de la escena actual (pruebas y medidas). */
  get panoramaStats(): CubePanoramaStats | null {
    return this.scene?.cube?.stats ?? null;
  }

  /** Vídeo: se retexturiza cada fotograma sobre la textura de la escena. */
  private uploadEnv(): void {
    const scene = this.scene;
    if (this.renderer == null || scene?.tex == null || scene.env.element == null) return;
    this.renderer.upload(scene.tex, scene.env.element);
  }

  /**
   * Fija el desfase de yaw en el primer fotograma tras aplicar una escena:
   * la vista de llegada queda justo donde mira ahora la cabeza.
   */
  private resolveArrival(headYaw: number): void {
    if (this.pendingArrivalYaw == null) return;
    this.sceneYawOffset = arrivalYawOffset(this.pendingArrivalYaw, headYaw);
    this.pendingArrivalYaw = null;
  }

  /** Desfase actual de la panorámica (radianes); útil en pruebas. */
  get yawOffset(): number {
    return this.sceneYawOffset;
  }

  // -----------------------------------------------------------------------
  // Sesión WebXR
  // -----------------------------------------------------------------------

  private async enterXr(): Promise<void> {
    const xr = (navigator as any).xr;
    // hand-tracking es opcional: si el visor o el usuario no lo tienen
    // activado, la sesión arranca igual y se usan los mandos.
    const session = await xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "hand-tracking", "bounded-floor"],
    });
    this.xrSession = session;
    this.mode = "xr";
    const gl = this.setupGl(true);
    await (gl as any).makeXRCompatible?.();
    const layer = new (window as any).XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer: layer, depthNear: 0.05, depthFar: 120 });
    this.refSpace = await session.requestReferenceSpace("local").catch(() => session.requestReferenceSpace("viewer"));
    await this.refreshEnvironment();
    this.onChange?.(true, "xr");

    session.addEventListener("selectstart", (e: any) => this.onSelectStart(e));
    session.addEventListener("select", (e: any) => this.onSelect(e));
    session.addEventListener("end", () => this.teardown());

    // Todo lo que pasa dentro de la sesión va al ritmo de este bucle: en Meta
    // Quest el requestAnimationFrame de la ventana está parado mientras dura.
    const onFrame = (time: number, frame: any): void => {
      if (this.xrSession == null) return;
      session.requestAnimationFrame(onFrame);
      this.frameTime = time;
      this.fade = this.transition.frame(time);
      const pose = frame.getViewerPose(this.refSpace);
      if (pose == null) return;
      this.headPosition = matPosition(pose.transform.matrix);
      this.xrForward = matForward(pose.transform.matrix);
      this.resolveArrival(yawPitchFromDir(this.xrForward).yaw);

      // La mirada (Android con cartón) no es un puntero con rayo: dibujarla
      // como tal era la «flecha» lila que no accionaba nada.
      const all = this.input.read(frame, this.refSpace, session);
      const pointers = all.filter((p) => isTrackedPointer(p));
      if (pointers.some((p) => p.physical)) this.trackedPointerSeen = true;
      this.updateInteraction(pointers);
      this.updateXrGaze(time);
      this.refreshPanelTexture();

      const glLayer = session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (this.scene?.env.dynamic === true) this.uploadEnv();
      this.updateVideoTexture();
      let eye = 0;
      for (const view of pose.views) {
        const vp = glLayer.getViewport(view);
        gl.viewport(vp.x, vp.y, vp.width, vp.height);
        this.drawScene(view.projectionMatrix, view.transform.inverse.matrix, eye, pointers);
        eye++;
      }
    };
    session.requestAnimationFrame(onFrame);
  }

  private onSelectStart(event: any): void {
    // Empezar a arrastrar el divisor del comparador
    const target = this.targetForSource(event.inputSource);
    if (target?.kind === "panel" && target.zone.id === "compare") {
      this.panelState.compare = target.u;
      this.panelDirty = true;
    }
  }

  private onSelect(event: any): void {
    const source = event.inputSource;
    // Un `select` real desde un rayo propio demuestra que hay mando o mano.
    if (isTrackedPointer(source)) this.trackedPointerSeen = true;
    const target = this.targetForSource(source);
    // Tocar la pantalla o el botón del visor acciona lo mirado al instante; el
    // anillo se vacía para que la permanencia no lo repita a continuación.
    if (!isTrackedPointer(source)) this.dwell.consume(targetKey(target));
    this.activate(target);
  }

  /** Mandos y manos apuntan con su rayo; la mirada y los toques, con la cabeza. */
  private targetForSource(source: any): PointerTarget {
    if (!isTrackedPointer(source)) return this.xrGazeTarget;
    return this.hover.get(this.keyForSource(source)) ?? null;
  }

  /**
   * Selección por mirada en WebXR: solo cuando la sesión no ha tenido mandos
   * ni manos. En Quest, bajar las manos un momento no debe convertir cada
   * mirada sostenida en un clic.
   */
  private gazeSelectActive(): boolean {
    return this.mode === "cardboard" || (this.mode === "xr" && !this.trackedPointerSeen);
  }

  private updateXrGaze(now: number): void {
    const forward = this.xrForward;
    if (forward == null) return;
    const ray: Ray = { origin: this.headPosition, direction: forward };
    const target = this.pickGaze(ray);
    this.xrGazeTarget = target;
    if (!this.gazeSelectActive()) {
      this.dwell.reset();
      return;
    }
    if (target != null) this.hover.set("gaze", target);
    if (this.dwell.update(targetKey(target), now)) this.activate(target);
  }

  private keyForSource(source: any): string {
    const handedness = String(source?.handedness ?? "none");
    return `${handedness}:${source?.hand != null ? "hand" : "controller"}`;
  }

  // -----------------------------------------------------------------------
  // Modo cardboard (móviles sin WebXR)
  // -----------------------------------------------------------------------

  /**
   * Aviso con botón para conceder el giroscopio.
   *
   * Si el permiso se ha denegado —o Safari lo rechazó por no venir de un
   * gesto—, sin esto el visitante ve un panorama quieto y no entiende por qué.
   * El botón vuelve a pedirlo, y esta vez sí sale de un gesto suyo.
   */
  private showOrientationGate(): void {
    const gate = document.createElement("div");
    gate.setAttribute("role", "alertdialog");
    gate.style.cssText =
      "position:absolute;inset:0;z-index:44;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;" +
      "background:rgba(6,8,20,.94);color:#fff;font:15px/1.5 system-ui;text-align:center;padding:24px;";
    const texto = document.createElement("p");
    texto.textContent = this.callbacks.t("vr_needs_motion");
    texto.style.cssText = "margin:0;max-width:30rem;";
    const boton = document.createElement("button");
    boton.textContent = this.callbacks.t("vr_allow_motion");
    boton.style.cssText =
      "background:#fff;color:#111;border:0;border-radius:10px;padding:12px 20px;font:600 15px system-ui;cursor:pointer;";
    const ayuda = document.createElement("p");
    ayuda.textContent = this.callbacks.t("vr_motion_settings");
    ayuda.style.cssText = "margin:0;max-width:30rem;opacity:.7;font-size:13px;";
    boton.addEventListener("click", () => {
      void DeviceOrientationControlMethod.requestPermission().then((ok) => {
        this.orientationGranted = ok;
        if (ok) this.hideOrientationGate();
        else ayuda.style.opacity = "1";
      });
    });
    gate.append(texto, boton, ayuda);
    this.container.appendChild(gate);
    this.orientationGate = gate;
  }

  private hideOrientationGate(): void {
    this.orientationGate?.remove();
    this.orientationGate = null;
  }

  private async enterCardboard(): Promise<void> {
    this.mode = "cardboard";
    // Lo PRIMERO: en iOS el permiso de orientación solo se concede dentro del
    // gesto del usuario. Pedirlo después de abrir la pantalla completa o de
    // cargar la textura del entorno llegaba tarde y Safari lo rechazaba en
    // silencio, así que el modo cartón se quedaba congelado.
    this.orientationGranted = await DeviceOrientationControlMethod.requestPermission().catch(() => false);
    const gl = this.setupGl(false);
    await this.refreshEnvironment();
    try {
      await this.container.requestFullscreen?.();
      await (screen.orientation as any)?.lock?.("landscape").catch(() => {});
    } catch {
      // pantalla completa no disponible
    }
    this.exitButton = document.createElement("button");
    this.exitButton.textContent = this.callbacks.t("vr_exit");
    this.exitButton.setAttribute("aria-label", this.callbacks.t("vr_exit"));
    this.exitButton.style.cssText =
      "position:absolute;top:12px;right:12px;z-index:41;background:rgba(0,0,0,.6);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:8px 14px;font:14px system-ui;cursor:pointer;";
    this.exitButton.addEventListener("click", () => this.exit());
    this.container.appendChild(this.exitButton);

    // Unas gafas de cartón se sujetan en horizontal. Si el bloqueo de
    // orientación no está disponible (Safari no lo tiene), al menos se avisa.
    this.rotateHint = document.createElement("div");
    this.rotateHint.setAttribute("role", "status");
    this.rotateHint.style.cssText =
      "position:absolute;inset:0;z-index:42;display:none;align-items:center;justify-content:center;" +
      "background:rgba(6,8,20,.92);color:#fff;font:600 16px/1.5 system-ui;text-align:center;padding:24px;";
    this.rotateHint.textContent = this.callbacks.t("vr_rotate_device");
    this.container.appendChild(this.rotateHint);
    const updateRotateHint = (): void => {
      if (this.rotateHint == null) return;
      const portrait = this.container.clientHeight > this.container.clientWidth;
      this.rotateHint.style.display = portrait ? "flex" : "none";
    };
    updateRotateHint();
    this.resizeHandler = updateRotateHint;
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("orientationchange", this.resizeHandler);

    const initial = this.callbacks.getViewYawPitch();
    this.cardboardYawPitch = { ...initial };
    // Rumbo del dispositivo al entrar: se resta para que el tour empiece
    // mirando donde estaba el visor plano y no donde apunte el norte.
    let headingOffset: number | null = null;
    this.orientationHandler = (e: DeviceOrientationEvent): void => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const raw = cameraQuaternion(e.alpha, e.beta, e.gamma, screenAngle());
      if (headingOffset == null) headingOffset = yawPitchFromQuat(raw).yaw - initial.yaw;
      // El desfase de rumbo se aplica al propio cuaternión: si solo se
      // corrigiera el yaw, el retículo y los hotspots quedarían en un sitio y
      // la imagen en otro.
      const q = rotateAroundWorldY(raw, headingOffset);
      this.cardboardQuat = q;
      this.cardboardYawPitch = yawPitchFromQuat(q);
    };
    window.addEventListener("deviceorientation", this.orientationHandler);
    if (!this.orientationGranted) this.showOrientationGate();

    // (el aviso de permiso, si hace falta, se monta arriba)

    // Las gafas de cartón llevan un botón que toca la pantalla: tocar acciona
    // al instante lo que esté enfocado, sin esperar la permanencia.
    this.tapHandler = (e: Event): void => {
      const el = e.target as HTMLElement | null;
      if (el != null && el.closest("button") != null) return;
      const target = this.hover.get("gaze");
      if (target != null) {
        e.preventDefault();
        this.dwell.consume(targetKey(target));
        this.activate(target);
      }
    };
    this.canvas?.addEventListener("pointerdown", this.tapHandler);
    this.onChange?.(true, "cardboard");

    // Selección por mirada: sin mando ni pantalla táctil accesible, el
    // visitante no puede pulsar nada, así que el retículo central acumula
    // permanencia sobre lo que mira y lo acciona solo (xr/gaze.ts).
    const loop = (): void => {
      if (this.mode !== "cardboard" || this.gl == null || this.canvas == null) return;
      this.raf = requestAnimationFrame(loop);
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.floor(this.container.clientWidth * dpr);
      const h = Math.floor(this.container.clientHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const now = performance.now();
      this.frameTime = now;
      this.fade = this.transition.frame(now);
      // En cartón el rumbo del móvil al entrar ya se descuenta (headingOffset);
      // tras cada salto se gira además la panorámica para mirar la llegada.
      this.resolveArrival(this.cardboardYawPitch.yaw);
      if (this.scene?.env.dynamic === true) this.uploadEnv();
      this.updateVideoTexture();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const { yaw, pitch } = this.cardboardYawPitch;
      const forward = dirFromYawPitch(yaw, pitch);
      const gaze: Ray = { origin: [0, 0, 0], direction: forward };
      // El panel se elige con el rayo de la mirada: con un punto fijo delante
      // de la cabeza no se alcanzaba, y sin poder mirar el aspa el panel no
      // había forma de cerrarlo en cardboard.
      const target = this.pickGaze(gaze);
      this.hover.clear();
      if (target != null) this.hover.set("gaze", target);
      if (this.dwell.update(targetKey(target), now)) this.activate(target);
      this.refreshPanelTexture();
      const proj = perspective(1.05, w / 2 / h, 0.05, 120);
      // Con el cuaternión se conserva la inclinación de la cabeza; sin él, al
      // ladear el móvil la escena se quedaba tiesa y mareaba.
      const view = this.cardboardQuat != null ? viewMatrixFromQuat(this.cardboardQuat) : viewMatrix(yaw, pitch);
      gl.viewport(0, 0, w / 2, h);
      this.drawScene(proj, view, 0, []);
      gl.viewport(w / 2, 0, w / 2, h);
      this.drawScene(proj, view, 1, []);
    };
    loop();
  }

  // -----------------------------------------------------------------------
  // Interacción
  // -----------------------------------------------------------------------

  private updateInteraction(pointers: XrPointer[]): void {
    this.hover.clear();
    for (const pointer of pointers) {
      let target: PointerTarget = null;
      if (pointer.ray != null) {
        target = this.pickPanel(pointer.ray) ?? this.pickHotspot(pointer.ray);
      }
      // Toque directo con la yema del índice sobre el panel abierto
      if (target == null && pointer.indexTip != null && this.panelAnchor != null) {
        const hit = this.pickPanelAt(pointer.indexTip);
        if (hit != null) target = hit;
      }
      this.hover.set(pointer.key, target);

      // Arrastre continuo del comparador mientras se mantiene la pinza
      if (pointer.pinching && target?.kind === "panel" && target.zone.id === "compare") {
        this.panelState.compare = target.u;
        this.panelDirty = true;
      }
      // Respaldo de activación por pinza para visores que no emiten `select`
      if (pointer.pinchStarted && pointer.isHand) {
        this.activate(target);
      }
    }
  }

  /**
   * Lo que hay bajo la mirada. El hotspot que ya acumula permanencia conserva
   * la mirada con un radio algo mayor (histéresis, xr/gaze.ts): el temblor de
   * un móvil sujeto a mano no debe vaciar el anillo.
   */
  private pickGaze(ray: Ray): PointerTarget {
    return this.pickPanel(ray) ?? this.pickHotspot(ray, this.dwell.current);
  }

  private pickHotspot(ray: Ray, stickyId: string | null = null): PointerTarget {
    // Durante el fundido de un salto los hotspots ya son los de la escena
    // nueva y la panorámica aún la vieja: no se apuntan ni se dibujan.
    if (this.transition.hideHotspots) return null;
    let best: PointerTarget = null;
    for (const hs of this.callbacks.getHotspots()) {
      const center = this.hotspotCenter(hs);
      const radius = gazeHitRadius(HOTSPOT_HIT_RADIUS * clampScale(hs.scale), hs.id === stickyId);
      const distance = raySphere(ray, center, radius);
      if (distance == null) continue;
      if (best == null || distance < best.distance) best = { kind: "hotspot", hotspot: hs, distance };
    }
    return best;
  }

  private pickPanel(ray: Ray): PointerTarget {
    if (this.panelAnchor == null || this.openHotspot == null) return null;
    const hit = rayRect(ray, this.panelAnchor.center, this.panelAnchor.right, this.panelAnchor.up, PANEL_WIDTH_M / 2, PANEL_HEIGHT_M / 2);
    if (hit == null) return null;
    const zone = this.zoneAt(hit.u, hit.v);
    if (zone == null) return { kind: "panel", zone: { id: "surface", x: 0, y: 0, w: 1, h: 1, label: "" }, u: hit.u, v: hit.v, distance: hit.distance };
    return { kind: "panel", zone, u: hit.u, v: hit.v, distance: hit.distance };
  }

  /** Impacto del dedo directamente sobre la superficie del panel. */
  private pickPanelAt(point: Vec3): PointerTarget {
    if (this.panelAnchor == null) return null;
    const { center, right, up } = this.panelAnchor;
    const normal = vecNormalize(crossVec(right, up));
    const local = vecSub(point, center);
    const depth = dot(local, normal);
    if (Math.abs(depth) > TOUCH_DISTANCE) return null;
    const x = dot(local, vecNormalize(right));
    const y = dot(local, vecNormalize(up));
    if (Math.abs(x) > PANEL_WIDTH_M / 2 || Math.abs(y) > PANEL_HEIGHT_M / 2) return null;
    const u = (x + PANEL_WIDTH_M / 2) / PANEL_WIDTH_M;
    const v = 1 - (y + PANEL_HEIGHT_M / 2) / PANEL_HEIGHT_M;
    const zone = this.zoneAt(u, v);
    return zone == null ? null : { kind: "panel", zone, u, v, distance: Math.abs(depth) };
  }

  private zoneAt(u: number, v: number): PanelZone | null {
    for (const zone of this.panelZones) {
      if (u >= zone.x && u <= zone.x + zone.w && v >= zone.y && v <= zone.y + zone.h) return zone;
    }
    return null;
  }

  private hotspotCenter(hs: VrHotspot): Vec3 {
    // Los hotspots giran con la panorámica: mismo desfase que la esfera.
    const dir = dirFromYawPitch(panoToWorldYaw(hs.yaw, this.sceneYawOffset), hs.pitch);
    return vecAdd(this.headPosition, vecScale(dir, HOTSPOT_RADIUS));
  }

  private activate(target: PointerTarget): void {
    if (target == null) return;
    if (target.kind === "hotspot") {
      this.activateHotspot(target.hotspot);
      return;
    }
    this.activateZone(target.zone, target.u);
  }

  private activateHotspot(hs: VrHotspot): void {
    if (hs.type === "navigation" && hs.target != null) {
      this.navigate(hs.target, hs.hotspot);
      return;
    }
    if (hs.type === "link" || hs.type === "state" || hs.type === "polygon") {
      this.callbacks.onDirectAction(hs);
      return;
    }
    this.openPanel(hs);
  }

  private activateZone(zone: PanelZone, u: number): void {
    const hs = this.openHotspot;
    if (hs == null) return;
    switch (zone.id) {
      case "close":
        this.closePanel();
        return;
      case "prev":
        if (hs.type === "quiz") this.goToQuizQuestion(hs, this.panelState.index - 1);
        else this.panelState.index = Math.max(0, this.panelState.index - 1);
        if (hs.type === "pdf") this.turnPdfPage();
        break;
      case "next": {
        if (hs.type === "quiz") {
          this.goToQuizQuestion(hs, this.panelState.index + 1);
          break;
        }
        if (hs.type === "pdf") {
          const total = this.pdf?.doc?.numPages ?? 1;
          this.panelState.index = Math.min(total - 1, this.panelState.index + 1);
          this.turnPdfPage();
          break;
        }
        const items = (hs.hotspot as { items?: unknown[] }).items ?? [];
        this.panelState.index = Math.min(Math.max(0, items.length - 1), this.panelState.index + 1);
        break;
      }
      case "scroll-up":
        this.panelState.scroll = Math.max(0, this.panelState.scroll - 3);
        break;
      case "scroll-down":
        this.panelState.scroll += 3;
        break;
      case "compare":
        this.panelState.compare = u;
        break;
      case "toggle":
        if (this.panelMedia != null) {
          const media = this.panelMedia;
          if (this.videoMutedByPolicy) {
            // Primer toque tras arrancar sin sonido: activarlo (ahora sí hay gesto)
            this.videoMutedByPolicy = false;
            media.muted = false;
            if (media.paused) void media.play().catch(() => {});
          } else if (media.paused) void media.play().catch(() => {});
          else media.pause();
        }
        break;
      case "check":
        this.checkQuiz(hs);
        break;
      case "external": {
        const content = hs.hotspot as { url?: string };
        const url = content.url != null ? this.callbacks.url(content.url) : "";
        if (url !== "") this.callbacks.onExternalRequest(url);
        this.closePanel();
        return;
      }
      case "exit-open": {
        // Salir de las gafas y abrir el hotspot en el visor plano (el vídeo de
        // YouTube con su reproductor, la página web…). Sin el hueco en el
        // visor, como antes: la dirección se abre al terminar la sesión.
        if (this.callbacks.onOpenAfterExit != null) this.callbacks.onOpenAfterExit(hs.id);
        else {
          const content = hs.hotspot as { url?: string };
          if (content.url != null) this.callbacks.onExternalRequest(this.callbacks.url(content.url));
        }
        this.closePanel();
        this.exit();
        return;
      }
      default:
        if (zone.id.startsWith("opt:")) {
          const optionId = zone.id.slice(4);
          const quiz = this.currentQuizQuestion(hs);
          if (this.panelState.answered || quiz == null) break;
          this.panelState.wrongHint = false;
          if (quiz.kind === "multiple") {
            if (this.panelState.selected.has(optionId)) this.panelState.selected.delete(optionId);
            else this.panelState.selected.add(optionId);
          } else {
            this.panelState.selected = new Set([optionId]);
          }
        }
        break;
    }
    this.panelDirty = true;
  }

  /** Página nueva del PDF: arriba del todo y a dibujarla si no lo está. */
  private turnPdfPage(): void {
    this.panelState.scroll = 0;
    this.ensurePdfPage();
  }

  /** Pregunta que enseña ahora el panel de quiz (la única, en la forma heredada). */
  private currentQuizQuestion(hs: VrHotspot): QuizQuestion | null {
    if (hs.type !== "quiz") return null;
    const preguntas = quizQuestions(hs.hotspot as QuizHotspot);
    return preguntas[Math.min(this.panelState.index, preguntas.length - 1)] ?? null;
  }

  /**
   * Cambia de pregunta (o al resumen, índice = número de preguntas). Las ya
   * comprobadas se enseñan como quedaron; las demás, en blanco.
   */
  private goToQuizQuestion(hs: VrHotspot, index: number): void {
    const preguntas = quizQuestions(hs.hotspot as QuizHotspot);
    if (preguntas.length <= 1) return;
    const st = this.panelState;
    const todas = preguntas.every((q) => st.quizResults.has(q.id));
    const max = todas ? preguntas.length : preguntas.length - 1;
    st.index = Math.max(0, Math.min(max, index));
    const pregunta = preguntas[st.index];
    const hecho = pregunta != null ? st.quizResults.get(pregunta.id) : undefined;
    st.selected = new Set(hecho?.selected ?? []);
    st.wrongHint = false;
    st.answered = hecho != null;
    st.correct = hecho?.correct === true;
  }

  /**
   * Comprueba la pregunta actual con los mismos intentos que el visor plano:
   * con intentos ilimitados se puede probar hasta acertar; con intentos
   * limitados, agotarlos la deja terminada (cuenta como fallo). Solo las
   * respuestas terminadas llegan al visor.
   */
  private checkQuiz(hs: VrHotspot): void {
    const pregunta = this.currentQuizQuestion(hs);
    const st = this.panelState;
    if (pregunta == null || st.answered || st.selected.size === 0) return;
    const picked = [...st.selected];
    const correct = isQuizAnswerCorrect(pregunta, picked);
    const tries = (st.quizTries.get(pregunta.id) ?? 0) + 1;
    st.quizTries.set(pregunta.id, tries);
    const max = (hs.hotspot as QuizHotspot).attempts ?? 0;
    const finished = correct || (max > 0 && tries >= max);
    if (!finished) {
      st.wrongHint = true;
      st.selected = new Set();
      return;
    }
    st.wrongHint = false;
    st.answered = true;
    st.correct = correct;
    st.quizResults.set(pregunta.id, { selected: new Set(picked), correct });
    this.callbacks.onQuizAnswer(hs.id, correct, quizQuestionPoints(pregunta), picked, pregunta.id);
  }

  // -----------------------------------------------------------------------
  // Panel
  // -----------------------------------------------------------------------

  private openPanel(hs: VrHotspot): void {
    this.closePanel();
    this.openHotspot = hs;
    this.panelState = newPanelState();
    this.panelDirty = true;
    // Anclar el panel delante del usuario, a la altura de los ojos. En
    // cardboard esto usaba la orientación del visor plano, no la del
    // giroscopio: el panel podía abrirse fuera de la vista y no había forma
    // de alcanzar el aspa de cerrar.
    const forward = this.headForward();
    const flat = vecNormalize([forward[0], 0, forward[2]]);
    const center = vecAdd(this.headPosition, vecScale(flat, PANEL_DISTANCE));
    const right = vecNormalize(crossVec([0, 1, 0], vecScale(flat, -1)));
    this.panelAnchor = { center, right, up: [0, 1, 0] };

    // Precargar imágenes necesarias
    for (const url of panelImageUrls(hs.hotspot, { url: (u) => this.callbacks.url(u) })) {
      this.loadImage(url);
    }
    // Medios reproducibles
    const content = hs.hotspot as { url?: string; loop?: boolean; volume?: number; muted?: boolean };
    if (hs.type === "videoFile" && content.url != null) {
      const video = document.createElement("video");
      video.src = this.callbacks.url(content.url);
      video.crossOrigin = "anonymous";
      video.loop = content.loop ?? false;
      video.muted = content.muted === true;
      video.playsInline = true;
      video.preload = "auto";
      video.addEventListener("play", () => (this.panelDirty = true));
      video.addEventListener("pause", () => (this.panelDirty = true));
      video.addEventListener("loadeddata", () => (this.panelDirty = true));
      this.panelMedia = video;
      this.videoTime = -1;
      this.playPanelMedia(video);
    } else if (hs.type === "audio" && content.url != null) {
      const audio = new Audio(this.callbacks.url(content.url));
      audio.crossOrigin = "anonymous";
      audio.loop = content.loop ?? false;
      if (content.volume != null) audio.volume = content.volume;
      this.panelMedia = audio;
      void audio.play().catch(() => {});
    } else if (hs.type === "pdf" && content.url != null && this.callbacks.loadPdf != null) {
      this.openPdf(this.callbacks.url(content.url));
    }
  }

  /**
   * Reproduce el medio del panel. Con mando, el `select` de WebXR cuenta como
   * gesto y suena; con la mirada no hay gesto y el navegador lo rechaza: se
   * arranca sin sonido y el botón ofrece activarlo.
   */
  private playPanelMedia(media: HTMLVideoElement): void {
    this.videoMutedByPolicy = false;
    void media.play().catch(() => {
      if (this.panelMedia !== media || media.muted) return;
      media.muted = true;
      this.videoMutedByPolicy = true;
      this.panelDirty = true;
      void media.play().catch(() => {});
    });
  }

  private openPdf(url: string): void {
    const token = {};
    const state: NonNullable<VRManager["pdf"]> = { token, status: "loading", doc: null, pages: new Map(), rendering: null };
    this.pdf = state;
    this.callbacks
      .loadPdf!(url)
      .then((doc) => {
        if (this.pdf?.token !== token) {
          doc.destroy?.();
          return;
        }
        state.doc = doc;
        state.status = doc.numPages > 0 ? "ready" : "error";
        this.panelDirty = true;
        this.ensurePdfPage();
      })
      .catch((error: unknown) => {
        console.warn("[andarama] no se pudo abrir el PDF en VR", error);
        if (this.pdf?.token !== token) return;
        state.status = "error";
        this.panelDirty = true;
      });
  }

  /**
   * Dibuja con pdf.js la página que toca (y después la siguiente, para que
   * pasar de página sea inmediato). Se guardan solo unas pocas páginas.
   */
  private ensurePdfPage(): void {
    const pdf = this.pdf;
    if (pdf?.doc == null || pdf.rendering != null) return;
    const current = Math.min(this.panelState.index, pdf.doc.numPages - 1);
    const wanted = [current, current + 1].filter((p) => p < pdf.doc!.numPages && !pdf.pages.has(p));
    const page = wanted[0];
    if (page == null) return;
    pdf.rendering = page;
    const token = pdf.token;
    pdf.doc
      .renderPage(page + 1, PDF_PAGE_WIDTH)
      .then((canvas) => {
        if (this.pdf?.token !== token) return;
        pdf.pages.set(page, canvas);
        // Memoria: fuera las páginas que quedan lejos de la actual
        const now = this.panelState.index;
        for (const p of pdf.pages.keys()) if (Math.abs(p - now) > 1) pdf.pages.delete(p);
        if (page === Math.min(this.panelState.index, pdf.doc!.numPages - 1)) this.panelDirty = true;
      })
      .catch((error: unknown) => {
        console.warn("[andarama] no se pudo dibujar la página del PDF", error);
        if (this.pdf?.token === token && !pdf.pages.has(page)) {
          pdf.status = "error";
          this.panelDirty = true;
        }
      })
      .finally(() => {
        if (this.pdf?.token !== token) return;
        pdf.rendering = null;
        if (pdf.status === "ready") this.ensurePdfPage();
      });
  }

  private pdfView(): PanelPdfView | null {
    const pdf = this.pdf;
    if (pdf == null) return null;
    const total = pdf.doc?.numPages ?? 0;
    const index = Math.min(this.panelState.index, Math.max(0, total - 1));
    return { status: pdf.status, page: pdf.pages.get(index) ?? null, index, total };
  }

  private closePanel(): void {
    if (this.panelMedia != null) {
      this.panelMedia.pause();
      this.panelMedia.removeAttribute("src");
      this.panelMedia.load();
      this.panelMedia = null;
    }
    if (this.videoTex != null) this.renderer?.deleteTexture(this.videoTex);
    this.videoTex = null;
    this.videoMutedByPolicy = false;
    if (this.pdf != null) {
      this.pdf.doc?.destroy?.();
      this.pdf = null;
    }
    this.openHotspot = null;
    this.panelAnchor = null;
    this.panelZones = [];
  }

  private panelContext(): PanelContext {
    return {
      text: (value) => this.callbacks.text(value),
      url: (value) => this.callbacks.url(value),
      t: (key, params) => this.callbacks.t(key, params),
      image: (url) => this.images.get(url) ?? this.loadImage(url),
      video: () => this.panelMedia as HTMLVideoElement | null,
      // El vídeo va en su propia textura encima del panel (updateVideoTexture)
      videoOverlay: true,
      videoMutedByPolicy: this.videoMutedByPolicy,
      pdf: this.callbacks.loadPdf != null ? () => this.pdfView() : undefined,
      exitToOpen: this.callbacks.onOpenAfterExit != null,
    };
  }

  private refreshPanelTexture(): void {
    if (this.openHotspot == null || this.panelCanvas == null || this.panelTex == null || this.renderer == null) return;
    // Vídeo y audio: el lienzo solo lleva botones y la barra de progreso, así
    // que basta con repintarlo dos veces por segundo; la imagen del vídeo
    // tiene su propia textura.
    const isMedia = this.openHotspot.type === "videoFile" || this.openHotspot.type === "audio";
    const due = isMedia && this.frameTime - this.panelDrawnAt > 500;
    if (!this.panelDirty && !due) return;
    this.panelZones = drawPanel(this.panelCanvas, this.openHotspot.hotspot, this.panelState, this.panelContext());
    this.renderer.upload(this.panelTex, this.panelCanvas);
    this.panelDirty = false;
    this.panelDrawnAt = this.frameTime;
  }

  /** Sube el fotograma nuevo del vídeo del panel, si lo hay. */
  private updateVideoTexture(): void {
    const video = this.panelMedia;
    const r = this.renderer;
    if (r == null || !(video instanceof HTMLVideoElement) || video.readyState < 2 || video.videoWidth === 0) return;
    if (video.currentTime === this.videoTime && this.videoTex != null) return;
    if (this.videoTex == null) this.videoTex = r.createTexture();
    if (r.upload(this.videoTex, video)) this.videoTime = video.currentTime;
  }

  /** Cuadrilátero del vídeo sobre su hueco del panel, con su proporción. */
  private drawPanelVideo(r: XrRenderer, panelModel: Float32Array): void {
    const video = this.panelMedia;
    if (this.videoTex == null || !(video instanceof HTMLVideoElement) || video.videoWidth === 0) return;
    const rect = VIDEO_RECT;
    const k = Math.min(rect.w / video.videoWidth, rect.h / video.videoHeight);
    const wPx = video.videoWidth * k;
    const hPx = video.videoHeight * k;
    const cx = (rect.x + rect.w / 2) / PANEL_WIDTH - 0.5;
    const cy = 0.5 - (rect.y + rect.h / 2) / PANEL_HEIGHT;
    const right: Vec3 = [panelModel[0]!, panelModel[1]!, panelModel[2]!];
    const up: Vec3 = [panelModel[4]!, panelModel[5]!, panelModel[6]!];
    const fwd: Vec3 = [panelModel[8]!, panelModel[9]!, panelModel[10]!];
    const base: Vec3 = [panelModel[12]!, panelModel[13]!, panelModel[14]!];
    // Un centímetro por delante del panel, hacia quien mira
    const center = vecAdd(vecAdd(base, vecScale(fwd, 0.01)), vecAdd(vecScale(right, cx * PANEL_WIDTH_M), vecScale(up, cy * PANEL_HEIGHT_M)));
    const w = (wPx / PANEL_WIDTH) * PANEL_WIDTH_M;
    const h = (hPx / PANEL_HEIGHT) * PANEL_HEIGHT_M;
    const model = new Float32Array([
      right[0] * w, right[1] * w, right[2] * w, 0,
      up[0] * h, up[1] * h, up[2] * h, 0,
      fwd[0], fwd[1], fwd[2], 0,
      center[0], center[1], center[2], 1,
    ]);
    r.draw(r.quad, model, { texture: this.videoTex, depthTest: false });
  }

  private loadImage(url: string): HTMLImageElement | null {
    if (url === "") return null;
    const cached = this.images.get(url);
    if (cached != null) return cached.complete ? cached : null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.panelDirty = true;
    };
    img.src = url;
    this.images.set(url, img);
    return null;
  }

  // -----------------------------------------------------------------------
  // Dibujo
  // -----------------------------------------------------------------------

  private drawScene(
    proj: Float32Array | number[],
    view: Float32Array | number[],
    eyeIndex: number,
    pointers: XrPointer[],
  ): void {
    const r = this.renderer;
    if (r == null) return;
    r.beginFrame(proj, view);

    // Entorno: esfera centrada en la cabeza para que el usuario esté siempre
    // en el centro del panorama aunque se desplace por la sala.
    let uvOffset: [number, number] = [0, 0];
    let uvScale: [number, number] = [1, 1];
    const scene = this.scene;
    if (scene?.env.stereo === "tb") {
      uvScale = [1, 0.5];
      uvOffset = eyeIndex === 0 ? [0, 0] : [0, 0.5];
    } else if (scene?.env.stereo === "sbs") {
      uvScale = [0.5, 1];
      uvOffset = eyeIndex === 0 ? [0, 0] : [0.5, 0];
    }
    if (scene != null) {
      const sceneModel = matTranslateYawScale(this.headPosition, this.sceneYawOffset, 1);
      // La vista previa queda debajo hasta que el cubo cubre todas las caras
      if (scene.tex != null && scene.cube?.covers !== true) {
        r.draw(r.envSphere, sceneModel, { texture: scene.tex, uvOffset, uvScale, depthTest: false });
      }
      scene.cube?.draw(sceneModel, matMultiply);
    }

    // Hotspots
    const hovered = new Set<string>();
    for (const target of this.hover.values()) {
      if (target?.kind === "hotspot") hovered.add(target.hotspot.id);
    }
    const hotspots = this.transition.hideHotspots ? [] : this.callbacks.getHotspots();
    for (const hs of hotspots) {
      const center = this.hotspotCenter(hs);
      const active = hovered.has(hs.id);
      const size = HOTSPOT_SIZE * clampScale(hs.scale) * (active ? 1.18 : 1);
      // Sin flipY: el quad ya mapea v=1 abajo y la textura de un lienzo tiene
      // su primera fila arriba. Invertirla ponía los rótulos del revés.
      r.draw(r.quad, r.billboardMatrix(center, this.headPosition, size), {
        texture: this.iconTexture(hs, active),
      });
    }

    // Panel de contenido
    if (this.openHotspot != null && this.panelAnchor != null && this.panelTex != null) {
      const { center } = this.panelAnchor;
      const model = r.billboardMatrix(center, this.headPosition, 1);
      // Escalar el billboard al tamaño real del panel
      const scaled = new Float32Array(model);
      for (let i = 0; i < 3; i++) {
        scaled[i] = model[i]! * PANEL_WIDTH_M;
        scaled[4 + i] = model[4 + i]! * PANEL_HEIGHT_M;
      }
      r.draw(r.quad, scaled, { texture: this.panelTex });
      this.drawPanelVideo(r, model);
      // Punto de mira sobre la zona apuntada
      for (const target of this.hover.values()) {
        if (target?.kind !== "panel") continue;
        const { right, up } = this.panelAnchor;
        const px = (target.u - 0.5) * PANEL_WIDTH_M;
        const py = (0.5 - target.v) * PANEL_HEIGHT_M;
        const dotPos = vecAdd(center, vecAdd(vecScale(vecNormalize(right), px), vecScale(vecNormalize(up), py)));
        r.draw(r.jointSphere, matTranslateScale(vecAdd(dotPos, vecScale(vecNormalize(crossVec(right, up)), 0.01)), 0.012), {
          color: [1, 1, 1, 0.9],
        });
      }
    }

    // Manos y rayos
    for (const pointer of pointers) {
      if (pointer.joints != null) {
        const pinch = pointer.pinching;
        for (const joint of pointer.joints) {
          r.draw(r.jointSphere, matTranslateScale(joint.position, Math.max(0.006, joint.radius)), {
            color: pinch ? [0.72, 0.42, 0.92, 0.95] : [0.94, 0.94, 1, 0.82],
          });
        }
      } else if (pointer.grip != null) {
        r.draw(r.jointSphere, matTranslateScale(pointer.grip, 0.022), { color: [0.85, 0.85, 0.95, 0.9] });
      }
      if (pointer.ray != null) {
        const target = this.hover.get(pointer.key);
        const length = target != null ? target.distance : 2.5;
        const end = vecAdd(pointer.ray.origin, vecScale(pointer.ray.direction, length));
        const color: [number, number, number, number] = target != null ? [0.72, 0.42, 0.92, 0.95] : [1, 1, 1, 0.35];
        r.draw(r.line, r.segmentMatrix(pointer.ray.origin, end, 0.004), { color });
        if (target != null) {
          r.draw(r.jointSphere, matTranslateScale(end, 0.018), { color });
        }
      }
    }

    this.drawNotice();

    // Retículo de la selección por mirada (cartón, y WebXR sin mandos), con
    // el anillo que se va dibujando. Se pone a la distancia de lo mirado —y
    // si no hay nada, a la de los hotspots— con el mismo tamaño aparente: en
    // un visor con un ojo por pantalla, un retículo más cerca que el hotspot
    // se ve doble.
    if (this.gazeSelectActive()) {
      const forward =
        this.mode === "cardboard"
          ? dirFromYawPitch(this.cardboardYawPitch.yaw, this.cardboardYawPitch.pitch)
          : this.xrForward;
      const tex = forward != null ? this.reticleTexture(this.dwell.progress) : null;
      if (forward != null && tex != null) {
        const aimed = this.hover.get("gaze");
        const distance = aimed != null ? Math.max(0.3, aimed.distance * 0.97) : HOTSPOT_RADIUS;
        const reticle = vecAdd(this.headPosition, vecScale(forward, distance));
        r.draw(r.quad, r.billboardMatrix(reticle, this.headPosition, (0.34 * distance) / 2.2), {
          texture: tex,
          color: [1, 1, 1, 1],
          depthTest: false,
        });
      }
    }

    // Velo negro del fundido entre escenas
    if (this.fade > 0) {
      r.draw(r.jointSphere, matTranslateScale(this.headPosition, 0.5), {
        color: [0, 0, 0, this.fade],
        depthTest: false,
      });
    }
  }

  /**
   * Retículo con el anillo de permanencia. Se cachea por pasos del 5 % para no
   * subir una textura nueva en cada fotograma.
   */
  private reticleTexture(progress: number): WebGLTexture | null {
    const r = this.renderer;
    if (r == null) return null;
    const step = Math.round(Math.max(0, Math.min(1, progress)) * 20) / 20;
    const key = step.toFixed(2);
    const cached = this.reticleTex.get(key);
    if (cached != null) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 128);
    // Punto central siempre visible
    // Contorno oscuro bajo todo: sin él el retículo desaparece sobre un cielo
    // claro, que es exactamente lo que pasaba.
    ctx.beginPath();
    ctx.arc(64, 64, step > 0 ? 9 : 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 64, step > 0 ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    // Anillo de fondo y anillo que se dibuja
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0, Math.PI * 2);
    ctx.stroke();
    if (step > 0) {
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(64, 64, 42, -Math.PI / 2, -Math.PI / 2 + step * Math.PI * 2);
      ctx.stroke();
    }
    const tex = r.createTexture();
    r.upload(tex, canvas);
    this.reticleTex.set(key, tex);
    return tex;
  }

  /**
   * Hacia dónde mira de verdad la cabeza. El panel se ancla aquí, así que
   * equivocarse significa abrirlo fuera de la vista: en cardboard manda la
   * orientación del giroscopio y en XR la de la pose del visor, no la del
   * visor plano, que es lo que se usaba antes.
   */
  private headForward(): Vec3 {
    if (this.mode === "cardboard") {
      return dirFromYawPitch(this.cardboardYawPitch.yaw, this.cardboardYawPitch.pitch);
    }
    if (this.xrForward != null) return this.xrForward;
    const view = this.callbacks.getViewYawPitch();
    return dirFromYawPitch(view.yaw, view.pitch);
  }

  /** Textura del billboard de un hotspot (icono + etiqueta), cacheada por estado. */
  private iconTexture(hs: VrHotspot, active: boolean): WebGLTexture | null {
    const key = `${hs.id}:${active ? "on" : "off"}:${hs.label}`;
    const cached = this.iconTex.get(key);
    if (cached != null) return cached;
    if (this.renderer == null) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 256);
    ctx.beginPath();
    ctx.arc(128, 104, active ? 72 : 64, 0, Math.PI * 2);
    ctx.fillStyle = active ? "rgba(92, 6, 140, 0.88)" : "rgba(12, 16, 30, 0.72)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = active ? "#d9bcee" : "rgba(255,255,255,0.85)";
    ctx.stroke();
    drawGlyph(ctx, hs.type);
    const label = hs.label.slice(0, 22);
    if (label !== "") {
      // A seis metros y en estéreo, un rótulo de 26 px no se lee. Va más
      // grande y sobre una cápsula opaca, que es lo único legible tanto con
      // cielo claro como con sombra.
      // La cápsula no puede salirse de la textura: primero se encoge la letra
      // y, si aún no cabe, se recorta con puntos suspensivos.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 34;
      let texto = label;
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      while (ctx.measureText(texto).width + 28 > 240 && size > 22) {
        size -= 2;
        ctx.font = `700 ${size}px system-ui, sans-serif`;
      }
      while (ctx.measureText(texto).width + 28 > 240 && texto.length > 4) {
        texto = `${texto.slice(0, -2)}…`;
      }
      const width = Math.min(240, ctx.measureText(texto).width + 28);
      const x = 128 - width / 2;
      const y = active ? 196 : 200;
      ctx.beginPath();
      const r = 16;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + 44, r);
      ctx.arcTo(x + width, y + 44, x, y + 44, r);
      ctx.arcTo(x, y + 44, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
      ctx.fillStyle = active ? "rgba(92, 6, 140, 0.94)" : "rgba(12, 16, 30, 0.82)";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(texto, 128, y + 23);
      ctx.textBaseline = "alphabetic";
    }
    const tex = this.renderer.createTexture();
    this.renderer.upload(tex, canvas);
    this.iconTex.set(key, tex);
    return tex;
  }

  /**
   * Salto de escena. No espera a nada que dependa del bucle de la ventana: la
   * textura nueva se sube en un fotograma del propio bucle inmersivo
   * (xr/transition.ts).
   */
  private navigate(target: string, hotspot?: Hotspot): void {
    if (this.transition.busy) return;
    // Compuertas: el visor plano no deja salir con una pregunta, un
    // formulario o un tesoro pendientes, y en gafas tampoco. Se dice por qué
    // dentro de la escena y, si es una pregunta, se abre para contestarla.
    const block = this.callbacks.navigationBlock?.() ?? null;
    if (block != null) {
      this.dwell.reset();
      this.showNotice(block.message);
      if (block.reason === "quiz" && block.hotspotId != null) {
        const gate = this.callbacks.getHotspots().find((h) => h.id === block.hotspotId);
        if (gate != null) this.openPanel(gate);
      }
      return;
    }
    this.closePanel();
    this.dwell.reset();
    this.clearNotice();
    this.navHotspot = hotspot;
    void this.transition.request(target);
  }

  // -----------------------------------------------------------------------
  // Aviso flotante
  // -----------------------------------------------------------------------

  /**
   * Muestra un aviso breve dentro de la escena, delante de la mirada. Los
   * avisos del visor plano (toasts del DOM) no se ven con las gafas puestas.
   */
  showNotice(text: string): void {
    if (text === "") return;
    this.clearNotice();
    this.notice = { text, until: null, dir: this.headForward(), tex: null, aspect: 4 };
  }

  /** Texto del aviso visible, si lo hay. */
  get noticeText(): string | null {
    return this.notice?.text ?? null;
  }

  private clearNotice(): void {
    if (this.notice?.tex != null) this.renderer?.deleteTexture(this.notice.tex);
    this.notice = null;
  }

  private drawNotice(): void {
    const notice = this.notice;
    const r = this.renderer;
    if (notice == null || r == null) return;
    if (notice.until == null) notice.until = this.frameTime + NOTICE_MS;
    if (this.frameTime > notice.until) {
      this.clearNotice();
      return;
    }
    if (notice.tex == null) {
      const canvas = document.createElement("canvas");
      notice.aspect = drawNoticeCanvas(canvas, notice.text);
      notice.tex = r.createTexture();
      r.upload(notice.tex, canvas);
    }
    const alpha = Math.min(1, (notice.until - this.frameTime) / 400);
    // Con un panel abierto (la pregunta que retiene), encima de él; si no, un
    // poco por debajo de la mirada para no tapar el retículo ni el hotspot.
    const width = this.panelAnchor != null ? PANEL_WIDTH_M * 0.9 : NOTICE_WIDTH_M;
    const height = width / notice.aspect;
    const center =
      this.panelAnchor != null
        ? vecAdd(this.panelAnchor.center, [0, PANEL_HEIGHT_M / 2 + height / 2 + 0.06, 0])
        : vecAdd(vecAdd(this.headPosition, vecScale(notice.dir, NOTICE_DISTANCE)), [0, -0.32, 0]);
    const model = r.billboardMatrix(center, this.headPosition, 1);
    const scaled = new Float32Array(model);
    for (let i = 0; i < 3; i++) {
      scaled[i] = model[i]! * width;
      scaled[4 + i] = model[4 + i]! * height;
    }
    r.draw(r.quad, scaled, { texture: notice.tex, color: [1, 1, 1, alpha], depthTest: false });
  }

  // -----------------------------------------------------------------------
  // Ciclo de vida
  // -----------------------------------------------------------------------

  exit(): void {
    if (this.xrSession != null) {
      void this.xrSession.end().catch(() => {});
      return; // el evento "end" dispara teardown
    }
    this.teardown();
  }

  private teardown(): void {
    this.xrSession = null;
    this.refSpace = null;
    cancelAnimationFrame(this.raf);
    if (this.orientationHandler != null) {
      window.removeEventListener("deviceorientation", this.orientationHandler);
      this.orientationHandler = null;
    }
    this.closePanel();
    this.input.reset();
    this.hover.clear();
    this.transition.reset();
    this.dwell.reset();
    this.fade = 0;
    this.sceneYawOffset = 0;
    this.pendingArrivalYaw = null;
    this.navHotspot = undefined;
    this.notice = null;
    for (const scene of [this.scene, ...this.preparing]) if (scene != null) this.disposeScene(scene);
    this.preparing.clear();
    this.scene = null;
    this.prefetchAbort?.abort();
    this.prefetchAbort = null;
    this.xrGazeTarget = null;
    this.trackedPointerSeen = false;
    this.xrForward = null;
    this.images.clear();
    this.iconTex.clear();
    this.exitButton?.remove();
    this.exitButton = null;
    if (this.resizeHandler != null) {
      window.removeEventListener("resize", this.resizeHandler);
      window.removeEventListener("orientationchange", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.tapHandler != null) {
      this.canvas?.removeEventListener("pointerdown", this.tapHandler);
      this.tapHandler = null;
    }
    this.rotateHint?.remove();
    this.rotateHint = null;
    this.hideOrientationGate();
    this.orientationGranted = true;
    this.cardboardQuat = null;
    this.reticleTex.clear();
    this.renderer?.destroy();
    this.renderer = null;
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    if (document.fullscreenElement != null) void document.exitFullscreen().catch(() => {});
    const wasActive = this.mode != null;
    this.mode = null;
    if (wasActive) {
      this.onChange?.(false, null);
      this.callbacks.onExit();
    }
  }

  destroy(): void {
    this.exit();
  }
}

// --- utilidades locales ---

function crossVec(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Dibuja el aviso flotante: cápsula oscura con el texto en hasta tres líneas.
 * Devuelve la proporción ancho/alto del lienzo.
 */
function drawNoticeCanvas(canvas: HTMLCanvasElement, text: string): number {
  const W = 1024;
  const H = 256;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "600 48px system-ui, sans-serif";
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const probe = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(probe).width > W - 120 && line !== "") {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line !== "") lines.push(line);
  const shown = lines.slice(0, 3);
  const r = 40;
  ctx.beginPath();
  ctx.moveTo(r, 8);
  ctx.arcTo(W - 8, 8, W - 8, H - 8, r);
  ctx.arcTo(W - 8, H - 8, 8, H - 8, r);
  ctx.arcTo(8, H - 8, 8, 8, r);
  ctx.arcTo(8, 8, W - 8, 8, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(12, 16, 30, 0.9)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#d9bcee";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lh = shown.length > 2 ? 58 : 64;
  shown.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (shown.length - 1) / 2) * lh));
  return W / H;
}

/** Pictograma sencillo por tipo de hotspot (sin dependencias de iconos). */
function drawGlyph(ctx: CanvasRenderingContext2D, type: string): void {
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (type) {
    case "navigation":
      ctx.moveTo(128, 140);
      ctx.lineTo(128, 72);
      ctx.moveTo(98, 102);
      ctx.lineTo(128, 70);
      ctx.lineTo(158, 102);
      break;
    case "text":
    case "tooltip":
      ctx.moveTo(96, 82);
      ctx.lineTo(160, 82);
      ctx.moveTo(96, 106);
      ctx.lineTo(160, 106);
      ctx.moveTo(96, 130);
      ctx.lineTo(138, 130);
      break;
    case "image":
    case "gallery":
      ctx.rect(92, 74, 72, 60);
      ctx.moveTo(92, 120);
      ctx.lineTo(114, 98);
      ctx.lineTo(136, 120);
      break;
    case "videoFile":
    case "embedVideo":
      ctx.moveTo(112, 76);
      ctx.lineTo(112, 132);
      ctx.lineTo(158, 104);
      ctx.closePath();
      break;
    case "audio":
      ctx.moveTo(108, 92);
      ctx.lineTo(108, 116);
      ctx.moveTo(128, 78);
      ctx.lineTo(128, 130);
      ctx.moveTo(148, 92);
      ctx.lineTo(148, 116);
      break;
    case "pdf":
    case "form":
      ctx.rect(98, 70, 60, 72);
      ctx.moveTo(112, 92);
      ctx.lineTo(144, 92);
      ctx.moveTo(112, 112);
      ctx.lineTo(144, 112);
      break;
    case "quiz":
      ctx.arc(128, 104, 34, 0, Math.PI * 2);
      ctx.moveTo(128, 122);
      ctx.lineTo(128, 124);
      break;
    case "compare":
      ctx.rect(96, 76, 64, 56);
      ctx.moveTo(128, 76);
      ctx.lineTo(128, 132);
      break;
    case "model3d":
      ctx.moveTo(128, 70);
      ctx.lineTo(162, 90);
      ctx.lineTo(162, 122);
      ctx.lineTo(128, 142);
      ctx.lineTo(94, 122);
      ctx.lineTo(94, 90);
      ctx.closePath();
      break;
    default:
      ctx.arc(128, 104, 26, 0, Math.PI * 2);
      break;
  }
  ctx.stroke();
}
