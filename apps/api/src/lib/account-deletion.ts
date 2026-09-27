import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  comments,
  formSubmissions,
  jobs,
  ltiRegistrations,
  media,
  orgInvites,
  orgMembers,
  orgs,
  projects,
  publications,
  quizResults,
  users,
  webhooks,
} from "@andarama/db";
import type { PlatformRuntime } from "@andarama/adapters";
import type { Db } from "./context.js";

/**
 * Supresión de una cuenta (derecho de supresión del RGPD), la pida Clerk por
 * webhook o el propio sistema.
 *
 * - Las organizaciones en las que la persona es el único miembro se borran
 *   enteras: proyectos, publicaciones (con su copia servida y su dominio),
 *   medios en el almacenamiento, formularios, resultados y registros LTI.
 * - En las organizaciones compartidas se retira su pertenencia; si respondía
 *   de ellas, pasa a responder el administrador más antiguo que quede. Lo que
 *   creó allí es de la organización y se queda, sin su nombre: sus
 *   comentarios pasan a un autor anónimo.
 * - Sus filas personales (sesiones, tokens, invitaciones a su correo) se
 *   borran con la fila del usuario o aquí mismo.
 *
 * El registro de auditoría conserva el identificador opaco, que ya no apunta
 * a ningún dato personal.
 */

export const ANONYMOUS_AUTHOR = "usuario-eliminado";

export interface DeletionSummary {
  userId: string;
  orgsDeleted: number;
  orgsLeft: number;
  projectsDeleted: number;
  mediaDeleted: number;
  ownershipTransferred: number;
}

export async function deleteUserData(db: Db, runtime: PlatformRuntime, userId: string): Promise<DeletionSummary | null> {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (user == null) return null;
  const summary: DeletionSummary = { userId, orgsDeleted: 0, orgsLeft: 0, projectsDeleted: 0, mediaDeleted: 0, ownershipTransferred: 0 };

  const memberships = await db.select().from(orgMembers).where(eq(orgMembers.userId, userId));
  for (const m of memberships) {
    const others = await db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, m.orgId), ne(orgMembers.userId, userId)))
      .orderBy(asc(orgMembers.createdAt));
    if (others.length === 0) {
      const counts = await purgeOrg(db, runtime, m.orgId);
      summary.orgsDeleted++;
      summary.projectsDeleted += counts.projects;
      summary.mediaDeleted += counts.media;
    } else {
      await db.delete(orgMembers).where(and(eq(orgMembers.orgId, m.orgId), eq(orgMembers.userId, userId)));
      const org = (await db.select().from(orgs).where(eq(orgs.id, m.orgId)).limit(1))[0];
      if (org?.ownerId === userId) {
        const heir = others.find((o) => o.role === "admin") ?? null;
        await db.update(orgs).set({ ownerId: heir?.userId ?? null }).where(eq(orgs.id, m.orgId));
        summary.ownershipTransferred++;
      }
      summary.orgsLeft++;
    }
  }
  // Organizaciones de las que respondía sin ser miembro (altas del panel)
  await db.update(orgs).set({ ownerId: null }).where(eq(orgs.ownerId, userId));

  await db.update(comments).set({ authorId: ANONYMOUS_AUTHOR }).where(eq(comments.authorId, userId));
  await db.delete(orgInvites).where(eq(orgInvites.email, user.email));
  // Sesiones, tokens de API y de correo, y comparticiones caen en cascada
  await db.delete(users).where(eq(users.id, userId));
  return summary;
}

/** Borra una organización entera, con lo que tiene en el almacenamiento. */
async function purgeOrg(db: Db, runtime: PlatformRuntime, orgId: string): Promise<{ projects: number; media: number }> {
  const projectRows = await db.select({ id: projects.id }).from(projects).where(eq(projects.orgId, orgId));
  const projectIds = projectRows.map((p) => p.id);
  if (projectIds.length > 0) {
    const pubs = await db.select().from(publications).where(inArray(publications.projectId, projectIds));
    for (const pub of pubs) {
      await runtime.storage.deletePrefix(`pub/${pub.slug}/`);
      await runtime.kv.delete(`pub:${pub.slug}`);
      if (pub.customDomain != null) await runtime.kv.delete(`domain:${pub.customDomain}`);
    }
    // Sin clave foránea: se borran a mano
    await db.delete(formSubmissions).where(inArray(formSubmissions.projectId, projectIds));
    await db.delete(quizResults).where(inArray(quizResults.projectId, projectIds));
  }
  const mediaRows = await db.select({ id: media.id, r2Key: media.r2Key }).from(media).where(eq(media.orgId, orgId));
  for (const row of mediaRows) {
    await runtime.storage.delete(row.r2Key);
    await runtime.storage.deletePrefix(`tiles/${row.id}/`);
    await runtime.storage.deletePrefix(`derived/${row.id}/`);
  }
  await runtime.storage.deletePrefix(`media/${orgId}/`);
  await db.delete(jobs).where(eq(jobs.orgId, orgId));
  await db.delete(webhooks).where(eq(webhooks.orgId, orgId));
  await db.delete(ltiRegistrations).where(eq(ltiRegistrations.orgId, orgId));
  // Proyectos (escenas, versiones, publicaciones...), medios, miembros e
  // invitaciones caen en cascada con la organización
  await db.delete(orgs).where(eq(orgs.id, orgId));
  return { projects: projectIds.length, media: mediaRows.length };
}
