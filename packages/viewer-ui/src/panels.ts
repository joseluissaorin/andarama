import type {
  AudioHotspot,
  CompareHotspot,
  EmbedVideoHotspot,
  FormHotspot,
  GalleryHotspot,
  Hotspot,
  ImageHotspot,
  Model3dHotspot,
  PdfHotspot,
  QuizHotspot,
  TextHotspot,
  TreasureHotspot,
  VideoFileHotspot,
  WebHotspot,
} from "@andarama/schema";
import { resolveUrl, type TourViewer } from "@andarama/viewer";
import { el, trapFocus } from "./dom.js";
import { renderMarkdown } from "./markdown.js";
import { createIconSvg } from "@andarama/viewer";
import type { Translator } from "./i18n.js";

export interface PanelContext {
  viewer: TourViewer;
  t: Translator;
  baseUrl: string;
  container: HTMLElement;
  /** Endpoint de la API de formularios (null en export sin backend). */
  formEndpoint: string | null;
  turnstileSiteKey: string | null;
  onClose: () => void;
}

/**
 * Host de paneles: lightbox accesible (dialog + trampa de foco + Esc)
 * que renderiza el contenido segun el tipo de hotspot.
 */
export class PanelHost {
  private backdrop: HTMLElement | null = null;
  private releaseFocus: (() => void) | null = null;
  private lastFocus: HTMLElement | null = null;

  constructor(private ctx: Omit<PanelContext, "onClose">) {}

  get isOpen(): boolean {
    return this.backdrop != null;
  }

  close(): void {
    this.releaseFocus?.();
    this.releaseFocus = null;
    this.backdrop?.remove();
    this.backdrop = null;
    this.lastFocus?.focus();
    this.lastFocus = null;
  }

  open(hotspot: Hotspot, anchor: HTMLElement | null): void {
    this.close();
    // Un tooltip es una burbuja anclada al marcador, no un modal.
    if (hotspot.type === "tooltip" && anchor != null) {
      this.openTooltip(hotspot, anchor);
      return;
    }
    this.lastFocus = (anchor ?? document.activeElement) as HTMLElement | null;
    const ctx: PanelContext = { ...this.ctx, onClose: () => this.close() };
    const content = buildPanelContent(hotspot, ctx);
    if (content == null) return;

    const title = this.ctx.viewer.text(hotspot.label) || this.ctx.viewer.text((hotspot as { title?: unknown }).title as any) || "";
    const closeBtn = el("button", {
      className: "anda-btn",
      type: "button",
      "aria-label": this.ctx.t("close"),
      // Accionable con la mirada: con el giroscopio puesto no hay dedo que
      // valga, y un panel que se abre pero no se cierra es una trampa.
      "data-gaze": "1",
    });
    closeBtn.appendChild(createIconSvg("x", 20));
    closeBtn.addEventListener("click", () => this.close());

    const panel = el(
      "div",
      {
        className: `anda-panel${content.wide === true ? " anda-panel--wide" : ""}`,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": title || hotspot.type,
      },
      el("div", { className: "anda-panel__head" }, el("h2", { text: title || " " }), closeBtn),
      content.body,
    );
    this.backdrop = el("div", { className: "anda-panel-backdrop" }, panel);
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.close();
    });
    this.ctx.container.appendChild(this.backdrop);
    this.releaseFocus = trapFocus(this.backdrop, () => this.close());
    closeBtn.focus();
    content.onMounted?.();
  }

  /** Burbuja de tooltip pegada al marcador; se cierra sola al mover la vista. */
  private openTooltip(hotspot: Hotspot, anchor: HTMLElement): void {
    const text = this.ctx.viewer.text((hotspot as { text?: unknown }).text as never) || this.ctx.viewer.text(hotspot.label);
    if (text === "") return;
    const existing = this.ctx.container.querySelector(`.anda-tooltip-bubble[data-for="${hotspot.id}"]`);
    if (existing != null) {
      existing.remove();
      return;
    }
    this.ctx.container.querySelectorAll(".anda-tooltip-bubble").forEach((b) => b.remove());
    const bubble = el("div", { className: "anda-tooltip-bubble", role: "status", "data-for": hotspot.id, text });
    this.ctx.container.appendChild(bubble);
    const place = (): void => {
      const cRect = this.ctx.container.getBoundingClientRect();
      const aRect = anchor.getBoundingClientRect();
      bubble.style.left = `${aRect.left - cRect.left + aRect.width / 2}px`;
      bubble.style.top = `${aRect.top - cRect.top - 10}px`;
    };
    place();
    const offView = this.ctx.viewer.on("viewChange", place);
    const offScene = this.ctx.viewer.on("sceneChange", () => cleanup());
    const cleanup = (): void => {
      offView();
      offScene();
      bubble.remove();
    };
    if ((hotspot as { permanent?: boolean }).permanent !== true) {
      setTimeout(cleanup, 6000);
    }
  }
}

