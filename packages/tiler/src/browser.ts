import { computePyramid, snapFaceSize, totalTileCount, type Face, type TileManifest } from "./math.js";

/**
 * Tiler de navegador: genera la piramide de tiles en un WebWorker con
 * OffscreenCanvas + WebGL (reproyeccion equirect -> caras de cubo en GPU).
 * El hilo principal solo decodifica la imagen y recibe blobs listos para
 * subir. Cero computo de servidor (decision de arquitectura §3.3/§6.5).
 */

export interface BrowserTileOptions {
  tileSize?: number;
  /** webp | jpeg (avif si el navegador lo soporta). */
  format?: "webp" | "jpeg" | "avif";
  quality?: number;
  /** Ediciones no destructivas: nivelado de horizonte y punto cero (rad). */
  yawOffset?: number;
  pitchOffset?: number;
  rollOffset?: number;
  /** Ajustes basicos: exposicion [-1,1] y saturacion [0,2]. */
  exposure?: number;
  saturation?: number;
  /** Parche de nadir (logo) a componer sobre la cara d. */
  nadirPatch?: Blob;
  nadirPatchSize?: number;
  signal?: AbortSignal;
  /** Imagen ya decodificada por `probeImage`, para no volver a hacerlo. */
  decoded?: DecodedSource;
}

export interface BrowserTileResult {
  manifest: TileManifest;
  /** Preview equirect pequeno como data URI (embebido en tour.json). */
  preview: string;
  /** Miniatura de escena (JPEG). */
  thumbnail: Blob;
  /** Imagen OG de comparticion (JPEG 1200x630). */
  ogImage: Blob;
  /** true si hubo que reducir resolucion por limites del dispositivo. */
  clientLimited: boolean;
  sourceWidth: number;
  sourceHeight: number;
}

export interface TileOutput {
  level: number;
  face: Face;
  x: number;
  y: number;
  blob: Blob;
}

