import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import {
  hotspots as hotspotsTable,
  projectMembers,
  projects,
  publications,
  scenes as scenesTable,
  translations as translationsTable,
  users,
} from "@ull360/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs, parseJson, slugify } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { listAccessibleProjects, projectAccess, requireOrgRole } from "../lib/authz.js";
import { audit, getSettings } from "../lib/helpers.js";
import { resolveNewTourSettings, type OrgDefaults, type UserPrefs } from "../lib/defaults.js";
import { compileProject } from "../compiler.js";

export function projectRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  // Listado por organizacion (con carpetas/etiquetas/plantillas/papelera)
  r.get("/", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const orgId = c.req.query("org");
    if (orgId == null) throw badRequest("Falta el parámetro org");
    const trashed = c.req.query("trashed") === "1";
    if (trashed) {
      await requireOrgRole(db, orgId, auth.user, "editor");
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.orgId, orgId), isNotNull(projects.deletedAt)));
      return c.json(rows.map((row) => projectSummary(row)));
    }
    const rows = await listAccessibleProjects(db, orgId, auth.user);
    const pubs = await db.select().from(publications);
    const pubByProject = new Map(pubs.map((p) => [p.projectId, p]));

    // Portada de cada tour: el panorama de su escena inicial, o el de la
    // primera escena si aún no se ha elegido inicio.
    const ids = rows.map((p) => p.id);
    const sceneRows = ids.length > 0
      ? await db.select().from(scenesTable).where(inArray(scenesTable.projectId, ids)).orderBy(asc(scenesTable.sort))
      : [];
    const coverOf = (project: typeof rows[number]): string | null => {
      const own = sceneRows.filter((sc) => sc.projectId === project.id);
      const start = parseJson<{ startScene?: string }>(project.settingsJson, {}).startScene;
      const scene = own.find((sc) => sc.id === start) ?? own[0];
      return scene?.mediaId ?? null;
    };

    return c.json(
      rows.map((p) => ({
        ...projectSummary(p, coverOf(p)),
        publishedSlug: pubByProject.get(p.id)?.slug ?? null,
      })),
    );
  });

  r.post("/", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:write");
    const db = c.get("db");
    const body = z
      .object({
        orgId: z.string(),
        title: z.string().min(1).max(200),
        folder: z.string().max(120).optional(),
        fromTemplate: z.string().optional(),
        defaultLang: z.string().default("es"),
      })
      .parse(await c.req.json());
    await requireOrgRole(db, body.orgId, auth.user, "editor");

    const settings = await getSettings(db);
    const count = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, body.orgId), isNull(projects.deletedAt)));
    const org = await requireOrgRole(db, body.orgId, auth.user, "editor");
    void org;
    const orgRow = (await db.select().from((await import("@ull360/db")).orgs).where(eq((await import("@ull360/db")).orgs.id, body.orgId)).limit(1))[0];
    if (orgRow != null && count.length >= orgRow.quotaTours) {
      throw forbidden(`La organización ha alcanzado su cuota de ${orgRow.quotaTours} tours`);
    }

    const id = newId();
    let slug = slugify(body.title);
    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, body.orgId), eq(projects.slug, slug)))
      .limit(1);
    if (taken.length > 0) slug = `${slug}-${newId(6).toLowerCase()}`;

    // Partir de una plantilla exige acceso de lectura a la plantilla: sin esta
    // comprobacion bastaba conocer un id de proyecto para clonar el contenido
    // de otra organizacion.
    let templateSettings: Record<string, unknown> | null = null;
    if (body.fromTemplate != null) {
      const tplAccess = await projectAccess(db, body.fromTemplate, auth.user);
      if (tplAccess.project.orgId !== body.orgId) {
        throw forbidden("La plantilla pertenece a otra organización");
      }
      // La razon de ser de una plantilla es la configuracion (tema, idiomas,
      // pantallas, variables, plano, quiz); duplicar solo las escenas dejaba
      // fuera justo lo reutilizable. startScene se conserva: duplicateContent
      // lo reapunta al id nuevo.
      templateSettings = parseJson<Record<string, unknown>>(tplAccess.project.settingsJson, {});
    }

    // Cascada instancia → organización → usuario → plantilla → lo elegido aquí
    const baseSettings = resolveNewTourSettings({
      instanceLangs: settings.defaultLangs,
      org: parseJson<OrgDefaults>(orgRow?.settingsJson ?? "{}", {}),
      user: parseJson<UserPrefs>(auth.user.prefsJson ?? "{}", {}),
      template: templateSettings,
      explicit: { defaultLang: body.defaultLang },
    });

    await db.insert(projects).values({
      id,
      orgId: body.orgId,
      title: body.title,
      slug,
      folder: body.folder ?? null,
      settingsJson: JSON.stringify(baseSettings),
      createdBy: auth.user.id,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });

    if (body.fromTemplate != null) {
      await duplicateContent(c, body.fromTemplate, id, auth.user.id);
    }
    await audit(c, "project.create", "project", id, { title: body.title }, body.orgId);
    return c.json({ id, slug }, 201);
  });

  r.get("/:projectId", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const pub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    return c.json({
      ...projectSummary(access.project),
      settings: parseJson(access.project.settingsJson, {}),
      permissions: { canEdit: access.canEdit, canPublish: access.canPublish, canManage: access.canManage, role: access.role },
      publication: pub != null ? { slug: pub.slug, visibility: pub.visibility, publishedAt: pub.publishedAt, versionId: pub.versionId, expireAt: pub.expireAt, publishAt: pub.publishAt, domains: parseJson(pub.domainsJson, []), hasPassword: pub.passwordHash != null } : null,
    });
  });

  r.patch("/:projectId", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:write");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden();
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        folder: z.string().max(120).nullable().optional(),
        tags: z.array(z.string().max(40)).optional(),
        settings: z.record(z.unknown()).optional(),
        isTemplate: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const patch: Record<string, unknown> = { updatedAt: nowMs() };
    if (body.title != null) patch.title = body.title;
    if (body.folder !== undefined) patch.folder = body.folder;
    if (body.tags != null) patch.tagsJson = JSON.stringify(body.tags);
    if (body.isTemplate != null) {
      if (!access.canManage) throw forbidden();
      patch.isTemplate = body.isTemplate;
    }
    if (body.settings != null) {
      const current = parseJson<Record<string, unknown>>(access.project.settingsJson, {});
      patch.settingsJson = JSON.stringify({ ...current, ...body.settings });
    }
    await db.update(projects).set(patch).where(eq(projects.id, access.project.id));
    await audit(c, "project.update", "project", access.project.id, {}, access.project.orgId);
    return c.json({ ok: true });
  });

  // Papelera con retencion (§3.1)
  r.delete("/:projectId", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:write");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canManage) throw forbidden();
    await db.update(projects).set({ deletedAt: nowMs(), status: "trashed" }).where(eq(projects.id, access.project.id));
    await audit(c, "project.trash", "project", access.project.id, {}, access.project.orgId);
    return c.json({ ok: true });
  });

  r.post("/:projectId/restore", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user, { allowTrashed: true });
    if (!access.canManage) throw forbidden();
    await db.update(projects).set({ deletedAt: null, status: "draft" }).where(eq(projects.id, access.project.id));
    await audit(c, "project.restore", "project", access.project.id, {}, access.project.orgId);
    return c.json({ ok: true });
  });

  r.delete("/:projectId/permanent", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user, { allowTrashed: true });
    if (!access.canManage) throw forbidden();
    if (access.project.deletedAt == null) throw badRequest("El proyecto debe estar en la papelera");
    await db.delete(projects).where(eq(projects.id, access.project.id));
    runtime.deferred(runtime.storage.deletePrefix(`pub/${access.project.slug}/`));
    await audit(c, "project.delete_permanent", "project", access.project.id, {}, access.project.orgId);
    return c.json({ ok: true });
  });

  // Duplicar (y plantillas §3.1)
  r.post("/:projectId/duplicate", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:write");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const body = z.object({ title: z.string().min(1).max(200).optional() }).parse(await c.req.json().catch(() => ({})));
    const id = newId();
    const title = body.title ?? `${access.project.title} (copia)`;
    let slug = slugify(title);
    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, access.project.orgId), eq(projects.slug, slug)))
      .limit(1);
    if (taken.length > 0) slug = `${slug}-${newId(6).toLowerCase()}`;
    await db.insert(projects).values({
      id,
      orgId: access.project.orgId,
      title,
      slug,
      folder: access.project.folder,
      tagsJson: access.project.tagsJson,
      settingsJson: access.project.settingsJson,
      createdBy: auth.user.id,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    await duplicateContent(c, access.project.id, id, auth.user.id);
    await audit(c, "project.duplicate", "project", id, { from: access.project.id }, access.project.orgId);
    return c.json({ id, slug }, 201);
  });

  // Comparticion por usuario (§3.1)
  r.get("/:projectId/members", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name, email: users.email })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, access.project.id));
    return c.json(rows);
  });

  r.post("/:projectId/members", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canManage) throw forbidden();
    const body = z
      .object({ email: z.string().email(), role: z.enum(["editor", "collaborator", "reader"]) })
      .parse(await c.req.json());
    const user = (await db.select().from(users).where(eq(users.email, body.email.trim().toLowerCase())).limit(1))[0];
    if (user == null) throw notFound("No existe ningún usuario con ese email en la instancia");
    const existing = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, access.project.id), eq(projectMembers.userId, user.id)))
      .limit(1);
    if (existing.length > 0) throw conflict("Ya compartido con ese usuario");
    await db.insert(projectMembers).values({ projectId: access.project.id, userId: user.id, role: body.role, createdAt: nowMs() });
    await audit(c, "project.share", "project", access.project.id, { with: user.id, role: body.role }, access.project.orgId);
    return c.json({ ok: true }, 201);
  });

  r.delete("/:projectId/members/:userId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canManage) throw forbidden();
    await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, access.project.id), eq(projectMembers.userId, c.req.param("userId"))));
    return c.json({ ok: true });
  });

  // Compilacion de previsualizacion (borrador -> tour.json)
  r.post("/:projectId/compile", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const compiled = await compileProject(db, access.project.id);
    // Cachear el mapa de assets para el servido de preview
    await c.get("runtime").kv.put(
      `preview-map:${access.project.id}`,
      JSON.stringify({ assets: compiled.assets, prefixes: compiled.prefixes }),
      { ttlSeconds: 3600 },
    );
    return c.json({ tour: compiled.tour, issues: compiled.issues });
  });

  // Assets del borrador para la vista previa del Studio
  r.get("/:projectId/preview/a/*", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rel = `a/${c.req.path.split("/preview/a/")[1] ?? ""}`;
    let map = parseJson<{ assets: Record<string, string>; prefixes: Record<string, string> } | null>(
      await runtime.kv.get(`preview-map:${access.project.id}`),
      null,
    );
    if (map == null) {
      const compiled = await compileProject(db, access.project.id);
      map = { assets: compiled.assets, prefixes: compiled.prefixes };
      await runtime.kv.put(`preview-map:${access.project.id}`, JSON.stringify(map), { ttlSeconds: 3600 });
    }
    const key = resolveAssetKey(rel, map);
    if (key == null) throw notFound("Asset no incluido en el tour");
    const obj = await runtime.storage.get(key);
    if (obj == null) throw notFound("Asset no encontrado en almacenamiento");
    return new Response(obj.body as unknown as BodyInit, {
      headers: {
        "content-type": obj.meta.contentType ?? guessContentType(key),
        "cache-control": "private, max-age=300",
      },
    });
  });

  return r;
}