interface PanelContent {
  body: HTMLElement;
  wide?: boolean;
  onMounted?: () => void;
}

function buildPanelContent(hotspot: Hotspot, ctx: PanelContext): PanelContent | null {
  switch (hotspot.type) {
    case "text":
      return textPanel(hotspot, ctx);
    case "image":
      return imagePanel(hotspot, ctx);
    case "gallery":
      return galleryPanel(hotspot, ctx);
    case "videoFile":
      return videoPanel(hotspot, ctx);
    case "embedVideo":
      return embedPanel(hotspot, ctx);
    case "audio":
      return audioPanel(hotspot, ctx);
    case "pdf":
      return pdfPanel(hotspot, ctx);
    case "model3d":
      return modelPanel(hotspot, ctx);
    case "web":
      return webPanel(hotspot, ctx);
    case "form":
      return formPanel(hotspot, ctx);
    case "compare":
      return comparePanel(hotspot, ctx);
    case "quiz":
      return quizPanel(hotspot, ctx);
    case "tooltip":
      return textPanel({ ...hotspot, type: "text", body: hotspot.text } as unknown as TextHotspot, ctx);
    case "treasure":
      return treasurePanel(hotspot, ctx);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

/**
 * Tesoro encontrado. El propio hotspot lleva lo que se lee al hallarlo; si no
 * lleva nada, el visor felicita igual, porque encontrarlo ya es el premio.
 */
function treasurePanel(hs: TreasureHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-treasure-found" });
  const icono = createIconSvg("gem", 44, "currentColor");
  icono.classList.add("anda-treasure-found__icon");
  body.appendChild(icono);
  const titulo = el("p", { className: "anda-treasure-found__title" });
  titulo.textContent = ctx.viewer.text(hs.label) || ctx.t("treasure_found");
  body.appendChild(titulo);
  const premio = ctx.viewer.text(hs.reward);
  if (premio !== "") {
    const prosa = el("div", { className: "anda-prose" });
    prosa.innerHTML = renderMarkdown(premio);
    body.appendChild(prosa);
  }
  const estado = ctx.viewer.treasureState();
  if (estado.total > 0) {
    const cuenta = el("p", { className: "anda-treasure-found__count" });
    cuenta.textContent = ctx.t("treasure_progress", { found: String(estado.found), total: String(estado.total) });
    body.appendChild(cuenta);
  }
  return { body };
}

function textPanel(hs: TextHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body" });
  const prose = el("div", { className: "anda-prose" });
  prose.innerHTML = renderMarkdown(ctx.viewer.text(hs.body));
  body.appendChild(prose);
  return { body };
}

function imagePanel(hs: ImageHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const zoom = el("div", { className: "anda-deepzoom" });
  const img = el("img", { src: resolveUrl(ctx.baseUrl, hs.url), alt: ctx.viewer.text(hs.altText) });
  zoom.appendChild(img);
  body.appendChild(zoom);
  const caption = ctx.viewer.text(hs.caption);
  if (caption !== "") body.appendChild(el("div", { className: "anda-deepzoom__caption", text: caption }));
  if (hs.download === true) {
    const bar = el("div", { className: "anda-deepzoom__caption" });
    const a = el("a", { href: resolveUrl(ctx.baseUrl, hs.url), download: "", text: ctx.t("download") });
    a.style.color = "var(--u3-primary)";
    bar.appendChild(a);
    body.appendChild(bar);
  }
  return { body, wide: true, onMounted: () => setupDeepZoom(zoom, img) };
}

/** Pan/zoom profundo con rueda, arrastre y pellizco. */
function setupDeepZoom(viewport: HTMLElement, img: HTMLImageElement): void {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let natW = 0;
  let natH = 0;

  const apply = (): void => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const fit = (): void => {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (natW === 0 || vw === 0) return;
    scale = Math.min(vw / natW, vh / natH);
    tx = (vw - natW * scale) / 2;
    ty = (vh - natH * scale) / 2;
    apply();
  };
  img.addEventListener("load", () => {
    natW = img.naturalWidth;
    natH = img.naturalHeight;
    fit();
  });
  if (img.complete && img.naturalWidth > 0) {
    natW = img.naturalWidth;
    natH = img.naturalHeight;
    setTimeout(fit, 0);
  }
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const ns = Math.min(8, Math.max(0.05, scale * factor));
      tx = cx - ((cx - tx) / scale) * ns;
      ty = cy - ((cy - ty) / scale) * ns;
      scale = ns;
      apply();
    },
    { passive: false },
  );
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  viewport.addEventListener("pointerdown", (e) => {
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) {
        const factor = d / pinchDist;
        scale = Math.min(8, Math.max(0.05, scale * factor));
        pinchDist = d;
        apply();
      }
    } else if (dragging) {
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    }
  });
  const up = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) dragging = false;
  };
  viewport.addEventListener("pointerup", up);
  viewport.addEventListener("pointercancel", up);
  viewport.addEventListener("dblclick", () => {
    scale = scale > 1 ? 1 : 2;
    fit();
    if (scale !== 1) {
      scale = 2;
      apply();
    }
  });
}

