import type { MultiresSource, Tour } from "@andarama/schema";
import { resolveL10n } from "@andarama/schema";
import { ZipWriter } from "./zip.js";
import {
  embedDocuments,
  renderAccessibleHtml,
  renderHtaccess,
  renderIndexHtml,
  renderReadme,
  renderServiceWorker,
  renderWebManifest,
} from "./templates.js";
import { renderImsManifest, renderScormAdapter, type ScormVersion } from "./scorm.js";

export { ZipWriter, buildZip, crc32, deflateRaw, isCompressible, type ZipWriterOptions } from "./zip.js";
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
  /**
   * Lecturas de assets en paralelo (por defecto 10). Antes se pedían de una en
   * una y una escena teselada tiene miles de teselas: el ZIP tardaba minutos.
   */
  concurrency?: number;
  /** Reintentos de cada lectura fallida (por defecto 4, con espera creciente). */
  retry?: RetryOptions;
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
  /** "retry": segunda vuelta para los ficheros que fallaron en la primera. */
  phase: "assets" | "retry" | "viewer" | "finalize";
  done: number;
  total: number;
  /** Bytes de assets descargados hasta ahora. */
  bytes?: number;
  /** Ficheros apartados por error, pendientes de la segunda vuelta. */
  skipped?: number;
}

/** Resultado del export; `missing` son los ficheros que no se pudieron leer. */
export interface ExportResult {
  files: number;
  bytes: number;
  missing: string[];
}

/** Lectura fallida de un asset, con el estado HTTP si lo hubo (null: red). */
export class AssetReadError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "AssetReadError";
    this.status = status;
  }
}

