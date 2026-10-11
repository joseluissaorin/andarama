import type { XrRenderer } from "./render.js";
import { dirFromYawPitch, vecNormalize, type Vec3 } from "./math.js";

/**
 * Panorámica troceada en cubo dentro del modo inmersivo.
 *
 * Antes, al entrar en una escena multirresolución, el modo VR descargaba las
 * teselas de un nivel, las pintaba en seis lienzos y reproyectaba el cubo a
 * equirectangular píxel a píxel en el hilo principal (8 millones de píxeles
 * en JavaScript). En un visor autónomo eso eran uno o dos segundos de negro
 * con el seguimiento de la cabeza congelado, y el resultado salía reducido a
 * 4096 × 2048 (11 px por grado) aunque hubiera teselas mejores.
 *
 * Ahora se pinta el propio cubo: seis caras, cada una con su textura, y las
 * teselas se suben directamente a su sitio (`texSubImage2D`) según llegan,
 * decodificadas fuera del hilo principal con `createImageBitmap`. Va en dos
 * etapas: el nivel 0 (una tesela por cara) se ve casi al instante y el nivel
 * bueno se refina encima tesela a tesela, empezando por lo que hay delante.
 * Las zonas aún sin tesela son transparentes y dejan ver la etapa anterior.
 *
 * Mientras se mira una escena se descargan (sin decodificar) las teselas de
 * las escenas vecinas, para que el salto encuentre todo en memoria.
 */

export const CUBE_FACES = ["f", "b", "l", "r", "u", "d"] as const;
export type CubeFace = (typeof CUBE_FACES)[number];

/** Panorámica multirresolución tal como la declara el tour (layout del tiler). */
export interface VrCubeSource {
  /** URL base ya resuelta: las teselas son `{base}/{nivel}/{cara}/{y}/{x}.{ext}`. */
  base: string;
  faceSize: number;
  levels: number;
  tileSize: number;
  extension: string;
}

/**
 * Bases de cada cara en el marco del troceador (packages/tiler, FACE_BASES):
 * +z es la cara f, +x la r y +y la u; `x` e `y` recorren la imagen hacia la
 * derecha y hacia arriba.
 */
const FACE_BASES: Record<CubeFace, { x: Vec3; y: Vec3; z: Vec3 }> = {
  f: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
  b: { x: [-1, 0, 0], y: [0, 1, 0], z: [0, 0, -1] },
  r: { x: [0, 0, -1], y: [0, 1, 0], z: [1, 0, 0] },
  l: { x: [0, 0, 1], y: [0, 1, 0], z: [-1, 0, 0] },
  u: { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] },
  d: { x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] },
};

/**
 * Del marco del troceador al de la esfera VR. En la esfera el centro de la
 * equirectangular (u = 0,5) cae en −Z y u = 0,75 en +X; en el troceador ese
 * mismo centro es +z y u = 0,75 es +x. Basta con invertir Z.
 */
export function tilerToVr(v: Vec3): Vec3 {
  return [v[0], v[1], -v[2]];
}

/** Semilado del cubo en metros (dentro del plano lejano de la sesión). */
export const CUBE_HALF = 20;

/**
 * Matriz de modelo que coloca el cuadrilátero unidad (plano XY, +Y arriba,
 * v = 0 en la fila superior de la textura) sobre la cara `face` del cubo.
 * Se agranda una pizca para que no asome una rendija entre caras.
 */
export function faceModelMatrix(face: CubeFace, half = CUBE_HALF): Float32Array {
  const b = FACE_BASES[face];
  const x = tilerToVr(b.x);
  const y = tilerToVr(b.y);
  const z = tilerToVr(b.z);
  const s = 2 * half * 1.002;
  return new Float32Array([
    x[0] * s, x[1] * s, x[2] * s, 0,
    y[0] * s, y[1] * s, y[2] * s, 0,
    z[0], z[1], z[2], 0,
    z[0] * half, z[1] * half, z[2] * half, 1,
  ]);
}

/** Dirección (marco VR, sin desfase) del punto (u, v) ∈ [0,1] de una cara; v crece hacia abajo. */
export function faceDirectionVr(face: CubeFace, u: number, v: number): Vec3 {
  const b = FACE_BASES[face];
  const a = 2 * u - 1;
  const c = 1 - 2 * v;
  return vecNormalize(tilerToVr([b.z[0] + a * b.x[0] + c * b.y[0], b.z[1] + a * b.x[1] + c * b.y[1], b.z[2] + a * b.x[2] + c * b.y[2]]));
}