function galleryPanel(hs: GalleryHotspot, ctx: PanelContext): PanelContent {
  let index = 0;
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const wrap = el("div", { className: "anda-gallery" });
  const main = el("img", { className: "anda-gallery__main", alt: "" });
  const meta = el("div", { className: "anda-gallery__meta" });
  const thumbs = el("div", { className: "anda-gallery__thumbs", role: "tablist" });

  const show = (i: number): void => {
    index = (i + hs.items.length) % hs.items.length;
    const item = hs.items[index]!;
    main.src = resolveUrl(ctx.baseUrl, item.url);
    main.alt = ctx.viewer.text(item.title);
    meta.replaceChildren(
      el("strong", { text: ctx.viewer.text(item.title) }),
      el("p", { text: ctx.viewer.text(item.description), style: "margin:4px 0 0;color:var(--u3-fg-dim);font-size:14px;" }),
    );
    thumbs.querySelectorAll("img").forEach((t, j) => {
      t.setAttribute("aria-current", j === index ? "true" : "false");
    });
  };
  const prev = el("button", { className: "anda-btn anda-gallery__nav anda-gallery__nav--prev", "aria-label": ctx.t("gallery_prev") });
  prev.appendChild(createIconSvg("chevron-left", 20));
  prev.addEventListener("click", () => show(index - 1));
  const next = el("button", { className: "anda-btn anda-gallery__nav anda-gallery__nav--next", "aria-label": ctx.t("gallery_next") });
  next.appendChild(createIconSvg("chevron-right", 20));
  next.addEventListener("click", () => show(index + 1));

  hs.items.forEach((item, i) => {
    const t = el("img", { src: resolveUrl(ctx.baseUrl, item.thumb ?? item.url), alt: ctx.viewer.text(item.title), role: "tab" });
    t.addEventListener("click", () => show(i));
    thumbs.appendChild(t);
  });
  wrap.append(main, prev, next);
  body.append(wrap, meta, thumbs);
  show(0);
  return { body, wide: true };
}

function videoPanel(hs: VideoFileHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const video = el("video", {
    controls: true,
    playsinline: true,
    style: "width:100%;max-height:70vh;display:block;background:#000;",
  });
  video.src = resolveUrl(ctx.baseUrl, hs.url);
  if (hs.autoplay === true) {
    video.muted = hs.muted ?? true;
    video.autoplay = true;
  }
  video.loop = hs.loop ?? false;
  for (const track of hs.subtitles ?? []) {
    const t = el("track", { kind: "subtitles", srclang: track.lang, src: resolveUrl(ctx.baseUrl, track.url) });
    video.appendChild(t);
  }
  body.appendChild(video);
  return { body, wide: true };
}

