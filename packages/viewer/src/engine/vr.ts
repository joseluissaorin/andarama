import type { Hotspot } from "@ull360/schema";
import { XrRenderer } from "./xr/render.js";
import { XrInput, type XrPointer } from "./xr/input.js";
import {
  drawPanel,
  newPanelState,
  panelImageUrls,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  type PanelContext,
  type PanelState,
  type PanelZone,
} from "./xr/panel.js";
import {
  angleDiff,
  dirFromYawPitch,
  matPosition,
  matTranslateScale,
  perspective,
  raySphere,
  rayRect,
  vecAdd,
  vecNormalize,
  vecScale,
  vecSub,
  viewMatrix,
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
 * - **Cardboard**: estéreo lado a lado con giroscopio para móviles sin WebXR.
 *
 * No hay dependencias externas ni peticiones al servidor: un tour exportado
 * conserva el modo inmersivo íntegro siempre que se sirva por HTTPS, que es
 * lo que exige WebXR (contexto seguro).
 */

export interface VrHotspot {
  id: string;
  yaw: number;
  pitch: number;
  label: string;
  type: string;
  /** Escena destino en los hotspots de navegación. */
  target?: string;
  /** Hotspot completo: lo necesita el panel inmersivo. */
  hotspot: Hotspot;
}

export interface VrEnvironment {
  /** Imagen/lienzo/vídeo equirectangular a proyectar. */
  element: TexImageSource & { videoWidth?: number };
  /** Layout estéreo del contenido. */
  stereo: "mono" | "tb" | "sbs";
  /** true si es vídeo (retexturizar cada fotograma). */
  dynamic: boolean;
}

export interface VrCallbacks {
  getEnvironment(): Promise<VrEnvironment>;
  getHotspots(): VrHotspot[];
  onNavigate(target: string): Promise<void>;
  /** Hotspots que actúan sin panel: enlace, estado, polígono. */
  onDirectAction(hotspot: VrHotspot): void;
  onQuizAnswer(hotspotId: string, correct: boolean, points: number): void;
  /** Contenido que se continúa fuera de VR: se abre al terminar la sesión. */
  onExternalRequest(url: string): void;
  onExit(): void;
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
/** Margen de cabeza (radianes) que no rompe la permanencia de la mirada. */
const GAZE_TOLERANCE = 0.1;
const DEFAULT_DWELL_MS = 2500;

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
  private env: VrEnvironment | null = null;
  private envTex: WebGLTexture | null = null;
  private iconTex = new Map<string, WebGLTexture>();
  private raf = 0;
  private cardboardYawPitch = { yaw: 0, pitch: 0 };
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private exitButton: HTMLButtonElement | null = null;
  private navigating = false;

  // Panel abierto
  private openHotspot: VrHotspot | null = null;
  private panelState: PanelState = newPanelState();
  private panelCanvas: HTMLCanvasElement | null = null;
  private panelTex: WebGLTexture | null = null;
  private panelZones: PanelZone[] = [];
  private panelAnchor: { center: Vec3; right: Vec3; up: Vec3 } | null = null;
  private panelMedia: HTMLVideoElement | HTMLAudioElement | null = null;
  private panelDirty = true;

  // Estado de punteros
  private hover = new Map<string, PointerTarget>();
  private images = new Map<string, HTMLImageElement>();
  private headPosition: Vec3 = [0, 0, 0];
  private gazeProgress = 0;
  private reticleTex = new Map<string, WebGLTexture>();
  /** Permanencia configurable por tour (`vr.dwellSeconds`). */
  dwellMs = DEFAULT_DWELL_MS;

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
    this.envTex = this.renderer.createTexture();
    this.panelCanvas = document.createElement("canvas");
    this.panelTex = this.renderer.createTexture();
    return gl;
  }

  async refreshEnvironment(): Promise<void> {
    if (this.renderer == null) return;
    this.env = await this.callbacks.getEnvironment();
    this.uploadEnv();
    this.iconTex.clear();
    this.closePanel();
  }

  private uploadEnv(): void {
    if (this.renderer == null || this.env == null || this.envTex == null) return;
    this.renderer.upload(this.envTex, this.env.element as TexImageSource);
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

    const onFrame = (_time: number, frame: any): void => {
      if (this.xrSession == null) return;
      session.requestAnimationFrame(onFrame);
      const pose = frame.getViewerPose(this.refSpace);
      if (pose == null) return;
      this.headPosition = matPosition(pose.transform.matrix);

      const pointers = this.input.read(frame, this.refSpace, session);
      this.updateInteraction(pointers);
      this.refreshPanelTexture();

      const glLayer = session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (this.env?.dynamic === true) this.uploadEnv();
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
    const key = this.keyForSource(event.inputSource);
    const target = this.hover.get(key);
    if (target?.kind === "panel" && target.zone.id === "compare") {
      this.panelState.compare = target.u;
      this.panelDirty = true;
    }
  }

  private onSelect(event: any): void {
    const key = this.keyForSource(event.inputSource);
    this.activate(this.hover.get(key) ?? null);
  }

  private keyForSource(source: any): string {
    const handedness = String(source?.handedness ?? "none");
    return `${handedness}:${source?.hand != null ? "hand" : "controller"}`;
  }

  // -----------------------------------------------------------------------
  // Modo cardboard (móviles sin WebXR)
  // -----------------------------------------------------------------------

  private async enterCardboard(): Promise<void> {
    this.mode = "cardboard";
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

    const initial = this.callbacks.getViewYawPitch();
    this.cardboardYawPitch = { ...initial };
    let last: { yaw: number; pitch: number } | null = null;
    this.orientationHandler = (e: DeviceOrientationEvent): void => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const yaw = (-e.alpha * Math.PI) / 180;
      const pitch = ((e.beta - 90) * Math.PI) / 180;
      if (last != null) {
        this.cardboardYawPitch.yaw += yaw - last.yaw;
        this.cardboardYawPitch.pitch = Math.max(-1.4, Math.min(1.4, this.cardboardYawPitch.pitch + (pitch - last.pitch)));
      }
      last = { yaw, pitch };
    };
    window.addEventListener("deviceorientation", this.orientationHandler);
    this.onChange?.(true, "cardboard");

    // Selección por mirada: sin mando ni pantalla táctil accesible, el
    // visitante no puede pulsar nada, así que el retículo central acumula
    // permanencia sobre lo que mira y lo acciona solo. Se reinicia si cambia
    // de objetivo o si la cabeza se mueve más de un margen.
    let gazeTarget: string | null = null;
    let gazeStart = 0;
    let gazeAnchor = { yaw: 0, pitch: 0 };
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
      if (this.env?.dynamic === true) this.uploadEnv();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const { yaw, pitch } = this.cardboardYawPitch;
      const forward = dirFromYawPitch(yaw, pitch);
      const gaze: Ray = { origin: [0, 0, 0], direction: forward };
      const target = this.pickPanelAt(vecAdd(this.headPosition, vecScale(forward, PANEL_DISTANCE))) ?? this.pickHotspot(gaze);
      const id =
        target == null ? null : target.kind === "hotspot" ? target.hotspot.id : `zone:${target.zone.id}`;
      const drift = Math.hypot(angleDiff(yaw, gazeAnchor.yaw), pitch - gazeAnchor.pitch);
      if (id !== gazeTarget || drift > GAZE_TOLERANCE) {
        gazeTarget = id;
        gazeStart = performance.now();
        gazeAnchor = { yaw, pitch };
      } else if (id != null && performance.now() - gazeStart > this.dwellMs) {
        gazeTarget = null;
        this.activate(target);
      }
      this.gazeProgress = gazeTarget != null ? Math.min(1, (performance.now() - gazeStart) / this.dwellMs) : 0;
      this.hover.clear();
      if (target != null) this.hover.set("gaze", target);
      this.refreshPanelTexture();
      const proj = perspective(1.05, w / 2 / h, 0.05, 120);
      const view = viewMatrix(yaw, pitch);
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

  private pickHotspot(ray: Ray): PointerTarget {
    let best: PointerTarget = null;
    for (const hs of this.callbacks.getHotspots()) {
      const center = this.hotspotCenter(hs);
      const distance = raySphere(ray, center, HOTSPOT_HIT_RADIUS);
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
    const dir = dirFromYawPitch(hs.yaw, hs.pitch);
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
      void this.navigate(hs.target);
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
        this.panelState.index = Math.max(0, this.panelState.index - 1);
        break;
      case "next": {
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
          if (this.panelMedia.paused) void this.panelMedia.play().catch(() => {});
          else this.panelMedia.pause();
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
      default:
        if (zone.id.startsWith("opt:")) {
          const optionId = zone.id.slice(4);
          const quiz = hs.hotspot as { kind?: string };
          if (this.panelState.answered) break;
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

  private checkQuiz(hs: VrHotspot): void {
    const quiz = hs.hotspot as { options?: { id: string; correct?: boolean }[]; points?: number };
    const options = quiz.options ?? [];
    const correctIds = new Set(options.filter((o) => o.correct === true).map((o) => o.id));
    const picked = this.panelState.selected;
    const correct = picked.size === correctIds.size && [...picked].every((id) => correctIds.has(id));
    this.panelState.answered = true;
    this.panelState.correct = correct;
    this.callbacks.onQuizAnswer(hs.id, correct, quiz.points ?? 1);
  }

  // -----------------------------------------------------------------------
  // Panel
  // -----------------------------------------------------------------------

  private openPanel(hs: VrHotspot): void {
    this.closePanel();
    this.openHotspot = hs;
    this.panelState = newPanelState();
    this.panelDirty = true;
    // Anclar el panel delante del usuario, a la altura de los ojos.
    const view = this.callbacks.getViewYawPitch();
    const forward = this.mode === "xr" ? this.headForward() : dirFromYawPitch(view.yaw, view.pitch);
    const flat = vecNormalize([forward[0], 0, forward[2]]);
    const center = vecAdd(this.headPosition, vecScale(flat, PANEL_DISTANCE));
    const right = vecNormalize(crossVec([0, 1, 0], vecScale(flat, -1)));
    this.panelAnchor = { center, right, up: [0, 1, 0] };

    // Precargar imágenes necesarias
    for (const url of panelImageUrls(hs.hotspot, { url: (u) => this.callbacks.url(u) })) {
      this.loadImage(url);
    }
    // Medios reproducibles
    const content = hs.hotspot as { url?: string; loop?: boolean; volume?: number };
    if (hs.type === "videoFile" && content.url != null) {
      const video = document.createElement("video");
      video.src = this.callbacks.url(content.url);
      video.crossOrigin = "anonymous";
      video.loop = content.loop ?? false;
      video.playsInline = true;
      this.panelMedia = video;
      void video.play().catch(() => {});
    } else if (hs.type === "audio" && content.url != null) {
      const audio = new Audio(this.callbacks.url(content.url));
      audio.crossOrigin = "anonymous";
      audio.loop = content.loop ?? false;
      if (content.volume != null) audio.volume = content.volume;
      this.panelMedia = audio;
      void audio.play().catch(() => {});
    }
  }

  private closePanel(): void {
    if (this.panelMedia != null) {
      this.panelMedia.pause();
      this.panelMedia.src = "";
      this.panelMedia = null;
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
    };
  }

  private refreshPanelTexture(): void {
    if (this.openHotspot == null || this.panelCanvas == null || this.panelTex == null || this.renderer == null) return;
    const isDynamic = this.openHotspot.type === "videoFile" || this.openHotspot.type === "audio";
    if (!this.panelDirty && !isDynamic) return;
    this.panelZones = drawPanel(this.panelCanvas, this.openHotspot.hotspot, this.panelState, this.panelContext());
    this.renderer.upload(this.panelTex, this.panelCanvas);
    this.panelDirty = false;
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
    if (this.env?.stereo === "tb") {
      uvScale = [1, 0.5];
      uvOffset = eyeIndex === 0 ? [0, 0] : [0, 0.5];
    } else if (this.env?.stereo === "sbs") {
      uvScale = [0.5, 1];
      uvOffset = eyeIndex === 0 ? [0, 0] : [0.5, 0];
    }
    r.draw(r.envSphere, matTranslateScale(this.headPosition, 1), {
      texture: this.envTex,
      uvOffset,
      uvScale,
      depthTest: false,
    });

    // Hotspots
    const hovered = new Set<string>();
    for (const target of this.hover.values()) {
      if (target?.kind === "hotspot") hovered.add(target.hotspot.id);
    }
    for (const hs of this.callbacks.getHotspots()) {
      const center = this.hotspotCenter(hs);
      const active = hovered.has(hs.id);
      const size = HOTSPOT_SIZE * (active ? 1.18 : 1);
      r.draw(r.quad, r.billboardMatrix(center, this.headPosition, size), {
        texture: this.iconTexture(hs, active),
        flipY: true,
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
      r.draw(r.quad, scaled, { texture: this.panelTex, flipY: true });
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

    // Retículo del modo cardboard, con el anillo que se va dibujando
    if (this.mode === "cardboard") {
      const forward = dirFromYawPitch(this.cardboardYawPitch.yaw, this.cardboardYawPitch.pitch);
      const reticle = vecAdd(this.headPosition, vecScale(forward, 2.2));
      const tex = this.reticleTexture(this.gazeProgress);
      if (tex != null) {
        r.draw(r.quad, r.billboardMatrix(reticle, this.headPosition, 0.34), { texture: tex, color: [1, 1, 1, 1] });
      }
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
    ctx.beginPath();
    ctx.arc(64, 64, step > 0 ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = step > 0 ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.75)";
    ctx.fill();
    // Anillo de fondo y anillo que se dibuja
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0, Math.PI * 2);
    ctx.stroke();
    if (step > 0) {
      ctx.strokeStyle = "rgba(184,107,235,.98)";
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

  private headForward(): Vec3 {
    // En XR el panel se ancla usando la última orientación conocida del visor;
    // como respaldo se usa la del visor 2D.
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
    const label = hs.label.slice(0, 24);
    if (label !== "") {
      ctx.font = "600 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 8;
      ctx.fillText(label, 128, 214);
      ctx.shadowBlur = 0;
    }
    const tex = this.renderer.createTexture();
    this.renderer.upload(tex, canvas);
    this.iconTex.set(key, tex);
    return tex;
  }

  private async navigate(target: string): Promise<void> {
    if (this.navigating) return;
    this.navigating = true;
    try {
      await this.callbacks.onNavigate(target);
      await this.refreshEnvironment();
    } finally {
      this.navigating = false;
    }
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
    this.images.clear();
    this.iconTex.clear();
    this.exitButton?.remove();
    this.exitButton = null;
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
