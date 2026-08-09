import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { formSubmissions, publications, quizResults, webhooks } from "@ull360/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs, parseJson, dailyIpHash } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";
import { clientIp, rateLimit, verifyTurnstile } from "../lib/helpers.js";
import { hmacSign } from "@ull360/adapters";

export function formRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Envio publico de formularios desde tours publicados (con Turnstile). */
  r.post("/public/forms/:slug", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const slug = c.req.param("slug");
    await rateLimit(runtime.kv, `form:${clientIp(c)}`, 20, 3600);
    const pub = (await db.select().from(publications).where(eq(publications.slug, slug)).limit(1))[0];
    if (pub == null) throw notFound("Tour no publicado");
    const body = z
      .object({
        hotspotId: z.string(),
        lang: z.string().max(10).optional(),
        data: z.record(z.unknown()),
        turnstileToken: z.string().nullable().optional(),
      })
      .parse(await c.req.json());
    const config = c.get("config");
    const turnstileOk = await verifyTurnstile(config.turnstileSecret, body.turnstileToken ?? undefined, clientIp(c));
    if (!turnstileOk) throw forbidden("Verificacion anti-spam fallida");
    // Limitar tamano de datos
    const json = JSON.stringify(body.data);
    if (json.length > 20000) throw badRequest("Datos demasiado grandes");
    const id = newId();
    await db.insert(formSubmissions).values({
      id,
      projectId: pub.projectId,
      hotspotId: body.hotspotId,
      dataJson: json,
      lang: body.lang ?? null,
      createdAt: nowMs(),
      ipHash: await dailyIpHash(clientIp(c), config.secret),
    });
    // Webhook form_submission
    const hooks = await db.select().from(webhooks).where(eq(webhooks.active, true));
    for (const hook of hooks) {
      if (hook.projectId != null && hook.projectId !== pub.projectId) continue;
      if (!parseJson<string[]>(hook.eventsJson, []).includes("form_submission")) continue;
      const payload = JSON.stringify({ event: "form_submission", projectId: pub.projectId, hotspotId: body.hotspotId, data: body.data, at: nowMs() });
      runtime.deferred(
        (async () => {
          const sig = hook.secret != null ? await hmacSign(hook.secret, payload) : undefined;
          await fetch(hook.url, {
            method: "POST",
            headers: { "content-type": "application/json", ...(sig != null ? { "x-ull360-signature": sig } : {}) },
            body: payload,
          }).catch(() => {});
        })(),
      );
    }
    return c.json({ ok: true }, 201);
  });

  /** Resultados de quiz desde tours publicados (informe + LTI passback). */
  r.post("/public/quiz/:slug", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const slug = c.req.param("slug");
    await rateLimit(runtime.kv, `quiz:${clientIp(c)}`, 30, 3600);
    const pub = (await db.select().from(publications).where(eq(publications.slug, slug)).limit(1))[0];
    if (pub == null) throw notFound();
    const body = z
      .object({
        sessionId: z.string().max(60),
        score: z.number().int().min(0),
        maxScore: z.number().int().min(0),
        passed: z.boolean().nullable(),
        detail: z.array(z.record(z.unknown())).max(200),
        participantName: z.string().max(120).optional(),
        ltiLaunchId: z.string().optional(),
      })
      .parse(await c.req.json());
    const id = newId();
    let ltiLaunchJson: string | null = null;
    if (body.ltiLaunchId != null) {
      ltiLaunchJson = await runtime.kv.get(`lti-launch:${body.ltiLaunchId}`);
    }
    await db.insert(quizResults).values({
      id,
      projectId: pub.projectId,
      sessionId: body.sessionId,
      score: body.score,
      maxScore: body.maxScore,
      passed: body.passed,
      detailJson: JSON.stringify(body.detail),
      ltiLaunchJson,
      participantName: body.participantName ?? null,
      createdAt: nowMs(),
    });
    // Devolucion de calificacion LTI AGS si el launch lo permite
    if (ltiLaunchJson != null) {
      const { sendAgsScore } = await import("./lti.js");
      runtime.deferred(sendAgsScore(c as never, ltiLaunchJson, body.score, body.maxScore));
    }
    return c.json({ ok: true }, 201);
  });

  /** Export CSV de envios de formularios (§2.14). */
  r.get("/projects/:projectId/submissions.csv", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.projectId, access.project.id))
      .orderBy(desc(formSubmissions.createdAt));
    const fieldSet = new Set<string>();
    const parsed = rows.map((row) => {
      const data = parseJson<Record<string, unknown>>(row.dataJson, {});
      for (const key of Object.keys(data)) fieldSet.add(key);
      return { row, data };
    });
    const fields = [...fieldSet];
    const head = ["fecha", "hotspot", "idioma", ...fields];
    const lines = [head.map(csv).join(",")];
    for (const { row, data } of parsed) {
      lines.push(
        [
          new Date(row.createdAt).toISOString(),
          row.hotspotId,
          row.lang ?? "",
          ...fields.map((f) => String(data[f] ?? "")),
        ]
          .map(csv)
          .join(","),
      );
    }
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${access.project.slug}-formularios.csv"`,
      },
    });
  });

  /** Export CSV de resultados de quiz. */
  r.get("/projects/:projectId/quiz-results.csv", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(quizResults)
      .where(eq(quizResults.projectId, access.project.id))
      .orderBy(desc(quizResults.createdAt));
    const lines = [["fecha", "sesion", "participante", "puntuacion", "maximo", "aprobado", "lti"].map(csv).join(",")];
    for (const row of rows) {
      lines.push(
        [
          new Date(row.createdAt).toISOString(),
          row.sessionId,
          row.participantName ?? "",
          String(row.score),
          String(row.maxScore),
          row.passed == null ? "" : row.passed ? "si" : "no",
          row.ltiLaunchJson != null ? "si" : "no",
        ]
          .map(csv)
          .join(","),
      );
    }
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${access.project.slug}-quiz.csv"`,
      },
    });
  });

  /** Listado JSON para el panel del Studio. */
  r.get("/projects/:projectId/submissions", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.projectId, access.project.id))
      .orderBy(desc(formSubmissions.createdAt))
      .limit(500);
    return c.json(rows.map((row) => ({ id: row.id, hotspotId: row.hotspotId, lang: row.lang, data: parseJson(row.dataJson, {}), createdAt: row.createdAt })));
  });

  r.get("/projects/:projectId/quiz-results", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(quizResults)
      .where(eq(quizResults.projectId, access.project.id))
      .orderBy(desc(quizResults.createdAt))
      .limit(500);
    return c.json(rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      participantName: row.participantName,
      score: row.score,
      maxScore: row.maxScore,
      passed: row.passed,
      lti: row.ltiLaunchJson != null,
      createdAt: row.createdAt,
    })));
  });

  return r;
}

function csv(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