function embedPanel(hs: EmbedVideoHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  let src = "";
  const nocookie = hs.nocookie !== false;
  if (hs.provider === "youtube") {
    const host = nocookie ? "www.youtube-nocookie.com" : "www.youtube.com";
    const params = new URLSearchParams();
    if (hs.autoplay === true) params.set("autoplay", "1");
    if (hs.start != null) params.set("start", String(hs.start));
    src = `https://${host}/embed/${encodeURIComponent(hs.videoId)}?${params.toString()}`;
  } else if (hs.provider === "vimeo") {
    const params = new URLSearchParams({ dnt: "1" });
    if (hs.autoplay === true) params.set("autoplay", "1");
    src = `https://player.vimeo.com/video/${encodeURIComponent(hs.videoId)}?${params.toString()}`;
  } else {
    const host = (hs.host ?? "").replace(/\/$/, "");
    src = `${host}/videos/embed/${encodeURIComponent(hs.videoId)}`;
  }
  const iframe = el("iframe", {
    src,
    allow: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen",
    allowfullscreen: true,
    style: "width:100%;aspect-ratio:16/9;border:0;display:block;",
    title: ctx.viewer.text(hs.label) || "Video",
  });
  body.appendChild(iframe);
  return { body, wide: true };
}

function audioPanel(hs: AudioHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body" });
  const audio = el("audio", { controls: true, style: "width:100%;" });
  audio.src = resolveUrl(ctx.baseUrl, hs.url);
  audio.loop = hs.loop ?? false;
  if (hs.volume != null) audio.volume = hs.volume;
  body.appendChild(audio);
  const transcript = ctx.viewer.text(hs.transcript);
  if (transcript !== "") {
    const details = el("details", { style: "margin-top:12px;" });
    details.appendChild(el("summary", { text: ctx.t("transcript") }));
    const prose = el("div", { className: "anda-prose" });
    prose.innerHTML = renderMarkdown(transcript);
    details.appendChild(prose);
    body.appendChild(details);
  }
  void audio.play().catch(() => {});
  return { body };
}

function pdfPanel(hs: PdfHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const holder = el("div", { style: "min-height:60vh;display:flex;flex-direction:column;" });
  body.appendChild(holder);
  const url = resolveUrl(ctx.baseUrl, hs.url);
  return {
    body,
    wide: true,
    onMounted: () => {
      void renderPdf(holder, url, ctx).catch(() => {
        // Fallback: visor nativo del navegador.
        holder.replaceChildren(
          el("iframe", { src: url, style: "flex:1;border:0;min-height:60vh;", title: "PDF" }),
        );
      });
      if (hs.download === true) {
        const bar = el("div", { style: "padding:10px 16px;" });
        const a = el("a", { href: url, download: "", text: ctx.t("download") });
        a.style.color = "var(--u3-primary)";
        bar.appendChild(a);
        body.appendChild(bar);
      }
    },
  };
}

/** Visor PDF.js con paginacion y zoom (carga perezosa del chunk). */
async function renderPdf(holder: HTMLElement, url: string, ctx: PanelContext): Promise<void> {
  const pdfjs: any = await import(/* @vite-ignore */ "pdfjs-dist" as string);
  if (pdfjs.GlobalWorkerOptions != null) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).toString();
    } catch {
      // el bundler resolvera el worker
    }
  }
  const doc = await pdfjs.getDocument(url).promise;
  let page = 1;
  let zoom = 1.2;
  const canvas = el("canvas", { style: "display:block;margin:0 auto;max-width:100%;" });
  const status = el("span", { style: "flex:1;text-align:center;font-size:13px;" });
  const render = async (): Promise<void> => {
    const p = await doc.getPage(page);
    const viewport = p.getViewport({ scale: zoom });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await p.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    status.textContent = ctx.t("pdf_page", { page, total: doc.numPages });
  };
  const btn = (icon: string, label: string, fn: () => void): HTMLButtonElement => {
    const b = el("button", { className: "anda-btn", "aria-label": label, style: "width:36px;height:36px;" });
    b.appendChild(createIconSvg(icon, 16));
    b.addEventListener("click", fn);
    return b;
  };
  const bar = el(
    "div",
    { style: "display:flex;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(128,128,160,.25);" },
    btn("chevron-left", ctx.t("gallery_prev"), () => {
      if (page > 1) {
        page--;
        void render();
      }
    }),
    btn("chevron-right", ctx.t("gallery_next"), () => {
      if (page < doc.numPages) {
        page++;
        void render();
      }
    }),
    status,
    btn("minus", ctx.t("zoom_out"), () => {
      zoom = Math.max(0.4, zoom / 1.25);
      void render();
    }),
    btn("plus", ctx.t("zoom_in"), () => {
      zoom = Math.min(4, zoom * 1.25);
      void render();
    }),
  );
  const scroller = el("div", { style: "flex:1;overflow:auto;background:#333;padding:12px;" }, canvas);
  holder.replaceChildren(bar, scroller);
  await render();
}

