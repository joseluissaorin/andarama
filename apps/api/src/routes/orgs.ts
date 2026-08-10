import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { media, orgInvites, orgMembers, orgs, projects, users } from "@ull360/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { newId, newToken, nowMs, parseJson, sha256Hex, slugify } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { requireOrgRole } from "../lib/authz.js";
import { audit } from "../lib/helpers.js";
import { INHERITED_KEYS, propagateOrgDefaults, type OrgDefaults } from "../lib/defaults.js";

const roleSchema = z.enum(["admin", "editor", "collaborator", "reader"]);

export function orgRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "orgs:write");
    const db = c.get("db");
    const { name } = z.object({ name: z.string().min(1).max(120) }).parse(await c.req.json());
    const id = newId();
    let slug = slugify(name);
    if ((await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1)).length > 0) {
      slug = `${slug}-${newId(6).toLowerCase()}`;
    }
    await db.insert(orgs).values({ id, name, slug, settingsJson: "{}", createdAt: nowMs() });
    await db.insert(orgMembers).values({ orgId: id, userId: auth.user.id, role: "admin", createdAt: nowMs() });
    await audit(c, "org.create", "org", id, { name }, id);
    return c.json({ id, name, slug }, 201);
  });

  r.get("/:orgId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "reader");
    const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
    if (org == null) throw notFound();
    return c.json(org);
  });

  r.patch("/:orgId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "admin");
    const body = z.object({ name: z.string().min(1).max(120).optional(), settingsJson: z.string().optional() }).parse(await c.req.json());
    await db
      .update(orgs)
      .set({ ...(body.name != null ? { name: body.name } : {}), ...(body.settingsJson != null ? { settingsJson: body.settingsJson } : {}) })
      .where(eq(orgs.id, orgId));
    await audit(c, "org.update", "org", orgId, body, orgId);
    return c.json({ ok: true });
  });

  /**
   * Valores por defecto de la organización. Al cambiarlos se propagan a los
   * borradores que no habían personalizado esa clave: eso es lo que significa
   * heredar. Los tours publicados no se tocan —son instantáneas compiladas—
   * hasta que alguien los vuelva a publicar.
   */
  r.put("/:orgId/defaults", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "admin");
    const body = z.object({ defaults: z.record(z.unknown()) }).parse(await c.req.json());
    const next = body.defaults as OrgDefaults;
    const changed = INHERITED_KEYS.filter((k) => (next as Record<string, unknown>)[k] !== undefined);

    await db.update(orgs).set({ settingsJson: JSON.stringify(next) }).where(eq(orgs.id, orgId));

    const drafts = await db.select().from(projects).where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)));
    let propagated = 0;
    for (const project of drafts) {
      const current = parseJson<Record<string, unknown>>(project.settingsJson, {});
      const updated = propagateOrgDefaults(current, next, changed);
      if (JSON.stringify(updated) === JSON.stringify(current)) continue;
      await db.update(projects).set({ settingsJson: JSON.stringify(updated), updatedAt: nowMs() }).where(eq(projects.id, project.id));
      propagated++;
    }
    await audit(c, "org.defaults", "org", orgId, { keys: changed, propagated }, orgId);
    return c.json({ ok: true, propagated });
  });

  r.get("/:orgId/defaults", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "reader");
    const row = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
    return c.json(parseJson<OrgDefaults>(row?.settingsJson ?? "{}", {}));
  });

  r.get("/:orgId/usage", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "reader");
    const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
    if (org == null) throw notFound();
    const bytesRow = await db
      .select({ total: sql<number>`coalesce(sum(${media.bytes}), 0)` })
      .from(media)
      .where(and(eq(media.orgId, orgId), isNull(media.deletedAt)));
    const projectsRow = await db
      .select({ total: sql<number>`count(*)` })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)));
    return c.json({
      quotaBytes: org.quotaBytes,
      usedBytes: Number(bytesRow[0]?.total ?? 0),
      quotaTours: org.quotaTours,
      usedTours: Number(projectsRow[0]?.total ?? 0),
    });
  });

  // ------- Miembros -------

  r.get("/:orgId/members", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "reader");
    const rows = await db
      .select({ userId: orgMembers.userId, role: orgMembers.role, name: users.name, email: users.email })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(orgMembers.orgId, orgId));
    const invites = await db.select().from(orgInvites).where(eq(orgInvites.orgId, orgId));
    return c.json({ members: rows, invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })) });
  });

  r.post("/:orgId/members", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const orgId = c.req.param("orgId");
    await requireOrgRole(db, orgId, auth.user, "admin");
    const body = z.object({ email: z.string().email(), role: roleSchema }).parse(await c.req.json());
    const emailNorm = body.email.trim().toLowerCase();
    const existingUser = (await db.select().from(users).where(eq(users.email, emailNorm)).limit(1))[0];
    if (existingUser != null) {
      const existing = await db
        .select()
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, existingUser.id)))
        .limit(1);
      if (existing.length > 0) throw conflict("Ya es miembro");
      await db.insert(orgMembers).values({ orgId, userId: existingUser.id, role: body.role, createdAt: nowMs() });
      await audit(c, "org.member_add", "user", existingUser.id, { role: body.role }, orgId);
      return c.json({ added: true });
    }
    // Invitacion por email
    const token = newToken(24);
    const id = newId();
    await db.insert(orgInvites).values({
      id,
      orgId,
      email: emailNorm,
      role: body.role,
      tokenHash: await sha256Hex(token),
      invitedBy: auth.user.id,
      expiresAt: nowMs() + 14 * 24 * 3600 * 1000,
      createdAt: nowMs(),
    });
    const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
    const url = `${c.get("config").publicUrl}/studio/invite?token=${token}&id=${id}`;
    runtime.deferred(
      runtime.email.send({
        to: emailNorm,
        subject: `Invitación a ${org?.name ?? "ULL360"}`,
        text: `${auth.user.name} te invita a colaborar en "${org?.name}" en ULL360.\n\nAcepta la invitación aquí (caduca en 14 días):\n${url}`,
      }),
    );
    await audit(c, "org.invite", "invite", id, { email: emailNorm, role: body.role }, orgId);
    return c.json({ invited: true, inviteUrl: runtime.email.configured ? undefined : url }, 201);
  });

  r.post("/invites/accept", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const { token, id } = z.object({ token: z.string(), id: z.string() }).parse(await c.req.json());
    const invite = (await db.select().from(orgInvites).where(eq(orgInvites.id, id)).limit(1))[0];
    if (invite == null || invite.expiresAt < nowMs()) throw badRequest("Invitación inválida o caducada");
    if (invite.tokenHash !== (await sha256Hex(token))) throw badRequest("Invitación inválida");
    if (invite.email !== auth.user.email) throw forbidden("La invitación es para otra dirección de email");
    await db.insert(orgMembers).values({ orgId: invite.orgId, userId: auth.user.id, role: invite.role, createdAt: nowMs() });
    await db.delete(orgInvites).where(eq(orgInvites.id, id));
    await audit(c, "org.invite_accept", "org", invite.orgId, {}, invite.orgId);
    return c.json({ orgId: invite.orgId });
  });

  r.patch("/:orgId/members/:userId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    await requireOrgRole(db, orgId, auth.user, "admin");
    const { role } = z.object({ role: roleSchema }).parse(await c.req.json());
    await db
      .update(orgMembers)
      .set({ role })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
    await audit(c, "org.member_role", "user", userId, { role }, orgId);
    return c.json({ ok: true });
  });

  r.delete("/:orgId/members/:userId", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    await requireOrgRole(db, orgId, auth.user, "admin");
    if (userId === auth.user.id) {
      const admins = await db
        .select()
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin")));
      if (admins.length <= 1) throw badRequest("No puedes eliminar al último administrador");
    }
    await db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
    await audit(c, "org.member_remove", "user", userId, {}, orgId);
    return c.json({ ok: true });
  });

  return r;
}
