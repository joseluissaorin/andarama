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

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    const { bitmap, faceSize, tileSize, format, quality, yaw, pitch, roll, exposure, saturation, nadir, nadirSize } = msg;
    const mime = format === "jpeg" ? "image/jpeg" : format === "avif" ? "image/avif" : "image/webp";

    const glCanvas = new OffscreenCanvas(faceSize, faceSize);
    const gl = glCanvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (gl == null) throw new Error("WebGL no disponible en el worker");
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
      return sh;
    };
    const prog = gl.createProgram();
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    bitmap.close();

    gl.uniformMatrix3fv(gl.getUniformLocation(prog, "uRot"), false, rotationMatrix(yaw, pitch, roll));
    gl.uniform1f(gl.getUniformLocation(prog, "uExposure"), exposure);
    gl.uniform1f(gl.getUniformLocation(prog, "uSaturation"), saturation);

    const levels = pyramid(faceSize, tileSize);
    const total = levels.reduce((a, l) => a + l.tiles * l.tiles * 6, 0);
    let done = 0;

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

      // Niveles de mayor a menor: reduccion sucesiva a la mitad
      for (let li = levels.length - 1; li >= 0; li--) {
        const level = levels[li];
        let levelCanvas = faceCanvas;
        if (level.size !== faceSize) {
          levelCanvas = new OffscreenCanvas(level.size, level.size);
          const lctx = levelCanvas.getContext("2d");
          lctx.imageSmoothingEnabled = true;
          lctx.imageSmoothingQuality = "high";
          lctx.drawImage(faceCanvas, 0, 0, level.size, level.size);
        }
        for (let ty = 0; ty < level.tiles; ty++) {
          for (let tx = 0; tx < level.tiles; tx++) {
            const w = Math.min(tileSize, level.size - tx * tileSize);
            const h = Math.min(tileSize, level.size - ty * tileSize);
            const tileCanvas = new OffscreenCanvas(w, h);
            tileCanvas.getContext("2d").drawImage(levelCanvas, tx * tileSize, ty * tileSize, w, h, 0, 0, w, h);
            const blob = await tileCanvas.convertToBlob({ type: mime, quality });
            done++;
            self.postMessage({ kind: "tile", level: level.level, face: faceName, x: tx, y: ty, blob, done, total });
          }
        }
      }
      faceCanvas = null;
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

/** Decodifica limitando al tamano de textura del dispositivo. */
async function decodeSource(blob: Blob): Promise<{ bitmap: ImageBitmap; limited: boolean; width: number; height: number }> {
  const probe = await createImageBitmap(blob);
  const width = probe.width;
  const height = probe.height;
  const maxTex = maxTextureSize();
  if (width <= maxTex) {
    return { bitmap: probe, limited: false, width, height };
  }
  probe.close();
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: maxTex,
    resizeHeight: Math.round((height * maxTex) / width),
    resizeQuality: "high",
  });
  return { bitmap, limited: true, width, height };
}

async function renderDerivative(
  blob: Blob,
  w: number,
  h: number,
  mime: string,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob, { resizeWidth: w * 2, resizeQuality: "high" });
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  // Recorte central (la vista frontal del panorama esta en el centro)
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const targetRatio = w / h;
  let cw = srcW;
  let ch = srcW / targetRatio;
  if (ch > srcH) {
    ch = srcH;
    cw = srcH * targetRatio;
  }
  ctx.drawImage(bitmap, (srcW - cw) / 2, (srcH - ch) / 2, cw, ch, 0, 0, w, h);
  bitmap.close();
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

  const { bitmap, limited, width, height } = await decodeSource(source);
  if (bitmap.width < 256) {
    bitmap.close();
    throw new Error("La imagen es demasiado pequena para trocear (min 256 px de ancho)");
  }
  // Cara en el esquema tileSize * 2^k (requisito de la geometria multires)
  const maxRenderFace = Math.min(8192, maxTextureSize());
  const faceSize = snapFaceSize(Math.floor(bitmap.width / 4), tileSize, maxRenderFace);

  // Derivados en paralelo con el troceado
  const previewPromise = renderDerivative(source, 512, 256, "image/jpeg", 0.6).then(blobToDataUrl);
  const thumbPromise = renderDerivative(source, 640, 384, "image/jpeg", 0.75);
  const ogPromise = renderDerivative(source, 1200, 630, "image/jpeg", 0.8);

  let nadirBitmap: ImageBitmap | null = null;
  if (options.nadirPatch != null) {
    nadirBitmap = await createImageBitmap(options.nadirPatch);
  }

  const worker = new Worker(getWorkerUrl());
  const mimeExt = format === "jpeg" ? "jpg" : format;

  const donePromise = new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      worker.terminate();
      reject(new DOMException("Cancelado", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const pendingWrites: Promise<unknown>[] = [];
    worker.onmessage = (e: MessageEvent): void => {
      const msg = e.data as { kind: string; message?: string } & Record<string, unknown>;
      if (msg.kind === "tile") {
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
      faceSize,
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

  const preview = await previewPromise;
  const manifest: TileManifest = {
    levels: computePyramid(faceSize, tileSize).length,
    tileSize,
    faceSize,
    extension: mimeExt,
    formats: [mimeExt],
    tileCount: totalTileCount(faceSize, tileSize),
    preview,
  };
  return {
    manifest,
    preview,
    thumbnail: await thumbPromise,
    ogImage: await ogPromise,
    clientLimited: limited,
    sourceWidth: width,
    sourceHeight: height,
  };
}

/** Detecta si un fichero de imagen parece un panorama equirectangular. */
export async function detectPanorama(blob: Blob): Promise<{ isPanorama: boolean; width: number; height: number; reason: string }> {
  // Metadatos XMP GPano
  const head = new Uint8Array(await blob.slice(0, 128 * 1024).arrayBuffer());
  const text = new TextDecoder("latin1").decode(head);
  if (text.includes("GPano:ProjectionType") || text.includes("equirectangular")) {
    const bitmap = await createImageBitmap(blob);
    const res = { isPanorama: true, width: bitmap.width, height: bitmap.height, reason: "xmp" };
    bitmap.close();
    return res;
  }
  const bitmap = await createImageBitmap(blob);
  const ratio = bitmap.width / bitmap.height;
  const result = {
    isPanorama: Math.abs(ratio - 2) < 0.02 && bitmap.width >= 2048,
    width: bitmap.width,
    height: bitmap.height,
    reason: "aspect",
  };
  bitmap.close();
  return result;
}
