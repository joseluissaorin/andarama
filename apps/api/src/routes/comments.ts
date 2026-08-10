import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { comments, users } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs, parseJson } from "../lib/util.js";
import { requireAuth } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";

/** Comentarios anclados a escenas/hotspots con hilos y estado (§3.5). */
export function commentRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:projectId/comments", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select({ comment: comments, authorName: users.name })
      .from(comments)
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.projectId, access.project.id))
      .orderBy(asc(comments.createdAt));
    return c.json(
      rows.map(({ comment, authorName }) => ({
        id: comment.id,
        sceneId: comment.sceneId,
        hotspotId: comment.hotspotId,
        parentId: comment.parentId,
        authorId: comment.authorId,
        authorName: authorName ?? "Usuario eliminado",
        body: comment.body,
        anchor: parseJson(comment.anchorJson, null),
        resolved: comment.resolved,
        createdAt: comment.createdAt,
      })),
    );
  });

  r.post("/:projectId/comments", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const body = z
      .object({
        sceneId: z.string().optional(),
        hotspotId: z.string().optional(),
        parentId: z.string().optional(),
        body: z.string().min(1).max(4000),
        anchor: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
      })
      .parse(await c.req.json());
    const id = newId();
    await db.insert(comments).values({
      id,
      projectId: access.project.id,
      sceneId: body.sceneId ?? null,
      hotspotId: body.hotspotId ?? null,
      parentId: body.parentId ?? null,
      authorId: auth.user.id,
      body: body.body,
      anchorJson: body.anchor != null ? JSON.stringify(body.anchor) : null,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    return c.json({ id }, 201);
  });

  r.patch("/:projectId/comments/:commentId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const row = (await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, c.req.param("commentId")), eq(comments.projectId, access.project.id)))
      .limit(1))[0];
    if (row == null) throw notFound();
    const body = z.object({ body: z.string().min(1).max(4000).optional(), resolved: z.boolean().optional() }).parse(await c.req.json());
    if (body.body != null && row.authorId !== auth.user.id && !access.canManage) throw forbidden();
    await db
      .update(comments)
      .set({
        ...(body.body != null ? { body: body.body } : {}),
        ...(body.resolved != null ? { resolved: body.resolved } : {}),
        updatedAt: nowMs(),
      })
      .where(eq(comments.id, row.id));
    return c.json({ ok: true });
  });

  r.delete("/:projectId/comments/:commentId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const row = (await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, c.req.param("commentId")), eq(comments.projectId, access.project.id)))
      .limit(1))[0];
    if (row == null) throw notFound();
    if (row.authorId !== auth.user.id && !access.canManage) throw forbidden();
    await db.delete(comments).where(eq(comments.id, row.id));
    return c.json({ ok: true });
  });

  return r;
}
