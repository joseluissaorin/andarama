import Marzipano from "marzipano";
import type {
  AutopilotRoute,
  ConnectionEntry,
  Hotspot,
  NavigationHotspot,
  Projection,
  Scene,
  Tour,
  TransitionSpec,
  ViewParams,
} from "@ull360/schema";
import { DEFAULT_TRANSITION, DEFAULT_VIEW, migrateTour, resolveL10n } from "@ull360/schema";
import type {
  QuizStateEvent,
  TourViewerOptions,
  Unsubscribe,
  ViewerEventMap,
  ViewerEventName,
} from "./types.js";
import { baseLevelTileUrls, buildScene, resolveUrl, type BuiltScene } from "./engine/sources.js";
import { AudioEngine } from "./engine/audio.js";
import { evalConditions, VariableStore } from "./engine/state.js";
import { buildDeepLink, parseDeepLink, replaceHash } from "./engine/deeplink.js";
import { DeviceOrientationControlMethod } from "./engine/gyro.js";
import { littlePlanetIntroParams, ProjectionPass } from "./engine/projections.js";
import { Autopilot, normalizeAutorotate } from "./engine/autopilot.js";
import { VRManager, type VrEnvironment, type VrHotspot } from "./engine/vr.js";
import { SceneMarkers } from "./hotspots/markers.js";
import { AnalyticsClient } from "./analytics.js";

interface LoadedScene {
  scene: Scene;
  built: BuiltScene;
  marzScene: any;
  markers: SceneMarkers;
}

/**
 * TourViewer: orquestador del motor 360. La misma clase alimenta la vista
 * previa del Studio, los tours publicados y los paquetes exportados.
 */
export class TourViewer {
  readonly tour: Tour;
  readonly container: HTMLElement;

  private viewer: any;
  private loaded = new Map<string, LoadedScene>();
  private currentId: string | null = null;
  private lang: string;
  private listeners = new Map<ViewerEventName, Set<(payload: any) => void>>();
  private historyStack: string[] = [];
  private vars: VariableStore;
  private audio: AudioEngine;
  private projectionPass: ProjectionPass | null = null;
  private autopilotCtl: Autopilot;
  private gyroMethod: DeviceOrientationControlMethod | null = null;
  private gyroEnabled = false;
  private vr: VRManager;
  private analytics: AnalyticsClient;
  private reducedMotion: boolean;
  private navBlocked = false;
  private videoRaf = 0;
  private sceneEnterTime = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private quizAnswers = new Map<string, { correct: boolean; points: number; sceneId: string }>();
  private treasureFound = new Set<string>();
  private fpsWindow: number[] = [];
  private lastFrame = 0;
  private degraded = false;
  private basePreloaded = new Set<string>();
  private sceneUse = new Map<string, number>();
  /** URL solicitada dentro de VR: se abre al terminar la sesión inmersiva. */
  private pendingExternalUrl: string | null = null;
  private baseUrl: string;
  private destroyed = false;
  private idleMovementActive = false;

  constructor(private options: TourViewerOptions) {
    this.tour = migrateTour(options.tour);
    this.container = options.container;
    this.baseUrl = options.baseUrl ?? "";
    this.reducedMotion =
      (options.respectReducedMotion ?? true) &&
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    const link = options.deepLinks !== false ? parseDeepLink(location.href) : { sceneId: null, view: null, lang: null };
    this.lang = options.lang ?? link.lang ?? this.tour.meta.defaultLang;
    if (!this.tour.meta.langs.includes(this.lang)) this.lang = this.tour.meta.defaultLang;

    this.container.classList.add("ull360-viewer");
    if (getComputedStyle(this.container).position === "static") this.container.style.position = "relative";

    this.viewer = new Marzipano.Viewer(this.container, {
      controls: { mouseViewMode: "drag" },
      stage: { preserveDrawingBuffer: true },
    });

    this.vars = new VariableStore(this.tour.variables);
    this.vars.subscribe((snapshot) => {
      this.currentMarkers()?.updateVisibility(this.currentVideoTime());
      this.emit("varsChange", snapshot);
    });

    this.audio = new AudioEngine(this.baseUrl, resolveUrl, () => this.lang);
    this.audio.onNarrationBlockChange = (blocked) => {
      this.navBlocked = blocked;
      this.emit("narrationBlock", { blocked });
    };

    this.autopilotCtl = new Autopilot({
      goToScene: async (sceneId, opts) => {
        await this.goTo(sceneId, { view: opts?.view as ViewParams | undefined, force: true });
      },
      rotateBy: (deltaYaw, durationMs) => this.rotateBy(deltaYaw, durationMs),
      openHotspotPanel: (hotspotId) => {
        const current = this.currentScene();
        const hs = current?.hotspots.find((h) => h.id === hotspotId);
        if (hs != null && current != null) {
          this.emit("hotspotActivate", {
            hotspot: hs,
            scene: current,
            element: this.currentMarkers()?.elementFor(hotspotId) ?? null,
          });
        }
      },
      closePanels: () => this.emit("hotspotDeactivate", {}),
      currentSceneId: () => this.currentId,
    });
    this.autopilotCtl.onChange = (active, routeId) => this.emit("autopilotChange", { active, routeId });

    this.vr = new VRManager(this.container, {
      getEnvironment: () => this.buildVrEnvironment(),
      getHotspots: () => this.vrHotspots(),
      onNavigate: async (target) => {
        await this.goTo(target, { force: true });
      },
      onDirectAction: (hs) => {
        // Enlace, estado y polígono se resuelven con la lógica normal del
        // visor; el enlace se difiere a la salida de VR (abrir una pestaña
        // durante la sesión inmersiva no es visible para el usuario).
        if (hs.type === "link") {
          const link = hs.hotspot as { url: string; scheme?: string };
          const url = link.scheme === "tel" ? `tel:${link.url}` : link.scheme === "mailto" ? `mailto:${link.url}` : link.url;
          this.pendingExternalUrl = url;
          return;
        }
        this.activateHotspot(hs.hotspot, null);
      },
      onQuizAnswer: (hotspotId, correct, points) => this.reportQuizAnswer(hotspotId, correct, points),
      onExternalRequest: (url) => {
        this.pendingExternalUrl = url;
      },
      onExit: () => {
        // Al salir de VR se abre el contenido que quedó pendiente
        const url = this.pendingExternalUrl;
        this.pendingExternalUrl = null;
        if (url != null) window.open(url, "_blank", "noopener");
      },
      getViewYawPitch: () => {
        const v = this.view();
        return { yaw: v.yaw, pitch: v.pitch };
      },
      text: (value) => this.text(value as never),
      url: (value) => resolveUrl(this.baseUrl, value),
      t: (key, params) => this.options.translate?.(key, params) ?? key,
    });
    this.vr.onChange = (active, mode) => {
      this.emit("vrChange", { active, mode });
      if (active) this.analytics.track({ event: "vr", sceneId: this.currentId ?? undefined });
    };

    const slug = (this.tour as { meta: { title: unknown } }).meta != null ? this.slugForAnalytics() : "tour";
    this.analytics = new AnalyticsClient(
      this.options.editMode === true ? null : (this.options.analyticsEndpoint ?? null),
      slug,
      () => this.lang,
      this.options.onAnalytics,
    );

    if (this.supportsProjections()) {
      this.projectionPass = new ProjectionPass(this.container, {
        getView: () => (this.currentId != null ? this.view() : null),
        getEnvironment: async () => {
          try {
            const env = await this.buildVrEnvironment();
            return { element: env.element as TexImageSource, dynamic: env.dynamic };
          } catch {
            return null;
          }
        },
      });
    }

    this.setupInteractionListeners();
    this.setupDeepLinks();
    this.startFpsMonitor();

    const startScene = link.sceneId ?? this.tour.start.scene;
    const startView = link.view ?? this.tour.start.view ?? DEFAULT_VIEW;
    void this.bootstrap(startScene, startView as ViewParams, link.sceneId == null);
  }

