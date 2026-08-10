import { eq } from "drizzle-orm";
import { jobs, media, mediaDerivatives } from "@andarama/db";
import type { PlatformRuntime } from "@andarama/adapters";
import type { Db } from "./lib/context.js";
import { newId, nowMs, parseJson } from "./lib/util.js";

/**
 * Procesador de trabajos (§5.5 paso 4): tiling/transcodificacion/export en
 * servidor. En self-host corre en el propio proceso; en Cloudflare lo
 * ejecuta el contenedor de procesado opcional (misma logica en Node). El
 * Worker en si no puede trocear imagenes (limites de CPU): si no hay
 * contenedor, deja el trabajo marcado para el runner externo.
 */

export interface JobContext {
  db: Db;
  runtime: PlatformRuntime;
  /** true si este proceso puede ejecutar trabajos pesados (Node + sharp). */
  heavyCapable: boolean;
}

export async function processJob(ctx: JobContext, jobId: string): Promise<void> {
  const { db } = ctx;
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (job == null || job.status === "done") return;
  if (!ctx.heavyCapable) {
    await db
      .update(jobs)
      .set({ status: "queued", error: "Pendiente del contenedor de procesado (el Worker no ejecuta trabajos pesados)", updatedAt: nowMs() })
      .where(eq(jobs.id, jobId));
    return;
  }
  await db.update(jobs).set({ status: "running", attempts: job.attempts + 1, updatedAt: nowMs() }).where(eq(jobs.id, jobId));
  try {
    const payload = parseJson<Record<string, unknown>>(job.payloadJson, {});
    switch (job.kind) {
      case "tile":
        await tileJob(ctx, String(payload.mediaId ?? ""));
        break;
      case "transcode":
        await transcodeJob(ctx, String(payload.mediaId ?? ""));
        break;
      default:
        throw new Error(`Tipo de trabajo desconocido: ${job.kind}`);
    }
    await db.update(jobs).set({ status: "done", error: null, updatedAt: nowMs() }).where(eq(jobs.id, jobId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[jobs] ${jobId} (${job.kind}) fallo:`, message);
    await db
      .update(jobs)
      .set({ status: job.attempts + 1 >= 3 ? "error" : "queued", error: message, updatedAt: nowMs() })
      .where(eq(jobs.id, jobId));
  }
}

/**
 * Import dinamico con especificador no literal: evita que el bundler del
 * Worker intente empaquetar modulos solo-Node (sharp, ws...). Estos caminos
 * solo se ejecutan cuando heavyCapable=true (proceso Node/contenedor).
 */
async function importNodeOnly<T>(specifier: string): Promise<T> {
  return (await import(/* @vite-ignore */ specifier)) as T;
}

async function tileJob(ctx: JobContext, mediaId: string): Promise<void> {
  const { db, runtime } = ctx;
  const row = (await db.select().from(media).where(eq(media.id, mediaId)).limit(1))[0];
  if (row == null) throw new Error("Medio no encontrado");
  const original = await runtime.storage.getBytes(row.r2Key);
  if (original == null) throw new Error("Original no disponible en almacenamiento");
  const { tilePanoramaNode } = await importNodeOnly<typeof import("@andarama/tiler/node")>("@andarama/tiler/node");
  const buffer = Buffer.from(original);
  const result = await tilePanoramaNode(buffer, { format: "webp" }, async (tile) => {
    await runtime.storage.put(`tiles/${mediaId}/${tile.key}`, tile.data, {
      contentType: tile.key.endsWith(".webp") ? "image/webp" : "image/jpeg",
    });
  });
  await runtime.storage.put(`derived/${mediaId}/thumb.jpg`, result.thumbnail, { contentType: "image/jpeg" });
  await runtime.storage.put(`derived/${mediaId}/og.jpg`, result.ogImage, { contentType: "image/jpeg" });

  const upsert = async (kind: string, prefix: string, manifest: Record<string, unknown>): Promise<void> => {
    const { and } = await import("drizzle-orm");
    const existing = (await db
      .select()
      .from(mediaDerivatives)
      .where(and(eq(mediaDerivatives.mediaId, mediaId), eq(mediaDerivatives.kind, kind)))
      .limit(1))[0];
    if (existing != null) {
      await db.update(mediaDerivatives).set({ r2Prefix: prefix, manifestJson: JSON.stringify(manifest) }).where(eq(mediaDerivatives.id, existing.id));
    } else {
      await db.insert(mediaDerivatives).values({
        id: newId(),
        mediaId,
        kind,
        r2Prefix: prefix,
        manifestJson: JSON.stringify(manifest),
        createdAt: nowMs(),
      });
    }
  };
  await upsert("tiles", `tiles/${mediaId}`, result.manifest as unknown as Record<string, unknown>);
  await upsert("thumb", `derived/${mediaId}/thumb.jpg`, {});
  await upsert("og", `derived/${mediaId}/og.jpg`, {});
  await db
    .update(media)
    .set({ status: "ready", width: result.sourceWidth, height: result.sourceHeight })
    .where(eq(media.id, mediaId));
}

/**
 * Transcodificacion self-host opcional con ffmpeg local (§3.3). Si no hay
 * ffmpeg instalado, el video se acepta tal cual (validado en subida) y se
 * documentan los preajustes recomendados en la guia.
 */
async function transcodeJob(ctx: JobContext, mediaId: string): Promise<void> {
  const { db, runtime } = ctx;
  const row = (await db.select().from(media).where(eq(media.id, mediaId)).limit(1))[0];
  if (row == null) throw new Error("Medio no encontrado");
  const { spawn } = await import("node:child_process");
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const available = await new Promise<boolean>((resolve) => {
    const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  if (!available) {
    await db.update(media).set({ status: "ready" }).where(eq(media.id, mediaId));
    return;
  }
  const original = await runtime.storage.getBytes(row.r2Key);
  if (original == null) throw new Error("Original no disponible");
  const dir = await mkdtemp(join(tmpdir(), "anda-transcode-"));
  const inPath = join(dir, "in");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(inPath, original);
    await new Promise<void>((resolve, reject) => {
      const p = spawn("ffmpeg", [
        "-y", "-i", inPath,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "160k",
        outPath,
      ]);
      p.on("error", reject);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg salio con ${code}`))));
    });
    const out = await readFile(outPath);
    const newKey = row.r2Key.replace(/\.[^.]+$/, "") + ".transcoded.mp4";
    await runtime.storage.put(newKey, out, { contentType: "video/mp4" });
    await db.update(media).set({ status: "ready", r2Key: newKey, mime: "video/mp4", bytes: out.length }).where(eq(media.id, mediaId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
