import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { hotspots as hotspotsTable, projects, scenes as scenesTable } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";
import { audit } from "../lib/helpers.js";

const HOTSPOT_TYPES = [
  "navigation", "text", "image", "gallery", "videoFile", "embedVideo", "audio", "pdf",
  "model3d", "web", "form", "compare", "quiz", "polygon", "tooltip", "link", "state",
] as const;

const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

const sceneCreateSchema = z.object({
  id: clientId.optional(),
  title: z.string().min(1).max(200),
  type: z.enum(["image", "video", "flat"]).default("image"),
  mediaId: z.string().nullable().optional(),
  sourceJson: z.record(z.unknown()).nullable().optional(),
});

const scenePatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.enum(["image", "video", "flat"]).optional(),
  mediaId: z.string().nullable().optional(),
  sourceJson: z.record(z.unknown()).nullable().optional(),
  initialView: z.object({ yaw: z.number(), pitch: z.number(), fov: z.number() }).nullable().optional(),
  limits: z.record(z.number()).nullable().optional(),
  audio: z.record(z.unknown()).nullable().optional(),
  map: z.record(z.unknown()).nullable().optional(),
  meta: z.record(z.unknown()).optional(),
  sort: z.number().int().optional(),
});

const hotspotSchema = z.object({
  id: clientId.optional(),
  type: z.enum(HOTSPOT_TYPES),
  position: z.record(z.unknown()),
  style: z.record(z.unknown()).nullable().optional(),
  content: z.record(z.unknown()).default({}),
  conditions: z.record(z.unknown()).nullable().optional(),
  sort: z.number().int().optional(),
});

async function editableProject(c: Parameters<typeof projectAccess>[0] extends never ? never : any, projectId: string): Promise<{ project: typeof projects.$inferSelect }> {
  const auth = requireAuth(c);
  requireScope(auth, "projects:write");
  const access = await projectAccess(c.get("db"), projectId, auth.user);
  if (!access.canEdit) throw forbidden();
  return { project: access.project };
}

async function touchProject(c: any, projectId: string): Promise<void> {
  await c.get("db").update(projects).set({ updatedAt: nowMs() }).where(eq(projects.id, projectId));
}