/** Lados de cara de cada nivel, del más pequeño (0) al más grande. */
export function cubeLevelSizes(faceSize: number, levels: number): number[] {
  const sizes: number[] = [];
  let s = faceSize;
  for (let i = 0; i < Math.max(1, levels); i++) {
    sizes.unshift(s);
    s = Math.ceil(s / 2);
  }
  return sizes;
}

/** Nivel más grande que no pasa de `target` (o el 0 si todos lo pasan). */
export function chooseCubeLevel(sizes: number[], target: number): number {
  let level = 0;
  for (let i = 0; i < sizes.length; i++) if (sizes[i]! <= target) level = i;
  return level;
}

/**
 * Lado de cara que se pide para el visor. 2048 por cara son 22,8 px por grado,
 * la densidad de las pantallas de Quest 2 y Quest 3 (unos 20–25 px/°): más no
 * se aprecia y cuadruplica la memoria. En cartón, la mitad de la pantalla de
 * un móvil no llega a 13 px/°, así que basta con 1024.
 */
export function vrTargetFaceSize(maxTextureSize: number, mode: "xr" | "cardboard"): number {
  return Math.min(maxTextureSize, mode === "xr" ? 2048 : 1024);
}

export function cubeTileUrl(src: VrCubeSource, level: number, face: CubeFace, y: number, x: number): string {
  return `${src.base}/${level}/${face}/${y}/${x}.${src.extension}`;
}

export interface CubeTile {
  face: CubeFace;
  x: number;
  y: number;
  url: string;
}

/**
 * Teselas de un nivel, ordenadas de la más cercana a la más lejana a la
 * dirección `yaw` (convenio VR, en el marco de la panorámica): primero se
 * afina lo que se tiene delante.
 */
export function cubeLevelTiles(src: VrCubeSource, level: number, yaw: number | null = null): CubeTile[] {
  const size = cubeLevelSizes(src.faceSize, src.levels)[level] ?? src.tileSize;
  const n = Math.max(1, Math.ceil(size / src.tileSize));
  const tiles: (CubeTile & { score: number })[] = [];
  const forward = yaw != null ? dirFromYawPitch(yaw, 0) : null;
  for (const face of CUBE_FACES) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let score = 0;
        if (forward != null) {
          const d = faceDirectionVr(face, (x + 0.5) / n, (y + 0.5) / n);
          score = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
        }
        tiles.push({ face, x, y, url: cubeTileUrl(src, level, face, y, x), score });
      }
    }
  }
  if (forward != null) tiles.sort((a, b) => b.score - a.score);
  return tiles.map(({ face, x, y, url }) => ({ face, x, y, url }));
}

// ---------------------------------------------------------------------------
// Almacén de teselas: descarga, caché en memoria y decodificación
// ---------------------------------------------------------------------------

/** Fuente decodificada lista para subir; `close` libera el ImageBitmap. */
type Decoded = TexImageSource & { close?: () => void };

/**
 * Teselas comprimidas en memoria (Blob), con tope de bytes y expulsión de la
 * más antigua. Comprimidas ocupan una décima parte que decodificadas: una
 * escena de 2048 por cara son unos 100 ficheros y pocos megas.
 */
export class TileStore {
  private blobs = new Map<string, Blob>();
  private inflight = new Map<string, Promise<Blob>>();
  private total = 0;

  constructor(
    private maxBytes = 96 * 1024 * 1024,
    private fetcher: ((url: string, init?: RequestInit) => Promise<Response>) | null = typeof fetch === "function" ? (u, i) => fetch(u, i) : null,
  ) {}

  get bytes(): number {
    return this.total;
  }

  get count(): number {
    return this.blobs.size;
  }

  has(url: string): boolean {
    return this.blobs.has(url);
  }

