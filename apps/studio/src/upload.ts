import { probeImage, tilePanorama, type DecodedSource } from "@andarama/tiler";
import { api, sha256Hex } from "./api";
import { Pool, deviceConcurrency, pooled } from "./pool";

/**
 * Pipeline de subida del Studio (§5.5):
 * 1. sha256 del fichero -> POST /media (dedup + URLs prefirmadas)
 * 2. subida directa (simple o multiparte reanudable)
 * 3. para panoramas: tiling en el navegador (WebWorker) y subida de tiles
 *    por lotes con URLs prefirmadas
 * 4. registro del manifiesto de derivados + confirmacion
 */

export type MediaKind = "panorama" | "image" | "video" | "audio" | "pdf" | "model" | "floorplan" | "subtitle" | "file";

export interface UploadProgress {
  phase: "hashing" | "uploading" | "tiling" | "finalizing" | "done" | "error";
  percent: number;
  detail?: string;
}

export interface UploadedMedia {
  id: string;
  deduplicated: boolean;
  clientLimited?: boolean;
}

/**
 * El porcentaje se redondea aquí, en el origen: enseñar «37.41666666666667 %»
 * queda descuidado, y arreglarlo en cada sitio donde se pinta es garantía de
 * olvidarse de uno.
 */
function pct(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

export function detectKind(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "pdf";
  if (name.endsWith(".glb") || name.endsWith(".gltf") || name.endsWith(".obj") || name.endsWith(".stl")) return "model";
  if (name.endsWith(".vtt") || name.endsWith(".srt")) return "subtitle";
  if (file.type.startsWith("image/")) return "image";
  return "file";
}

/** Extraccion minima de EXIF (orientacion + GPS) de un JPEG. */
export async function extractExif(file: File): Promise<Record<string, unknown> | null> {
  try {
    const head = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (head.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 < head.byteLength) {
      const marker = head.getUint16(offset);
      const size = head.getUint16(offset + 2);
      if (marker === 0xffe1) {
        // APP1 EXIF
        const tiffStart = offset + 10;
        if (head.getUint32(offset + 4) !== 0x45786966) return null; // "Exif"
        const little = head.getUint16(tiffStart) === 0x4949;
        const get16 = (o: number): number => head.getUint16(o, little);
        const get32 = (o: number): number => head.getUint32(o, little);
        const ifd0 = tiffStart + get32(tiffStart + 4);
        const out: Record<string, unknown> = {};
        let gpsIfd = 0;
        const entries = get16(ifd0);
        for (let i = 0; i < entries; i++) {
          const entry = ifd0 + 2 + i * 12;
          const tag = get16(entry);
          if (tag === 0x8825) gpsIfd = tiffStart + get32(entry + 8);
          if (tag === 0x0112) out.orientation = get16(entry + 8);
        }
        if (gpsIfd > 0 && gpsIfd + 2 < head.byteLength) {
          const gpsEntries = get16(gpsIfd);
          let latRef = "N";
          let lngRef = "E";
          let lat: number | null = null;
          let lng: number | null = null;
          const rational = (o: number): number => {
            const valOff = tiffStart + get32(o);
            if (valOff + 24 > head.byteLength) return 0;
            const d = (idx: number): number => get32(valOff + idx * 8) / Math.max(1, get32(valOff + idx * 8 + 4));
            return d(0) + d(1) / 60 + d(2) / 3600;
          };
          for (let i = 0; i < gpsEntries; i++) {
            const entry = gpsIfd + 2 + i * 12;
            const tag = get16(entry);
            if (tag === 1) latRef = String.fromCharCode(head.getUint8(entry + 8));
            if (tag === 3) lngRef = String.fromCharCode(head.getUint8(entry + 8));
            if (tag === 2) lat = rational(entry + 8);
            if (tag === 4) lng = rational(entry + 8);
          }
          if (lat != null && lng != null && (lat !== 0 || lng !== 0)) {
            out.gps = { lat: latRef === "S" ? -lat : lat, lng: lngRef === "W" ? -lng : lng };
          }
        }
        return Object.keys(out).length > 0 ? out : null;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

async function putWithRetry(url: string, body: Blob, contentType?: string, tries = 3): Promise<string | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        body,
        headers: contentType != null ? { "content-type": contentType } : undefined,
      });
      if (res.ok) return res.headers.get("etag");
    } catch {
      // reintento
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`Subida fallida: ${url.slice(0, 80)}`);
}

export async function uploadMedia(
  orgId: string,
  file: File,
  kindOverride: MediaKind | null,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadedMedia> {
  onProgress({ phase: "hashing", percent: 2 });
  // El resumen y la lectura del EXIF no dependen el uno del otro
  const [hash, exif] = await Promise.all([sha256Hex(file), file.type === "image/jpeg" ? extractExif(file) : Promise.resolve(null)]);
  let kind = kindOverride ?? detectKind(file);
  // Una sola decodificación para todo: detectar el panorama, medirlo, sacar los
  // derivados y alimentar el troceador.
  let decoded: DecodedSource | null = null;
  if (kind === "image" || kind === "panorama" || kind === "floorplan") {
    try {
      decoded = await probeImage(file);
      if (kindOverride == null && decoded.isPanorama) kind = "panorama";
    } catch {
      // no decodificable como imagen: se tratara como fichero
    }
  }

  const created = await api<{
    deduplicated?: boolean;
    media: { id: string; key: string };
    upload?: { kind: "simple" | "multipart"; url?: string; uploadId?: string; partSize?: number; headers?: Record<string, string> };
  }>("/media", {
    method: "POST",
    body: {
      orgId,
      kind,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      bytes: file.size,
      sha256: hash,
      multipart: file.size > 100 * 1024 * 1024,
    },
  });
  if (created.deduplicated === true) {
    decoded?.bitmap.close();
    onProgress({ phase: "done", percent: 100 });
    return { id: (created as unknown as { media: { id: string } }).media.id, deduplicated: true };
  }
  const mediaId = created.media.id;
  const upload = created.upload!;
  const lanes = deviceConcurrency().network;

  onProgress({ phase: "uploading", percent: 8 });
  if (upload.kind === "simple") {
    await putWithRetry(upload.url!, file, file.type);
  } else {
    // Multiparte reanudable. Las partes van en paralelo: en fila india, un
    // vídeo de medio giga usaba una sola conexión y tardaba lo que le diera la
    // gana al servidor, no lo que da la línea.
    const partSize = upload.partSize ?? 10 * 1024 * 1024;
    const totalParts = Math.ceil(file.size / partSize);
    const parts: { partNumber: number; etag: string }[] = [];
    let subidas = 0;
    for (let batchStart = 1; batchStart <= totalParts; batchStart += 20) {
      const nums = Array.from({ length: Math.min(20, totalParts - batchStart + 1) }, (_, i) => batchStart + i);
      const { urls } = await api<{ urls: Record<number, string> }>(`/media/${mediaId}/parts`, {
        method: "POST",
        body: { uploadId: upload.uploadId, partNumbers: nums },
      });
      const done = await pooled(
        nums.map((n) => async () => {
          const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
          const etag = await putWithRetry(urls[n]!, blob);
          subidas++;
          onProgress({ phase: "uploading", percent: pct(8 + (subidas / totalParts) * 40) });
          return { partNumber: n, etag: etag?.replaceAll('"', "") ?? `part-${n}` };
        }),
        lanes,
      );
      parts.push(...done);
    }
    parts.sort((a, b) => a.partNumber - b.partNumber);
    await api(`/media/${mediaId}/complete-multipart`, { method: "POST", body: { uploadId: upload.uploadId, parts } });
  }

  // Tiling en navegador para panoramas (§3.3)
  let clientLimited = false;
  if (kind === "panorama") {
    const result = await tileAndUpload(mediaId, file, decoded, lanes, onProgress);
    decoded = null;
    clientLimited = result.clientLimited;
    await api(`/media/${mediaId}/complete`, {
      method: "POST",
      body: { width: result.sourceWidth, height: result.sourceHeight, exif: exif ?? undefined },
    });
    if (clientLimited) {
      // Resolucion completa via contenedor de procesado
      await api(`/media/${mediaId}/process`, { method: "POST" }).catch(() => {});
    }
  } else {
    onProgress({ phase: "finalizing", percent: 92 });
    // Las medidas salen de la decodificación que ya se hizo al abrirla
    const width: number | undefined = decoded?.width;
    const height: number | undefined = decoded?.height;
    let duration: number | undefined;
    decoded?.bitmap.close();
    decoded = null;
    if (kind === "video" || kind === "audio") {
      duration = await mediaDuration(file).catch(() => undefined);
    }
    await api(`/media/${mediaId}/complete`, {
      method: "POST",
      body: { width, height, duration, exif: exif ?? undefined },
    });
  }
  onProgress({ phase: "done", percent: 100 });
  return { id: mediaId, deduplicated: false, clientLimited };
}

function mediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => reject(new Error("No se pudo leer la duración"));
    el.src = URL.createObjectURL(file);
  });
}

