import { and, eq, isNull } from "drizzle-orm";
import { orgMembers, projectMembers, projects } from "@ull360/db";
import type { Db, UserRow } from "./context.js";
import { forbidden, notFound } from "./errors.js";

/**
 * Autorizacion comprobada en servidor en cada operacion (§4.2).
 * Roles de organizacion: admin > editor > collaborator > reader.
 * Roles de proyecto (comparticion): editor > collaborator > reader.
 */

export type OrgRole = "admin" | "editor" | "collaborator" | "reader";
const ORG_ORDER: Record<OrgRole, number> = { admin: 3, editor: 2, collaborator: 1, reader: 0 };

export function isInstanceAdmin(user: UserRow): boolean {
  return user.roleGlobal === "admin";
}

export async function orgRole(db: Db, orgId: string, user: UserRow): Promise<OrgRole | null> {
  if (isInstanceAdmin(user)) return "admin";
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1);
  return (rows[0]?.role as OrgRole | undefined) ?? null;
}

export async function requireOrgRole(db: Db, orgId: string, user: UserRow, min: OrgRole): Promise<OrgRole> {
  const role = await orgRole(db, orgId, user);
  if (role == null || ORG_ORDER[role] < ORG_ORDER[min]) {
    throw forbidden("No tienes permisos suficientes en esta organización");
  }
  return role;
}

export interface ProjectAccess {
  project: typeof projects.$inferSelect;
  /** Rol efectivo sobre el proyecto. */
  role: OrgRole;
  canEdit: boolean;
  canPublish: boolean;
  canManage: boolean;
}

/**
 * Resuelve el acceso a un proyecto combinando rol de organizacion y
 * comparticion directa. editor de org: todo sobre sus proyectos y los
 * compartidos; collaborator: editar compartidos sin publicar; reader: ver.
 */
export async function projectAccess(db: Db, projectId: string, user: UserRow, opts: { allowTrashed?: boolean } = {}): Promise<ProjectAccess> {
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (project == null || (project.deletedAt != null && opts.allowTrashed !== true)) throw notFound("Proyecto no encontrado");

  let role = await orgRole(db, project.orgId, user);
  // Comparticion directa del proyecto
  const shared = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
    .limit(1);
  const sharedRole = shared[0]?.role as OrgRole | undefined;
  if (sharedRole != null && (role == null || ORG_ORDER[sharedRole] > ORG_ORDER[role])) {
    role = sharedRole;
  }
  if (role == null) throw forbidden("No tienes acceso a este proyecto");

  const isOwner = project.createdBy === user.id;
  const canManage = role === "admin" || (role === "editor" && isOwner) || sharedRole === "editor";
  const canEdit = ORG_ORDER[role] >= ORG_ORDER.collaborator;
  const canPublish = role === "admin" || role === "editor" || sharedRole === "editor";
  return { project, role, canEdit, canPublish, canManage };
}

export async function listAccessibleProjects(db: Db, orgId: string, user: UserRow): Promise<(typeof projects.$inferSelect)[]> {
  const role = await orgRole(db, orgId, user);
  const all = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  if (role != null && ORG_ORDER[role] >= ORG_ORDER.reader && role !== "collaborator") {
    return all;
  }
  // collaborator externo o sin rol de org: solo compartidos
  const shared = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, user.id));
  const ids = new Set(shared.map((s) => s.projectId));
  return all.filter((p) => ids.has(p.id) || (role === "collaborator" && p.createdBy === user.id));
}