  /**
   * Descarga (o devuelve de memoria) una tesela. Las peticiones iguales se
   * comparten, así que una descarga empezada no se cancela: puede que la
   * escena a la que se salta la esté esperando.
   */
  blob(url: string): Promise<Blob> {
    const cached = this.blobs.get(url);
    if (cached != null) {
      // Usada ahora: pasa al final de la cola de expulsión
      this.blobs.delete(url);
      this.blobs.set(url, cached);
      return Promise.resolve(cached);
    }
    const pending = this.inflight.get(url);
    if (pending != null) return pending;
    if (this.fetcher == null) return Promise.reject(new Error("sin fetch"));
    const p = this.fetcher(url, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        this.put(url, blob);
        return blob;
      })
      .finally(() => this.inflight.delete(url));
    this.inflight.set(url, p);
    return p;
  }

  private put(url: string, blob: Blob): void {
    if (this.blobs.has(url)) return;
    this.blobs.set(url, blob);
    this.total += blob.size;
    for (const [key, old] of this.blobs) {
      if (this.total <= this.maxBytes || key === url) break;
      this.blobs.delete(key);
      this.total -= old.size;
    }
  }

  /**
   * Olvida todo lo que no empiece por alguno de los prefijos: al cambiar de
   * escena se conservan la actual y sus vecinas, y se sueltan las lejanas.
   */
  keepOnly(prefixes: string[]): void {
    for (const [key, blob] of this.blobs) {
      if (prefixes.some((p) => key.startsWith(p))) continue;
      this.blobs.delete(key);
      this.total -= blob.size;
    }
  }

  /** Descarga en segundo plano, de pocas en pocas; se corta con `signal`. */
  async prefetch(urls: string[], signal: AbortSignal, concurrency = 3): Promise<void> {
    const queue = urls.filter((u) => !this.blobs.has(u));
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && !signal.aborted) {
        const url = queue.shift()!;
        await this.blob(url).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  /**
   * Tesela decodificada. `createImageBitmap` decodifica fuera del hilo
   * principal; si no existe o falla (CSP sin `connect-src`, CORS), se cae a
   * un `<img>` con `decode()`, que también decodifica en segundo plano.
   */
  async decode(url: string, signal?: AbortSignal): Promise<Decoded> {
    if (typeof createImageBitmap === "function" && this.fetcher != null) {
      try {
        const blob = await this.blob(url);
        if (signal?.aborted === true) throw new Error("cancelada");
        return await createImageBitmap(blob);
      } catch (error) {
        if (signal?.aborted === true) throw error;
      }
    }
    return loadImageElement(url);
  }
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // decode() asegura que la subida a la GPU no decodifica en el bucle
      const ready = typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve();
      void ready.then(() => resolve(img));
    };
    img.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Cubo con refinado progresivo
// ---------------------------------------------------------------------------

export interface CubePanoramaOptions {
  store: TileStore;
  /** Lado de cara deseado (vrTargetFaceSize). */
  targetFace: number;
  /** Yaw de la panorámica que quedará delante (vista de llegada). */
  priorityYaw: number | null;
  /** Descargas y decodificaciones simultáneas. */
  concurrency?: number;
  now?: () => number;
}

export interface CubePanoramaStats {
  /** Lado de cara del nivel definitivo. */
  faceSize: number;
  tilesDone: number;
  tilesTotal: number;
  /** Milisegundos hasta tener el nivel 0 entero y hasta terminar. */
  baseMs: number | null;
  completeMs: number | null;
}

interface FaceStage {
  tex: WebGLTexture | null;
  /** Teselas que faltan en esta cara. */
  left: number;
  /** Alguna tesela ya subida (hay algo que pintar). */
  any: boolean;
}

export class CubePanorama {
  readonly sizes: number[];
  readonly level: number;
  readonly stats: CubePanoramaStats;
  /** Se resuelve con el nivel 0 entero (o lo que haya llegado si algo falla). */
  readonly baseReady: Promise<void>;
  /** Se resuelve con el nivel definitivo entero (las teselas que fallan cuentan como hechas). */
  readonly complete: Promise<void>;

  private base = new Map<CubeFace, FaceStage>();
  private hi = new Map<CubeFace, FaceStage>();
  private abort = new AbortController();
  private disposed = false;
  private started = 0;
  private resolveBase!: () => void;
  private resolveComplete!: () => void;
  private readonly now: () => number;

  constructor(
    private renderer: XrRenderer,
    readonly source: VrCubeSource,
    private options: CubePanoramaOptions,
  ) {
    this.now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.sizes = cubeLevelSizes(source.faceSize, source.levels);
    this.level = chooseCubeLevel(this.sizes, options.targetFace);
    const n = Math.max(1, Math.ceil(this.sizes[this.level]! / source.tileSize));
    this.stats = { faceSize: this.sizes[this.level]!, tilesDone: 0, tilesTotal: 6 * n * n + (this.level > 0 ? 6 : 0), baseMs: null, completeMs: null };
    this.baseReady = new Promise((r) => (this.resolveBase = r));
    this.complete = new Promise((r) => (this.resolveComplete = r));
  }

  /** URLs de todas las teselas que usará (para saber si ya están en memoria). */
  urls(): string[] {
    const list = cubeLevelTiles(this.source, 0).map((t) => t.url);
    if (this.level > 0) list.push(...cubeLevelTiles(this.source, this.level).map((t) => t.url));
    return list;
  }

  /** true si todas sus teselas están ya descargadas en el almacén. */
  allCached(): boolean {
    return this.urls().every((u) => this.options.store.has(u));
  }