function modelPanel(hs: Model3dHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const holder = el("div", { style: "height:60vh;background:#1a1a2a;" });
  body.appendChild(holder);
  if (hs.format === "obj" || hs.format === "stl") {
    return {
      body,
      wide: true,
      onMounted: () => {
        void renderThreeModel(holder, resolveUrl(ctx.baseUrl, hs.url), hs.format as "obj" | "stl", ctx).catch(() => {
          holder.textContent = ctx.t("error_load");
        });
      },
    };
  }
  return {
    body,
    wide: true,
    onMounted: () => {
      void (async () => {
        try {
          await import(/* @vite-ignore */ "@google/model-viewer" as string);
        } catch {
          holder.textContent = ctx.t("error_load");
          return;
        }
        const mv = document.createElement("model-viewer") as HTMLElement & Record<string, unknown>;
        mv.setAttribute("src", resolveUrl(ctx.baseUrl, hs.url));
        mv.setAttribute("camera-controls", "");
        mv.setAttribute("auto-rotate", "");
        mv.setAttribute("shadow-intensity", "1");
        mv.setAttribute("style", "width:100%;height:100%;");
        mv.setAttribute("alt", ctx.viewer.text(hs.altText));
        if (hs.poster != null) mv.setAttribute("poster", resolveUrl(ctx.baseUrl, hs.poster));
        if (hs.ar === true) {
          mv.setAttribute("ar", "");
          mv.setAttribute("ar-modes", "scene-viewer quick-look webxr");
          if (hs.usdz != null) mv.setAttribute("ios-src", resolveUrl(ctx.baseUrl, hs.usdz));
        }
        holder.replaceChildren(mv);
      })();
    },
  };
}

