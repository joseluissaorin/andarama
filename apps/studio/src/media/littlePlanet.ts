/**
 * Little planet instantáneo para la biblioteca de medios.
 *
 * La idea es comprobar de un vistazo qué panorama estás cogiendo, así que lo
 * único que importa es que aparezca sin espera perceptible. Por eso:
 *
 *  - Se dibuja con Canvas 2D, no con WebGL: una rejilla de miniaturas con
 *    veinte lienzos WebGL agotaría los contextos del navegador (Chrome corta
 *    sobre los dieciséis y empieza a matar los antiguos).
 *  - La fuente es el preview equirect de 512×256 que el teselado ya guarda
 *    dentro del manifiesto de tiles, así que no hay ni una petición de red.
 *  - La correspondencia píxel→píxel se calcula una sola vez por tamaño y se
 *    reutiliza para todas las imágenes: cada miniatura son ~57.000 lecturas de
 *    un array, cuestión de milisegundos.
 */

/** Radio del disco en unidades de proyección: 1 es justo el horizonte. */
const RADIUS = 1.9;

/** Orientación fija: el frente del panorama queda arriba del disco. */
const YAW0 = 0;

interface Lut {
  /** Índice de píxel de origen (×4) por cada píxel de destino, -1 si está fuera del disco. */
  offsets: Int32Array;
  size: number;
  srcW: number;
  srcH: number;
}

const lutCache = new Map<string, Lut>();

/**
 * Proyección estereográfica desde el cenit sobre el plano del nadir: el centro
 * del disco es el suelo y el borde, el cielo. Es la construcción clásica del
 * «planeta», y la que espera cualquiera que haya visto una foto 360.
 */
/**
 * Punto del equirect que corresponde a un punto del disco, en coordenadas
 * normalizadas [-1, 1]. Es la matemática de la proyección, aislada para poder
 * probarla sin navegador.
 */
export function planetSample(u: number, v: number, srcW: number, srcH: number): { x: number; y: number } | null {
  const r = Math.hypot(u, v);
  if (r > 1) return null;
  // theta: ángulo desde el nadir. r = tan(theta/2) es la estereográfica.
  const theta = 2 * Math.atan(r * RADIUS);
  const pitch = -Math.PI / 2 + theta;
  const yaw = Math.atan2(u, -v) + YAW0;
  // Equirect: yaw 0 en el centro de la imagen, pitch +90° arriba.
  const frac = 0.5 + yaw / (2 * Math.PI);
  return {
    x: Math.min(srcW - 1, Math.floor((((frac % 1) + 1) % 1) * srcW)),
    y: Math.min(srcH - 1, Math.max(0, Math.floor((0.5 - pitch / Math.PI) * srcH))),
  };
}

function buildLut(size: number, srcW: number, srcH: number): Lut {
  const offsets = new Int32Array(size * size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sample = planetSample((x - half) / half, (y - half) / half, srcW, srcH);
      offsets[y * size + x] = sample == null ? -1 : (sample.y * srcW + sample.x) * 4;
    }
  }
  return { offsets, size, srcW, srcH };
}

function getLut(size: number, srcW: number, srcH: number): Lut {
  const key = `${size}:${srcW}:${srcH}`;
  let lut = lutCache.get(key);
  if (lut == null) {
    lut = buildLut(size, srcW, srcH);
    lutCache.set(key, lut);
  }
  return lut;
}

/** Remapea un equirect ya decodificado a un little planet cuadrado. */
export function renderLittlePlanet(source: CanvasImageSource & { width: number; height: number }, size: number): HTMLCanvasElement {
  const src = document.createElement("canvas");
  // 512×256 basta y sobra: el resultado se ve a 220 px.
  src.width = Math.min(512, source.width);
  src.height = Math.min(256, source.height);
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(source, 0, 0, src.width, src.height);
  const srcData = sctx.getImageData(0, 0, src.width, src.height).data;

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(size, size);
  const dst = img.data;
  const { offsets } = getLut(size, src.width, src.height);
  for (let i = 0; i < offsets.length; i++) {
    const o = offsets[i]!;
    const d = i * 4;
    if (o < 0) {
      dst[d + 3] = 0;
      continue;
    }
    dst[d] = srcData[o]!;
    dst[d + 1] = srcData[o + 1]!;
    dst[d + 2] = srcData[o + 2]!;
    dst[d + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

const planetCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/**
 * Little planet de un medio como data URL, cacheado por id. `equirectUrl` es
 * normalmente el preview embebido en el manifiesto (data URI): entonces no hay
 * red de por medio y el resultado aparece en el mismo fotograma del hover.
 */
export async function littlePlanetFor(mediaId: string, equirectUrl: string, size = 220): Promise<string | null> {
  const key = `${mediaId}:${size}`;
  const cached = planetCache.get(key);
  if (cached != null) return cached;
  const inFlight = pending.get(key);
  if (inFlight != null) return inFlight;

  const task = (async () => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = equirectUrl;
      await img.decode();
      const canvas = renderLittlePlanet(img, size);
      const url = canvas.toDataURL("image/png");
      planetCache.set(key, url);
      return url;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}

/** Precalcula en tiempo ocioso para que el primer hover tampoco espere. */
export function prefetchLittlePlanets(items: { id: string; equirectUrl: string | null }[], size = 220): void {
  const schedule: (fn: () => void) => void =
    typeof requestIdleCallback === "function" ? (fn) => void requestIdleCallback(fn, { timeout: 3000 }) : (fn) => void setTimeout(fn, 300);
  let i = 0;
  const step = (): void => {
    const item = items[i++];
    if (item == null) return;
    if (item.equirectUrl != null && !planetCache.has(`${item.id}:${size}`)) {
      void littlePlanetFor(item.id, item.equirectUrl, size).then(() => schedule(step));
      return;
    }
    schedule(step);
  };
  schedule(step);
}
