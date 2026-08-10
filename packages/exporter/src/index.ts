import type { MultiresSource, Tour } from "@ull360/schema";
import { resolveL10n } from "@ull360/schema";
import { ZipWriter } from "./zip.js";
import {
  renderAccessibleHtml,
  renderHtaccess,
  renderIndexHtml,
  renderReadme,
  renderServiceWorker,
  renderWebManifest,
} from "./templates.js";
import { renderImsManifest, renderScormAdapter, type ScormVersion } from "./scorm.js";

export { ZipWriter, buildZip, crc32 } from "./zip.js";
export * from "./templates.js";
export { renderImsManifest, renderScormAdapter, type ScormVersion } from "./scorm.js";

/**
 * Exportador de paquetes estaticos autocontenidos: carpeta con index.html +
 * visor + tour.json + tiles + medios, sin ninguna dependencia externa ni
 * llamada de red a terceros. Variantes: HTML unico, SCORM, kiosko, PWA
 * offline. Corre en navegador (Studio) y en Node (contenedor/automatizacion).
 */

export interface ExportOptions {
  /** Idiomas a incluir (por defecto todos). */
  langs?: string[];
  /** Numero maximo de niveles de tiles a incluir (limita resolucion). */
  maxLevels?: number | null;
  /** Incluir botones/ficheros de descarga (PDF, imagenes). */
  includeDownloads?: boolean;
  /** Endpoint de analitica propio (null = sin analitica). */
  analyticsEndpoint?: string | null;
  /** Service worker offline (PWA instalable para kioscos/museos). */
  serviceWorker?: boolean;
  /** Todo inline en un único index.html (tours pequeños). */
  singleFile?: boolean;
  /** Export SCORM con reporte de finalizacion/puntuacion. */
  scorm?: ScormVersion | null;
  /** Modo kiosko: autopilot + reinicio por inactividad. */
  kiosk?: boolean;
}

export interface AssetFile {
  /** Ruta relativa dentro del paquete (p. ej. "tiles/m1/0/f/0/0.webp"). */
  path: string;
  data: Uint8Array;
}

export interface AssetProvider {
  /** Enumera las rutas de assets del tour (tiles y medios). */
  list(): Promise<string[]>;
  read(path: string): Promise<Uint8Array>;
}

export interface ExportProgress {
  phase: "assets" | "viewer" | "finalize";
  done: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Transformaciones del tour.json
// ---------------------------------------------------------------------------

/** Filtra las cadenas localizables a los idiomas seleccionados. */
export function filterTourLangs(tour: Tour, langs: string[]): Tour {
  const allLangs = new Set(tour.meta.langs);
  const keep = langs.filter((l) => allLangs.has(l));
  if (keep.length === 0) return tour;
  const defaultLang = keep.includes(tour.meta.defaultLang) ? tour.meta.defaultLang : keep[0]!;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value != null && typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>);
      const isL10n =
        keys.length > 0 &&
        keys.every((k) => allLangs.has(k)) &&
        Object.values(value as Record<string, unknown>).every((v) => typeof v === "string");
      if (isL10n) {
        const map = value as Record<string, string>;
        const out: Record<string, string> = {};
        for (const l of keep) {
          if (map[l] != null) out[l] = map[l];
        }
        if (out[defaultLang] == null) {
          out[defaultLang] = resolveL10n(map, defaultLang, tour.meta.defaultLang);
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  const result = walk(structuredClone(tour)) as Tour;
  result.meta.langs = keep;
  result.meta.defaultLang = defaultLang;
  return result;
}

/** Limita los niveles de la piramide multirresolucion (y el faceSize). */
export function limitTourResolution(tour: Tour, maxLevels: number): { tour: Tour; skippedLevelFor: Map<string, number> } {
  const skipped = new Map<string, number>();
  const clone = structuredClone(tour);
  for (const scene of clone.scenes) {
    if (scene.source.kind === "multires") {
      const src = scene.source as MultiresSource;
      if (src.levels > maxLevels) {
        const drop = src.levels - maxLevels;
        skipped.set(src.base, maxLevels);
        src.faceSize = Math.ceil(src.faceSize / Math.pow(2, drop));
        src.levels = maxLevels;
      }
    }
  }
  return { tour: clone, skippedLevelFor: skipped };
}

/** Elimina descargas (flags download) si el export las excluye. */
export function stripDownloads(tour: Tour): Tour {
  const clone = structuredClone(tour);
  for (const scene of clone.scenes) {
    for (const hs of scene.hotspots) {
      if ((hs.type === "image" || hs.type === "pdf") && (hs as { download?: boolean }).download === true) {
        (hs as { download?: boolean }).download = false;
      }
    }
  }
  return clone;
}

function shouldSkipTile(path: string, skippedLevelFor: Map<string, number>): boolean {
  for (const [base, maxLevels] of skippedLevelFor) {
    const cleanBase = base.replace(/\/$/, "");
    if (path.startsWith(cleanBase + "/")) {
      const rest = path.slice(cleanBase.length + 1);
      const level = parseInt(rest.split("/")[0] ?? "", 10);
      if (Number.isFinite(level) && level >= maxLevels) return true;
    }
  }
  return false;
}

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    glb: "model/gltf-binary",
    vtt: "text/vtt",
  };
  return map[ext] ?? "application/octet-stream";
}

function toBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    bin += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Export principal
// ---------------------------------------------------------------------------

/** Metadatos de compartición del paquete exportado, resueltos al idioma. */
function socialFor(tour: Tour, lang: string): Record<string, unknown> | undefined {
  const social = tour.social;
  if (social == null) return undefined;
  const text = (value: unknown): string | undefined => {
    if (value == null) return undefined;
    const resolved = resolveL10n(value as never, lang, tour.meta.defaultLang);
    return resolved !== "" ? resolved : undefined;
  };
  return {
    title: text(social.title),
    description: text(social.description),
    image: social.image,
    imageAlt: text(social.imageAlt),
    type: social.type,
    siteName: social.siteName,
    twitterCard: social.twitterCard,
    twitterSite: social.twitterSite,
    twitterCreator: social.twitterCreator,
    locale: social.locale,
    noindex: social.noindex,
  };
}

export async function runExport(
  tourInput: Tour,
  viewerFiles: AssetFile[],
  assets: AssetProvider,
  options: ExportOptions,
  writer: ZipWriter,
  onProgress?: (p: ExportProgress) => void,
): Promise<{ files: number; bytes: number }> {
  let tour = structuredClone(tourInput);
  if (options.langs != null && options.langs.length > 0) tour = filterTourLangs(tour, options.langs);
  if (options.includeDownloads === false) tour = stripDownloads(tour);
  let skippedLevelFor = new Map<string, number>();
  if (options.maxLevels != null) {
    const limited = limitTourResolution(tour, options.maxLevels);
    tour = limited.tour;
    skippedLevelFor = limited.skippedLevelFor;
  }
  tour.analytics = {
    enabled: options.analyticsEndpoint != null,
    endpoint: options.analyticsEndpoint ?? undefined,
  };

  const lang = tour.meta.defaultLang;
  const title = resolveL10n(tour.meta.title, lang, lang);
  const description = resolveL10n(tour.meta.description, lang, lang) || undefined;
  const enc = new TextEncoder();
  const packageFiles: string[] = [];

  const add = async (path: string, data: Uint8Array): Promise<void> => {
    await writer.addFile(path, data);
    packageFiles.push(path);
  };

  if (options.singleFile === true) {
    // HTML unico: assets como data URIs, visor inline.
    const assetPaths = await assets.list();
    const dataUris = new Map<string, string>();
    let done = 0;
    for (const path of assetPaths) {
      if (shouldSkipTile(path, skippedLevelFor)) continue;
      // En single-file los tiles multires no se pueden mapear (URLs calculadas);
      // las escenas multires ya deben venir convertidas a equirect por el llamador.
      if (/\/\d+\/[fblrud]\/\d+\/\d+\.(webp|jpg|avif)$/.test(path)) continue;
      const data = await assets.read(path);
      dataUris.set(path, `data:${guessMime(path)};base64,${toBase64(data)}`);
      onProgress?.({ phase: "assets", done: ++done, total: assetPaths.length });
    }
    const tourJson = JSON.stringify(tour);
    const rewritten = tourJson.replace(/"((?:media|tiles|assets)\/[^"]+)"/g, (match, path: string) => {
      const uri = dataUris.get(path);
      return uri != null ? JSON.stringify(uri) : match;
    });
    // El HTML único necesita el bundle sin trocear: con file:// el navegador
    // bloquea los import() dinámicos, así que viewer.js (con chunks perezosos)
    // no sirve aquí.
    const viewerJs =
      viewerFiles.find((f) => f.path === "viewer.standalone.js") ?? viewerFiles.find((f) => f.path === "viewer.js");
    if (viewerJs == null) throw new Error("Falta viewer.standalone.js para el modo single-file");
    const html = renderIndexHtml({
      title,
      description,
      lang,
      social: socialFor(tour, lang),
      inlineConfig: `{"tour": ${rewritten}, "analyticsEndpoint": ${JSON.stringify(options.analyticsEndpoint ?? null)}, "kiosk": ${options.kiosk === true}}`,
      inlineViewerJs: new TextDecoder().decode(viewerJs.data),
      kiosk: options.kiosk,
    });
    await add("index.html", enc.encode(html));
    await add("LEEME.md", enc.encode(renderReadme(title)));
  } else {
    // Paquete estandar
    let done = 0;
    // viewer.standalone.js solo lo usa el HTML único: en el paquete estándar
    // serían 2,6 MB duplicados.
    const splitFiles = viewerFiles.filter((f) => f.path !== "viewer.standalone.js");
    for (const vf of splitFiles) {
      await add(`viewer/${vf.path}`, vf.data);
      onProgress?.({ phase: "viewer", done: ++done, total: splitFiles.length });
    }
    await add("tour.json", enc.encode(JSON.stringify(tour)));
    const assetPaths = await assets.list();
    done = 0;
    for (const path of assetPaths) {
      if (shouldSkipTile(path, skippedLevelFor)) {
        onProgress?.({ phase: "assets", done: ++done, total: assetPaths.length });
        continue;
      }
      if (options.includeDownloads === false && path.endsWith(".pdf")) {
        // los PDF se mantienen (visor integrado); solo se retiran los botones
      }
      const data = await assets.read(path);
      await add(path, data);
      onProgress?.({ phase: "assets", done: ++done, total: assetPaths.length });
    }
    const accessibleHtml = renderAccessibleHtml(tour, lang);
    const html = renderIndexHtml({
      title,
      description,
      lang,
      social: socialFor(tour, lang),
      viewerPath: "viewer/viewer.js",
      tourJsonPath: "tour.json",
      analyticsEndpoint: options.analyticsEndpoint,
      kiosk: options.kiosk,
      serviceWorker: options.serviceWorker,
      accessibleHtml,
      scorm: options.scorm != null,
    });
    await add("index.html", enc.encode(html));
    // Paquete listo para un alojamiento estático básico: tipos MIME de
    // Apache e instrucciones de publicación (incluido el HTTPS que exige VR).
    await add(".htaccess", enc.encode(renderHtaccess()));
    await add("LEEME.md", enc.encode(renderReadme(title)));
  }

  onProgress?.({ phase: "finalize", done: 0, total: 1 });

  if (options.serviceWorker === true && options.singleFile !== true) {
    await add("manifest.webmanifest", enc.encode(renderWebManifest(tour, lang)));
    const version = String(Math.abs(hashCode(JSON.stringify(tour))));
    await add("sw.js", enc.encode(renderServiceWorker(["./index.html", ...packageFiles.filter((f) => f !== "sw.js").map((f) => `./${f}`)], version)));
  }

  if (options.scorm != null) {
    await add("scorm-adapter.js", enc.encode(renderScormAdapter(options.scorm, tour.quiz?.passingScore ?? null)));
    await add(
      "imsmanifest.xml",
      enc.encode(
        renderImsManifest({
          version: options.scorm,
          identifier: `ull360-${slugify(title)}`,
          title,
          files: [...packageFiles],
        }),
      ),
    );
  }

  await writer.close();
  onProgress?.({ phase: "finalize", done: 1, total: 1 });
  return { files: writer.fileCount, bytes: writer.bytesWritten };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "tour";
}
