import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { formSubmissions, publications, quizResults, webhooks } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs, parseJson, dailyIpHash } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";
import { clientIp, rateLimit, verifyTurnstile } from "../lib/helpers.js";
import { hmacSign } from "@andarama/adapters";
import { findHotspot, isOnceForm, loadPublishedTour, scoreQuiz } from "../lib/quiz.js";
import { quizResultsCsv, submissionsCsv } from "../lib/csv-exports.js";

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
        /** Identificador anónimo del visitante (lo guarda su navegador). */
        visitorId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
      })
      .parse(await c.req.json());
    const config = c.get("config");
    const turnstileOk = await verifyTurnstile(config.turnstileSecret, body.turnstileToken ?? undefined, clientIp(c));
    if (!turnstileOk) throw forbidden("Verificación anti-spam fallida");
    // Limitar tamano de datos
    const json = JSON.stringify(body.data);
    if (json.length > 20000) throw badRequest("Datos demasiado grandes");
    // Formulario de un solo envío: el segundo del mismo visitante se rechaza
    // con 409 y el visor lo muestra como «ya enviado». Se identifica por el
    // identificador anónimo del navegador y no por la IP, que en un aula es
    // la misma para toda la clase.
    if (body.visitorId != null) {
      const tour = await loadPublishedTour(runtime, slug);
      if (tour != null && isOnceForm(findHotspot(tour, body.hotspotId))) {
        const previo = await db
          .select({ id: formSubmissions.id })
          .from(formSubmissions)
          .where(
            and(
              eq(formSubmissions.projectId, pub.projectId),
              eq(formSubmissions.hotspotId, body.hotspotId),
              eq(formSubmissions.visitorId, body.visitorId),
            ),
          )
          .limit(1);
        if (previo.length > 0) return c.json({ ok: false, alreadySubmitted: true }, 409);
      }
    }
    const id = newId();
    await db.insert(formSubmissions).values({
      id,
      projectId: pub.projectId,
      hotspotId: body.hotspotId,
      dataJson: json,
      lang: body.lang ?? null,
      createdAt: nowMs(),
      ipHash: await dailyIpHash(clientIp(c), config.secret),
      visitorId: body.visitorId ?? null,
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
            headers: { "content-type": "application/json", ...(sig != null ? { "x-anda-signature": sig } : {}) },
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
        sessionId: z.string().min(1).max(60),
        score: z.number().int().min(0).optional(),
        maxScore: z.number().int().min(0).optional(),
        passed: z.boolean().nullable().optional(),
        detail: z.array(z.record(z.unknown())).max(200),
        participantName: z.string().max(120).optional(),
        ltiLaunchId: z.string().max(128).optional(),
      })
      .parse(await c.req.json());
    // La nota la pone el servidor con el tour publicado: el navegador solo
    // dice qué marcó. Sin tour (publicación rota) no hay con qué corregir y
    // se guarda lo recibido, pero nunca por encima del máximo.
    const tour = await loadPublishedTour(runtime, slug);
    let score: number;
    let maxScore: number;
    let passed: boolean | null;
    let detail: unknown[];
    if (tour != null) {
      const nota = scoreQuiz(tour, body.detail);
      ({ score, maxScore, passed } = nota);
      detail = nota.detail;
    } else {
      maxScore = body.maxScore ?? 0;
      score = Math.min(body.score ?? 0, maxScore);
      passed = body.passed ?? null;
      detail = body.detail;
    }
    // El lanzamiento LTI solo vale para el tour con el que se lanzó
    let ltiLaunchJson: string | null = null;
    let launchName: string | undefined;
    if (body.ltiLaunchId != null) {
      const raw = await runtime.kv.get(`lti-launch:${body.ltiLaunchId}`);
      const launch = parseJson<{ slug?: string; name?: string } | null>(raw, null);
      if (raw != null && launch != null && launch.slug === slug) {
        ltiLaunchJson = raw;
        launchName = launch.name;
      }
    }
    const id = newId();
    await db.insert(quizResults).values({
      id,
      projectId: pub.projectId,
      sessionId: body.sessionId,
      score,
      maxScore,
      passed,
      detailJson: JSON.stringify(detail),
      ltiLaunchJson,
      participantName: body.participantName ?? launchName ?? null,
      createdAt: nowMs(),
    });
    // Devolucion de calificacion LTI AGS si el launch lo permite
    if (ltiLaunchJson != null) {
      const { sendAgsScore } = await import("./lti.js");
      runtime.deferred(sendAgsScore(c as never, ltiLaunchJson, score, maxScore));
    }
    return c.json({ ok: true, score, maxScore, passed }, 201);
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
    return new Response(submissionsCsv(rows), {
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
    return new Response(quizResultsCsv(rows), {
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