export interface TileCallbacks {
  onTile: (tile: TileOutput) => void | Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

const WORKER_SOURCE = String.raw`
"use strict";
const FACES = ["f", "b", "l", "r", "u", "d"];

function pyramid(faceSize, tileSize) {
  const sizes = [];
  let s = faceSize;
  for (;;) { sizes.unshift(s); if (s <= tileSize) break; s = Math.ceil(s / 2); }
  return sizes.map((size, level) => ({ level, size, tiles: Math.ceil(size / tileSize) }));
}

const VS = "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }";
const FS = [
  "precision highp float; varying vec2 vUv; uniform sampler2D uTex;",
  "uniform vec3 uAxisX; uniform vec3 uAxisY; uniform vec3 uAxisZ;",
  "uniform mat3 uRot; uniform float uExposure; uniform float uSaturation;",
  "void main(){",
  "  float a = 2.0 * vUv.x - 1.0; float b = 2.0 * vUv.y - 1.0;",
  "  vec3 dir = normalize(uAxisZ + a * uAxisX + b * uAxisY);",
  "  dir = uRot * dir;",
  "  float lon = atan(dir.x, dir.z); float lat = asin(clamp(dir.y, -1.0, 1.0));",
  "  vec2 uv = vec2((lon + 3.14159265) / 6.2831853, (lat + 1.5707963) / 3.14159265);",
  "  vec4 c = texture2D(uTex, uv);",
  "  c.rgb = c.rgb * pow(2.0, uExposure);",
  "  float grey = dot(c.rgb, vec3(0.299, 0.587, 0.114));",
  "  c.rgb = mix(vec3(grey), c.rgb, uSaturation);",
  "  gl_FragColor = c;",
  "}",
].join("\n");

// Bases por cara: Z apunta al centro de la cara; X e Y recorren u y v.
const BASES = {
  f: { x: [1, 0, 0], y: [0, -1, 0], z: [0, 0, 1] },
  b: { x: [-1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] },
  r: { x: [0, 0, -1], y: [0, -1, 0], z: [1, 0, 0] },
  l: { x: [0, 0, 1], y: [0, -1, 0], z: [-1, 0, 0] },
  u: { x: [1, 0, 0], y: [0, 0, 1], z: [0, 1, 0] },
  d: { x: [1, 0, 0], y: [0, 0, -1], z: [0, -1, 0] },
};

function rotationMatrix(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // column-major mat3 para WebGL
  return new Float32Array([
    cy * cr + sy * sp * sr, cp * sr, -sy * cr + cy * sp * sr,
    -cy * sr + sy * sp * cr, cp * cr, sy * sr + cy * sp * cr,
    sy * cp, -sp, cy * cp,
  ]);
}

/** Reduce la fuente a la mitad sin volver a descomprimir el fichero. */
function halve(source) {
  const w = Math.max(1024, Math.floor(source.width / 2));
  const h = Math.max(512, Math.floor(source.height / 2));
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(source, 0, 0, w, h);
  if (source.close) source.close();
  return c;
}

function snapFace(raw, tileSize, maxFace) {
  let size = tileSize;
  while (size < raw && size < maxFace) size *= 2;
  return Math.min(size, maxFace);
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    const { bitmap, tileSize, format, quality, yaw, pitch, roll, exposure, saturation, nadir, nadirSize, maxFace } = msg;
    const mime = format === "jpeg" ? "image/jpeg" : format === "avif" ? "image/avif" : "image/webp";

    /**
     * MAX_TEXTURE_SIZE dice el lado máximo, no si hay memoria para esa textura.
     * Una equirectangular de 12.000 px son 286 MB de textura: la tarjeta la
     * rechaza en silencio, la textura queda incompleta y **todas las teselas
     * salen negras**. Las miniaturas, que se hacen aparte con un lienzo 2D,
     * salen bien, así que el fallo no se ve hasta abrir el visor.
     *
     * Por eso aquí no se da nada por hecho: se sube la textura, se comprueba el
     * error de GL y se pinta una muestra. Si sale negra, se reduce a la mitad y
     * se vuelve a intentar.
     */
    let source = bitmap;
    let gl = null;
    let glCanvas = null;
    let prog = null;
    let faceSize = 0;
    let limited = false;

    for (let intento = 0; intento < 4; intento++) {
      faceSize = snapFace(Math.floor(source.width / 4), tileSize, maxFace);
      glCanvas = new OffscreenCanvas(faceSize, faceSize);
      const opciones = { preserveDrawingBuffer: true, premultipliedAlpha: false };
      // WebGL 2 admite repetir texturas que no son potencia de dos; WebGL 1 no
      gl = glCanvas.getContext("webgl2", opciones);
      const webgl2 = gl != null;
      if (gl == null) gl = glCanvas.getContext("webgl", opciones);
      if (gl == null) throw new Error("WebGL no disponible en el worker");
      const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
        return sh;
      };
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      /**
       * En WebGL 1 una textura que no sea potencia de dos **solo** puede usar
       * CLAMP_TO_EDGE: con REPEAT queda incompleta y el muestreo devuelve negro.
       * Aquí se repetía en horizontal para envolver la longitud, así que
       * cualquier panorama que no midiera 4096, 8192... salía **entero negro**,
       * y como la miniatura se hace aparte con un lienzo 2D, el fallo no se veía
       * hasta abrir el visor.
       */
      const potencia = (n) => (n & (n - 1)) === 0;
      const repetible = webgl2 || (potencia(source.width) && potencia(source.height));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repetible ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      while (gl.getError() !== gl.NO_ERROR) {
        // vaciar errores previos
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const errorTextura = gl.getError();

      gl.uniformMatrix3fv(gl.getUniformLocation(prog, "uRot"), false, rotationMatrix(yaw, pitch, roll));
      gl.uniform1f(gl.getUniformLocation(prog, "uExposure"), exposure);
      gl.uniform1f(gl.getUniformLocation(prog, "uSaturation"), saturation);

      // Muestra de las seis caras: si TODAS salen del mismo negro, no es una
      // foto oscura, es una textura que no ha llegado a la tarjeta.
      let vacio = errorTextura !== gl.NO_ERROR || gl.isContextLost();
      let motivo = vacio ? ("gl " + errorTextura) : "";
      if (!vacio) {
        const lado = 16;
        const px = new Uint8Array(lado * lado * 4);
        let distintos = 0;
        for (const faceName of FACES) {
          const basis = BASES[faceName];
          gl.uniform3fv(gl.getUniformLocation(prog, "uAxisX"), basis.x);
          gl.uniform3fv(gl.getUniformLocation(prog, "uAxisY"), basis.y);
          gl.uniform3fv(gl.getUniformLocation(prog, "uAxisZ"), basis.z);
          gl.viewport(0, 0, lado, lado);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.readPixels(0, 0, lado, lado, gl.RGBA, gl.UNSIGNED_BYTE, px);
          for (let i = 0; i < px.length; i += 4) {
            if (px[i] > 3 || px[i + 1] > 3 || px[i + 2] > 3) {
              distintos++;
              break;
            }
          }
        }
        vacio = distintos === 0;
        if (vacio) motivo = "muestra en negro";
      }

      if (!vacio) break;
      if (source.width <= 2048) throw new Error("La tarjeta gráfica no ha podido procesar el panorama (" + motivo + ", " + source.width + "x" + source.height + ")");
      // Otra vuelta con la mitad de resolución
      source = halve(source);
      limited = true;
    }

    if (source.close) source.close();
    self.postMessage({ kind: "ready", faceSize, limited });

    const levels = pyramid(faceSize, tileSize);
    const total = levels.reduce((a, l) => a + l.tiles * l.tiles * 6, 0);
    let done = 0;
    const tileCanvases = new Map();

    for (const faceName of FACES) {
      const basis = BASES[faceName];
      gl.uniform3fv(gl.getUniformLocation(prog, "uAxisX"), basis.x);
      gl.uniform3fv(gl.getUniformLocation(prog, "uAxisY"), basis.y);
      gl.uniform3fv(gl.getUniformLocation(prog, "uAxisZ"), basis.z);
      gl.viewport(0, 0, faceSize, faceSize);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Copia de la cara a un canvas 2D (y parche de nadir si toca)
      let faceCanvas = new OffscreenCanvas(faceSize, faceSize);
      const fctx = faceCanvas.getContext("2d");
      fctx.drawImage(glCanvas, 0, 0);
      if (faceName === "d" && nadir != null) {
        const size = Math.round(faceSize * (nadirSize || 0.5));
        fctx.save();
        fctx.translate(faceSize / 2, faceSize / 2);
        fctx.drawImage(nadir, -size / 2, -size / 2, size, size);
        fctx.restore();
      }

      // Niveles de mayor a menor. Cada nivel se saca del anterior, no del
      // original: reducir a la mitad seis veces es mucho más barato que seis
      // reducciones desde 8192, y además el resultado es más limpio.
      let prevCanvas = faceCanvas;
      for (let li = levels.length - 1; li >= 0; li--) {
        const level = levels[li];
        let levelCanvas = prevCanvas;
        if (level.size !== prevCanvas.width) {
          levelCanvas = new OffscreenCanvas(level.size, level.size);
          const lctx = levelCanvas.getContext("2d");
          lctx.imageSmoothingEnabled = true;
          lctx.imageSmoothingQuality = "high";
          lctx.drawImage(prevCanvas, 0, 0, level.size, level.size);
        }
        prevCanvas = levelCanvas;
        for (let ty = 0; ty < level.tiles; ty++) {
          for (let tx = 0; tx < level.tiles; tx++) {
            const w = Math.min(tileSize, level.size - tx * tileSize);
            const h = Math.min(tileSize, level.size - ty * tileSize);
            // Un lienzo por tamaño en vez de uno por tesela: un panorama de
            // 8192 son más de mil teselas, y mil lienzos cuestan lo suyo.
            const ck = w + "x" + h;
            let tileCanvas = tileCanvases.get(ck);
            if (tileCanvas == null) {
              tileCanvas = new OffscreenCanvas(w, h);
              tileCanvases.set(ck, tileCanvas);
            }
            const tctx = tileCanvas.getContext("2d");
            tctx.clearRect(0, 0, w, h);
            tctx.drawImage(levelCanvas, tx * tileSize, ty * tileSize, w, h, 0, 0, w, h);
            const blob = await tileCanvas.convertToBlob({ type: mime, quality });
            done++;
            self.postMessage({ kind: "tile", level: level.level, face: faceName, x: tx, y: ty, blob, done, total });
          }
        }
      }
      faceCanvas = null;
      prevCanvas = null;
    }
    self.postMessage({ kind: "done" });
  } catch (err) {
    self.postMessage({ kind: "error", message: err && err.message ? err.message : String(err) });
  }
};
`;

let workerUrl: string | null = null;
function getWorkerUrl(): string {
  if (workerUrl == null) {
    workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  }
  return workerUrl;
}

async function supportsMime(mime: string): Promise<boolean> {
  const c = new OffscreenCanvas(2, 2);
  c.getContext("2d")!.fillRect(0, 0, 2, 2);
  const blob = await c.convertToBlob({ type: mime }).catch(() => null);
  return blob != null && blob.type === mime;
}

function maxTextureSize(): number {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl");
  if (gl == null) return 4096;
  return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
}

/** Imagen ya decodificada, lista para reutilizar en todo el proceso. */
export interface DecodedSource {
  /** Mapa de bits listo para la GPU (reducido si excede la textura máxima). */
  bitmap: ImageBitmap;
  /** Dimensiones **originales** del fichero, aunque el mapa se haya reducido. */
  width: number;
  height: number;
  /** Hubo que reducir por el límite de textura del dispositivo. */
  limited: boolean;
  isPanorama: boolean;
  reason: "xmp" | "aspect";
}

/**
 * Decodifica la imagen **una sola vez** y de paso dice si es un panorama.
 *
 * Antes cada foto se decodificaba cinco o seis veces: una para detectar si era
 * panorama, otra para medirla, otra para la textura y tres más para la
 * previsualización, la miniatura y la imagen social. En una foto de 60 Mpx eso
 * son varios segundos tirados por foto.
 */
export async function probeImage(blob: Blob): Promise<DecodedSource> {
  const head = new Uint8Array(await blob.slice(0, 128 * 1024).arrayBuffer());
  const text = new TextDecoder("latin1").decode(head);
  const xmp = text.includes("GPano:ProjectionType") || text.includes("equirectangular");

  const full = await createImageBitmap(blob);
  const width = full.width;
  const height = full.height;
  const ratio = width / Math.max(1, height);
  const isPanorama = xmp || (Math.abs(ratio - 2) < 0.02 && width >= 2048);

  const maxTex = maxTextureSize();
  if (width <= maxTex) {
    return { bitmap: full, width, height, limited: false, isPanorama, reason: xmp ? "xmp" : "aspect" };
  }
  // Reducir desde el mapa ya decodificado, no volviendo a descomprimir el JPEG
  const bitmap = await createImageBitmap(full, {
    resizeWidth: maxTex,
    resizeHeight: Math.round((height * maxTex) / width),
    resizeQuality: "high",
  });
  full.close();
  return { bitmap, width, height, limited: true, isPanorama, reason: xmp ? "xmp" : "aspect" };
}

/**
 * Derivado (previsualización, miniatura, imagen social) a partir del mapa ya
 * decodificado. Si la reducción es muy grande se hace en dos pasos: bajar de
 * 11.000 px a 1.200 de golpe deja escalones.
 */
async function renderDerivative(bitmap: ImageBitmap, w: number, h: number, mime: string, quality: number): Promise<Blob> {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  // Recorte central (la vista frontal del panorama está en el centro)
  const targetRatio = w / h;
  let cw = srcW;
  let ch = srcW / targetRatio;
  if (ch > srcH) {
    ch = srcH;
    cw = srcH * targetRatio;
  }
  const sx = (srcW - cw) / 2;
  const sy = (srcH - ch) / 2;

  let source: OffscreenCanvas | ImageBitmap = bitmap;
  let sourceX = sx;
  let sourceY = sy;
  let sourceW = cw;
  let sourceH = ch;
  if (cw / w > 4) {
    const midW = Math.max(w, Math.round(cw / 4));
    const midH = Math.max(h, Math.round(ch / 4));
    const mid = new OffscreenCanvas(midW, midH);
    const mctx = mid.getContext("2d")!;
    mctx.imageSmoothingEnabled = true;
    mctx.imageSmoothingQuality = "high";
    mctx.drawImage(bitmap, sx, sy, cw, ch, 0, 0, midW, midH);
    source = mid;
    sourceX = 0;
    sourceY = 0;
    sourceW = midW;
    sourceH = midH;
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sourceX, sourceY, sourceW, sourceH, 0, 0, w, h);
  return canvas.convertToBlob({ type: mime, quality });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("FileReader fallo"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Trocea un panorama equirectangular en el navegador.
 * Devuelve el manifiesto; los tiles se entregan por callback segun se
 * generan (para subida en streaming con URLs prefirmadas).
 */
export async function tilePanorama(
  source: Blob,
  options: BrowserTileOptions,
  callbacks: TileCallbacks,
): Promise<BrowserTileResult> {
  const tileSize = options.tileSize ?? 512;
  let format = options.format ?? "webp";
  if (format === "avif" && !(await supportsMime("image/avif"))) format = "webp";
  if (format === "webp" && !(await supportsMime("image/webp"))) format = "jpeg";
  const quality = options.quality ?? 0.82;

  // Si quien llama ya la ha decodificado, se reutiliza: es lo caro de todo esto
  const decoded = options.decoded ?? (await probeImage(source));
  const { bitmap, limited, width, height } = decoded;
  if (bitmap.width < 256) {
    bitmap.close();
    throw new Error("La imagen es demasiado pequeña para trocear (min 256 px de ancho)");
  }
  // Cara en el esquema tileSize * 2^k (requisito de la geometria multires).
  // El tamaño definitivo lo decide el worker: si la tarjeta no traga la textura
  // reduce la fuente y lo dice, y el manifiesto tiene que contar lo que hay.
  const maxRenderFace = Math.min(8192, maxTextureSize());

  // Los derivados salen del mismo mapa de bits, antes de cedérselo al worker
  // (al transferirlo se queda vacío).
  const preview = await renderDerivative(bitmap, 512, 256, "image/jpeg", 0.6).then(blobToDataUrl);
  const thumbnail = await renderDerivative(bitmap, 640, 384, "image/jpeg", 0.75);
  const ogImage = await renderDerivative(bitmap, 1200, 630, "image/jpeg", 0.8);

  let nadirBitmap: ImageBitmap | null = null;
  if (options.nadirPatch != null) {
    nadirBitmap = await createImageBitmap(options.nadirPatch);
  }

  const worker = new Worker(getWorkerUrl());
  const mimeExt = format === "jpeg" ? "jpg" : format;

  let faceSize = snapFaceSize(Math.floor(bitmap.width / 4), tileSize, maxRenderFace);
  let gpuLimited = false;

  const donePromise = new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      worker.terminate();
      reject(new DOMException("Cancelado", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const pendingWrites: Promise<unknown>[] = [];
    worker.onmessage = (e: MessageEvent): void => {
      const msg = e.data as { kind: string; message?: string } & Record<string, unknown>;
      if (msg.kind === "ready") {
        faceSize = msg.faceSize as number;
        gpuLimited = msg.limited === true;
      } else if (msg.kind === "tile") {
        const p = callbacks.onTile({
          level: msg.level as number,
          face: msg.face as Face,
          x: msg.x as number,
          y: msg.y as number,
          blob: msg.blob as Blob,
        });
        if (p != null) pendingWrites.push(p);
        callbacks.onProgress?.(msg.done as number, msg.total as number);
      } else if (msg.kind === "done") {
        options.signal?.removeEventListener("abort", abort);
        void Promise.all(pendingWrites).then(() => resolve());
      } else if (msg.kind === "error") {
        options.signal?.removeEventListener("abort", abort);
        reject(new Error(msg.message ?? "Error de troceado"));
      }
    };
    worker.onerror = (e): void => reject(new Error(e.message));
  });

  worker.postMessage(
    {
      bitmap,
      maxFace: maxRenderFace,
      tileSize,
      format,
      quality,
      yaw: options.yawOffset ?? 0,
      pitch: options.pitchOffset ?? 0,
      roll: options.rollOffset ?? 0,
      exposure: options.exposure ?? 0,
      saturation: options.saturation ?? 1,
      nadir: nadirBitmap,
      nadirSize: options.nadirPatchSize,
    },
    nadirBitmap != null ? [bitmap, nadirBitmap] : [bitmap],
  );

  try {
    await donePromise;
  } finally {
    worker.terminate();
  }

  const manifest: TileManifest = {
    levels: computePyramid(faceSize, tileSize).length,
    tileSize,
    faceSize,
    extension: mimeExt,
    formats: [mimeExt],
    tileCount: totalTileCount(faceSize, tileSize),
    preview,
  };
  return { manifest, preview, thumbnail, ogImage, clientLimited: limited || gpuLimited, sourceWidth: width, sourceHeight: height };
}

/**
 * Detecta si un fichero de imagen parece un panorama equirectangular.
 *
 * Se conserva por compatibilidad; en el flujo de subida se usa `probeImage`,
 * que además devuelve la imagen decodificada para no repetir el trabajo.
 */
export async function detectPanorama(blob: Blob): Promise<{ isPanorama: boolean; width: number; height: number; reason: string }> {
  const probe = await probeImage(blob);
  probe.bitmap.close();
  return { isPanorama: probe.isPanorama, width: probe.width, height: probe.height, reason: probe.reason };
}