/** Modelos OBJ/STL con three.js (carga perezosa; glTF/GLB usan model-viewer). */
async function renderThreeModel(holder: HTMLElement, url: string, format: "obj" | "stl", ctx: PanelContext): Promise<void> {
  const [three, controlsMod, loaderMod] = await Promise.all([
    import(/* @vite-ignore */ "three" as string),
    import(/* @vite-ignore */ "three/examples/jsm/controls/OrbitControls.js" as string),
    format === "obj"
      ? import(/* @vite-ignore */ "three/examples/jsm/loaders/OBJLoader.js" as string)
      : import(/* @vite-ignore */ "three/examples/jsm/loaders/STLLoader.js" as string),
  ]);
  const THREE: any = three;
  const width = holder.clientWidth || 800;
  const height = holder.clientHeight || 480;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2a);
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  holder.replaceChildren(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(3, 5, 4);
  scene.add(dir);

  const material = new THREE.MeshStandardMaterial({ color: 0xb8bdd0, metalness: 0.1, roughness: 0.7 });
  let object: any;
  if (format === "obj") {
    const loader = new (loaderMod as any).OBJLoader();
    object = await loader.loadAsync(url);
    object.traverse((child: any) => {
      if (child.isMesh && child.material?.map == null) child.material = material;
    });
  } else {
    const loader = new (loaderMod as any).STLLoader();
    const geometry = await loader.loadAsync(url);
    geometry.computeVertexNormals();
    object = new THREE.Mesh(geometry, material);
  }
  // Centrar y encuadrar
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  scene.add(object);
  camera.position.set(size * 0.7, size * 0.5, size * 0.9);
  const controls = new (controlsMod as any).OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  let alive = true;
  const tick = (): void => {
    if (!alive) return;
    if (!document.contains(holder)) {
      alive = false;
      renderer.dispose();
      return;
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();
  void ctx;
}

function webPanel(hs: WebHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  // Sandbox estricto por defecto: allow-scripts + allow-same-origin juntos
  // anulan el aislamiento, asi que same-origin es opt-in explicito.
  const sandbox = Array.isArray(hs.sandbox)
    ? hs.sandbox.join(" ")
    : (hs.sandbox as unknown) === "permissive"
      ? "allow-scripts allow-same-origin allow-forms allow-popups"
      : "allow-scripts allow-forms allow-popups";
  const iframe = el("iframe", {
    src: hs.url,
    sandbox,
    allow: (hs.allow ?? []).join("; "),
    style: `width:100%;height:${hs.height ?? 480}px;border:0;display:block;`,
    title: ctx.viewer.text(hs.label) || "Web",
    referrerpolicy: "no-referrer",
  });
  body.appendChild(iframe);
  return { body, wide: true };
}

function formPanel(hs: FormHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body" });
  const form = el("form", { className: "anda-form", novalidate: true });
  const fields: { id: string; input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; required: boolean }[] = [];

  for (const field of hs.fields) {
    const label = el("label", { for: `u3f-${field.id}`, text: ctx.viewer.text(field.label) + (field.required === true ? " *" : "") });
    form.appendChild(label);
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.type === "select") {
      input = el("select", { id: `u3f-${field.id}` });
      for (const opt of field.options ?? []) {
        input.appendChild(el("option", { value: opt.value, text: ctx.viewer.text(opt.label) }));
      }
    } else if (field.type === "textarea") {
      input = el("textarea", { id: `u3f-${field.id}`, rows: "4" });
    } else if (field.type === "checkbox") {
      const wrap = el("div", { className: "anda-check" });
      input = el("input", { type: "checkbox", id: `u3f-${field.id}` });
      wrap.append(input);
      form.removeChild(label);
      wrap.appendChild(el("label", { for: `u3f-${field.id}`, text: ctx.viewer.text(field.label), style: "margin:0;" }));
      form.appendChild(wrap);
    } else {
      input = el("input", { type: field.type, id: `u3f-${field.id}` });
    }
    const ph = ctx.viewer.text(field.placeholder);
    if (ph !== "" && "placeholder" in input) (input as HTMLInputElement).placeholder = ph;
    if (input.parentElement == null) form.appendChild(input);
    fields.push({ id: field.id, input, required: field.required === true });
  }

  let turnstileToken: string | null = null;
  if (hs.turnstile === true && ctx.turnstileSiteKey != null) {
    const holder = el("div", { style: "margin-top:14px;" });
    form.appendChild(holder);
    const w = window as unknown as Record<string, any>;
    const renderTs = (): void => {
      w.turnstile?.render(holder, {
        sitekey: ctx.turnstileSiteKey,
        callback: (token: string) => {
          turnstileToken = token;
        },
      });
    };
    if (w.turnstile != null) renderTs();
    else {
      const script = el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js" });
      script.addEventListener("load", renderTs);
      document.head.appendChild(script);
    }
  }

  const submit = el("button", { className: "anda-primary-btn", type: "submit", text: ctx.viewer.text(hs.submitLabel) || ctx.t("submit") });
  const status = el("p", { role: "status", style: "margin-top:10px;font-size:14px;" });
  form.append(submit, status);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Validacion basica
    for (const f of fields) {
      const value = f.input instanceof HTMLInputElement && f.input.type === "checkbox" ? f.input.checked : f.input.value;
      form.querySelector(`#u3f-${f.id} + .anda-form__error`)?.remove();
      if (f.required && (value === "" || value === false)) {
        f.input.insertAdjacentElement("afterend", el("p", { className: "anda-form__error", text: ctx.t("required_field") }));
        return;
      }
      if (f.input instanceof HTMLInputElement && f.input.type === "email" && f.input.value !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.input.value)) {
        f.input.insertAdjacentElement("afterend", el("p", { className: "anda-form__error", text: ctx.t("invalid_email") }));
        return;
      }
    }
    const data: Record<string, unknown> = {};
    for (const f of fields) {
      data[f.id] = f.input instanceof HTMLInputElement && f.input.type === "checkbox" ? f.input.checked : f.input.value;
    }
    submit.disabled = true;
    status.textContent = ctx.t("sending");
    const destination = ctx.formEndpoint != null && hs.destination.api !== false ? ctx.formEndpoint : hs.destination.webhook;
    const send = async (): Promise<void> => {
      if (destination == null) throw new Error("sin destino");
      const res = await fetch(destination, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hotspotId: hs.id,
          lang: ctx.viewer.currentLang(),
          data,
          turnstileToken,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
    };
    send()
      .then(() => {
        ctx.viewer.trackForm(hs.id);
        form.replaceChildren(el("p", { className: "anda-prose", text: ctx.viewer.text(hs.successMessage) || ctx.t("form_success") }));
      })
      .catch(() => {
        submit.disabled = false;
        status.textContent = ctx.t("form_error");
      });
  });

  body.appendChild(form);
  return { body };
}

