import type { Hotspot } from "@andarama/schema";
import { quizQuestions } from "@andarama/schema";

/**
 * Paneles inmersivos: el contenido de un hotspot dibujado sobre un lienzo 2D
 * que después se sube como textura de un cuadrilátero curvo delante del
 * usuario. Cada panel declara sus zonas activas en coordenadas normalizadas
 * [0,1] (origen arriba-izquierda), que el motor XR cruza con el rayo de la
 * mano o del mando.
 *
 * Todo se dibuja con Canvas 2D: sin DOM, sin dependencias externas y sin
 * peticiones adicionales, para que el modo VR siga funcionando en un paquete
 * exportado servido desde un hosting estático.
 */

export const PANEL_WIDTH = 1280;
export const PANEL_HEIGHT = 800;

export interface PanelZone {
  id: string;
  /** Rectángulo normalizado [0,1] dentro del panel. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface PanelState {
  /** Índice de la galería, página del documento o pregunta del quiz. */
  index: number;
  /** Opciones marcadas en la pregunta actual del cuestionario. */
  selected: Set<string>;
  /** Respuesta de la pregunta actual ya comprobada. */
  answered: boolean;
  correct: boolean;
  /** Preguntas terminadas en este panel (para volver a ellas y para el resumen). */
  quizResults: Map<string, { selected: Set<string>; correct: boolean }>;
  /** Intentos gastados por pregunta. */
  quizTries: Map<string, number>;
  /** El último intento falló y aún quedan intentos (se puede volver a probar). */
  wrongHint: boolean;
  /** Posición del divisor del comparador [0,1]. */
  compare: number;
  /** Desplazamiento vertical del texto largo. */
  scroll: number;
}

export function newPanelState(): PanelState {
  return { index: 0, selected: new Set(), answered: false, correct: false, quizResults: new Map(), quizTries: new Map(), wrongHint: false, compare: 0.5, scroll: 0 };
}

/** Documento PDF abierto con pdf.js, tal como lo necesita el panel inmersivo. */
export interface VrPdfDocument {
  numPages: number;
  /** Dibuja la página (1…numPages) en un lienzo de `width` píxeles de ancho. */
  renderPage(pageNumber: number, width: number): Promise<HTMLCanvasElement>;
  destroy?(): void;
}

/** Estado del PDF que enseña el panel. */
export interface PanelPdfView {
  status: "loading" | "ready" | "error";
  /** Página actual ya dibujada (null mientras se dibuja). */
  page: HTMLCanvasElement | null;
  /** Índice de la página (desde 0). */
  index: number;
  total: number;
}

/** Hueco del vídeo dentro del panel (px del lienzo): el motor pone ahí su textura. */
export const VIDEO_RECT = { x: 44, y: 128, w: PANEL_WIDTH - 88, h: PANEL_HEIGHT - 240 };

/** Hueco de la página del PDF; a la derecha quedan los botones de desplazamiento. */
export const PDF_RECT = { x: 44, y: 128, w: PANEL_WIDTH - 88 - 96, h: PANEL_HEIGHT - 248 };

/**
 * Ancho al que se dibuja cada página: el del hueco. Se ajusta al ancho y se
 * desplaza en vertical: una página A4 entera en 550 px de alto no se leería.
 */
export const PDF_PAGE_WIDTH = PDF_RECT.w;

/** Píxeles que avanza el PDF por cada unidad de `scroll` (un toque son 3). */
const PDF_SCROLL_PX = 60;

export interface PanelContext {
  /** Resuelve un texto localizado del tour. */
  text: (value: unknown) => string;
  /** Resuelve una URL relativa del tour. */
  url: (value: string) => string;
  /** Traducción de la interfaz. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Imagen ya cargada (el motor precarga las que necesita el panel). */
  image: (url: string) => HTMLImageElement | null;
  /** Vídeo en reproducción para este hotspot, si lo hay. */
  video: (hotspotId: string) => HTMLVideoElement | null;
  /**
   * El motor pinta el vídeo con su propia textura encima de `VIDEO_RECT`:
   * el lienzo deja el hueco y no hace falta repintarlo en cada fotograma.
   */
  videoOverlay?: boolean;
  /** El vídeo suena en silencio porque el navegador no dejó reproducirlo con sonido. */
  videoMutedByPolicy?: boolean;
  /** PDF del panel (sin esto, el PDF se ofrece para verlo fuera de VR). */
  pdf?: () => PanelPdfView | null;
  /** Se puede salir de VR y abrir el hotspot en el visor plano. */
  exitToOpen?: boolean;
}

