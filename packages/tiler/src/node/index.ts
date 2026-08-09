import { applyMatrix, computePyramid, directionToEquirect, faceDirection, FACES, rotationMatrix, totalTileCount, type Face, type TileManifest } from "../math.js";

/**
 * Tiler de Node (sharp/libvips): misma logica que el de navegador, para el
 * contenedor de procesado (imagenes que exceden la capacidad del cliente o
 * subidas hechas por API sin navegador). Reproyeccion CPU con muestreo
 * bilineal sobre el buffer RGBA completo.
 */

export interface NodeTileOptions {
  tileSize?: number;
  format?: "webp" | "jpeg" | "avif";
  quality?: number;
  yawOffset?: number;
  pitchOffset?: number;
  rollOffset?: number;
  /** Limite de tamano de cara (por defecto 8192 = equirect 32K). */
  maxFaceSize?: number;
}

export interface NodeTileOutput {
  level: number;
  face: Face;
  x: number;
  y: number;
  data: Buffer;
  key: string;
}

export interface NodeTileResult {
  manifest: TileManifest;
  preview: string;
  thumbnail: Buffer;
  ogImage: Buffer;
  sourceWidth: number;
  sourceHeight: number;
}

export async function tilePanoramaNode(
  input: Buffer | string,
  options: NodeTileOptions,
  onTile: (tile: NodeTileOutput) => Promise<void> | void,
): Promise<NodeTileResult> {
  const { default: sharp } = await import("sharp");
  const tileSize = options.tileSize ?? 512;
  const format = options.format ?? "webp";
  const quality = Math.round((options.quality ?? 0.82) * 100);
  const ext = format === "jpeg" ? "jpg" : format;

  const image = sharp(input, { limitInputPixels: false });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 256) throw new Error("Imagen demasiado pequena");

  const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const srcW = info.width;
  const srcH = info.height;

  const faceSize = Math.min(Math.floor(srcW / 4), options.maxFaceSize ?? 8192);
  const rot = rotationMatrix(options.yawOffset ?? 0, options.pitchOffset ?? 0, options.rollOffset ?? 0);
  const identity = (options.yawOffset ?? 0) === 0 && (options.pitchOffset ?? 0) === 0 && (options.rollOffset ?? 0) === 0;

  const sample = (u: number, v: number, out: Buffer, outIdx: number): void => {
    // Bilineal con wrap horizontal
    const x = u * srcW - 0.5;
    const y = Math.min(srcH - 1, Math.max(0, v * srcH - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const x1 = (x0 + 1 + srcW) % srcW;
    const xx0 = ((x0 % srcW) + srcW) % srcW;
    const y1 = Math.min(srcH - 1, y0 + 1);
    for (let c = 0; c < 4; c++) {
      const p00 = data[(y0 * srcW + xx0) * 4 + c]!;
      const p10 = data[(y0 * srcW + x1) * 4 + c]!;
      const p01 = data[(y1 * srcW + xx0) * 4 + c]!;
      const p11 = data[(y1 * srcW + x1) * 4 + c]!;
      out[outIdx + c] = Math.round(
        p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy,
      );
    }
  };

  const levels = computePyramid(faceSize, tileSize);
  for (const face of FACES) {
    // Render de la cara al tamano maximo
    const faceBuf = Buffer.allocUnsafe(faceSize * faceSize * 4);
    for (let py = 0; py < faceSize; py++) {
      const v = (py + 0.5) / faceSize;
      for (let px = 0; px < faceSize; px++) {
        const u = (px + 0.5) / faceSize;
        let dir = faceDirection(face, u, v);
        if (!identity) dir = applyMatrix(rot, dir);
        const [eu, ev] = directionToEquirect(dir[0], dir[1], dir[2]);
        sample(eu, ev, faceBuf, (py * faceSize + px) * 4);
      }
    }
    const faceSharp = (): import("sharp").Sharp =>
      sharpFromRaw(faceBuf, faceSize, faceSize);

    for (let li = levels.length - 1; li >= 0; li--) {
      const level = levels[li]!;
      let levelSharp = faceSharp();
      if (level.size !== faceSize) {
        levelSharp = levelSharp.resize(level.size, level.size, { kernel: "lanczos3" });
      }
      const levelBuf = await levelSharp.png().toBuffer();
      for (let ty = 0; ty < level.tiles; ty++) {
        for (let tx = 0; tx < level.tiles; tx++) {
          const w = Math.min(tileSize, level.size - tx * tileSize);
          const h = Math.min(tileSize, level.size - ty * tileSize);
          let tile = sharp(levelBuf).extract({ left: tx * tileSize, top: ty * tileSize, width: w, height: h });
          tile = format === "jpeg" ? tile.jpeg({ quality }) : format === "avif" ? tile.avif({ quality }) : tile.webp({ quality });
          const buf = await tile.toBuffer();
          await onTile({ level: level.level, face, x: tx, y: ty, data: buf, key: `${level.level}/${face}/${ty}/${tx}.${ext}` });
        }
      }
    }
  }

  function sharpFromRaw(buf: Buffer, w: number, h: number): import("sharp").Sharp {
    return sharp(buf, { raw: { width: w, height: h, channels: 4 }, limitInputPixels: false });
  }

  const previewBuf = await sharp(input, { limitInputPixels: false }).resize(512, 256, { fit: "fill" }).jpeg({ quality: 60 }).toBuffer();
  const thumbnail = await sharp(input, { limitInputPixels: false }).resize(640, 384, { fit: "cover" }).jpeg({ quality: 75 }).toBuffer();
  const ogImage = await sharp(input, { limitInputPixels: false }).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();

  return {
    manifest: {
      levels: levels.length,
      tileSize,
      faceSize,
      extension: ext,
      formats: [ext],
      tileCount: totalTileCount(faceSize, tileSize),
      preview: `data:image/jpeg;base64,${previewBuf.toString("base64")}`,
    },
    preview: `data:image/jpeg;base64,${previewBuf.toString("base64")}`,
    thumbnail,
    ogImage,
    sourceWidth: width,
    sourceHeight: height,
  };
}

/**
 * Tiles piramidales de una imagen plana gigapixel (obras, documentos,
 * fachadas). Layout: {z}/{y}/{x}.{ext}, nivel 0 el mas pequeno.
 */
export async function tileFlatNode(
  input: Buffer | string,
  options: { tileSize?: number; format?: "webp" | "jpeg"; quality?: number },
  onTile: (tile: { level: number; x: number; y: number; data: Buffer; key: string }) => Promise<void> | void,
): Promise<{ levels: number; tileSize: number; width: number; height: number; extension: string }> {
  const { default: sharp } = await import("sharp");
  const tileSize = options.tileSize ?? 512;
  const format = options.format ?? "webp";
  const quality = Math.round((options.quality ?? 0.85) * 100);
  const ext = format === "jpeg" ? "jpg" : format;
  const meta = await sharp(input, { limitInputPixels: false }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const sizes: { w: number; h: number }[] = [];
  let w = width;
  let h = height;
  for (;;) {
    sizes.unshift({ w, h });
    if (w <= tileSize && h <= tileSize) break;
    w = Math.ceil(w / 2);
    h = Math.ceil(h / 2);
  }
  for (let level = 0; level < sizes.length; level++) {
    const { w: lw, h: lh } = sizes[level]!;
    const levelBuf = await sharp(input, { limitInputPixels: false }).resize(lw, lh).png().toBuffer();
    const tilesX = Math.ceil(lw / tileSize);
    const tilesY = Math.ceil(lh / tileSize);
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tw = Math.min(tileSize, lw - tx * tileSize);
        const th = Math.min(tileSize, lh - ty * tileSize);
        let tile = sharp(levelBuf).extract({ left: tx * tileSize, top: ty * tileSize, width: tw, height: th });
        tile = format === "jpeg" ? tile.jpeg({ quality }) : tile.webp({ quality });
        const buf = await tile.toBuffer();
        await onTile({ level, x: tx, y: ty, data: buf, key: `${level}/${ty}/${tx}.${ext}` });
      }
    }
  }
  return { levels: sizes.length, tileSize, width, height, extension: ext };
}
