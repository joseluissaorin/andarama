import Marzipano from "marzipano";
import type { CubemapSource, EquirectSource, FlatSource, MultiresSource, Scene, ViewLimits } from "@ull360/schema";

/**
 * Construccion de geometry/source/view de Marzipano a partir de la fuente
 * declarada en tour.json. El troceado usa el layout {base}/{z}/{f}/{y}/{x}.{ext}
 * generado por @ull360/tiler.
 */

export interface BuiltScene {
  geometry: any;
  source: any;
  view: any;
  /** Elemento de video si la escena es de video. */
  video?: HTMLVideoElement;
  /** Asset dinamico (markDirty por frame para video). */
  dynamicAsset?: any;
}

const FALLBACK_RESOLUTION = 4096;

export function resolveUrl(baseUrl: string, url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (baseUrl === "") return url;
  return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

function detectTileExtension(src: MultiresSource): string {
  if (src.extension != null) return src.extension;
  // Negociacion en cliente: WebP tiene soporte universal en los navegadores
  // objetivo (2 ultimas versiones); AVIF se usa solo si se declara.
  return "webp";
}

export function buildLimiter(scene: Scene, faceSize: number): any {
  const limits: ViewLimits = scene.limits ?? {};
  const fns: any[] = [
    Marzipano.RectilinearView.limit.resolution(faceSize > 0 ? faceSize : FALLBACK_RESOLUTION),
    Marzipano.RectilinearView.limit.vfov(limits.fovMin ?? 0.35, limits.fovMax ?? 2.4),
  ];
  if (limits.pitchMin != null || limits.pitchMax != null) {
    fns.push(Marzipano.RectilinearView.limit.pitch(limits.pitchMin ?? -Math.PI / 2, limits.pitchMax ?? Math.PI / 2));
  } else {
    fns.push(Marzipano.RectilinearView.limit.pitch(-Math.PI / 2, Math.PI / 2));
  }
  if (limits.yawMin != null || limits.yawMax != null) {
    fns.push(Marzipano.RectilinearView.limit.yaw(limits.yawMin ?? -Math.PI, limits.yawMax ?? Math.PI));
  }
  return Marzipano.util.compose(...fns);
}

/** Panorama parcial: compone la imagen sobre un lienzo equirect 2:1 completo. */
async function loadPartialEquirect(url: string, partial: NonNullable<EquirectSource["partial"]>): Promise<HTMLCanvasElement> {
  const img = await loadImage(url);
  const fullWidth = Math.round(img.width * ((2 * Math.PI) / partial.hfov));
  const fullHeight = Math.round(fullWidth / 2);
  const canvas = document.createElement("canvas");
  // Limitar al tamano de textura tipico para no agotar memoria.
  const scale = Math.min(1, 8192 / fullWidth);
  canvas.width = Math.round(fullWidth * scale);
  canvas.height = Math.round(fullHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const cx = canvas.width / 2 + ((partial.yawOffset ?? 0) / (2 * Math.PI)) * canvas.width;
  const cy = canvas.height / 2 - ((partial.pitchOffset ?? 0) / Math.PI) * canvas.height;
  ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  return canvas;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${url}`));
    img.src = url;
  });
}

/** Recorta el layout estereo TB/SBS al ojo izquierdo para vista monoscopica. */
function cropStereo(image: HTMLImageElement, stereo: "tb" | "sbs"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const w = stereo === "sbs" ? image.width / 2 : image.width;
  const h = stereo === "tb" ? image.height / 2 : image.height;
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(image, 0, 0, w, h, 0, 0, w, h);
  return canvas;
}

export async function buildScene(scene: Scene, baseUrl: string, initialViewParams: any): Promise<BuiltScene> {
  const src = scene.source;
  switch (src.kind) {
    case "multires": {
      const geometryLevels: { tileSize: number; size: number; fallbackOnly?: boolean }[] = [];
      // Nivel de fallback (preview) + piramide real.
      let size = src.faceSize;
      const sizes: number[] = [];
      for (let i = 0; i < src.levels; i++) {
        sizes.unshift(size);
        size = Math.ceil(size / 2);
      }
      for (const s of sizes) geometryLevels.push({ tileSize: src.tileSize, size: s });
      const geometry = new Marzipano.CubeGeometry(geometryLevels);
      const ext = detectTileExtension(src);
      const base = resolveUrl(baseUrl, src.base).replace(/\/$/, "");
      const source = Marzipano.ImageUrlSource.fromString(`${base}/{z}/{f}/{y}/{x}.${ext}`, {
        cubeMapPreviewUrl: src.preview != null ? resolveUrl(baseUrl, src.preview) : undefined,
      });
      const view = new Marzipano.RectilinearView(initialViewParams, buildLimiter(scene, src.faceSize));
      return { geometry, source, view };
    }

    case "equirect": {
      const url = resolveUrl(baseUrl, src.url);
      let asset: any;
      let width: number;
      if (src.partial != null) {
        const canvas = await loadPartialEquirect(url, src.partial);
        asset = new Marzipano.StaticAsset(canvas);
        width = canvas.width;
      } else if (src.stereo === "tb" || src.stereo === "sbs") {
        const img = await loadImage(url);
        const canvas = cropStereo(img, src.stereo);
        asset = new Marzipano.StaticAsset(canvas);
        width = canvas.width;
      } else {
        const img = await loadImage(url);
        asset = new Marzipano.StaticAsset(img);
        width = img.width;
      }
      const geometry = new Marzipano.EquirectGeometry([{ width }]);
      const source = new Marzipano.SingleAssetSource(asset);
      const view = new Marzipano.RectilinearView(initialViewParams, buildLimiter(scene, width / 4));
      return { geometry, source, view };
    }

    case "cubemap": {
      const faces = src.faces ?? {};
      const order: ("f" | "b" | "l" | "r" | "u" | "d")[] = ["f", "b", "l", "r", "u", "d"];
      let faceUrls: Record<string, string> = {};
      let faceSize = 1024;
      if (src.strip != null) {
        const img = await loadImage(resolveUrl(baseUrl, src.strip.url));
        const seq = (src.strip.order ?? "frblud").split("") as ("f" | "b" | "l" | "r" | "u" | "d")[];
        const n = seq.length;
        faceSize = src.strip.layout === "horizontal" ? img.width / n : img.height / n;
        const dataUrls: Record<string, string> = {};
        seq.forEach((face, i) => {
          const canvas = document.createElement("canvas");
          canvas.width = faceSize;
          canvas.height = faceSize;
          const sx = src.strip!.layout === "horizontal" ? i * faceSize : 0;
          const sy = src.strip!.layout === "horizontal" ? 0 : i * faceSize;
          canvas.getContext("2d")!.drawImage(img, sx, sy, faceSize, faceSize, 0, 0, faceSize, faceSize);
          dataUrls[face] = canvas.toDataURL("image/png");
        });
        faceUrls = dataUrls;
      } else {
        for (const f of order) {
          const u = faces[f];
          if (u != null) faceUrls[f] = resolveUrl(baseUrl, u);
        }
        // Determinar tamano de cara con la primera imagen.
        const first = Object.values(faceUrls)[0];
        if (first != null) {
          const img = await loadImage(first);
          faceSize = img.width;
        }
      }
      const geometry = new Marzipano.CubeGeometry([{ tileSize: faceSize, size: faceSize }]);
      const source = new Marzipano.ImageUrlSource((tile: any) => ({ url: faceUrls[tile.face] ?? "" }));
      const view = new Marzipano.RectilinearView(initialViewParams, buildLimiter(scene, faceSize));
      return { geometry, source, view };
    }

    case "flat": {
      let geometry: any;
      let source: any;
      let width = src.width;
      let height = src.height;
      if (src.tiles != null) {
        const levels: { tileSize: number; size: number }[] = [];
        let w = src.width;
        const sizes: number[] = [];
        for (let i = 0; i < src.tiles.levels; i++) {
          sizes.unshift(w);
          w = Math.ceil(w / 2);
        }
        for (const s of sizes) {
          levels.push({ tileSize: src.tiles.tileSize, size: s });
        }
        geometry = new Marzipano.FlatGeometry(
          levels.map((l) => ({
            tileWidth: l.tileSize,
            tileHeight: l.tileSize,
            width: l.size,
            height: Math.round((l.size * src.height) / src.width),
          })),
        );
        const base = resolveUrl(baseUrl, src.tiles.base).replace(/\/$/, "");
        const ext = src.tiles.extension ?? "webp";
        source = Marzipano.ImageUrlSource.fromString(`${base}/{z}/{y}/{x}.${ext}`);
      } else if (src.url != null) {
        const img = await loadImage(resolveUrl(baseUrl, src.url));
        width = img.width;
        height = img.height;
        geometry = new Marzipano.FlatGeometry([{ tileWidth: width, tileHeight: height, width, height }]);
        source = new Marzipano.SingleAssetSource(new Marzipano.StaticAsset(img));
      } else {
        throw new Error(`Escena plana "${scene.id}" sin tiles ni url`);
      }
      const mediaAspectRatio = width / height;
      const limiter = Marzipano.util.compose(
        Marzipano.FlatView.limit.resolution(width),
        Marzipano.FlatView.limit.letterbox(),
      );
      const view = new Marzipano.FlatView({ mediaAspectRatio, zoom: 1 }, limiter);
      return { geometry, source, view };
    }

    case "video": {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.preload = "metadata";
      if (src.poster != null) video.poster = resolveUrl(baseUrl, src.poster);
      video.muted = src.muted ?? true;
      video.loop = src.loop ?? src.onEnd?.action === "loop";
      for (const track of src.subtitles ?? []) {
        const el = document.createElement("track");
        el.kind = "subtitles";
        el.srclang = track.lang;
        el.src = resolveUrl(baseUrl, track.url);
        video.appendChild(el);
      }
      const asset = new Marzipano.DynamicAsset(video);
      const geometry = new Marzipano.EquirectGeometry([{ width: 1 }]);
      const source = new Marzipano.SingleAssetSource(asset);
      const view = new Marzipano.RectilinearView(initialViewParams, buildLimiter(scene, 2048));
      return { geometry, source, view, video, dynamicAsset: asset };
    }

    default:
      throw new Error(`Tipo de fuente desconocido: ${(src as { kind?: string }).kind}`);
  }
}