export function resolveAssetKey(
  rel: string,
  map: { assets: Record<string, string>; prefixes: Record<string, string> },
): string | null {
  const direct = map.assets[rel];
  if (direct != null) return direct;
  for (const [prefix, storagePrefix] of Object.entries(map.prefixes)) {
    if (rel.startsWith(prefix)) {
      const rest = rel.slice(prefix.length);
      if (rest.includes("..")) return null;
      return `${storagePrefix}${rest}`;
    }
  }
  return null;
}

export function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
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
    vtt: "text/vtt",
    json: "application/json",
    js: "text/javascript",
    css: "text/css",
    html: "text/html; charset=utf-8",
    // Sin este tipo el navegador ignora el manifiesto y la app no se instala
    webmanifest: "application/manifest+json",
    ico: "image/x-icon",
    txt: "text/plain; charset=utf-8",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Copia escenas, hotspots y traducciones a otro proyecto. */
async function duplicateContent(
  c: { get: (k: "db") => import("../lib/context.js").Db },
  fromId: string,
  toId: string,
  _userId: string,
): Promise<void> {
  const db = c.get("db");
  const sceneRows = await db.select().from(scenesTable).where(eq(scenesTable.projectId, fromId));
  const idMap = new Map<string, string>();
  for (const s of sceneRows) idMap.set(s.id, newId());
  for (const s of sceneRows) {
    await db.insert(scenesTable).values({ ...s, id: idMap.get(s.id)!, projectId: toId });
  }
  const sceneIds = sceneRows.map((s) => s.id);
  if (sceneIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const hsRows = await db.select().from(hotspotsTable).where(inArray(hotspotsTable.sceneId, sceneIds));
    const hsIdMap = new Map<string, string>();
    for (const h of hsRows) hsIdMap.set(h.id, newId());
    for (const h of hsRows) {
      let content = h.contentJson;
      // Reapuntar targets de navegacion a los nuevos IDs de escena
      for (const [oldId, newSceneId] of idMap) {
        content = content.replaceAll(`"${oldId}"`, `"${newSceneId}"`);
      }
      await db.insert(hotspotsTable).values({ ...h, id: hsIdMap.get(h.id)!, sceneId: idMap.get(h.sceneId)!, contentJson: content });
    }
    const trRows = await db.select().from(translationsTable).where(eq(translationsTable.projectId, fromId));
    for (const t of trRows) {
      const entityId = t.entity === "scene" ? idMap.get(t.entityId) : t.entity === "hotspot" ? hsIdMap.get(t.entityId) : t.entityId;
      if (entityId == null && t.entity !== "tour") continue;
      await db.insert(translationsTable).values({ ...t, id: newId(), projectId: toId, entityId: entityId ?? t.entityId });
    }
  }
  // Actualizar startScene en settings
  const proj = (await db.select().from(projects).where(eq(projects.id, toId)).limit(1))[0];
  if (proj != null) {
    const settings = parseJson<Record<string, unknown>>(proj.settingsJson, {});
    if (typeof settings.startScene === "string" && idMap.has(settings.startScene)) {
      settings.startScene = idMap.get(settings.startScene);
      await db.update(projects).set({ settingsJson: JSON.stringify(settings) }).where(eq(projects.id, toId));
    }
  }
}

function projectSummary(p: typeof projects.$inferSelect, cover?: string | null): Record<string, unknown> {
  return {
    id: p.id,
    orgId: p.orgId,
    title: p.title,
    slug: p.slug,
    folder: p.folder,
    tags: parseJson(p.tagsJson, []),
    status: p.status,
    isTemplate: p.isTemplate,
    /** Medio de la escena inicial: la portada del tour en el panel. */
    coverMediaId: cover ?? null,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
  };
}

/** Limpieza de papelera: proyectos con mas dias de retencion que lo configurado. */
export async function purgeTrashedProjects(db: import("../lib/context.js").Db, retentionDays: number): Promise<number> {
  const threshold = nowMs() - retentionDays * 24 * 3600 * 1000;
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, threshold)));
  for (const row of rows) {
    await db.delete(projects).where(eq(projects.id, row.id));
  }
  return rows.length;
}