export function contentRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  // ------- Escenas -------

  r.get("/:projectId/scenes", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(scenesTable)
      .where(eq(scenesTable.projectId, access.project.id))
      .orderBy(asc(scenesTable.sort));
    const sceneIds = rows.map((s) => s.id);
    const hs = sceneIds.length > 0
      ? await db.select().from(hotspotsTable).where(inArray(hotspotsTable.sceneId, sceneIds)).orderBy(asc(hotspotsTable.sort))
      : [];
    return c.json({ scenes: rows, hotspots: hs });
  });

  r.post("/:projectId/scenes", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const body = sceneCreateSchema.parse(await c.req.json());
    const existing = await db.select({ sort: scenesTable.sort }).from(scenesTable).where(eq(scenesTable.projectId, project.id));
    const id = body.id ?? newId();
    await db.insert(scenesTable).values({
      id,
      projectId: project.id,
      sort: existing.length,
      title: body.title,
      type: body.type,
      mediaId: body.mediaId ?? null,
      sourceJson: body.sourceJson != null ? JSON.stringify(body.sourceJson) : null,
      metaJson: "{}",
    });
    await touchProject(c, project.id);
    await audit(c, "scene.create", "scene", id, {}, project.orgId);
    return c.json({ id }, 201);
  });

  r.patch("/:projectId/scenes/:sceneId", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const sceneId = c.req.param("sceneId");
    const scene = (await db.select().from(scenesTable).where(and(eq(scenesTable.id, sceneId), eq(scenesTable.projectId, project.id))).limit(1))[0];
    if (scene == null) throw notFound("Escena no encontrada");
    const body = scenePatchSchema.parse(await c.req.json());
    const patch: Record<string, unknown> = {};
    if (body.title != null) patch.title = body.title;
    if (body.type != null) patch.type = body.type;
    if (body.mediaId !== undefined) patch.mediaId = body.mediaId;
    if (body.sourceJson !== undefined) patch.sourceJson = body.sourceJson != null ? JSON.stringify(body.sourceJson) : null;
    if (body.initialView !== undefined) patch.initialViewJson = body.initialView != null ? JSON.stringify(body.initialView) : null;
    if (body.limits !== undefined) patch.limitsJson = body.limits != null ? JSON.stringify(body.limits) : null;
    if (body.audio !== undefined) patch.audioJson = body.audio != null ? JSON.stringify(body.audio) : null;
    if (body.map !== undefined) patch.mapJson = body.map != null ? JSON.stringify(body.map) : null;
    if (body.meta != null) {
      const current = JSON.parse(scene.metaJson || "{}") as Record<string, unknown>;
      patch.metaJson = JSON.stringify({ ...current, ...body.meta });
    }
    if (body.sort != null) patch.sort = body.sort;
    await db.update(scenesTable).set(patch).where(eq(scenesTable.id, sceneId));
    await touchProject(c, project.id);
    return c.json({ ok: true });
  });

  r.post("/:projectId/scenes/reorder", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const { order } = z.object({ order: z.array(z.string()) }).parse(await c.req.json());
    for (const [i, sceneId] of order.entries()) {
      await db.update(scenesTable).set({ sort: i }).where(and(eq(scenesTable.id, sceneId), eq(scenesTable.projectId, project.id)));
    }
    await touchProject(c, project.id);
    return c.json({ ok: true });
  });

  r.delete("/:projectId/scenes/:sceneId", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const sceneId = c.req.param("sceneId");
    await db.delete(scenesTable).where(and(eq(scenesTable.id, sceneId), eq(scenesTable.projectId, project.id)));
    await touchProject(c, project.id);
    await audit(c, "scene.delete", "scene", sceneId, {}, project.orgId);
    return c.json({ ok: true });
  });

  // ------- Hotspots -------

  r.post("/:projectId/scenes/:sceneId/hotspots", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const sceneId = c.req.param("sceneId");
    const scene = (await db.select().from(scenesTable).where(and(eq(scenesTable.id, sceneId), eq(scenesTable.projectId, project.id))).limit(1))[0];
    if (scene == null) throw notFound("Escena no encontrada");
    const body = hotspotSchema.parse(await c.req.json());
    const id = body.id ?? newId();
    await db.insert(hotspotsTable).values({
      id,
      sceneId,
      type: body.type,
      positionJson: JSON.stringify(body.position),
      styleJson: body.style != null ? JSON.stringify(body.style) : null,
      contentJson: JSON.stringify(body.content),
      conditionsJson: body.conditions != null ? JSON.stringify(body.conditions) : null,
      sort: body.sort ?? 0,
    });
    await touchProject(c, project.id);
    return c.json({ id }, 201);
  });

  r.patch("/:projectId/hotspots/:hotspotId", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const hotspotId = c.req.param("hotspotId");
    const rows = await db
      .select({ hs: hotspotsTable, sceneProject: scenesTable.projectId })
      .from(hotspotsTable)
      .innerJoin(scenesTable, eq(hotspotsTable.sceneId, scenesTable.id))
      .where(eq(hotspotsTable.id, hotspotId))
      .limit(1);
    if (rows[0] == null || rows[0].sceneProject !== project.id) throw notFound("Hotspot no encontrado");
    const body = hotspotSchema.partial().parse(await c.req.json());
    const patch: Record<string, unknown> = {};
    if (body.type != null) patch.type = body.type;
    if (body.position != null) patch.positionJson = JSON.stringify(body.position);
    if (body.style !== undefined) patch.styleJson = body.style != null ? JSON.stringify(body.style) : null;
    if (body.content != null) patch.contentJson = JSON.stringify(body.content);
    if (body.conditions !== undefined) patch.conditionsJson = body.conditions != null ? JSON.stringify(body.conditions) : null;
    if (body.sort != null) patch.sort = body.sort;
    await db.update(hotspotsTable).set(patch).where(eq(hotspotsTable.id, hotspotId));
    await touchProject(c, project.id);
    return c.json({ ok: true });
  });

  r.delete("/:projectId/hotspots/:hotspotId", async (c) => {
    const { project } = await editableProject(c, c.req.param("projectId"));
    const db = c.get("db");
    const hotspotId = c.req.param("hotspotId");
    const rows = await db
      .select({ id: hotspotsTable.id, sceneProject: scenesTable.projectId })
      .from(hotspotsTable)
      .innerJoin(scenesTable, eq(hotspotsTable.sceneId, scenesTable.id))
      .where(eq(hotspotsTable.id, hotspotId))
      .limit(1);
    if (rows[0] == null || rows[0].sceneProject !== project.id) throw notFound();
    await db.delete(hotspotsTable).where(eq(hotspotsTable.id, hotspotId));
    await touchProject(c, project.id);
    return c.json({ ok: true });
  });

  return r;
}
