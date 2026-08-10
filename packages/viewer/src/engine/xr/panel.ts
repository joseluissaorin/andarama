import type { Hotspot } from "@andarama/schema";

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
  /** Índice de la galería o página del documento. */
  index: number;
  /** Opciones marcadas en un cuestionario. */
  selected: Set<string>;
  /** Respuesta ya comprobada. */
  answered: boolean;
  correct: boolean;
  /** Posición del divisor del comparador [0,1]. */
  compare: number;
  /** Desplazamiento vertical del texto largo. */
  scroll: number;
}

export function newPanelState(): PanelState {
  return { index: 0, selected: new Set(), answered: false, correct: false, compare: 0.5, scroll: 0 };
}

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
}

const BG = "#12172b";
const BG_SOFT = "#1d2440";
const FG = "#f2f4fb";
const FG_DIM = "#a9b0cd";
const ACCENT = "#a35fd1";
const OK = "#34d399";
const BAD = "#f87171";

/** Tipos que se consumen enteros dentro de VR. */
const IMMERSIVE_TYPES = new Set(["text", "tooltip", "image", "gallery", "videoFile", "audio", "quiz", "compare"]);

/** Tipos que necesitan un motor externo (documento, navegador, 3D). */
const CONTINUE_OUTSIDE = new Set(["pdf", "web", "form", "embedVideo", "model3d"]);

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
      ctx.fillText(`${state.index + 1} / ${items.length}${label !== "" ? ` — ${truncate(ctx, label, 700)}` : ""}`, PANEL_WIDTH / 2, PANEL_HEIGHT - 76);
      addPrevNext(ctx, zones, ctxApi);
      break;
    }
    case "videoFile": {
      const video = ctxApi.video(hotspot.id);
      drawContain(ctx, video, { ...body, h: body.h - 60 }, ctxApi.t("loading"));
      const playing = video != null && !video.paused;
      drawButton(ctx, PANEL_WIDTH / 2 - 110, PANEL_HEIGHT - 110, 220, 64, playing ? ctxApi.t("video_pause") : ctxApi.t("video_play"), true);
      zones.push({ id: "toggle", x: (PANEL_WIDTH / 2 - 110) / PANEL_WIDTH, y: (PANEL_HEIGHT - 110) / PANEL_HEIGHT, w: 220 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: ctxApi.t("video_play") });
      if (video != null && video.duration > 0) {
        const pct = video.currentTime / video.duration;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(body.x, PANEL_HEIGHT - 132, body.w, 8);
        ctx.fillStyle = ACCENT;
        ctx.fillRect(body.x, PANEL_HEIGHT - 132, body.w * pct, 8);
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
      ctx.fillStyle = FG;
      ctx.font = "500 34px system-ui, sans-serif";
      ctx.textAlign = "left";
      const qLines = wrapText(ctx, stripMarkdown(ctxApi.text(hotspot.question)), body.w);
      let y = 176;
      for (const line of qLines.slice(0, 3)) {
        ctx.fillText(line, body.x, y);
        y += 46;
      }
      const options = hotspot.options ?? [];
      y += 12;
      for (const opt of options.slice(0, 5)) {
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
        drawButton(ctx, PANEL_WIDTH / 2 - 130, PANEL_HEIGHT - 104, 260, 64, ctxApi.t("quiz_check"), true);
        zones.push({ id: "check", x: (PANEL_WIDTH / 2 - 130) / PANEL_WIDTH, y: (PANEL_HEIGHT - 104) / PANEL_HEIGHT, w: 260 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: ctxApi.t("quiz_check") });
      } else {
        ctx.fillStyle = state.correct ? OK : BAD;
        ctx.font = "600 34px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(state.correct ? ctxApi.t("quiz_correct") : ctxApi.t("quiz_incorrect"), PANEL_WIDTH / 2, PANEL_HEIGHT - 72);
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
    default: {
      // Tipos que requieren un motor externo: ficha con la información
      // disponible y continuidad fuera del modo inmersivo.
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
      const lines = wrapText(ctx, ctxApi.t("vr_open_outside"), body.w);
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
      drawButton(ctx, PANEL_WIDTH / 2 - 190, PANEL_HEIGHT - 116, 380, 68, ctxApi.t("vr_queue_open"), true);
      zones.push({ id: "external", x: (PANEL_WIDTH / 2 - 190) / PANEL_WIDTH, y: (PANEL_HEIGHT - 116) / PANEL_HEIGHT, w: 380 / PANEL_WIDTH, h: 68 / PANEL_HEIGHT, label: ctxApi.t("vr_queue_open") });
      break;
    }
  }
  return zones;
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
    default:
      return [];
  }
}

// --- primitivas de dibujo ---

function addPrevNext(ctx: CanvasRenderingContext2D, zones: PanelZone[], api: PanelContext): void {
  drawButton(ctx, 44, PANEL_HEIGHT - 110, 150, 64, "‹", true);
  drawButton(ctx, PANEL_WIDTH - 194, PANEL_HEIGHT - 110, 150, 64, "›", true);
  zones.push({ id: "prev", x: 44 / PANEL_WIDTH, y: (PANEL_HEIGHT - 110) / PANEL_HEIGHT, w: 150 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: api.t("gallery_prev") });
  zones.push({ id: "next", x: (PANEL_WIDTH - 194) / PANEL_WIDTH, y: (PANEL_HEIGHT - 110) / PANEL_HEIGHT, w: 150 / PANEL_WIDTH, h: 64 / PANEL_HEIGHT, label: api.t("gallery_next") });
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