function comparePanel(hs: CompareHotspot, ctx: PanelContext): PanelContent {
  if (hs.mode === "panoramas") {
    return comparePanoramas(hs, ctx);
  }
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const wrap = el("div", { className: "anda-compare" });
  const before = el("img", { src: resolveUrl(ctx.baseUrl, hs.before.url ?? ""), alt: ctx.viewer.text(hs.before.label) || ctx.t("before") });
  const afterClip = el("div", { className: "anda-compare__after" });
  const after = el("img", { src: resolveUrl(ctx.baseUrl, hs.after.url ?? ""), alt: ctx.viewer.text(hs.after.label) || ctx.t("after") });
  afterClip.appendChild(after);
  const handle = el("div", { className: "anda-compare__handle", role: "slider", "aria-label": "Comparador", tabindex: "0", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50" });
  const tagB = el("span", { className: "anda-compare__tag", text: ctx.viewer.text(hs.before.label) || ctx.t("before"), style: "left:10px;" });
  const tagA = el("span", { className: "anda-compare__tag", text: ctx.viewer.text(hs.after.label) || ctx.t("after"), style: "right:10px;" });
  wrap.append(before, afterClip, handle, tagB, tagA);
  body.appendChild(wrap);
  const setPos = (pct: number): void => {
    const p = Math.max(0, Math.min(100, pct));
    afterClip.style.clipPath = `inset(0 0 0 ${p}%)`;
    handle.style.left = `calc(${p}% - 2px)`;
    handle.setAttribute("aria-valuenow", String(Math.round(p)));
  };
  setPos(50);
  let dragging = false;
  const fromEvent = (clientX: number): number => {
    const rect = wrap.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  };
  wrap.addEventListener("pointerdown", (e) => {
    dragging = true;
    wrap.setPointerCapture(e.pointerId);
    setPos(fromEvent(e.clientX));
  });
  wrap.addEventListener("pointermove", (e) => {
    if (dragging) setPos(fromEvent(e.clientX));
  });
  wrap.addEventListener("pointerup", () => {
    dragging = false;
  });
  handle.addEventListener("keydown", (e) => {
    const now = Number(handle.getAttribute("aria-valuenow"));
    if (e.key === "ArrowLeft") setPos(now - 4);
    if (e.key === "ArrowRight") setPos(now + 4);
  });
  return { body, wide: true };
}

/**
 * Comparador de dos panoramas: vista dividida con dos visores sincronizados
 * (dos iframes del propio tour, acoplados por la API postMessage). Arrastrar
 * en uno mueve el otro: la comparación es real, no dos botones.
 */
function comparePanoramas(hs: CompareHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body anda-panel__body--flush" });
  const beforeLabel = ctx.viewer.text(hs.before.label) || ctx.t("before");
  const afterLabel = ctx.viewer.text(hs.after.label) || ctx.t("after");
  const split = el("div", { className: "anda-split" });
  const v = ctx.viewer.view();
  const frames: HTMLIFrameElement[] = [];
  const mkPane = (sceneId: string | undefined, label: string): HTMLElement => {
    const pane = el("div", { className: "anda-split__pane" });
    if (sceneId == null) return pane;
    const iframe = el("iframe", {
      src: `${location.pathname}${location.search}#s=${encodeURIComponent(sceneId)}&y=${v.yaw.toFixed(3)}&p=${v.pitch.toFixed(3)}&f=${v.fov.toFixed(3)}`,
      title: label,
      allow: "fullscreen; gyroscope",
    });
    frames.push(iframe);
    pane.append(iframe, el("span", { className: "anda-compare__tag", text: label, style: "left:10px;top:10px;bottom:auto;" }));
    return pane;
  };
  split.append(mkPane(hs.before.sceneId, beforeLabel), mkPane(hs.after.sceneId, afterLabel));
  body.appendChild(split);

  // Sincronía bidireccional con supresión de eco
  let lastPush = 0;
  const onMessage = (e: MessageEvent): void => {
    const data = e.data as { andarama?: string; view?: { yaw: number; pitch: number; fov: number } };
    if (data?.andarama !== "viewChange" || data.view == null) return;
    const from = frames.find((f) => f.contentWindow === e.source);
    if (from == null) return;
    if (Date.now() - lastPush < 120) return;
    lastPush = Date.now();
    for (const f of frames) {
      if (f !== from) f.contentWindow?.postMessage({ andarama: "setView", view: data.view }, "*");
    }
  };
  window.addEventListener("message", onMessage);
  const observer = new MutationObserver(() => {
    if (!document.contains(split)) {
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    }
  });
  observer.observe(ctx.container, { childList: true, subtree: true });
  return { body, wide: true };
}

function quizPanel(hs: QuizHotspot, ctx: PanelContext): PanelContent {
  const body = el("div", { className: "anda-panel__body" });
  const question = el("div", { className: "anda-prose" });
  question.innerHTML = renderMarkdown(ctx.viewer.text(hs.question));
  body.appendChild(question);

  const multi = hs.kind === "multiple";
  const name = `quiz-${hs.id}`;
  const options = [...hs.options];
  const optEls: { id: string; input: HTMLInputElement; wrap: HTMLElement; correct: boolean }[] = [];
  const list = el("div", { role: multi ? "group" : "radiogroup", "aria-label": ctx.viewer.text(hs.question) });
  for (const opt of options) {
    const input = el("input", { type: multi ? "checkbox" : "radio", name, id: `${name}-${opt.id}` });
    const wrap = el(
      "label",
      { className: "anda-quiz__option", for: `${name}-${opt.id}` },
      input,
      el("span", { text: ctx.viewer.text(opt.text) }),
    );
    list.appendChild(wrap);
    optEls.push({ id: opt.id, input, wrap, correct: opt.correct === true });
  }
  body.appendChild(list);

  let attempts = 0;
  const maxAttempts = hs.attempts ?? 0;
  const check = el("button", { className: "anda-primary-btn", type: "button", text: ctx.t("quiz_check") });
  const feedback = el("div", { role: "status" });
  body.append(check, feedback);

  check.addEventListener("click", () => {
    const selected = optEls.filter((o) => o.input.checked).map((o) => o.id);
    if (selected.length === 0) return;
    attempts++;
    const correctIds = optEls.filter((o) => o.correct).map((o) => o.id);
    const isCorrect = selected.length === correctIds.length && selected.every((s) => correctIds.includes(s));
    for (const o of optEls) {
      if (o.input.checked) o.wrap.dataset.state = o.correct ? "correct" : "wrong";
      else if (isCorrect && o.correct) o.wrap.dataset.state = "correct";
      else delete o.wrap.dataset.state;
      o.input.disabled = isCorrect || (maxAttempts > 0 && attempts >= maxAttempts);
    }
    feedback.className = `anda-quiz__feedback ${isCorrect ? "anda-quiz__feedback--ok" : "anda-quiz__feedback--ko"}`;
    feedback.textContent = isCorrect
      ? ctx.viewer.text(hs.feedbackCorrect) || ctx.t("quiz_correct")
      : ctx.viewer.text(hs.feedbackWrong) || ctx.t("quiz_incorrect");
    const finished = isCorrect || (maxAttempts > 0 && attempts >= maxAttempts);
    if (finished) {
      check.disabled = true;
      ctx.viewer.reportQuizAnswer(hs.id, isCorrect, hs.points ?? 1);
      if (hs.gate === true && isCorrect) ctx.viewer.setNavigationBlocked(false);
    }
    if (hs.gate === true && !isCorrect) {
      ctx.viewer.setNavigationBlocked(true);
      feedback.append(el("p", { text: ctx.t("quiz_gate_message"), style: "margin:6px 0 0;font-size:13px;" }));
    }
  });
  return { body };
}