  start(): this {
    this.started = this.now();
    const r = this.renderer;
    const tilesPerSide = (level: number): number => Math.max(1, Math.ceil(this.sizes[level]! / this.source.tileSize));
    // Nivel 0: una textura por cara del tamaño de su única tesela
    const baseTiles = cubeLevelTiles(this.source, 0, this.options.priorityYaw);
    const nb = tilesPerSide(0);
    for (const face of CUBE_FACES) this.base.set(face, { tex: null, left: nb * nb, any: false });
    let baseLeft = baseTiles.length;
    const baseDone = (): void => {
      baseLeft--;
      if (baseLeft === 0) {
        this.stats.baseMs = this.now() - this.started;
        this.resolveBase();
        if (this.level === 0) this.finish();
      }
    };
    // Nivel bueno: texturas transparentes del tamaño de la cara que se rellenan
    let hiTiles: CubeTile[] = [];
    let hiLeft = 0;
    if (this.level > 0) {
      const size = this.sizes[this.level]!;
      const nh = tilesPerSide(this.level);
      for (const face of CUBE_FACES) this.hi.set(face, { tex: r.allocTexture(size, size), left: nh * nh, any: false });
      hiTiles = cubeLevelTiles(this.source, this.level, this.options.priorityYaw);
      hiLeft = hiTiles.length;
    }
    const hiDone = (): void => {
      hiLeft--;
      if (hiLeft === 0) this.finish();
    };

    // Una sola cola: el nivel 0 primero, después el bueno por cercanía
    const jobs: { tile: CubeTile; stage: "base" | "hi" }[] = [
      ...baseTiles.map((tile) => ({ tile, stage: "base" as const })),
      ...hiTiles.map((tile) => ({ tile, stage: "hi" as const })),
    ];
    const store = this.options.store;
    const signal = this.abort.signal;
    const worker = async (): Promise<void> => {
      while (jobs.length > 0 && !this.disposed) {
        const { tile, stage } = jobs.shift()!;
        let img: Decoded | null = null;
        try {
          img = await store.decode(tile.url, signal);
        } catch {
          img = null;
        }
        if (this.disposed) {
          img?.close?.();
          return;
        }
        if (img != null) this.place(stage, tile, img);
        img?.close?.();
        this.stats.tilesDone++;
        if (stage === "base") baseDone();
        else hiDone();
      }
    };
    for (let i = 0; i < (this.options.concurrency ?? 8); i++) void worker();
    return this;
  }

  private finish(): void {
    if (this.stats.completeMs != null) return;
    this.stats.completeMs = this.now() - this.started;
    this.resolveComplete();
  }

  private place(stage: "base" | "hi", tile: CubeTile, img: Decoded): void {
    const r = this.renderer;
    const faces = stage === "base" ? this.base : this.hi;
    const st = faces.get(tile.face)!;
    if (stage === "base") {
      // Nivel 0: la tesela es la cara entera
      if (st.tex == null) st.tex = r.createTexture();
      if (r.upload(st.tex, img)) st.any = true;
    } else if (st.tex != null) {
      if (r.uploadSub(st.tex, tile.x * this.source.tileSize, tile.y * this.source.tileSize, img)) st.any = true;
    }
    st.left--;
    // Cara buena completa: la de baja ya no se ve, se libera
    if (stage === "hi" && st.left === 0) {
      const low = this.base.get(tile.face);
      if (low?.tex != null) {
        r.deleteTexture(low.tex);
        low.tex = null;
      }
    }
  }

  /** true si el nivel 0 (o el definitivo) cubre todas las caras: la vista previa sobra. */
  get covers(): boolean {
    return CUBE_FACES.every((f) => this.base.get(f)?.any === true || this.hi.get(f)?.left === 0);
  }

  /** Pinta las caras: la etapa baja debajo y la buena encima, con sus huecos transparentes. */
  draw(sceneModel: Float32Array, multiply: (a: Float32Array, b: Float32Array) => Float32Array): void {
    const r = this.renderer;
    for (const face of CUBE_FACES) {
      const hi = this.hi.get(face);
      const low = this.base.get(face);
      const model = multiply(sceneModel, faceModelMatrix(face));
      const hiDone = hi != null && hi.left === 0;
      if (!hiDone && low?.tex != null && low.any) r.draw(r.quad, model, { texture: low.tex, depthTest: false });
      if (hi?.tex != null && hi.any) r.draw(r.quad, model, { texture: hi.tex, depthTest: false });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    for (const st of [...this.base.values(), ...this.hi.values()]) {
      this.renderer.deleteTexture(st.tex);
      st.tex = null;
    }
    this.resolveBase();
    this.resolveComplete();
  }
}
