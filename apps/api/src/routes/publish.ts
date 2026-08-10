import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { projects, publications, versions, webhooks } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs, parseJson, slugify } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";
import { audit } from "../lib/helpers.js";
import { compileProject } from "../compiler.js";
import { hmacSign } from "@andarama/adapters";

/**
 * Publicar = congelar una version inmutable en el almacenamiento (§5.4):
 *   pub/{slug}/{n}/tour.json  - tour compilado
 *   pub/{slug}/{n}/map.json   - mapa de assets (ruta relativa -> clave)
 *   pub/{slug}/current.json   - puntero: version activa + proteccion
 * El servido de /t/{slug} lee SOLO del almacenamiento (nunca de la DB).
 */

export interface PublicationPointer {
  version: number;
  visibility: "public" | "unlisted" | "password" | "org" | "domains";
  passwordHash?: string;
  domains?: string[];
  publishAt?: number;
  expireAt?: number;
  title: string;
  ogImage?: string;
  description?: string;
  defaultLang: string;
  analytics: boolean;
  turnstile?: boolean;
}

const publishSchema = z.object({
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).optional(),
  visibility: z.enum(["public", "unlisted", "password", "org", "domains"]).default("public"),
  password: z.string().min(4).max(100).optional(),
  domains: z.array(z.string().max(200)).optional(),
  customDomain: z
    .string()
    .max(200)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, "Dominio no válido")
    .nullable()
    .optional(),
  publishAt: z.number().optional(),
  expireAt: z.number().optional(),
  note: z.string().max(500).optional(),
  /** Portada para compartir capturada por el editor: la escena inicial con la
   *  proyección real del visor, como data URL JPEG. */
  shareImage: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .max(2_000_000)
    .optional(),
});

