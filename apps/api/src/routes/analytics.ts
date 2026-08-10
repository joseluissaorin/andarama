import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { publications } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";

/** Panel de analitica del Studio (§2.14): consultas agregadas por tour. */
export function analyticsRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/projects/:projectId/analytics", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const pub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    if (pub == null) throw notFound("El proyecto no está publicado; no hay analítica");
    const from = parseInt(c.req.query("from") ?? "", 10);
    const to = parseInt(c.req.query("to") ?? "", 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw badRequest("Parámetros from/to (epoch ms) requeridos");
    try {
      const summary = await runtime.analytics.query(pub.slug, { from, to });
      return c.json({ slug: pub.slug, ...summary });
    } catch (err) {
      return c.json({
        slug: pub.slug,
        unavailable: true,
        reason: err instanceof Error ? err.message : "Analítica no disponible",
      });
    }
  });

  return r;
}
