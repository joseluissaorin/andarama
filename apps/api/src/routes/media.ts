import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { hotspots, jobs, media, mediaDerivatives, orgs, scenes } from "@ull360/db";
import { verifyUploadUrl } from "@ull360/adapters";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound, payloadTooLarge } from "../lib/errors.js";
import { newId, nowMs, parseJson } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { requireOrgRole } from "../lib/authz.js";
import { audit, getSettings, mimeAllowedForKind, sanitizeSvgServer, sniffMime } from "../lib/helpers.js";

const KINDS = ["panorama", "image", "video", "audio", "pdf", "model", "floorplan", "subtitle", "file"] as const;

const createSchema = z.object({
  orgId: z.string(),
  kind: z.enum(KINDS),
  filename: z.string().min(1).max(200),
  mime: z.string().max(100),
  bytes: z.number().int().positive(),
  folder: z.string().max(120).optional(),
  projectId: z.string().optional(),
  sha256: z.string().length(64).optional(),
  multipart: z.boolean().optional(),
});

const patchSchema = z.object({
  filename: z.string().min(1).max(200).optional(),
  folder: z.string().max(120).nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export function mediaRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "media:read");
    const db = c.get("db");
    const orgId = c.req.query("org");
    if (orgId == null) throw badRequest("Falta org");
    await requireOrgRole(db, orgId, auth.user, "reader");
    const kind = c.req.query("kind");
    const folder = c.req.query("folder");
    const projectId = c.req.query("project");
    const order = c.req.query("order") ?? "recent";
    const search = c.req.query("q")?.toLowerCase();
    let rows = await db
      .select()
      .from(media)
      .where(and(eq(media.orgId, orgId), isNull(media.deletedAt)));
    if (kind != null && kind !== "") rows = rows.filter((m) => m.kind === kind);
    if (folder != null) rows = rows.filter((m) => (m.folder ?? "") === folder);
    if (projectId != null && projectId !== "") {
      rows = projectId === "none" ? rows.filter((m) => m.projectId == null) : rows.filter((m) => m.projectId === projectId);
    }
    if (search != null && search !== "") rows = rows.filter((m) => m.filename.toLowerCase().includes(search));
    rows.sort(order === "name" ? (a, b) => a.filename.localeCompare(b.filename, "es") : (a, b) => b.createdAt - a.createdAt);
    const ids = rows.map((m) => m.id);
    const ders = ids.length > 0
      ? await db.select().from(mediaDerivatives).where(sql`${mediaDerivatives.mediaId} IN ${ids}`)
      : [];
    return c.json(
      rows.map((m) => ({
        ...m,
        exif: parseJson(m.exifJson, null),
        derivatives: ders.filter((d) => d.mediaId === m.id).map((d) => ({ kind: d.kind, manifest: parseJson(d.manifestJson, {}) })),
      })),
    );
  });

  /** Inicia una subida: valida tipo/cuota y devuelve URLs prefirmadas (§5.5). */
  r.post("/", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "media:write");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const body = createSchema.parse(await c.req.json());
    await requireOrgRole(db, body.orgId, auth.user, "collaborator");

    const settings = await getSettings(db);
    if (body.bytes > settings.maxUploadMb * 1024 * 1024) {
      throw payloadTooLarge(`El limite de subida es ${settings.maxUploadMb} MB`);
    }
    const org = (await db.select().from(orgs).where(eq(orgs.id, body.orgId)).limit(1))[0];
    if (org == null) throw notFound();
    const used = await db
      .select({ total: sql<number>`coalesce(sum(${media.bytes}), 0)` })
      .from(media)
      .where(and(eq(media.orgId, body.orgId), isNull(media.deletedAt)));
    if (Number(used[0]?.total ?? 0) + body.bytes > org.quotaBytes) {
      throw forbidden("La organizacion ha agotado su cuota de almacenamiento");
    }

    // Deduplicacion por hash de contenido (§3.2)
    if (body.sha256 != null) {
      const dup = await db
        .select()
        .from(media)
        .where(and(eq(media.orgId, body.orgId), eq(media.sha256, body.sha256), isNull(media.deletedAt)))
        .limit(1);
      if (dup[0] != null && dup[0].status === "ready") {
        return c.json({ deduplicated: true, media: dup[0] });
      }
    }

    const id = newId();
    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "bin";
    const key = `media/${body.orgId}/${id}/original.${ext}`;
    await db.insert(media).values({
      id,
      orgId: body.orgId,
      kind: body.kind,
      filename: body.filename,
      mime: body.mime,
      folder: body.folder ?? null,
      projectId: body.projectId ?? null,
      sha256: body.sha256 ?? null,
      bytes: body.bytes,
      r2Key: key,
      status: "uploading",
      createdBy: auth.user.id,
      createdAt: nowMs(),
    });
    const upload = await runtime.storage.createPresignedUpload(key, {
      contentType: body.mime,
      contentLength: body.bytes,
      multipart: body.multipart,
    });
    return c.json({ media: { id, key }, upload }, 201);
  });

  /** URLs de partes multiparte adicionales. */
  r.post("/:mediaId/parts", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const { uploadId, partNumbers } = z
      .object({ uploadId: z.string(), partNumbers: z.array(z.number().int().positive()).max(100) })
      .parse(await c.req.json());
    void db;
    const urls: Record<number, string> = {};
    for (const n of partNumbers) {
      urls[n] = await runtime.storage.presignUploadPart(row.r2Key, uploadId, n);
    }
    return c.json({ urls });
  });

  r.post("/:mediaId/complete-multipart", async (c) => {
    const auth = requireAuth(c);
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const { uploadId, parts } = z
      .object({ uploadId: z.string(), parts: z.array(z.object({ partNumber: z.number().int(), etag: z.string() })) })
      .parse(await c.req.json());
    await runtime.storage.completeMultipart(row.r2Key, uploadId, parts);
    return c.json({ ok: true });
  });

  /** Confirma la subida: verifica tamano y tipo real (magic bytes §3.2). */
  r.post("/:mediaId/complete", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const body = z
      .object({
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        duration: z.number().positive().optional(),
        exif: z.record(z.unknown()).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));

    const head = await runtime.storage.head(row.r2Key);
    if (head == null) throw badRequest("El fichero no se ha subido");
    // Sniffing de magic bytes sobre los primeros KB
    const bytes = await runtime.storage.getBytes(row.r2Key);
    if (bytes == null) throw badRequest("El fichero no se ha subido");
    const sniffed = sniffMime(bytes.slice(0, 4096));
    if (!mimeAllowedForKind(row.kind, sniffed)) {
      await runtime.storage.delete(row.r2Key);
      await db.delete(media).where(eq(media.id, row.id));
      throw badRequest(`El contenido no coincide con el tipo esperado (${row.kind}); detectado: ${sniffed ?? "desconocido"}`);
    }
    // Saneado de SVG subidos (§3.2)
    if (sniffed === "image/svg+xml") {
      const clean = sanitizeSvgServer(new TextDecoder().decode(bytes));
      await runtime.storage.put(row.r2Key, clean, { contentType: "image/svg+xml" });
    }
    await db
      .update(media)
      .set({
        status: "ready",
        bytes: head.size,
        mime: sniffed ?? row.mime,
        width: body.width ?? null,
        height: body.height ?? null,
        duration: body.duration != null ? Math.round(body.duration) : null,
        exifJson: body.exif != null ? JSON.stringify(body.exif) : null,
      })
      .where(eq(media.id, row.id));
    await audit(c, "media.upload", "media", row.id, { kind: row.kind, bytes: head.size }, row.orgId);
    return c.json({ ok: true, sniffedMime: sniffed });
  });

  /** Manifiesto de derivados generado por el tiler del navegador (§5.5 paso 3). */
  r.post("/:mediaId/derivatives", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const body = z
      .object({
        kind: z.enum(["tiles", "flat_tiles", "preview", "thumb", "og", "transcode"]),
        manifest: z.record(z.unknown()).default({}),
      })
      .parse(await c.req.json());

    const prefix =
      body.kind === "tiles" ? `tiles/${row.id}` :
      body.kind === "flat_tiles" ? `ftiles/${row.id}` :
      `derived/${row.id}/${body.kind}.jpg`;

    // Validacion del manifiesto: recuento y muestreo de tiles (§5.5)
    if (body.kind === "tiles") {
      const m = body.manifest as { levels?: number; tileSize?: number; faceSize?: number; extension?: string; tileCount?: number };
      if (m.levels == null || m.faceSize == null || m.extension == null) throw badRequest("Manifiesto de tiles incompleto");
      const checks = [
        `${prefix}/0/f/0/0.${m.extension}`,
        `${prefix}/${m.levels - 1}/f/0/0.${m.extension}`,
        `${prefix}/${m.levels - 1}/d/0/0.${m.extension}`,
      ];
      for (const key of checks) {
        if ((await runtime.storage.head(key)) == null) {
          throw badRequest(`Validacion de tiles fallida: falta ${key}`);
        }
      }
    }

    const existing = await db
      .select()
      .from(mediaDerivatives)
      .where(and(eq(mediaDerivatives.mediaId, row.id), eq(mediaDerivatives.kind, body.kind)))
      .limit(1);
    if (existing[0] != null) {
      await db
        .update(mediaDerivatives)
        .set({ manifestJson: JSON.stringify(body.manifest), r2Prefix: prefix })
        .where(eq(mediaDerivatives.id, existing[0].id));
    } else {
      await db.insert(mediaDerivatives).values({
        id: newId(),
        mediaId: row.id,
        kind: body.kind,
        r2Prefix: prefix,
        manifestJson: JSON.stringify(body.manifest),
        createdAt: nowMs(),
      });
    }
    return c.json({ ok: true, prefix }, 201);
  });

  /** URLs prefirmadas para subir tiles/derivados por lotes. */
  r.post("/:mediaId/derivative-uploads", async (c) => {
    const auth = requireAuth(c);
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const { keys } = z.object({ keys: z.array(z.string().max(300)).max(200) }).parse(await c.req.json());
    const urls: Record<string, string> = {};
    for (const rel of keys) {
      if (rel.includes("..")) throw badRequest("Clave invalida");
      const allowed =
        rel.startsWith(`tiles/${row.id}/`) ||
        rel.startsWith(`ftiles/${row.id}/`) ||
        rel.startsWith(`derived/${row.id}/`);
      if (!allowed) throw badRequest(`Clave fuera del espacio del medio: ${rel}`);
      const upload = await runtime.storage.createPresignedUpload(rel, {});
      urls[rel] = upload.url ?? "";
    }
    return c.json({ urls });
  });

  /** Encola procesado en servidor (imagenes que exceden el cliente o API §5.5 paso 4). */
  r.post("/:mediaId/process", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const jobId = newId();
    await db.insert(jobs).values({
      id: jobId,
      orgId: row.orgId,
      kind: row.kind === "video" ? "transcode" : "tile",
      payloadJson: JSON.stringify({ mediaId: row.id, key: row.r2Key }),
      status: "queued",
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    await runtime.queue.enqueue({ id: jobId, kind: row.kind === "video" ? "transcode" : "tile", payload: { mediaId: row.id }, orgId: row.orgId });
    await db.update(media).set({ status: "processing" }).where(eq(media.id, row.id));
    return c.json({ jobId }, 202);
  });

  r.get("/:mediaId/file", async (c) => {
    const auth = requireAuth(c);
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"), "reader");
    const obj = await runtime.storage.get(row.r2Key);
    if (obj == null) throw notFound();
    return new Response(obj.body as unknown as BodyInit, {
      headers: {
        "content-type": row.mime,
        "content-disposition": `inline; filename="${row.filename.replaceAll('"', "")}"`,
        "cache-control": "private, max-age=3600",
      },
    });
  });

  r.get("/:mediaId/derived/:kind", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"), "reader");
    const der = (await db
      .select()
      .from(mediaDerivatives)
      .where(and(eq(mediaDerivatives.mediaId, row.id), eq(mediaDerivatives.kind, c.req.param("kind"))))
      .limit(1))[0];
    if (der == null) throw notFound();
    const obj = await runtime.storage.get(der.r2Prefix);
    if (obj == null) throw notFound();
    return new Response(obj.body as unknown as BodyInit, {
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  });

  /** Renombrar, mover de carpeta o asignar a un tour. */
  r.patch("/:mediaId", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "media:write");
    const db = c.get("db");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));
    const body = patchSchema.parse(await c.req.json());
    const patch: Record<string, unknown> = {};
    if (body.filename != null) patch.filename = body.filename;
    if (body.folder !== undefined) patch.folder = body.folder;
    if (body.projectId !== undefined) patch.projectId = body.projectId;
    if (Object.keys(patch).length > 0) await db.update(media).set(patch).where(eq(media.id, row.id));
    await audit(c, "media.update", "media", row.id, patch, row.orgId);
    return c.json({ ok: true });
  });

  r.delete("/:mediaId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const row = await ownedMedia(c, auth, c.req.param("mediaId"));

    // Borrado seguro: un medio referenciado por escenas u hotspots no se
    // destruye (romperia tours de forma irreversible).
    const refScenes = await db
      .select({ id: scenes.id, title: scenes.title, projectId: scenes.projectId })
      .from(scenes)
      .where(
        sql`${scenes.mediaId} = ${row.id}
          OR ${scenes.metaJson} LIKE ${`%${row.id}%`}
          OR coalesce(${scenes.audioJson}, '') LIKE ${`%${row.id}%`}
          OR coalesce(${scenes.sourceJson}, '') LIKE ${`%${row.id}%`}`,
      );
    const refHotspots = await db
      .select({ id: hotspots.id, sceneId: hotspots.sceneId })
      .from(hotspots)
      .where(sql`coalesce(${hotspots.contentJson}, '') LIKE ${`%${row.id}%`}`);
    if (refScenes.length > 0 || refHotspots.length > 0) {
      throw conflict(
        `El medio esta en uso y no se puede eliminar. Escenas: ${refScenes.map((s) => s.title).join(", ") || "-"}; hotspots: ${refHotspots.length}. Quita esas referencias primero.`,
      );
    }

    await db.update(media).set({ deletedAt: nowMs() }).where(eq(media.id, row.id));
    runtime.deferred(runtime.storage.deletePrefix(`tiles/${row.id}/`));
    runtime.deferred(runtime.storage.deletePrefix(`derived/${row.id}/`));
    runtime.deferred(runtime.storage.delete(row.r2Key));
    await audit(c, "media.delete", "media", row.id, {}, row.orgId);
    return c.json({ ok: true });
  });

  return r;
}