/**
 * Trocea el panorama y sube las teselas, la miniatura y la imagen social, y
 * registra el manifiesto. Lo usan tanto la subida inicial como la regeneración
 * de un medio que ya está en la biblioteca.
 */
async function tileAndUpload(
  mediaId: string,
  file: Blob,
  decoded: DecodedSource | null,
  lanes: number,
  onProgress: (p: UploadProgress) => void,
): Promise<{ clientLimited: boolean; sourceWidth: number; sourceHeight: number }> {
  onProgress({ phase: "tiling", percent: 50 });
  // Las teselas se suben mientras se generan, pero con la mano puesta: un
  // puñado de peticiones a la vez y como mucho dos lotes esperando. Antes se
  // soltaban de cien en cien y se acumulaban en memoria sin freno.
  const pool = new Pool(2);
  let urlBatch: { key: string; blob: Blob }[] = [];
  const flushBatch = async (): Promise<void> => {
    if (urlBatch.length === 0) return;
    const batch = urlBatch;
    urlBatch = [];
    await pool.push(async () => {
      const { urls } = await api<{ urls: Record<string, string> }>(`/media/${mediaId}/derivative-uploads`, {
        method: "POST",
        body: { keys: batch.map((b) => b.key) },
      });
      await pooled(
        batch.map(({ key, blob }) => async () => {
          const url = urls[key];
          if (url != null && url !== "") await putWithRetry(url, blob);
        }),
        lanes,
      );
    });
  };
  const result = await tilePanorama(
    file,
    { decoded: decoded ?? undefined },
    {
      onTile: (tile) => {
        const key = `tiles/${mediaId}/${tile.level}/${tile.face}/${tile.y}/${tile.x}.${tile.blob.type === "image/jpeg" ? "jpg" : tile.blob.type.split("/")[1]}`;
        urlBatch.push({ key, blob: tile.blob });
        // Lotes de 60: bastante para amortizar la petición de URLs y poco para
        // no tener medio panorama en memoria.
        return urlBatch.length >= 60 ? flushBatch() : undefined;
      },
      onProgress: (done, total) => {
        onProgress({ phase: "tiling", percent: pct(50 + (done / total) * 40), detail: `${done}/${total}` });
      },
    },
  );
  await flushBatch();
  await pool.drain();
  const { urls } = await api<{ urls: Record<string, string> }>(`/media/${mediaId}/derivative-uploads`, {
    method: "POST",
    body: { keys: [`derived/${mediaId}/thumb.jpg`, `derived/${mediaId}/og.jpg`] },
  });
  await putWithRetry(urls[`derived/${mediaId}/thumb.jpg`]!, result.thumbnail, "image/jpeg");
  await putWithRetry(urls[`derived/${mediaId}/og.jpg`]!, result.ogImage, "image/jpeg");
  onProgress({ phase: "finalizing", percent: 92 });
  await api(`/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "tiles", manifest: result.manifest } });
  await api(`/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "thumb", manifest: {} } });
  await api(`/media/${mediaId}/derivatives`, { method: "POST", body: { kind: "og", manifest: {} } });
  return { clientLimited: result.clientLimited, sourceWidth: result.sourceWidth, sourceHeight: result.sourceHeight };
}

/**
 * Vuelve a trocear un panorama que ya está subido, a partir del fichero
 * original guardado.
 *
 * Hace falta porque una tarjeta gráfica que se queda sin memoria produce
 * teselas **negras** sin dar ningún error: la foto se ve en la biblioteca —la
 * miniatura se hace aparte— y en el visor no se ve nada. Con esto se arregla
 * sin volver a subir nada.
 */
export async function retileMedia(mediaId: string, onProgress: (p: UploadProgress) => void): Promise<{ clientLimited: boolean }> {
  onProgress({ phase: "hashing", percent: 2 });
  const res = await fetch(`/api/v1/media/${mediaId}/file`);
  if (!res.ok) throw new Error("No se pudo leer el fichero original");
  const blob = await res.blob();
  onProgress({ phase: "tiling", percent: 20 });
  const decoded = await probeImage(blob);
  const result = await tileAndUpload(mediaId, blob, decoded, deviceConcurrency().network, onProgress);
  await api(`/media/${mediaId}/complete`, {
    method: "POST",
    body: { width: result.sourceWidth, height: result.sourceHeight },
  });
  onProgress({ phase: "done", percent: 100 });
  return { clientLimited: result.clientLimited };
}
