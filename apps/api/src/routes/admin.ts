import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { auditLog, jobs, media, orgMembers, orgs, projects, publications, users, webhooks } from "@ull360/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { hmacSign } from "@ull360/adapters";
import { newId, nowMs, parseJson, slugify } from "../lib/util.js";
import { requireAuth } from "../lib/session.js";
import { isInstanceAdmin } from "../lib/authz.js";
import { audit, getSettings, saveSettings } from "../lib/helpers.js";

/** Panel de administracion global de la instancia (§3.7). */
export function adminRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.use("*", async (c, next) => {
    const auth = requireAuth(c);
    if (!isInstanceAdmin(auth.user)) throw forbidden("Solo administradores de la instancia");
    await next();
  });

  r.get("/overview", async (c) => {
    const db = c.get("db");
    const [userCount, orgCount, projectCount, pubCount, mediaBytes, queuedJobs] = await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(users),
      db.select({ c: sql<number>`count(*)` }).from(orgs),
      db.select({ c: sql<number>`count(*)` }).from(projects).where(isNull(projects.deletedAt)),
      db.select({ c: sql<number>`count(*)` }).from(publications),
      db.select({ c: sql<number>`coalesce(sum(${media.bytes}), 0)` }).from(media).where(isNull(media.deletedAt)),
      db.select({ c: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, "queued")),
    ]);
    return c.json({
      users: Number(userCount[0]?.c ?? 0),
      orgs: Number(orgCount[0]?.c ?? 0),
      projects: Number(projectCount[0]?.c ?? 0),
      publications: Number(pubCount[0]?.c ?? 0),
      storageBytes: Number(mediaBytes[0]?.c ?? 0),
      queuedJobs: Number(queuedJobs[0]?.c ?? 0),
    });
  });

  r.get("/settings", async (c) => c.json(await getSettings(c.get("db"))));

  r.put("/settings", async (c) => {
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        logo: z.string().optional(),
        defaultLangs: z.array(z.string()).optional(),
        registration: z.enum(["open", "invite", "domain"]).optional(),
        allowedDomains: z.array(z.string()).optional(),
        maxUploadMb: z.number().int().positive().max(10240).optional(),
        trashRetentionDays: z.number().int().positive().max(365).optional(),
        legal: z.object({ privacy: z.string().optional(), cookies: z.string().optional(), terms: z.string().optional() }).optional(),
        defaultQuotaBytes: z.number().int().positive().optional(),
        defaultQuotaTours: z.number().int().positive().optional(),
      })
      .parse(await c.req.json());
    await saveSettings(c.get("db"), body);
    await audit(c, "instance.settings", "settings", "instance", body);
    return c.json({ ok: true });
  });

  // ------- Usuarios -------

  r.get("/users", async (c) => {
    const db = c.get("db");
    const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(500);
    return c.json(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roleGlobal: u.roleGlobal,
        emailVerified: u.emailVerified,
        totp: u.totpSecret != null,
        sso: u.idpSubject != null,
        createdAt: u.createdAt,
      })),
    );
  });

  /** Alta de usuario desde el panel (con contraseña temporal). */
  r.post("/users", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(120),
        password: z.string().min(10).max(200),
        roleGlobal: z.enum(["admin", "user"]).default("user"),
        orgId: z.string().optional(),
        orgRole: z.enum(["admin", "editor", "collaborator", "reader"]).default("editor"),
      })
      .parse(await c.req.json());
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);
    if (existing[0] != null) throw conflict("Ya existe un usuario con ese email");
    const id = newId();
    await db.insert(users).values({
      id,
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash: await runtime.passwords.hash(body.password),
      roleGlobal: body.roleGlobal,
      emailVerified: true,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    if (body.orgId != null) {
      await db.insert(orgMembers).values({ orgId: body.orgId, userId: id, role: body.orgRole, createdAt: nowMs() });
    }
    await audit(c, "admin.user_create", "user", id, { email: body.email, roleGlobal: body.roleGlobal });
    return c.json({ id }, 201);
  });

  r.patch("/users/:userId", async (c) => {
    const db = c.get("db");
    const userId = c.req.param("userId");
    const body = z.object({ roleGlobal: z.enum(["admin", "user"]).optional(), name: z.string().optional() }).parse(await c.req.json());
    const auth = requireAuth(c);
    if (userId === auth.user.id && body.roleGlobal === "user") {
      const admins = await db.select().from(users).where(eq(users.roleGlobal, "admin"));
      if (admins.length <= 1) throw badRequest("No puedes quitarte el rol de administrador siendo el último");
    }
    await db
      .update(users)
      .set({ ...(body.roleGlobal != null ? { roleGlobal: body.roleGlobal } : {}), ...(body.name != null ? { name: body.name } : {}), updatedAt: nowMs() })
      .where(eq(users.id, userId));
    await audit(c, "admin.user_update", "user", userId, body);
    return c.json({ ok: true });
  });

  r.delete("/users/:userId", async (c) => {
    const db = c.get("db");
    const auth = requireAuth(c);
    const userId = c.req.param("userId");
    if (userId === auth.user.id) throw badRequest("No puedes eliminar tu propia cuenta desde aquí");
    await db.delete(users).where(eq(users.id, userId));
    await audit(c, "admin.user_delete", "user", userId);
    return c.json({ ok: true });
  });

  // ------- Organizaciones y cuotas -------

  r.get("/orgs", async (c) => {
    const db = c.get("db");
    const rows = await db.select().from(orgs);
    const usage = await db
      .select({ orgId: media.orgId, bytes: sql<number>`coalesce(sum(${media.bytes}), 0)` })
      .from(media)
      .where(isNull(media.deletedAt))
      .groupBy(media.orgId);
    const usageMap = new Map(usage.map((u) => [u.orgId, Number(u.bytes)]));
    return c.json(rows.map((o) => ({ ...o, usedBytes: usageMap.get(o.id) ?? 0 })));
  });

  /** Alta de organización desde el panel. */
  r.post("/orgs", async (c) => {
    const db = c.get("db");
    const body = z
      .object({
        name: z.string().min(1).max(120),
        ownerUserId: z.string().optional(),
        quotaBytes: z.number().int().positive().optional(),
        quotaTours: z.number().int().positive().optional(),
      })
      .parse(await c.req.json());
    const id = newId();
    let slug = slugify(body.name);
    const taken = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
    if (taken[0] != null) slug = `${slug}-${id.slice(0, 5)}`;
    const settings = await getSettings(db);
    await db.insert(orgs).values({
      id,
      name: body.name,
      slug,
      quotaBytes: body.quotaBytes ?? settings.defaultQuotaBytes ?? 5368709120,
      quotaTours: body.quotaTours ?? settings.defaultQuotaTours ?? 100,
      createdAt: nowMs(),
    });
    if (body.ownerUserId != null) {
      await db.insert(orgMembers).values({ orgId: id, userId: body.ownerUserId, role: "admin", createdAt: nowMs() });
    }
    await audit(c, "admin.org_create", "org", id, { name: body.name });
    return c.json({ id, slug }, 201);
  });

  r.patch("/orgs/:orgId", async (c) => {
    const db = c.get("db");
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        quotaBytes: z.number().int().positive().optional(),
        quotaTours: z.number().int().positive().optional(),
      })
      .parse(await c.req.json());
    await db.update(orgs).set(body).where(eq(orgs.id, c.req.param("orgId")));
    await audit(c, "admin.org_quota", "org", c.req.param("orgId"), body);
    return c.json({ ok: true });
  });

  // ------- Tours publicados -------

  r.get("/publications", async (c) => {
    const db = c.get("db");
    const rows = await db
      .select({ pub: publications, title: projects.title, orgId: projects.orgId })
      .from(publications)
      .innerJoin(projects, eq(publications.projectId, projects.id));
    return c.json(rows.map(({ pub, title, orgId }) => ({ ...pub, title, orgId })));
  });

  /** Despublicar desde el panel (el admin de instancia no necesita ser miembro). */
  r.post("/publications/:projectId/unpublish", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const projectId = c.req.param("projectId");
    const pub = (await db.select().from(publications).where(eq(publications.projectId, projectId)).limit(1))[0];
    if (pub == null) throw notFound("El proyecto no está publicado");
    await runtime.storage.delete(`pub/${pub.slug}/current.json`);
    await runtime.kv.delete(`pub:${pub.slug}`);
    await db.delete(publications).where(eq(publications.projectId, projectId));
    await db.update(projects).set({ status: "draft", updatedAt: nowMs() }).where(eq(projects.id, projectId));
    await audit(c, "admin.unpublish", "project", projectId, { slug: pub.slug });
    return c.json({ ok: true });
  });

  // ------- Cola de trabajos -------

  r.get("/jobs", async (c) => {
    const db = c.get("db");
    const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(200);
    return c.json(rows);
  });

  r.post("/jobs/:jobId/retry", async (c) => {
    const db = c.get("db");
    const runtime = c.get("runtime");
    const job = (await db.select().from(jobs).where(eq(jobs.id, c.req.param("jobId"))).limit(1))[0];
    if (job == null) throw notFound();
    await db.update(jobs).set({ status: "queued", error: null, updatedAt: nowMs() }).where(eq(jobs.id, job.id));
    await runtime.queue.enqueue({ id: job.id, kind: job.kind, payload: parseJson(job.payloadJson, {}), orgId: job.orgId });
    return c.json({ ok: true });
  });

  // ------- Auditoria -------

  r.get("/audit", async (c) => {
    const db = c.get("db");
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(500);
    return c.json(rows);
  });

  // ------- Webhooks -------

  r.get("/webhooks", async (c) => {
    const rows = await c.get("db").select().from(webhooks);
    return c.json(rows);
  });

  r.post("/webhooks", async (c) => {
    const body = z
      .object({
        url: z.string().url(),
        events: z.array(z.enum(["publish", "unpublish", "form_submission"])),
        orgId: z.string().optional(),
        projectId: z.string().optional(),
        secret: z.string().optional(),
      })
      .parse(await c.req.json());
    const id = newId();
    await c.get("db").insert(webhooks).values({
      id,
      orgId: body.orgId ?? null,
      projectId: body.projectId ?? null,
      url: body.url,
      eventsJson: JSON.stringify(body.events),
      secret: body.secret ?? null,
      createdAt: nowMs(),
    });
    return c.json({ id }, 201);
  });

  /** Activar/desactivar un webhook sin borrarlo. */
  r.patch("/webhooks/:id", async (c) => {
    const body = z.object({ active: z.boolean() }).parse(await c.req.json());
    await c.get("db").update(webhooks).set({ active: body.active }).where(eq(webhooks.id, c.req.param("id")));
    return c.json({ ok: true });
  });

  /** Envío de prueba: verifica URL, conectividad y firma. */
  r.post("/webhooks/:id/test", async (c) => {
    const db = c.get("db");
    const hook = (await db.select().from(webhooks).where(eq(webhooks.id, c.req.param("id"))).limit(1))[0];
    if (hook == null) throw notFound();
    const body = JSON.stringify({ event: "test", at: nowMs(), message: "Envío de prueba de ULL360" });
    const signature = hook.secret != null ? await hmacSign(hook.secret, body) : undefined;
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(signature != null ? { "x-ull360-signature": signature } : {}) },
        body,
      });
      return c.json({ ok: res.ok, status: res.status });
    } catch (err) {
      return c.json({ ok: false, status: 0, error: String(err instanceof Error ? err.message : err) });
    }
  });

  r.delete("/webhooks/:id", async (c) => {
    await c.get("db").delete(webhooks).where(eq(webhooks.id, c.req.param("id")));
    return c.json({ ok: true });
  });

  // ------- Copia de seguridad (export/import completo §3.7) -------

  r.get("/backup", async (c) => {
    const db = c.get("db");
    const schema = await import("@ull360/db");
    const tables = [
      "users", "orgs", "orgMembers", "projects", "projectMembers", "scenes", "hotspots",
      "connections", "media", "mediaDerivatives", "versions", "publications", "translations",
      "comments", "formSubmissions", "quizResults", "auditLog", "instanceSettings", "webhooks", "ltiRegistrations",
    ] as const;
    const dump: Record<string, unknown[]> = {};
    for (const name of tables) {
      dump[name] = await db.select().from((schema as Record<string, any>)[name]);
    }
    return new Response(JSON.stringify({ format: "ull360-backup", version: 1, exportedAt: nowMs(), tables: dump }), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="ull360-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  });

  r.post("/backup/import", async (c) => {
    const db = c.get("db");
    const doc = z
      .object({ format: z.literal("ull360-backup"), version: z.number(), tables: z.record(z.array(z.record(z.unknown()))) })
      .parse(await c.req.json());
    const schema = await import("@ull360/db");
    let imported = 0;
    // Orden respetando claves foraneas
    const order = [
      "users", "orgs", "orgMembers", "projects", "projectMembers", "scenes", "hotspots",
      "connections", "media", "mediaDerivatives", "versions", "publications", "translations",
      "comments", "formSubmissions", "quizResults", "instanceSettings", "webhooks", "ltiRegistrations",
    ];
    for (const name of order) {
      const rows = doc.tables[name];
      const table = (schema as Record<string, any>)[name];
      if (rows == null || table == null) continue;
      for (const row of rows) {
        try {
          await db.insert(table).values(row as never);
          imported++;
        } catch {
          // fila ya existente: se omite (import idempotente)
        }
      }
    }
    await audit(c, "admin.backup_import", "instance", null, { imported });
    return c.json({ imported });
  });

  return r;
}