export function publishRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/:projectId/publish", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "publish");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canPublish) throw forbidden("Tu rol no permite publicar");
    const body = publishSchema.parse(await c.req.json().catch(() => ({})));
    if (body.visibility === "password" && body.password == null) {
      const existing = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
      if (existing?.passwordHash == null) throw badRequest("La visibilidad por contraseña requiere una contraseña");
    }

    const compiled = await compileProject(db, access.project.id);
    const errors = compiled.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      throw badRequest("El tour tiene errores que impiden publicar", { issues: errors });
    }

    // Slug de publicacion
    const existingPub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    let slug = body.slug ?? existingPub?.slug ?? slugify(access.project.title);
    const slugOwner = (await db.select().from(publications).where(eq(publications.slug, slug)).limit(1))[0];
    if (slugOwner != null && slugOwner.projectId !== access.project.id) {
      if (body.slug != null) throw conflict("Ese slug ya esta en uso");
      slug = `${slug}-${newId(6).toLowerCase()}`;
    }

    // Numero de version
    const lastVersion = (await db
      .select()
      .from(versions)
      .where(eq(versions.projectId, access.project.id))
      .orderBy(desc(versions.number))
      .limit(1))[0];
    const number = (lastVersion?.number ?? 0) + 1;

    // Congelar artefactos
    const tourKey = `pub/${slug}/${number}/tour.json`;
    const mapKey = `pub/${slug}/${number}/map.json`;
    await runtime.storage.put(tourKey, JSON.stringify(compiled.tour), { contentType: "application/json" });
    await runtime.storage.put(mapKey, JSON.stringify({ assets: compiled.assets, prefixes: compiled.prefixes }), {
      contentType: "application/json",
    });
    if (body.shareImage != null) {
      const binario = atob(body.shareImage.split(",", 2)[1]!);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      await runtime.storage.put(`pub/${slug}/${number}/share.jpg`, bytes, { contentType: "image/jpeg" });
    }

    const versionId = newId();
    await db.insert(versions).values({
      id: versionId,
      projectId: access.project.id,
      number,
      tourJsonKey: tourKey,
      createdBy: auth.user.id,
      note: body.note ?? null,
      kind: "publish",
      createdAt: nowMs(),
    });

    const passwordHash =
      body.password != null ? await runtime.passwords.hash(body.password) : (existingPub?.passwordHash ?? null);

    // Dominio propio: unicidad + mapeo host->slug en KV para resolucion rapida
    const customDomain =
      body.customDomain === undefined ? (existingPub?.customDomain ?? null) : body.customDomain?.toLowerCase() ?? null;
    if (customDomain != null) {
      const domainOwner = (await db.select().from(publications).where(eq(publications.customDomain, customDomain)).limit(1))[0];
      if (domainOwner != null && domainOwner.projectId !== access.project.id) {
        throw conflict("Ese dominio ya está en uso por otra publicación");
      }
    }
    if (existingPub?.customDomain != null && existingPub.customDomain !== customDomain) {
      await runtime.kv.delete(`domain:${existingPub.customDomain}`);
    }
    if (customDomain != null) {
      await runtime.kv.put(`domain:${customDomain}`, slug);
    }

    const settings = parseJson<Record<string, unknown>>(access.project.settingsJson, {});
    const pointer: PublicationPointer = {
      version: number,
      visibility: body.visibility,
      passwordHash: body.visibility === "password" ? (passwordHash ?? undefined) : undefined,
      domains: body.visibility === "domains" ? (body.domains ?? []) : undefined,
      publishAt: body.publishAt,
      expireAt: body.expireAt,
      title: access.project.title,
      description: typeof settings.description === "string" ? settings.description : undefined,
      ogImage: compiled.tour.meta.ogImage,
      defaultLang: compiled.tour.meta.defaultLang,
      analytics: (compiled.tour.analytics?.enabled ?? true) !== false,
      turnstile: c.get("config").turnstileSiteKey != null,
    };
    await runtime.storage.put(`pub/${slug}/current.json`, JSON.stringify(pointer), { contentType: "application/json" });
    // Invalidar cache KV del puntero
    await runtime.kv.delete(`pub:${slug}`);

    if (existingPub != null) {
      await db
        .update(publications)
        .set({
          versionId,
          slug,
          visibility: body.visibility,
          passwordHash,
          domainsJson: body.domains != null ? JSON.stringify(body.domains) : existingPub.domainsJson,
          customDomain,
          publishAt: body.publishAt ?? null,
          expireAt: body.expireAt ?? null,
          publishedAt: nowMs(),
          publishedBy: auth.user.id,
        })
        .where(eq(publications.projectId, access.project.id));
    } else {
      await db.insert(publications).values({
        projectId: access.project.id,
        versionId,
        slug,
        visibility: body.visibility,
        passwordHash,
        domainsJson: body.domains != null ? JSON.stringify(body.domains) : null,
        customDomain,
        publishAt: body.publishAt ?? null,
        expireAt: body.expireAt ?? null,
        publishedAt: nowMs(),
        publishedBy: auth.user.id,
      });
    }
    await db.update(projects).set({ status: "published", updatedAt: nowMs() }).where(eq(projects.id, access.project.id));
    await audit(c, "project.publish", "project", access.project.id, { slug, version: number }, access.project.orgId);
    await fireWebhooks(c, access.project.orgId, access.project.id, "publish", { slug, version: number });

    return c.json({
      slug,
      version: number,
      url: `${c.get("config").publicUrl}/t/${slug}`,
      warnings: compiled.issues.filter((i) => i.severity === "warning"),
    }, 201);
  });

  r.post("/:projectId/unpublish", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "publish");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canPublish) throw forbidden();
    const pub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    if (pub == null) throw notFound("El proyecto no está publicado");
    await runtime.storage.delete(`pub/${pub.slug}/current.json`);
    await runtime.kv.delete(`pub:${pub.slug}`);
    if (pub.customDomain != null) await runtime.kv.delete(`domain:${pub.customDomain}`);
    await db.delete(publications).where(eq(publications.projectId, access.project.id));
    await db.update(projects).set({ status: "draft", updatedAt: nowMs() }).where(eq(projects.id, access.project.id));
    await audit(c, "project.unpublish", "project", access.project.id, { slug: pub.slug }, access.project.orgId);
    await fireWebhooks(c, access.project.orgId, access.project.id, "unpublish", { slug: pub.slug });
    return c.json({ ok: true });
  });

  // ------- Versiones (§3.5 historial) -------

  r.get("/:projectId/versions", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(versions)
      .where(eq(versions.projectId, access.project.id))
      .orderBy(desc(versions.number));
    return c.json(rows);
  });

  /** Instantanea manual con nombre. */
  r.post("/:projectId/versions", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden();
    const { note } = z.object({ note: z.string().max(500).optional() }).parse(await c.req.json().catch(() => ({})));
    const compiled = await compileProject(db, access.project.id);
    const last = (await db
      .select()
      .from(versions)
      .where(eq(versions.projectId, access.project.id))
      .orderBy(desc(versions.number))
      .limit(1))[0];
    const number = (last?.number ?? 0) + 1;
    const key = `snapshots/${access.project.id}/${number}/tour.json`;
    await runtime.storage.put(key, JSON.stringify(compiled.tour), { contentType: "application/json" });
    const id = newId();
    await db.insert(versions).values({
      id,
      projectId: access.project.id,
      number,
      tourJsonKey: key,
      createdBy: auth.user.id,
      note: note ?? null,
      kind: "manual",
      createdAt: nowMs(),
    });
    return c.json({ id, number }, 201);
  });

  /** Contenido tour.json de una version (para diff en el Studio). */
  r.get("/:projectId/versions/:number/tour", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const number = parseInt(c.req.param("number"), 10);
    const row = (await db
      .select()
      .from(versions)
      .where(and(eq(versions.projectId, access.project.id), eq(versions.number, number)))
      .limit(1))[0];
    if (row == null) throw notFound();
    const bytes = await runtime.storage.getBytes(row.tourJsonKey);
    if (bytes == null) throw notFound("El artefacto de la version no existe");
    return new Response(bytes as unknown as BodyInit, { headers: { "content-type": "application/json" } });
  });

  /** Republicar una version anterior (restaurar §3.6). */
  r.post("/:projectId/versions/:number/restore", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "publish");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canPublish) throw forbidden();
    const number = parseInt(c.req.param("number"), 10);
    const row = (await db
      .select()
      .from(versions)
      .where(and(eq(versions.projectId, access.project.id), eq(versions.number, number)))
      .limit(1))[0];
    if (row == null) throw notFound();
    const pub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    if (pub == null) throw badRequest("El proyecto no está publicado; publica primero");
    // El artefacto de la version debe estar bajo pub/{slug}/ para poder servirse
    if (!row.tourJsonKey.startsWith(`pub/${pub.slug}/`)) {
      throw badRequest("Solo se pueden restaurar versiones publicadas de este slug");
    }
    const currentRaw = await runtime.storage.getBytes(`pub/${pub.slug}/current.json`);
    const pointer = currentRaw != null ? (JSON.parse(new TextDecoder().decode(currentRaw)) as PublicationPointer) : null;
    if (pointer == null) throw badRequest("Falta el puntero de publicación");
    pointer.version = number;
    await runtime.storage.put(`pub/${pub.slug}/current.json`, JSON.stringify(pointer), { contentType: "application/json" });
    await runtime.kv.delete(`pub:${pub.slug}`);
    await db.update(publications).set({ versionId: row.id, publishedAt: nowMs(), publishedBy: auth.user.id }).where(eq(publications.projectId, access.project.id));
    await audit(c, "project.restore_version", "project", access.project.id, { version: number }, access.project.orgId);
    return c.json({ ok: true, version: number });
  });

  // ------- Export de parametros (el ZIP se arma en cliente §3.6) -------

  r.post("/:projectId/export", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const compiled = await compileProject(db, access.project.id);
    const errors = compiled.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) throw badRequest("El tour tiene errores", { issues: errors });
    // Enumerar assets: claves directas + expansion de prefijos (tiles)
    const assetPaths: { rel: string; key: string }[] = Object.entries(compiled.assets).map(([rel, key]) => ({ rel, key }));
    for (const [relPrefix, storagePrefix] of Object.entries(compiled.prefixes)) {
      let cursor: string | undefined;
      for (;;) {
        const page = await runtime.storage.list(storagePrefix, { limit: 1000, cursor });
        for (const obj of page.objects) {
          assetPaths.push({ rel: `${relPrefix}${obj.key.slice(storagePrefix.length)}`, key: obj.key });
        }
        if (!page.truncated || page.cursor == null) break;
        cursor = page.cursor;
      }
    }
    await runtime.kv.put(
      `preview-map:${access.project.id}`,
      JSON.stringify({ assets: compiled.assets, prefixes: compiled.prefixes }),
      { ttlSeconds: 3600 },
    );
    return c.json({
      tour: compiled.tour,
      assets: assetPaths,
      warnings: compiled.issues.filter((i) => i.severity === "warning"),
    });
  });

  // ------- Portabilidad .andarama (§3.7) -------

  r.get("/:projectId/export.andarama", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const { scenes, hotspots, translations } = await import("@andarama/db");
    const { inArray } = await import("drizzle-orm");
    const sceneRows = await db.select().from(scenes).where(eq(scenes.projectId, access.project.id));
    const sceneIds = sceneRows.map((s) => s.id);
    const hotspotRows = sceneIds.length > 0 ? await db.select().from(hotspots).where(inArray(hotspots.sceneId, sceneIds)) : [];
    const translationRows = await db.select().from(translations).where(eq(translations.projectId, access.project.id));
    const doc = {
      format: "anda-project",
      version: 1,
      exportedAt: nowMs(),
      project: {
        title: access.project.title,
        slug: access.project.slug,
        settingsJson: access.project.settingsJson,
        tagsJson: access.project.tagsJson,
      },
      scenes: sceneRows,
      hotspots: hotspotRows,
      translations: translationRows,
    };
    return new Response(JSON.stringify(doc, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${access.project.slug}.andarama"`,
      },
    });
  });

  r.post("/import.andarama", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.query("org");
    if (orgId == null) throw badRequest("Falta org");
    const { requireOrgRole } = await import("../lib/authz.js");
    await requireOrgRole(db, orgId, auth.user, "editor");
    const doc = z
      .object({
        format: z.literal("anda-project"),
        version: z.number(),
        project: z.object({ title: z.string(), settingsJson: z.string(), tagsJson: z.string().optional() }),
        scenes: z.array(z.record(z.unknown())),
        hotspots: z.array(z.record(z.unknown())),
        // Los documentos anteriores a la unificacion del grafo traen
        // conexiones sueltas: se aceptan y se ignoran.
        connections: z.array(z.record(z.unknown())).optional(),
        translations: z.array(z.record(z.unknown())),
      })
      .parse(await c.req.json());
    const projectId = newId();
    let slug = slugify(doc.project.title);
    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.slug, slug)))
      .limit(1);
    if (taken.length > 0) slug = `${slug}-${newId(6).toLowerCase()}`;
    await db.insert(projects).values({
      id: projectId,
      orgId,
      title: doc.project.title,
      slug,
      tagsJson: doc.project.tagsJson ?? "[]",
      settingsJson: doc.project.settingsJson,
      createdBy: auth.user.id,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    const { scenes, hotspots, translations } = await import("@andarama/db");
    const sceneIdMap = new Map<string, string>();
    for (const s of doc.scenes) sceneIdMap.set(s.id as string, newId());
    for (const s of doc.scenes) {
      await db.insert(scenes).values({ ...(s as typeof scenes.$inferInsert), id: sceneIdMap.get(s.id as string)!, projectId, mediaId: null, sourceJson: null });
    }
    const hsIdMap = new Map<string, string>();
    for (const h of doc.hotspots) hsIdMap.set(h.id as string, newId());
    for (const h of doc.hotspots) {
      const sceneId = sceneIdMap.get(h.sceneId as string);
      if (sceneId == null) continue;
      let content = String(h.contentJson ?? "{}");
      for (const [oldId, newSceneId] of sceneIdMap) content = content.replaceAll(`"${oldId}"`, `"${newSceneId}"`);
      await db.insert(hotspots).values({ ...(h as typeof hotspots.$inferInsert), id: hsIdMap.get(h.id as string)!, sceneId, contentJson: content });
    }
    for (const t of doc.translations) {
      const entityId =
        t.entity === "scene"
          ? sceneIdMap.get(t.entityId as string)
          : t.entity === "hotspot"
            ? hsIdMap.get(t.entityId as string)
            : (t.entityId as string);
      if (entityId == null) continue;
      await db.insert(translations).values({ ...(t as typeof translations.$inferInsert), id: newId(), projectId, entityId });
    }
    await audit(c, "project.import", "project", projectId, {}, orgId);
    return c.json({ id: projectId, slug, mediaNote: "Los medios no se incluyen en .andarama; vuelve a subirlos o sincroniza el almacenamiento" }, 201);
  });

  return r;
}

async function fireWebhooks(
  c: { get: (k: any) => any },
  orgId: string,
  projectId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = c.get("db");
  const runtime = c.get("runtime");
  const rows = await db.select().from(webhooks).where(eq(webhooks.active, true));
  const relevant = (rows as (typeof webhooks.$inferSelect)[]).filter(
    (w) =>
      (w.orgId == null || w.orgId === orgId) &&
      (w.projectId == null || w.projectId === projectId) &&
      parseJson<string[]>(w.eventsJson, []).includes(event),
  );
  for (const hook of relevant) {
    const body = JSON.stringify({ event, projectId, at: nowMs(), ...payload });
    runtime.deferred(
      (async () => {
        const signature = hook.secret != null ? await hmacSign(hook.secret, body) : undefined;
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(signature != null ? { "x-anda-signature": signature } : {}),
          },
          body,
        }).catch((err) => console.error(`[webhook] ${hook.url} fallo:`, err));
      })(),
    );
  }
}