export interface RetryOptions {
  /** Reintentos tras el primer intento (por defecto 4). */
  retries?: number;
  /** Espera base en ms; se dobla en cada reintento (por defecto 500). */
  baseDelayMs?: number;
  /** Tope de la espera en ms (por defecto 8000). */
  maxDelayMs?: number;
  /** Para las pruebas: espera y azar sustituibles. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/**
 * ¿Merece la pena reintentar? Sí con errores del servidor (5xx), límites de
 * ritmo (429), tiempos agotados (408) y fallos de red; no con un 404 o un 403,
 * que van a responder lo mismo.
 */
export function isRetryableReadError(err: unknown): boolean {
  if (err instanceof AssetReadError) {
    return err.status == null || err.status >= 500 || err.status === 429 || err.status === 408;
  }
  return true;
}

/**
 * Repite `fn` con espera exponencial y azar (la mitad fija, la otra mitad
 * aleatoria) para que las lecturas en paralelo no reintenten a la vez.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 8000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = opts.random ?? Math.random;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryableReadError(err)) throw err;
      const ceiling = Math.min(max, base * 2 ** attempt);
      await sleep(ceiling / 2 + random() * (ceiling / 2));
    }
  }
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

/**
 * Lee varios elementos a la vez y los entrega en su orden. La red era el
 * cuello de botella del export; el orden se conserva para que el paquete
 * salga siempre igual. La memoria queda acotada a `concurrency` lecturas.
 */
export async function readAhead<T, R = Uint8Array>(
  items: T[],
  concurrency: number,
  read: (item: T) => Promise<R>,
  consume: (item: T, data: R) => Promise<void>,
): Promise<void> {
  const inflight = new Map<number, Promise<R>>();
  let launched = 0;
  const width = Math.max(1, Math.floor(concurrency));
  for (let consumed = 0; consumed < items.length; consumed++) {
    while (launched < items.length && launched - consumed < width) {
      const i = launched++;
      const p = read(items[i]!);
      // Se marca como atendida: si falla, el error sale al esperarla en orden
      p.catch(() => {});
      inflight.set(i, p);
    }
    const data = await inflight.get(consumed)!;
    inflight.delete(consumed);
    await consume(items[consumed]!, data);
  }
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
    gltf: "model/gltf+json",
    stl: "model/stl",
    obj: "model/obj",
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
): Promise<ExportResult> {
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
  const concurrency = options.concurrency ?? 10;
  // Un fichero que falla no tumba el paquete: se reintenta, se aparta, se le
  // da una segunda vuelta al final y, si sigue sin leerse, se anota en LEEME.md
  const missing = new Map<string, string>();
  let assetBytes = 0;
  const readAssets = async (paths: string[], consume: (path: string, data: Uint8Array) => Promise<void>): Promise<void> => {
    const attempt = (path: string): Promise<Uint8Array | AssetReadError> =>
      withRetry(() => assets.read(path), options.retry).catch((err: unknown) =>
        err instanceof AssetReadError ? err : new AssetReadError(String(err instanceof Error ? err.message : err), null),
      );
    const skipped: string[] = [];
    let done = 0;
    await readAhead(paths, concurrency, attempt, async (path, data) => {
      if (data instanceof AssetReadError) skipped.push(path);
      else {
        assetBytes += data.byteLength;
        await consume(path, data);
      }
      onProgress?.({ phase: "assets", done: ++done, total: paths.length, bytes: assetBytes, skipped: skipped.length });
    });
    if (skipped.length === 0) return;
    done = 0;
    // Segunda vuelta más despacio: lo que falló suele ser un pico del servidor
    await readAhead(skipped, Math.min(2, concurrency), attempt, async (path, data) => {
      if (data instanceof AssetReadError) missing.set(path, data.status != null ? `error ${data.status}` : "error de red");
      else {
        assetBytes += data.byteLength;
        await consume(path, data);
      }
      onProgress?.({ phase: "retry", done: ++done, total: skipped.length, bytes: assetBytes, skipped: missing.size });
    });
  };
  const readme = (): Uint8Array => enc.encode(renderReadme(title) + renderMissingFiles(missing));
  const scormJs = options.scorm != null ? renderScormAdapter(options.scorm, tour.quiz?.passingScore ?? null) : null;

  if (options.singleFile === true) {
    // HTML unico: assets como data URIs, visor inline.
    // En single-file los tiles multires no se pueden mapear (URLs calculadas);
    // las escenas multires ya deben venir convertidas a equirect por el llamador.
    const assetPaths = (await assets.list()).filter(
      (path) => !shouldSkipTile(path, skippedLevelFor) && !/\/\d+\/[fblrud]\/\d+\/\d+\.(webp|jpg|avif)$/.test(path),
    );
    const dataUris = new Map<string, string>();
    await readAssets(assetPaths, async (path, data) => {
      dataUris.set(path, `data:${guessMime(path)};base64,${toBase64(data)}`);
    });
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
      // El adaptador SCORM va dentro del propio HTML: antes se empaquetaba
      // aparte, nadie lo cargaba y el aula virtual no recibía nada.
      inlineScormJs: scormJs ?? undefined,
    });
    await add("index.html", enc.encode(html));
    await add("LEEME.md", readme());
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
    // Los códigos de inserción con más que un iframe viajan como documentos
    // aparte, que el visor abre en un marco aislado
    for (const doc of embedDocuments(tour, lang)) await add(doc.path, enc.encode(doc.html));
    // Los PDF y las imágenes se mantienen aunque no haya descargas: el
    // visitante los ve dentro del recorrido; solo se retira el botón.
    const assetPaths = (await assets.list()).filter((path) => !shouldSkipTile(path, skippedLevelFor));
    await readAssets(assetPaths, (path, data) => add(path, data));
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
    await add("LEEME.md", readme());
  }

  onProgress?.({ phase: "finalize", done: 0, total: 1 });

  if (options.serviceWorker === true && options.singleFile !== true) {
    await add("manifest.webmanifest", enc.encode(renderWebManifest(tour, lang)));
    const version = String(Math.abs(hashCode(JSON.stringify(tour))));
    await add("sw.js", enc.encode(renderServiceWorker(["./index.html", ...packageFiles.filter((f) => f !== "sw.js").map((f) => `./${f}`)], version)));
  }

  if (options.scorm != null && scormJs != null) {
    // En el HTML único el adaptador ya va dentro de index.html
    if (options.singleFile !== true) await add("scorm-adapter.js", enc.encode(scormJs));
    await add(
      "imsmanifest.xml",
      enc.encode(
        renderImsManifest({
          version: options.scorm,
          identifier: `anda-${slugify(title)}`,
          title,
          files: [...packageFiles],
        }),
      ),
    );
  }

  await writer.close();
  onProgress?.({ phase: "finalize", done: 1, total: 1 });
  return { files: writer.fileCount, bytes: writer.bytesWritten, missing: [...missing.keys()].sort() };
}

/** Apartado de LEEME.md con los ficheros que no entraron en el paquete. */
export function renderMissingFiles(missing: Map<string, string>): string {
  if (missing.size === 0) return "";
  const list = [...missing.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, reason]) => `- \`${path}\` (${reason})`)
    .join("\n");
  return `
## Ficheros que faltan

Al generar este paquete no se pudieron descargar ${missing.size === 1 ? "un fichero" : `${missing.size} ficheros`}, ni
siquiera tras varios reintentos. El recorrido funciona, pero donde se usan se
verá un hueco: una tesela en negro, o una imagen o un audio que no cargan.
Vuelve a exportar el tour para completarlo. Si el fallo se repite con los
mismos ficheros, es probable que falten en el almacenamiento y haya que volver
a subir el medio correspondiente desde el Studio.

${list}
`;
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