const BG = "#12172b";
const BG_SOFT = "#1d2440";
const FG = "#f2f4fb";
const FG_DIM = "#a9b0cd";
const ACCENT = "#a35fd1";
const OK = "#34d399";
const BAD = "#f87171";

/** Tipos que se consumen enteros dentro de VR. */
const IMMERSIVE_TYPES = new Set(["text", "tooltip", "image", "gallery", "videoFile", "audio", "quiz", "compare", "pdf"]);

/**
 * Tipos que necesitan un motor externo (navegador, reproductor de terceros,
 * 3D). Los vídeos de YouTube, Vimeo o PeerTube son un iframe y un iframe no se
 * puede pintar dentro de una sesión WebXR.
 */
const CONTINUE_OUTSIDE = new Set(["web", "form", "embedVideo", "model3d"]);

export function isImmersivePanel(type: string): boolean {
  return IMMERSIVE_TYPES.has(type);
}

export function needsExternalContinuation(type: string): boolean {
  return CONTINUE_OUTSIDE.has(type);
}

/**
 * Dibuja el panel de un hotspot y devuelve sus zonas activas.
 * `canvas` se reutiliza entre fotogramas para no reservar memoria por frame.
 */
export function drawPanel(
  canvas: HTMLCanvasElement,
  hotspot: Hotspot,
  state: PanelState,
  ctxApi: PanelContext,
): PanelZone[] {
  canvas.width = PANEL_WIDTH;
  canvas.height = PANEL_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const zones: PanelZone[] = [];

  // Fondo y cabecera
  roundRect(ctx, 0, 0, PANEL_WIDTH, PANEL_HEIGHT, 28, BG);
  ctx.fillStyle = BG_SOFT;
  ctx.fillRect(0, 0, PANEL_WIDTH, 96);
  ctx.fillStyle = FG;
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const title = ctxApi.text(hotspot.label) || ctxApi.text(hotspot.altText) || ctxApi.t(`hotspot_${hotspot.type}`);
  ctx.fillText(truncate(ctx, title, PANEL_WIDTH - 220), 44, 50);

  // Botón de cierre siempre presente
  drawButton(ctx, PANEL_WIDTH - 132, 20, 96, 56, "✕", false);
  zones.push({ id: "close", x: (PANEL_WIDTH - 132) / PANEL_WIDTH, y: 20 / PANEL_HEIGHT, w: 96 / PANEL_WIDTH, h: 56 / PANEL_HEIGHT, label: ctxApi.t("close") });

  const body = { x: 44, y: 128, w: PANEL_WIDTH - 88, h: PANEL_HEIGHT - 180 };

  switch (hotspot.type) {
    case "text":
    case "tooltip": {
      const raw = hotspot.type === "text" ? ctxApi.text(hotspot.body) : ctxApi.text(hotspot.text);
      drawParagraphs(ctx, stripMarkdown(raw), body, state.scroll);
      addScrollZones(zones, ctxApi);
      break;
    }
    case "image": {
      const img = ctxApi.image(ctxApi.url(hotspot.url));
      drawContain(ctx, img, body, ctxApi.t("loading"));
      const caption = ctxApi.text(hotspot.caption);
      if (caption !== "") {
        ctx.fillStyle = FG_DIM;
        ctx.font = "400 28px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(truncate(ctx, caption, body.w), PANEL_WIDTH / 2, PANEL_HEIGHT - 32);
      }
      break;
    }
    case "gallery": {
      const items = hotspot.items ?? [];
      const item = items[Math.min(state.index, Math.max(0, items.length - 1))];
      const img = item != null ? ctxApi.image(ctxApi.url(item.url)) : null;
      drawContain(ctx, img, { ...body, h: body.h - 60 }, ctxApi.t("loading"));
      ctx.fillStyle = FG_DIM;
      ctx.font = "500 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      const label = item != null ? ctxApi.text(item.title) : "";
      ctx.fillText(`${state.index + 1} / ${items.length}${label !== "" ? ` · ${truncate(ctx, label, 700)}` : ""}`, PANEL_WIDTH / 2, PANEL_HEIGHT - 76);
      addPrevNext(ctx, zones, ctxApi);
      break;
    }
    case "videoFile": {
      const video = ctxApi.video(hotspot.id);
      const ready = video != null && video.readyState >= 2 && video.videoWidth > 0;
      if (ctxApi.videoOverlay === true) {
        // Hueco negro: encima va la textura del vídeo
        ctx.fillStyle = "#000";
        ctx.fillRect(VIDEO_RECT.x, VIDEO_RECT.y, VIDEO_RECT.w, VIDEO_RECT.h);
        if (!ready) drawContain(ctx, null, VIDEO_RECT, ctxApi.t("loading"));
      } else {
        drawContain(ctx, video, VIDEO_RECT, ctxApi.t("loading"));
      }
      const playing = video != null && !video.paused;
      const label = ctxApi.videoMutedByPolicy === true ? ctxApi.t("video_sound_on") : playing ? ctxApi.t("video_pause") : ctxApi.t("video_play");
      drawButton(ctx, PANEL_WIDTH / 2 - 150, PANEL_HEIGHT - 96, 300, 64, label, true);
      zones.push({ id: "toggle", x: (PANEL_WIDTH / 2 - 150) / PANEL_WIDTH, y: (PANEL_HEIGHT - 96) / PANEL_HEIGHT, w: 300 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label });
      if (video != null && video.duration > 0) {
        const pct = video.currentTime / video.duration;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(body.x, PANEL_HEIGHT - 120, body.w, 8);
        ctx.fillStyle = ACCENT;
        ctx.fillRect(body.x, PANEL_HEIGHT - 120, body.w * pct, 8);
      }
      break;
    }
    case "audio": {
      const audio = ctxApi.video(hotspot.id) as unknown as HTMLAudioElement | null;
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(PANEL_WIDTH / 2, 300, 84, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "600 64px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(audio != null && !audio.paused ? "❙❙" : "▶", PANEL_WIDTH / 2, 302);
      zones.push({ id: "toggle", x: (PANEL_WIDTH / 2 - 84) / PANEL_WIDTH, y: 216 / PANEL_HEIGHT, w: 168 / PANEL_WIDTH, h: 168 / PANEL_HEIGHT, label: ctxApi.t("video_play") });
      const transcript = ctxApi.text(hotspot.transcript);
      if (transcript !== "") {
        drawParagraphs(ctx, stripMarkdown(transcript), { x: body.x, y: 420, w: body.w, h: PANEL_HEIGHT - 470 }, state.scroll);
        addScrollZones(zones, ctxApi);
      }
      break;
    }
    case "quiz": {
      // Varias preguntas: una por página, con ‹ › y un resumen al final
      // (índice = número de preguntas). Una sola: el panel de siempre.
      const preguntas = quizQuestions(hotspot);
      const varias = preguntas.length > 1;
      if (varias && state.index >= preguntas.length) {
        const aciertos = preguntas.filter((q) => state.quizResults.get(q.id)?.correct === true).length;
        ctx.fillStyle = FG;
        ctx.font = "600 44px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ctxApi.t("quiz_summary", { correct: aciertos, total: preguntas.length }), PANEL_WIDTH / 2, 330);
        addPrevNext(ctx, zones, ctxApi, { next: false, prevLabel: ctxApi.t("quiz_prev") });
        break;
      }
      const pregunta = preguntas[Math.min(state.index, preguntas.length - 1)];
      if (pregunta == null) break;
      let y = 176;
      if (varias) {
        ctx.fillStyle = FG_DIM;
        ctx.font = "600 26px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(ctxApi.t("quiz_question_of", { n: state.index + 1, total: preguntas.length }), body.x, 150);
        y = 200;
      }
      ctx.fillStyle = FG;
      ctx.font = "500 34px system-ui, sans-serif";
      ctx.textAlign = "left";
      const qLines = wrapText(ctx, stripMarkdown(ctxApi.text(pregunta.question)), body.w);
      for (const line of qLines.slice(0, varias ? 2 : 3)) {
        ctx.fillText(line, body.x, y);
        y += 46;
      }
      const options = pregunta.options ?? [];
      y += 12;
      for (const opt of options.slice(0, varias ? 4 : 5)) {
        const picked = state.selected.has(opt.id);
        const height = 72;
        let fill = picked ? "rgba(163,95,209,0.35)" : "rgba(255,255,255,0.07)";
        if (state.answered) {
          if (opt.correct === true) fill = "rgba(52,211,153,0.32)";
          else if (picked) fill = "rgba(248,113,113,0.32)";
        }
        roundRect(ctx, body.x, y, body.w, height, 16, fill);
        ctx.strokeStyle = picked ? ACCENT : "rgba(255,255,255,0.16)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = FG;
        ctx.font = "500 30px system-ui, sans-serif";
        ctx.fillText(truncate(ctx, ctxApi.text(opt.text), body.w - 48), body.x + 24, y + height / 2);
        zones.push({ id: `opt:${opt.id}`, x: body.x / PANEL_WIDTH, y: y / PANEL_HEIGHT, w: body.w / PANEL_WIDTH, h: height / PANEL_HEIGHT, label: ctxApi.text(opt.text) });
        y += height + 14;
      }
      if (!state.answered) {
        if (state.wrongHint) {
          ctx.fillStyle = BAD;
          ctx.font = "600 28px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(ctxApi.t("quiz_incorrect"), PANEL_WIDTH / 2, PANEL_HEIGHT - 128);
        }
        drawButton(ctx, PANEL_WIDTH / 2 - 130, PANEL_HEIGHT - 104, 260, 64, ctxApi.t("quiz_check"), true);
        zones.push({ id: "check", x: (PANEL_WIDTH / 2 - 130) / PANEL_WIDTH, y: (PANEL_HEIGHT - 104) / PANEL_HEIGHT, w: 260 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: ctxApi.t("quiz_check") });
      } else {
        ctx.fillStyle = state.correct ? OK : BAD;
        ctx.font = "600 34px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(state.correct ? ctxApi.t("quiz_correct") : ctxApi.t("quiz_incorrect"), PANEL_WIDTH / 2, PANEL_HEIGHT - 72);
      }
      if (varias) {
        // El último «›» lleva al resumen, solo con todas comprobadas
        const todas = preguntas.every((q) => state.quizResults.has(q.id));
        const ultima = state.index >= preguntas.length - 1;
        addPrevNext(ctx, zones, ctxApi, {
          prev: state.index > 0,
          next: !ultima || todas,
          prevLabel: ctxApi.t("quiz_prev"),
          nextLabel: ultima ? ctxApi.t("quiz_see_result") : ctxApi.t("quiz_next"),
        });
      }
      break;
    }
    case "compare": {
      const before = ctxApi.image(ctxApi.url(hotspot.before?.url ?? ""));
      const after = ctxApi.image(ctxApi.url(hotspot.after?.url ?? ""));
      const area = { ...body, h: body.h - 40 };
      drawContain(ctx, before, area, ctxApi.t("loading"));
      if (after != null) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(area.x + area.w * state.compare, area.y, area.w * (1 - state.compare), area.h);
        ctx.clip();
        drawContain(ctx, after, area, "");
        ctx.restore();
      }
      const divider = area.x + area.w * state.compare;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(divider, area.y);
      ctx.lineTo(divider, area.y + area.h);
      ctx.stroke();
      // Toda la imagen es zona activa: apuntar mueve el divisor
      zones.push({ id: "compare", x: area.x / PANEL_WIDTH, y: area.y / PANEL_HEIGHT, w: area.w / PANEL_WIDTH, h: area.h / PANEL_HEIGHT, label: ctxApi.t("compare_hint") });
      ctx.fillStyle = FG_DIM;
      ctx.font = "400 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ctxApi.t("compare_hint"), PANEL_WIDTH / 2, PANEL_HEIGHT - 28);
      break;
    }
    case "pdf": {
      const view = ctxApi.pdf?.() ?? null;
      if (view == null || view.status === "error") {
        drawOutside(ctx, zones, hotspot, ctxApi, body, view?.status === "error" ? ctxApi.t("vr_pdf_error") : ctxApi.t("vr_open_outside"));
        break;
      }
      drawPdfPage(ctx, zones, view, state, ctxApi);
      break;
    }
    case "embedVideo": {
      // Un iframe de YouTube no se puede pintar dentro de WebXR: miniatura,
      // título y la salida para verlo en el recorrido, sin cortar la visita.
      const thumb = embedThumbnail(hotspot);
      const area = { x: PANEL_WIDTH / 2 - 300, y: body.y + 8, w: 600, h: 338 };
      const img = thumb != null ? ctxApi.image(thumb) : null;
      drawContain(ctx, img, area, "");
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(area.x + area.w / 2, area.y + area.h / 2, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(area.x + area.w / 2 - 18, area.y + area.h / 2 - 28);
      ctx.lineTo(area.x + area.w / 2 - 18, area.y + area.h / 2 + 28);
      ctx.lineTo(area.x + area.w / 2 + 30, area.y + area.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = FG;
      ctx.font = "500 30px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const message = ctxApi.t("vr_video_outside", { provider: PROVIDERS[hotspot.provider] ?? hotspot.provider });
      let y = area.y + area.h + 46;
      for (const line of wrapText(ctx, message, body.w - 40).slice(0, 2)) {
        ctx.fillText(line, PANEL_WIDTH / 2, y);
        y += 40;
      }
      addOutsideButtons(ctx, zones, ctxApi);
      break;
    }
    default: {
      drawOutside(ctx, zones, hotspot, ctxApi, body, ctxApi.t("vr_open_outside"));
      break;
    }
  }
  return zones;
}

const PROVIDERS: Record<string, string> = { youtube: "YouTube", vimeo: "Vimeo", peertube: "PeerTube" };

/** Identificador de YouTube de lo que haya en `videoId` (el id o una dirección). */
export function youtubeId(value: string): string | null {
  const v = value.trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  const m = /(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(v);
  return m?.[1] ?? null;
}

/** Miniatura pública del vídeo (solo YouTube la da sin API ni clave). */
export function embedThumbnail(hotspot: Hotspot): string | null {
  if (hotspot.type !== "embedVideo" || hotspot.provider !== "youtube") return null;
  const id = youtubeId(hotspot.videoId);
  return id != null ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/**
 * Página del PDF ajustada al ancho del hueco, con desplazamiento vertical
 * (▲ ▼ a la derecha) y página anterior/siguiente abajo.
 */
function drawPdfPage(ctx: CanvasRenderingContext2D, zones: PanelZone[], view: PanelPdfView, state: PanelState, api: PanelContext): void {
  const area = PDF_RECT;
  ctx.fillStyle = "#3a3f55";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const page = view.page;
  let maxScroll = 0;
  if (view.status === "loading" || page == null || page.width === 0) {
    drawContain(ctx, null, area, api.t("loading"));
  } else {
    const k = area.w / page.width;
    const fullH = page.height * k;
    maxScroll = Math.max(0, fullH - area.h);
    const offset = Math.max(0, Math.min(maxScroll, state.scroll * PDF_SCROLL_PX));
    // Se guarda el desplazamiento real: bajar de más no obliga a subir de más
    state.scroll = offset / PDF_SCROLL_PX;
    const visibleH = Math.min(area.h, fullH);
    const y = area.y + (area.h - visibleH) / 2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(area.x, y, area.w, visibleH);
    ctx.drawImage(page, 0, offset / k, page.width, visibleH / k, area.x, y, area.w, visibleH);
  }
  // Desplazamiento
  const bx = area.x + area.w + 16;
  const canUp = state.scroll > 0;
  const canDown = state.scroll * PDF_SCROLL_PX < maxScroll - 0.5;
  drawButton(ctx, bx, area.y, 80, 120, "▲", canUp);
  drawButton(ctx, bx, area.y + area.h - 120, 80, 120, "▼", canDown);
  zones.push({ id: "scroll-up", x: bx / PANEL_WIDTH, y: area.y / PANEL_HEIGHT, w: 80 / PANEL_WIDTH, h: 120 / PANEL_HEIGHT, label: api.t("pdf_scroll_up") });
  zones.push({ id: "scroll-down", x: bx / PANEL_WIDTH, y: (area.y + area.h - 120) / PANEL_HEIGHT, w: 80 / PANEL_WIDTH, h: 120 / PANEL_HEIGHT, label: api.t("pdf_scroll_down") });
  // Página
  if (view.total > 0) {
    ctx.fillStyle = FG_DIM;
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(api.t("pdf_page", { page: view.index + 1, total: view.total }), PANEL_WIDTH / 2, PANEL_HEIGHT - 78);
  }
  addPrevNext(ctx, zones, api, { prev: view.index > 0, next: view.index < view.total - 1 });
}

/** Botones de la ficha de lo que no se ve dentro de VR. */
function addOutsideButtons(ctx: CanvasRenderingContext2D, zones: PanelZone[], api: PanelContext): void {
  const y = PANEL_HEIGHT - 116;
  if (api.exitToOpen === true) {
    const stayW = 300;
    const goW = 400;
    const gap = 28;
    const x0 = PANEL_WIDTH / 2 - (stayW + goW + gap) / 2;
    drawButton(ctx, x0, y, stayW, 68, api.t("vr_stay"), false);
    zones.push({ id: "close", x: x0 / PANEL_WIDTH, y: y / PANEL_HEIGHT, w: stayW / PANEL_WIDTH, h: 68 / PANEL_HEIGHT, label: api.t("vr_stay") });
    const x1 = x0 + stayW + gap;
    drawButton(ctx, x1, y, goW, 68, api.t("vr_exit_and_view"), true);
    zones.push({ id: "exit-open", x: x1 / PANEL_WIDTH, y: y / PANEL_HEIGHT, w: goW / PANEL_WIDTH, h: 68 / PANEL_HEIGHT, label: api.t("vr_exit_and_view") });
    return;
  }
  drawButton(ctx, PANEL_WIDTH / 2 - 190, y, 380, 68, api.t("vr_queue_open"), true);
  zones.push({ id: "external", x: (PANEL_WIDTH / 2 - 190) / PANEL_WIDTH, y: y / PANEL_HEIGHT, w: 380 / PANEL_WIDTH, h: 68 / PANEL_HEIGHT, label: api.t("vr_queue_open") });
}

/**
 * Ficha de los tipos que requieren un motor externo: la información
 * disponible y la salida para verlos en el visor plano.
 */
function drawOutside(
  ctx: CanvasRenderingContext2D,
  zones: PanelZone[],
  hotspot: Hotspot,
  ctxApi: PanelContext,
  body: { x: number; y: number; w: number; h: number },
  message: string,
): void {
  const info = externalInfo(hotspot, ctxApi);
  const poster = info.poster != null ? ctxApi.image(info.poster) : null;
  if (poster != null) {
    drawContain(ctx, poster, { ...body, h: body.h - 190 }, "");
  } else {
    ctx.fillStyle = FG_DIM;
    ctx.font = "400 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(info.kind, PANEL_WIDTH / 2, 260);
  }
  ctx.fillStyle = FG;
  ctx.font = "500 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  const lines = wrapText(ctx, message, body.w);
  let y = PANEL_HEIGHT - 250;
  for (const line of lines.slice(0, 2)) {
    ctx.fillText(line, PANEL_WIDTH / 2, y);
    y += 40;
  }
  if (info.url !== "") {
    ctx.fillStyle = FG_DIM;
    ctx.font = "400 26px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(truncate(ctx, info.url, body.w), PANEL_WIDTH / 2, y + 6);
  }
  addOutsideButtons(ctx, zones, ctxApi);
}

/** Información mostrable de los hotspots que se continúan fuera de VR. */
export function externalInfo(hotspot: Hotspot, ctxApi: PanelContext): { kind: string; url: string; poster?: string } {
  switch (hotspot.type) {
    case "pdf":
      return { kind: ctxApi.t("hotspot_pdf"), url: ctxApi.url(hotspot.url) };
    case "web":
      return { kind: ctxApi.t("hotspot_web"), url: hotspot.url };
    case "form":
      return { kind: ctxApi.t("hotspot_form"), url: "" };
    case "embedVideo":
      return {
        kind: ctxApi.t("hotspot_embedVideo"),
        url:
          hotspot.provider === "youtube"
            ? `https://youtu.be/${hotspot.videoId}`
            : hotspot.provider === "vimeo"
              ? `https://vimeo.com/${hotspot.videoId}`
              : `https://${hotspot.host ?? ""}/w/${hotspot.videoId}`,
      };
    case "model3d":
      return {
        kind: ctxApi.t("hotspot_model3d"),
        url: ctxApi.url(hotspot.url),
        poster: hotspot.poster != null ? ctxApi.url(hotspot.poster) : undefined,
      };
    default:
      return { kind: ctxApi.t(`hotspot_${hotspot.type}`), url: "" };
  }
}

/** Imágenes que el panel necesitará: el motor las precarga antes de abrirlo. */
export function panelImageUrls(hotspot: Hotspot, ctxApi: Pick<PanelContext, "url">): string[] {
  switch (hotspot.type) {
    case "image":
      return [ctxApi.url(hotspot.url)];
    case "gallery":
      return (hotspot.items ?? []).map((i) => ctxApi.url(i.url));
    case "compare":
      return [hotspot.before?.url, hotspot.after?.url].filter((u): u is string => u != null && u !== "").map((u) => ctxApi.url(u));
    case "model3d":
      return hotspot.poster != null ? [ctxApi.url(hotspot.poster)] : [];
    case "embedVideo": {
      const thumb = embedThumbnail(hotspot);
      return thumb != null ? [thumb] : [];
    }
    default:
      return [];
  }
}

// --- primitivas de dibujo ---

function addPrevNext(
  ctx: CanvasRenderingContext2D,
  zones: PanelZone[],
  api: PanelContext,
  opts: { prev?: boolean; next?: boolean; prevLabel?: string; nextLabel?: string } = {},
): void {
  if (opts.prev !== false) {
    drawButton(ctx, 44, PANEL_HEIGHT - 110, 150, 64, "‹", true);
    zones.push({ id: "prev", x: 44 / PANEL_WIDTH, y: (PANEL_HEIGHT - 110) / PANEL_HEIGHT, w: 150 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: opts.prevLabel ?? api.t("gallery_prev") });
  }
  if (opts.next !== false) {
    drawButton(ctx, PANEL_WIDTH - 194, PANEL_HEIGHT - 110, 150, 64, "›", true);
    zones.push({ id: "next", x: (PANEL_WIDTH - 194) / PANEL_WIDTH, y: (PANEL_HEIGHT - 110) / PANEL_HEIGHT, w: 150 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: opts.nextLabel ?? api.t("gallery_next") });
  }
}

function addScrollZones(zones: PanelZone[], api: PanelContext): void {
  zones.push({ id: "scroll-up", x: 0.93, y: 0.2, w: 0.06, h: 0.14, label: api.t("gallery_prev") });
  zones.push({ id: "scroll-down", x: 0.93, y: 0.62, w: 0.06, h: 0.14, label: api.t("gallery_next") });
}

function drawButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, primary: boolean): void {
  roundRect(ctx, x, y, w, h, 14, primary ? ACCENT : "rgba(255,255,255,0.12)");
  ctx.fillStyle = "#fff";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement | null,
  area: { x: number; y: number; w: number; h: number },
  placeholder: string,
): void {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const mw = media == null ? 0 : media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const mh = media == null ? 0 : media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (media == null || mw === 0 || mh === 0) {
    if (placeholder !== "") {
      ctx.fillStyle = FG_DIM;
      ctx.font = "400 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(placeholder, area.x + area.w / 2, area.y + area.h / 2);
    }
    return;
  }
  const scale = Math.min(area.w / mw, area.h / mh);
  const w = mw * scale;
  const h = mh * scale;
  ctx.drawImage(media, area.x + (area.w - w) / 2, area.y + (area.h - h) / 2, w, h);
}

function drawParagraphs(
  ctx: CanvasRenderingContext2D,
  text: string,
  area: { x: number; y: number; w: number; h: number },
  scroll: number,
): void {
  ctx.fillStyle = FG;
  ctx.font = "400 32px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const lineHeight = 46;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    lines.push(...wrapText(ctx, paragraph, area.w));
  }
  const visible = Math.floor(area.h / lineHeight);
  const start = Math.max(0, Math.min(lines.length - visible, Math.round(scroll)));
  let y = area.y + 32;
  for (const line of lines.slice(start, start + visible)) {
    ctx.fillText(line, area.x, y);
    y += lineHeight;
  }
  if (lines.length > visible) {
    ctx.fillStyle = FG_DIM;
    ctx.font = "400 24px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.min(start + visible, lines.length)} / ${lines.length}`, area.x + area.w, area.y + area.h + 26);
  }
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (ctx.measureText(candidate).width > maxWidth && current !== "") {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Markdown a texto plano legible (el panel no renderiza HTML). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