async function ownedMedia(
  c: any,
  auth: { user: import("../lib/context.js").UserRow },
  mediaId: string,
  minRole: "reader" | "collaborator" = "collaborator",
): Promise<typeof media.$inferSelect> {
  const db = c.get("db");
  const row = (await db.select().from(media).where(eq(media.id, mediaId)).limit(1))[0];
  if (row == null || row.deletedAt != null) throw notFound("Medio no encontrado");
  await requireOrgRole(db, row.orgId, auth.user, minRole);
  return row;
}

/** Endpoint de subida directa pass-through (URLs firmadas HMAC). */
export function directUploadRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.put("/api/v1/uploads/direct", async (c) => {
    const runtime = c.get("runtime");
    const config = c.get("config");
    const url = new URL(c.req.url);
    const parsed = await verifyUploadUrl(config.secret, url.searchParams);
    if (parsed == null) throw forbidden("Firma de subida invalida o caducada");
    const body = c.req.raw.body;
    if (body == null) throw badRequest("Cuerpo vacio");
    const key = parsed.part != null ? `${parsed.key}.part-${parsed.part}` : parsed.key;
    await runtime.storage.put(key, body, {
      contentType: c.req.header("content-type"),
    });
    return c.json({ ok: true, etag: `part-${parsed.part ?? 0}` });
  });
  return r;
}