  private slugForAnalytics(): string {
    try {
      const m = /\/t\/([^/?#]+)/.exec(location.pathname);
      if (m != null) return m[1]!;
    } catch {
      // sin location (tests)
    }
    return "export";
  }

  private async bootstrap(sceneId: string, view: ViewParams, allowIntro: boolean): Promise<void> {
    const useIntro = allowIntro && !this.reducedMotion && this.tour.start.intro === "littlePlanet";
    await this.goTo(sceneId, {
      view: useIntro ? (littlePlanetIntroParams() as ViewParams) : view,
      transition: { kind: "cut" },
      force: true,
      skipHistory: true,
    });
    this.analytics.track({ event: "view" });
    this.startHeartbeat();
    if (useIntro) {
      const target = view;
      window.setTimeout(() => {
        this.lookTo(target, 2400);
      }, 350);
    }
    this.emit("ready", { scene: this.currentScene()! });
    this.applyIdleBehaviors();
  }

  // -----------------------------------------------------------------------
  // Eventos
  // -----------------------------------------------------------------------

  on<K extends ViewerEventName>(name: K, fn: (payload: ViewerEventMap[K]) => void): Unsubscribe {
    let set = this.listeners.get(name);
    if (set == null) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn as (payload: any) => void);
    return () => set!.delete(fn as (payload: any) => void);
  }

  private emit<K extends ViewerEventName>(name: K, payload: ViewerEventMap[K]): void {
    for (const fn of this.listeners.get(name) ?? []) {
      try {
        (fn as (p: ViewerEventMap[K]) => void)(payload);
      } catch (err) {
        console.error(`[ull360] listener de ${name} fallo:`, err);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Acceso basico
  // -----------------------------------------------------------------------

  currentScene(): Scene | null {
    return this.currentId != null ? (this.loaded.get(this.currentId)?.scene ?? null) : null;
  }

  currentSceneId(): string | null {
    return this.currentId;
  }

  currentLang(): string {
    return this.lang;
  }

  variables(): VariableStore {
    return this.vars;
  }

  audioEngine(): AudioEngine {
    return this.audio;
  }

  marzipanoViewer(): any {
    return this.viewer;
  }

  text(value: Parameters<typeof resolveL10n>[0]): string {
    return resolveL10n(value, this.lang, this.tour.meta.defaultLang);
  }

  view(): ViewParams {
    const v = this.viewer.view();
    if (v == null) return { ...DEFAULT_VIEW };
    const params = v.parameters != null ? v.parameters() : {};
    return { yaw: params.yaw ?? 0, pitch: params.pitch ?? 0, fov: params.fov ?? 1.2 };
  }

  setView(view: Partial<ViewParams>): void {
    const v = this.viewer.view();
    v?.setParameters?.(view);
  }

  lookTo(view: Partial<ViewParams>, durationMs = 1000): void {
    const scene = this.currentId != null ? this.loaded.get(this.currentId) : null;
    if (scene == null) return;
    scene.marzScene.lookTo(view, { transitionDuration: this.reducedMotion ? 0 : durationMs });
  }

  setLang(lang: string): void {
    if (!this.tour.meta.langs.includes(lang) || lang === this.lang) return;
    this.lang = lang;
    try {
      const url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(history.state, "", url.toString());
    } catch {
      // sin location
    }
    // Reconstruir marcadores de la escena actual con el nuevo idioma.
    const current = this.currentId;
    if (current != null) {
      const entry = this.loaded.get(current);
      if (entry != null) {
        entry.markers.destroy();
        entry.markers = this.createMarkers(entry.scene, entry.marzScene, entry.built.view);
        entry.markers.updateVisibility(this.currentVideoTime());
      }
    }
    this.emit("langChange", { lang });
  }

  deepLink(): string {
    const id = this.currentId ?? this.tour.start.scene;
    return buildDeepLink(location.href, id, this.view(), this.lang);
  }

  // -----------------------------------------------------------------------
  // Carga y cambio de escena
  // -----------------------------------------------------------------------

  private async ensureLoaded(sceneId: string): Promise<LoadedScene> {
    const existing = this.loaded.get(sceneId);
    if (existing != null) return existing;
    const scene = this.tour.scenes.find((s) => s.id === sceneId);
    if (scene == null) throw new Error(`Escena inexistente: ${sceneId}`);
    const initial = scene.initialView ?? DEFAULT_VIEW;
    const built = await buildScene(scene, this.baseUrl, { ...initial });
    const marzScene = this.viewer.createScene({
      source: built.source,
      geometry: built.geometry,
      view: built.view,
      pinFirstLevel: true,
    });
    const markers = this.createMarkers(scene, marzScene, built.view);
    const entry: LoadedScene = { scene, built, marzScene, markers };
    this.loaded.set(sceneId, entry);
    return entry;
  }

  private createMarkers(scene: Scene, marzScene: any, view: any): SceneMarkers {
    return new SceneMarkers(scene, marzScene, view, this.container, this.vars, {
      lang: () => this.lang,
      defaultLang: this.tour.meta.defaultLang,
      baseUrl: this.baseUrl,
      editable: this.options.editMode === true,
      onDrag: (hotspot, yaw, pitch, phase) => this.emit("hotspotMove", { hotspot, yaw, pitch, phase }),
      onActivate: (hotspot, element) => this.activateHotspot(hotspot, element),
    });
  }

  /**
   * Precarga el nivel base de una escena multirres (6 tiles pequenas) para
   * que el fundido de entrada ocurra siempre sobre imagen valida.
   */
  private preloadBase(entry: LoadedScene): Promise<void> {
    const src = entry.scene.source;
    if (src.kind !== "multires" || this.basePreloaded.has(entry.scene.id)) return Promise.resolve();
    this.basePreloaded.add(entry.scene.id);
    const loads = baseLevelTileUrls(src, this.baseUrl).map(
      (u) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res();
          img.onerror = () => res();
          img.src = u;
        }),
    );
    return Promise.race([
      Promise.all(loads).then(() => undefined),
      new Promise<void>((r) => setTimeout(r, 2500)),
    ]);
  }

  /** Libera las escenas menos usadas para no acumular memoria en tours grandes. */
  private evictStaleScenes(): void {
    const MAX_LOADED = 12;
    if (this.loaded.size <= MAX_LOADED) return;
    const current = this.currentId;
    const neighbors = new Set<string>();
    if (current != null) {
      const scene = this.tour.scenes.find((s) => s.id === current);
      for (const hs of scene?.hotspots ?? []) if (hs.type === "navigation") neighbors.add(hs.target);
    }
    const candidates = [...this.loaded.keys()]
      .filter((id) => id !== current && !neighbors.has(id))
      .sort((a, b) => (this.sceneUse.get(a) ?? 0) - (this.sceneUse.get(b) ?? 0));
    while (this.loaded.size > MAX_LOADED && candidates.length > 0) {
      const id = candidates.shift()!;
      const entry = this.loaded.get(id);
      if (entry == null) continue;
      try {
        entry.markers.destroy();
        this.viewer.destroyScene(entry.marzScene);
      } catch {
        // ya destruida
      }
      this.loaded.delete(id);
      this.basePreloaded.delete(id);
    }
  }

  /**
   * Precarga de escenas vecinas segun el grafo (con presupuesto), diferida a
   * un momento ocioso para no competir con las tiles de la escena actual.
   */
  private preloadNeighbors(sceneId: string): void {
    const schedule: (fn: () => void) => void =
      typeof requestIdleCallback === "function"
        ? (fn) => requestIdleCallback(fn, { timeout: 4000 })
        : (fn) => void setTimeout(fn, 1500);
    schedule(() => {
      if (this.destroyed || this.currentId !== sceneId) return;
      const scene = this.tour.scenes.find((s) => s.id === sceneId);
      if (scene == null) return;
      const targets = new Set<string>();
      for (const hs of scene.hotspots) {
        if (hs.type === "navigation") targets.add(hs.target);
      }
      let budget = 2;
      for (const t of targets) {
        if (budget <= 0) break;
        if (!this.loaded.has(t) && this.tour.scenes.some((s) => s.id === t)) {
          budget--;
          void this.ensureLoaded(t)
            .then((entry) => this.preloadBase(entry))
            .catch(() => {});
        }
      }
    });
  }

  async goTo(
    sceneId: string,
    opts: {
      view?: ViewParams;
      entry?: ConnectionEntry;
      transition?: TransitionSpec;
      force?: boolean;
      skipHistory?: boolean;
      fromHotspot?: NavigationHotspot;
    } = {},
  ): Promise<void> {
    if (this.destroyed) return;
    if (this.navBlocked && opts.force !== true) return;
    const previousId = this.currentId;
    const previousView = this.view();
    const entry = await this.ensureLoaded(sceneId);
    // La escena anterior sigue visible hasta que el nivel base este listo:
    // el fundido nunca ocurre sobre tiles a medio cargar.
    await this.preloadBase(entry);

    // Registrar tiempo en la escena anterior
    if (previousId != null && previousId !== sceneId) {
      this.analytics.track({
        event: "duration",
        sceneId: previousId,
        durationMs: Date.now() - this.sceneEnterTime,
      });
      const prev = this.loaded.get(previousId);
      if (prev?.built.video != null) {
        prev.built.video.pause();
      }
    }

    // Orientacion de entrada
    const targetView = this.computeEntryView(entry.scene, opts, previousId, previousView);
    entry.built.view.setParameters?.(targetView);

    const spec = opts.transition ?? opts.fromHotspot?.transition ?? this.tour.transition ?? DEFAULT_TRANSITION;
    const duration = this.reducedMotion || spec.kind === "cut" ? 0 : (spec.duration ?? 800);
    const switchOpts: Record<string, unknown> = { transitionDuration: duration };
    if (spec.kind === "crossRotate" && duration > 0) {
      const startYaw = targetView.yaw - 0.35;
      entry.built.view.setParameters?.({ ...targetView, yaw: startYaw });
      switchOpts.transitionUpdate = (val: number, newScene: any) => {
        newScene.layer().mergeEffects({ opacity: val });
        newScene.view().setParameters?.({ ...targetView, yaw: startYaw + 0.35 * val });
      };
    } else if (spec.kind === "zoom" && duration > 0 && previousId != null) {
      const prev = this.loaded.get(previousId);
      switchOpts.transitionUpdate = (val: number, newScene: any, oldScene: any) => {
        newScene.layer().mergeEffects({ opacity: val });
        if (oldScene != null && prev != null) {
          const params = oldScene.view().parameters();
          oldScene.view().setParameters?.({ ...params, fov: Math.max(0.25, params.fov * (1 - 0.35 * val)) });
        }
      };
    }

    this.currentId = sceneId;
    this.sceneEnterTime = Date.now();
    await new Promise<void>((resolve) => {
      this.viewer.switchScene(entry.marzScene, switchOpts, () => resolve());
    });

    if (!opts.skipHistory && previousId != null && previousId !== sceneId) {
      this.historyStack.push(previousId);
    }

    // Audio de la escena
    this.audio.setSceneAudio(entry.scene.audio);
    if (this.tour.globalAudio != null && previousId == null) {
      this.audio.setGlobalMusic(this.tour.globalAudio);
    }

    // Video de la escena
    this.setupVideoScene(entry);

    entry.markers.updateVisibility(this.currentVideoTime());
    entry.markers.updatePolygons();
    this.sceneUse.set(sceneId, Date.now());
    this.projectionPass?.invalidateEnvironment();
    this.evictStaleScenes();
    this.preloadNeighbors(sceneId);
    this.applyIdleBehaviors();
    if (this.options.deepLinks !== false) replaceHash(sceneId, this.view());

    this.analytics.track({ event: "scene", sceneId });
    this.emit("sceneChange", {
      scene: entry.scene,
      previous: previousId != null ? (this.loaded.get(previousId)?.scene ?? null) : null,
    });
  }

  private computeEntryView(
    scene: Scene,
    opts: { view?: ViewParams; entry?: ConnectionEntry; fromHotspot?: NavigationHotspot },
    previousId: string | null,
    previousView: ViewParams,
  ): ViewParams {
    const initial = scene.initialView ?? DEFAULT_VIEW;
    if (opts.view != null) return opts.view;
    const entry = opts.entry ?? opts.fromHotspot?.entry;
    if (entry == null) return { ...initial };
    switch (entry.mode) {
      case "fixed":
        return {
          yaw: entry.yaw ?? initial.yaw,
          pitch: entry.pitch ?? initial.pitch,
          fov: entry.fov ?? initial.fov,
        };
      case "relative":
        return { ...previousView, fov: entry.fov ?? previousView.fov };
      case "lookBack": {
        if (previousId != null) {
          const back = scene.hotspots.find(
            (h): h is NavigationHotspot => h.type === "navigation" && h.target === previousId,
          );
          if (back != null) {
            return { yaw: back.yaw, pitch: Math.max(-0.4, Math.min(0.4, back.pitch)), fov: entry.fov ?? initial.fov };
          }
        }
        if (opts.fromHotspot != null) {
          return { yaw: opts.fromHotspot.yaw + Math.PI, pitch: 0, fov: entry.fov ?? initial.fov };
        }
        return { ...initial };
      }
      default:
        return { ...initial };
    }
  }

  /** Volver a la escena anterior del historial de navegacion. */
  async back(): Promise<boolean> {
    const prev = this.historyStack.pop();
    if (prev == null) return false;
    await this.goTo(prev, { skipHistory: true });
    return true;
  }

  canGoBack(): boolean {
    return this.historyStack.length > 0;
  }

  // -----------------------------------------------------------------------
  // Video 360
  // -----------------------------------------------------------------------

  private setupVideoScene(entry: LoadedScene): void {
    cancelAnimationFrame(this.videoRaf);
    const video = entry.built.video;
    if (video == null) return;
    const src = entry.scene.source;
    if (src.kind !== "video") return;
    if (video.dataset.ull360Init !== "1") {
      video.dataset.ull360Init = "1";
      void this.attachVideoSource(video, src.hls, src.renditions);
      video.addEventListener("timeupdate", () => {
        entry.markers.updateVisibility(video.currentTime);
      });
      video.addEventListener("ended", () => {
        const onEnd = src.onEnd;
        if (onEnd?.action === "goto" && onEnd.target != null) {
          void this.goTo(onEnd.target);
        }
        // loop lo gestiona video.loop; hold se queda en el ultimo frame
      });
    }
    const pump = (): void => {
      if (this.currentId !== entry.scene.id) return;
      if (video.readyState >= 2) entry.built.dynamicAsset?.markDirty();
      this.videoRaf = requestAnimationFrame(pump);
    };
    pump();
    if (src.autoplay !== false) {
      void video.play().catch(() => {
        // requiere gesto: el primer clic la arranca (unlock)
      });
    }
  }

  private async attachVideoSource(
    video: HTMLVideoElement,
    hls: string | undefined,
    renditions: { url: string; type: string; height?: number }[],
  ): Promise<void> {
    if (hls != null) {
      const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
      if (nativeHls) {
        video.src = resolveUrl(this.baseUrl, hls);
        return;
      }
      try {
        const mod: any = await import(/* @vite-ignore */ "hls.js" as string);
        const Hls = mod.default ?? mod;
        if (Hls?.isSupported?.() === true) {
          const instance = new Hls({ maxBufferLength: 30 });
          instance.loadSource(resolveUrl(this.baseUrl, hls));
          instance.attachMedia(video);
          return;
        }
      } catch {
        // hls.js no disponible (p. ej. paquete exportado sin el chunk): usar renditions
      }
    }
    // Seleccion automatica de rendition por altura de pantalla.
    const targetHeight = Math.min(4320, Math.max(1080, screen.height * (devicePixelRatio || 1)));
    const sorted = [...renditions].sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
    const best =
      sorted.find((r) => (r.height ?? 0) >= targetHeight) ?? sorted[sorted.length - 1] ?? sorted[0];
    if (best != null) {
      for (const r of sorted) {
        const sourceEl = document.createElement("source");
        sourceEl.src = resolveUrl(this.baseUrl, r.url);
        sourceEl.type = r.type;
        video.appendChild(sourceEl);
      }
      video.load();
    }
  }

  videoElement(): HTMLVideoElement | null {
    return this.currentId != null ? (this.loaded.get(this.currentId)?.built.video ?? null) : null;
  }

  private currentVideoTime(): number | null {
    const video = this.videoElement();
    return video != null ? video.currentTime : null;
  }

  private currentMarkers(): SceneMarkers | null {
    return this.currentId != null ? (this.loaded.get(this.currentId)?.markers ?? null) : null;
  }

  // -----------------------------------------------------------------------
  // Hotspots
  // -----------------------------------------------------------------------

  private activateHotspot(hotspot: Hotspot, element: HTMLElement | null): void {
    const scene = this.currentScene();
    if (scene == null) return;
    // Modo edicion: ningun hotspot ejecuta su efecto (navegar, abrir URL,
    // mutar estado...). Siempre se emite la activacion para que el editor
    // seleccione el hotspot y abra sus propiedades.
    if (this.options.editMode === true) {
      this.emit("hotspotActivate", { hotspot, scene, element });
      return;
    }
    this.audio.unlock();
    this.autopilotCtl.pauseForInteraction();
    this.analytics.track({ event: "hotspot", sceneId: scene.id, hotspotId: hotspot.id });
    this.markTreasure(scene.id, hotspot.id);

    switch (hotspot.type) {
      case "navigation":
        void this.goTo(hotspot.target, { fromHotspot: hotspot, entry: hotspot.entry });
        return;
      case "link": {
        const url =
          hotspot.scheme === "tel"
            ? `tel:${hotspot.url}`
            : hotspot.scheme === "mailto"
              ? `mailto:${hotspot.url}`
              : hotspot.url;
        if (hotspot.newTab !== false && hotspot.scheme !== "tel" && hotspot.scheme !== "mailto") {
          window.open(url, "_blank", "noopener");
        } else {
          location.href = url;
        }
        return;
      }
      case "state": {
        this.vars.apply(hotspot.actions);
        if (hotspot.thenGoto != null) {
          void this.goTo(hotspot.thenGoto, { entry: hotspot.thenEntry, transition: { kind: "fade", duration: 350 } });
        }
        return;
      }
      case "polygon": {
        const action = hotspot.action;
        if (action == null || action.kind === "none") return;
        if (action.kind === "goto") {
          void this.goTo(action.target, { entry: action.entry });
          return;
        }
        if (action.kind === "openUrl") {
          if (action.newTab !== false) window.open(action.url, "_blank", "noopener");
          else location.href = action.url;
          return;
        }
        if (action.kind === "setVars") {
          this.vars.apply(action.actions);
          return;
        }
        if (action.kind === "openHotspot") {
          const target = scene.hotspots.find((h) => h.id === action.hotspotId);
          if (target != null) this.activateHotspot(target, this.currentMarkers()?.elementFor(target.id) ?? null);
          return;
        }
        return;
      }
      case "audio": {
        if (hotspot.mode === "spatial") {
          // Fuente posicional real: suena anclada al punto y sigue la vista
          // (panner HRTF). Clic alterna reproducir/parar; no abre panel.
          const playing = this.audio.toggleSpatialHotspot(hotspot.id, {
            id: hotspot.id,
            url: hotspot.url,
            yaw: hotspot.yaw,
            pitch: hotspot.pitch,
            volume: hotspot.volume,
            loop: hotspot.loop ?? true,
          });
          element?.setAttribute("aria-pressed", String(playing));
          this.audio.updateListener(this.view().yaw, this.view().pitch);
          return;
        }
        this.emit("hotspotActivate", { hotspot, scene, element });
        return;
      }
      default:
        this.emit("hotspotActivate", { hotspot, scene, element });
    }
  }

  /** Activa un hotspot por id (paleta de comandos, autopilot, LTI...). */
  openHotspot(hotspotId: string): void {
    const scene = this.currentScene();
    const hs = scene?.hotspots.find((h) => h.id === hotspotId);
    if (hs != null) this.activateHotspot(hs, this.currentMarkers()?.elementFor(hotspotId) ?? null);
  }

  focusFirstHotspot(): void {
    this.currentMarkers()?.focusFirst();
  }

  // -----------------------------------------------------------------------
  // Quiz y busqueda del tesoro
  // -----------------------------------------------------------------------

  reportQuizAnswer(hotspotId: string, correct: boolean, points: number): void {
    const sceneId = this.currentId ?? "";
    this.quizAnswers.set(hotspotId, { correct, points: correct ? points : 0, sceneId });
    if (correct) this.vars.set(`quiz_${hotspotId}`, true);
    this.emit("quizChange", this.quizState());
    this.analytics.track({ event: "quiz", sceneId, hotspotId, meta: { correct } });
  }

  quizState(): QuizStateEvent {
    let total = 0;
    let maxScore = 0;
    const detail: QuizStateEvent["detail"] = [];
    for (const scene of this.tour.scenes) {
      for (const hs of scene.hotspots) {
        if (hs.type === "quiz") {
          total++;
          maxScore += hs.points ?? 1;
          const answer = this.quizAnswers.get(hs.id);
          if (answer != null) {
            detail.push({ hotspotId: hs.id, sceneId: scene.id, correct: answer.correct, points: answer.points });
          }
        }
      }
    }
    const score = detail.reduce((a, d) => a + d.points, 0);
    const passing = this.tour.quiz?.passingScore;
    const answered = detail.length;
    const passed =
      answered < total ? null : passing != null ? (maxScore > 0 ? (score / maxScore) * 100 >= passing : true) : null;
    return { score, maxScore, answered, total, passed, detail };
  }

  /** Compuerta de quiz: bloquear/desbloquear la navegacion. */
  setNavigationBlocked(blocked: boolean): void {
    this.navBlocked = blocked;
    this.emit("narrationBlock", { blocked });
  }

  private markTreasure(sceneId: string, hotspotId: string): void {
    const hunt = this.tour.treasureHunt;
    if (hunt?.enabled !== true) return;
    const target = hunt.targets.find((t) => t.hotspotId === hotspotId && t.sceneId === sceneId);
    if (target == null || this.treasureFound.has(hotspotId)) return;
    this.treasureFound.add(hotspotId);
    this.vars.set(`found_${hotspotId}`, true);
    this.emit("treasureProgress", {
      found: this.treasureFound.size,
      total: hunt.targets.length,
      lastFound: hotspotId,
    });
  }

  treasureState(): { found: number; total: number; foundIds: string[] } {
    const total = this.tour.treasureHunt?.targets.length ?? 0;
    return { found: this.treasureFound.size, total, foundIds: [...this.treasureFound] };
  }

  // -----------------------------------------------------------------------
  // Autorotate / autopilot / interaccion
  // -----------------------------------------------------------------------

  private applyIdleBehaviors(): void {
    const scene = this.currentScene();
    const sceneCfg = scene?.autorotate;
    const cfg =
      sceneCfg === false ? null : normalizeAutorotate(sceneCfg ?? undefined) ?? normalizeAutorotate(this.tour.autorotate);
    if (cfg == null || this.reducedMotion || this.options.editMode === true) {
      if (this.idleMovementActive) {
        this.viewer.setIdleMovement(Infinity, null);
        this.idleMovementActive = false;
      }
      return;
    }
    const movement = Marzipano.autorotate({
      yawSpeed: cfg.direction === "ccw" ? -cfg.speed : cfg.speed,
      targetPitch: null,
      targetFov: null,
    });
    this.viewer.setIdleMovement(cfg.delay * 1000, movement);
    this.idleMovementActive = true;
  }

  startAutopilot(routeId?: string): void {
    const route: AutopilotRoute | undefined =
      routeId != null ? this.tour.autopilot?.find((r) => r.id === routeId) : this.tour.autopilot?.[0];
    if (route != null) void this.autopilotCtl.start(route);
  }

  stopAutopilot(): void {
    this.autopilotCtl.stop();
  }

  autopilotActive(): boolean {
    return this.autopilotCtl.active;
  }

  private rotateBy(deltaYaw: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.reducedMotion) {
        resolve();
        return;
      }
      const v = this.view();
      this.lookTo({ yaw: v.yaw + deltaYaw }, durationMs);
      setTimeout(resolve, durationMs + 50);
    });
  }

  /** Soporte opcional de gamepad (§2.6): stick izquierdo gira, derecho zoom. */
  private startGamepadLoop(): void {
    if (this.tour.controls?.gamepad !== true || typeof navigator.getGamepads !== "function") return;
    const tick = (): void => {
      if (this.destroyed) return;
      requestAnimationFrame(tick);
      const pad = navigator.getGamepads()[0];
      if (pad == null) return;
      const dead = (v: number): number => (Math.abs(v) < 0.15 ? 0 : v);
      const dx = dead(pad.axes[0] ?? 0);
      const dy = dead(pad.axes[1] ?? 0);
      const dz = dead(pad.axes[3] ?? 0);
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        const v = this.view();
        this.setView({
          yaw: v.yaw + dx * 0.04,
          pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, v.pitch - dy * 0.03)),
          fov: Math.max(0.35, Math.min(2.4, v.fov + dz * 0.03)),
        });
      }
    };
    requestAnimationFrame(tick);
  }

  private setupInteractionListeners(): void {
    this.startGamepadLoop();
    const onFirstInteraction = (): void => this.audio.unlock();
    this.container.addEventListener("pointerdown", onFirstInteraction, { once: true });
    this.container.addEventListener("keydown", onFirstInteraction, { once: true });

    this.container.addEventListener("pointerdown", () => this.autopilotCtl.pauseForInteraction());
    this.container.addEventListener(
      "wheel",
      () => this.autopilotCtl.pauseForInteraction(),
      { passive: true },
    );

    // Doble clic para zoom
    this.container.addEventListener("dblclick", (e) => {
      const v = this.viewer.view();
      if (v?.screenToCoordinates == null) return;
      const rect = this.container.getBoundingClientRect();
      const coords = v.screenToCoordinates({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (coords != null) {
        this.lookTo({ yaw: coords.yaw, pitch: coords.pitch, fov: Math.max(0.4, this.view().fov * 0.55) }, 500);
      }
    });

    // viewChange: reproyectar poligonos, escalar marcadores, listener espacial, deep link
    let hashThrottle = 0;
    const emitViewChange = (): void => {
      const v = this.view();
      this.currentMarkers()?.updatePolygons();
      this.currentMarkers()?.updateScale(v.fov);
      this.audio.updateListener(v.yaw, v.pitch);
      this.emit("viewChange", v);
      const now = Date.now();
      if (this.options.deepLinks !== false && this.currentId != null && now - hashThrottle > 500) {
        hashThrottle = now;
        replaceHash(this.currentId, v);
      }
    };
    this.viewer.addEventListener("viewChange", emitViewChange);
  }

  private setupDeepLinks(): void {
    if (this.options.deepLinks === false) return;
    window.addEventListener("hashchange", () => {
      const link = parseDeepLink(location.href);
      if (link.sceneId != null && link.sceneId !== this.currentId) {
        void this.goTo(link.sceneId, { view: link.view as ViewParams | undefined });
      } else if (link.view != null) {
        this.setView(link.view);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Giroscopio
  // -----------------------------------------------------------------------

  async enableGyro(): Promise<boolean> {
    if (this.gyroEnabled) return true;
    const granted = await DeviceOrientationControlMethod.requestPermission();
    if (!granted) return false;
    if (this.gyroMethod == null) {
      this.gyroMethod = new DeviceOrientationControlMethod();
      this.viewer.controls().registerMethod("gyro", this.gyroMethod as any, false);
    }
    this.gyroMethod.start();
    this.viewer.controls().enableMethod("gyro");
    this.gyroEnabled = true;
    return true;
  }

  disableGyro(): void {
    if (!this.gyroEnabled) return;
    this.viewer.controls().disableMethod("gyro");
    this.gyroMethod?.stop();
    this.gyroEnabled = false;
  }

  gyroActive(): boolean {
    return this.gyroEnabled;
  }

  // -----------------------------------------------------------------------
  // Proyecciones
  // -----------------------------------------------------------------------

  private supportsProjections(): boolean {
    return typeof WebGLRenderingContext !== "undefined";
  }

  setProjection(projection: Projection): void {
    if (this.projectionPass == null || !this.projectionPass.supported) return;
    if (projection !== "rectilinear" && this.currentScene()?.source.kind === "flat") return;
    // Los hotspots se ocultan mientras la proyeccion esta activa (sus
    // posiciones de pantalla ya no corresponden a lo que se ve).
    this.container.classList.toggle("ull360-projection-active", projection !== "rectilinear");
    this.projectionPass.setProjection(projection, !this.reducedMotion);
  }

  currentProjection(): Projection {
    return this.projectionPass?.currentProjection ?? "rectilinear";
  }

  // -----------------------------------------------------------------------
  // VR
  // -----------------------------------------------------------------------

  async enterVr(): Promise<void> {
    await this.vr.enter();
  }

  exitVr(): void {
    this.vr.exit();
  }

  vrActive(): boolean {
    return this.vr.active;
  }

  /**
   * Estado de la sesion inmersiva. Lo usan la skin, los integradores y las
   * pruebas automatizadas para saber que esta ocurriendo dentro de las gafas.
   */
  vrState(): { active: boolean; mode: "xr" | "cardboard" | null; hands: boolean; openHotspotId: string | null; hotspots: number } {
    return {
      active: this.vr.active,
      mode: this.vr.currentMode,
      hands: this.vr.handsTracked,
      openHotspotId: this.vr.openHotspotId,
      hotspots: this.vrHotspots().length,
    };
  }

  /**
   * Hotspots visibles en VR: TODOS los tipos, no solo la navegación. Los
   * polígonos usan el primero de sus vértices como ancla del billboard.
   */
  private vrHotspots(): VrHotspot[] {
    const scene = this.currentScene();
    if (scene == null) return [];
    return scene.hotspots
      .filter((h) => evalConditions(h.conditions, this.vars, this.lang, this.currentVideoTime()))
      .map((h) => {
        const anchor =
          h.type === "polygon" && h.points.length > 0
            ? { yaw: h.points[0]!.yaw, pitch: h.points[0]!.pitch }
            : { yaw: h.yaw, pitch: h.pitch };
        return {
          id: h.id,
          yaw: anchor.yaw,
          pitch: anchor.pitch,
          label: this.text(h.label) || this.text(h.altText),
          type: h.type,
          target: h.type === "navigation" ? (h as NavigationHotspot).target : undefined,
          hotspot: h,
        };
      });
  }

  private async buildVrEnvironment(): Promise<VrEnvironment> {
    const entry = this.currentId != null ? this.loaded.get(this.currentId) : null;
    if (entry == null) throw new Error("Sin escena activa");
    const src = entry.scene.source;
    if (src.kind === "video" && entry.built.video != null) {
      return { element: entry.built.video, stereo: src.stereo ?? "mono", dynamic: true };
    }
    if (src.kind === "equirect") {
      const img = await loadImageAsync(resolveUrl(this.baseUrl, src.url));
      return { element: img, stereo: src.stereo ?? "mono", dynamic: false };
    }
    if (src.kind === "multires") {
      const canvas = await assembleEquirectFromCube(resolveUrl(this.baseUrl, src.base), src, 2048);
      if (canvas != null) return { element: canvas, stereo: "mono", dynamic: false };
      if (src.preview != null) {
        const img = await loadImageAsync(resolveUrl(this.baseUrl, src.preview));
        return { element: img, stereo: "mono", dynamic: false };
      }
    }
    if (src.kind === "cubemap" && src.preview != null) {
      const img = await loadImageAsync(resolveUrl(this.baseUrl, src.preview));
      return { element: img, stereo: "mono", dynamic: false };
    }
    throw new Error("Esta escena no soporta VR");
  }

  // -----------------------------------------------------------------------
  // Rendimiento
  // -----------------------------------------------------------------------

  private startFpsMonitor(): void {
    const tick = (t: number): void => {
      if (this.destroyed) return;
      if (this.lastFrame > 0) {
        const dt = t - this.lastFrame;
        if (dt > 0 && dt < 500) {
          this.fpsWindow.push(1000 / dt);
          if (this.fpsWindow.length > 120) this.fpsWindow.shift();
        }
      }
      this.lastFrame = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const check = setInterval(() => {
      if (this.destroyed) {
        clearInterval(check);
        return;
      }
      if (this.fpsWindow.length < 60) return;
      const avg = this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
      if (avg < 40 && !this.degraded) {
        this.degraded = true;
        this.container.classList.add("ull360-degraded");
      } else if (avg > 55 && this.degraded) {
        this.degraded = false;
        this.container.classList.remove("ull360-degraded");
      }
    }, 4000);
  }

  currentFps(): number {
    if (this.fpsWindow.length === 0) return 60;
    return this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (document.visibilityState !== "visible" || this.currentId == null) return;
      const v = this.view();
      this.analytics.track({ event: "heartbeat", sceneId: this.currentId, yaw: v.yaw, pitch: v.pitch });
    }, 5000);
  }

  trackShare(): void {
    this.analytics.track({ event: "share", sceneId: this.currentId ?? undefined });
  }

  trackForm(hotspotId: string): void {
    this.analytics.track({ event: "form", sceneId: this.currentId ?? undefined, hotspotId });
  }

  // -----------------------------------------------------------------------

  destroy(): void {
    this.destroyed = true;
    if (this.heartbeatTimer != null) clearInterval(this.heartbeatTimer);
    cancelAnimationFrame(this.videoRaf);
    this.analytics.destroy();
    this.autopilotCtl.stop();
    this.vr.destroy();
    this.projectionPass?.destroy();
    this.audio.destroy();
    for (const entry of this.loaded.values()) {
      entry.markers.destroy();
      entry.built.video?.pause();
    }
    this.loaded.clear();
    this.viewer.destroy();
  }
}

function loadImageAsync(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
    img.src = url;
  });
}


async function assembleEquirectFromCube(
  base: string,
  src: { levels: number; tileSize: number; faceSize: number; extension?: string },
  maxFace: number,
): Promise<HTMLCanvasElement | null> {
  try {
    const sizes: number[] = [];
    let s = src.faceSize;
    for (let i = 0; i < src.levels; i++) {
      sizes.unshift(s);
      s = Math.ceil(s / 2);
    }
    let level = 0;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i]! <= maxFace) level = i;
    }
    const faceSize = sizes[level]!;
    const tiles = Math.ceil(faceSize / src.tileSize);
    const ext = src.extension ?? "webp";
    const faces: Record<string, HTMLCanvasElement> = {};
    const cleanBase = base.replace(/\/$/, "");
    await Promise.all(
      ["f", "b", "l", "r", "u", "d"].map(async (face) => {
        const canvas = document.createElement("canvas");
        canvas.width = faceSize;
        canvas.height = faceSize;
        const ctx = canvas.getContext("2d")!;
        await Promise.all(
          Array.from({ length: tiles * tiles }, async (_, i) => {
            const x = i % tiles;
            const y = Math.floor(i / tiles);
            const img = await loadImageAsync(`${cleanBase}/${level}/${face}/${y}/${x}.${ext}`);
            ctx.drawImage(img, x * src.tileSize, y * src.tileSize);
          }),
        );
        faces[face] = canvas;
      }),
    );
    // Reproyeccion cubo -> equirect por muestreo directo.
    const outW = Math.min(4096, faceSize * 4);
    const outH = outW / 2;
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d")!;
    const outData = octx.createImageData(outW, outH);
    const faceData: Record<string, ImageData> = {};
    for (const [k, c] of Object.entries(faces)) {
      faceData[k] = c.getContext("2d")!.getImageData(0, 0, faceSize, faceSize);
    }
    const o = outData.data;
    for (let py = 0; py < outH; py++) {
      // Fila 0 = cenit (equirect estandar, como los previews y las fotos)
      const phi = (0.5 - (py + 0.5) / outH) * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      for (let px = 0; px < outW; px++) {
        const theta = ((px + 0.5) / outW) * 2 * Math.PI - Math.PI;
        const dx = cosPhi * Math.sin(theta);
        const dy = sinPhi;
        const dz = cosPhi * Math.cos(theta);
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);
        let face: string;
        let u: number;
        let v: number;
        if (az >= ax && az >= ay) {
          if (dz > 0) {
            face = "f";
            u = dx / az;
            v = -dy / az;
          } else {
            face = "b";
            u = -dx / az;
            v = -dy / az;
          }
        } else if (ax >= ay) {
          if (dx > 0) {
            face = "r";
            u = -dz / ax;
            v = -dy / ax;
          } else {
            face = "l";
            u = dz / ax;
            v = -dy / ax;
          }
        } else {
          if (dy > 0) {
            face = "u";
            u = dx / ay;
            v = dz / ay;
          } else {
            face = "d";
            u = dx / ay;
            v = -dz / ay;
          }
        }
        const fd = faceData[face]!;
        const fx = Math.min(faceSize - 1, Math.max(0, Math.round(((u + 1) / 2) * (faceSize - 1))));
        const fy = Math.min(faceSize - 1, Math.max(0, Math.round(((v + 1) / 2) * (faceSize - 1))));
        const si = (fy * faceSize + fx) * 4;
        const di = (py * outW + px) * 4;
        o[di] = fd.data[si]!;
        o[di + 1] = fd.data[si + 1]!;
        o[di + 2] = fd.data[si + 2]!;
        o[di + 3] = 255;
      }
    }
    octx.putImageData(outData, 0, 0);
    return out;
  } catch {
    return null;
  }
}
