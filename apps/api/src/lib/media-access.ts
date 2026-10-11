import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { hotspots, media, projectMembers, projects, scenes } from "@andarama/db";
import type { Db, UserRow } from "./context.js";
import { roleAtLeast, type OrgRole } from "./authz.js";

/**
 * Acceso a medios a través de un recorrido compartido (projectMembers).
 *
 * Quien recibe un recorrido de otra organización no tiene rol en ella, pero
 * tiene que ver las miniaturas, los originales y las teselas de lo que usa ese
 * recorrido, y quien puede editarlo, subir medios a él. Nada más: ni el resto
 * de la biblioteca de la organización ni los medios de recorridos que no le
 * han compartido.
 *
 * Las consultas se acotan a los recorridos compartidos con la persona dentro
 * de la organización del medio (índice por usuario de project_members) y a
 * sus escenas (índice por proyecto): nunca se recorren todos los proyectos.
 */

type MediaRow = typeof media.$inferSelect;

export interface SharedProject {
  id: string;
  role: OrgRole;
  settingsJson: string;
}

/** Recorridos vivos de una organización compartidos directamente con la persona. */
export async function sharedProjectsInOrg(db: Db, orgId: string, user: UserRow): Promise<SharedProject[]> {
  const rows = await db
    .select({ id: projects.id, role: projectMembers.role, settingsJson: projects.settingsJson })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, user.id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  return rows.map((r) => ({ ...r, role: r.role as OrgRole }));
}

/**
 * Si alguno de estos recorridos usa el medio: como escena, o como referencia
 * "media:ID", "thumb:ID", "og:ID" o "preview:ID" en los mismos campos que
 * recoge el compilador (fuente, audio y meta de la escena, contenido y estilo
 * de los hotspots, ajustes del recorrido).
 */
async function usedByAny(db: Db, row: MediaRow, candidates: SharedProject[]): Promise<boolean> {
  if (candidates.length === 0) return false;
  // Las referencias van entre comillas en el JSON guardado: «:ID"» solo
  // casa con la referencia completa, no con un identificador más largo.
  const needle = `:${row.id}"`;
  if (candidates.some((p) => p.settingsJson.includes(needle))) return true;
  const ids = candidates.map((p) => p.id);
  const inScene = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(
      and(
        inArray(scenes.projectId, ids),
        or(
          eq(scenes.mediaId, row.id),
          sql`instr(coalesce(${scenes.sourceJson}, ''), ${needle}) > 0`,
          sql`instr(coalesce(${scenes.audioJson}, ''), ${needle}) > 0`,
          sql`instr(${scenes.metaJson}, ${needle}) > 0`,
        ),
      ),
    )
    .limit(1);
  if (inScene.length > 0) return true;
  const inHotspot = await db
    .select({ id: hotspots.id })
    .from(hotspots)
    .innerJoin(scenes, eq(hotspots.sceneId, scenes.id))
    .where(
      and(
        inArray(scenes.projectId, ids),
        or(
          sql`instr(${hotspots.contentJson}, ${needle}) > 0`,
          sql`instr(coalesce(${hotspots.styleJson}, ''), ${needle}) > 0`,
        ),
      ),
    )
    .limit(1);
  return inHotspot.length > 0;
}

/**
 * Acceso a un medio por compartición de recorrido.
 * - "read": algún recorrido compartido (con cualquier rol) lo tiene asignado o lo usa.
 * - "edit": está asignado (media.projectId) a un recorrido compartido con
 *   permiso de edición. Lo que solo se usa desde el recorrido pero es de la
 *   biblioteca general de la organización no se toca: rehacerlo, renombrarlo
 *   o borrarlo afectaría a otros recorridos.
 */
export async function mediaSharedAccess(db: Db, row: MediaRow, user: UserRow, need: "read" | "edit"): Promise<boolean> {
  const shared = await sharedProjectsInOrg(db, row.orgId, user);
  if (need === "edit") {
    return row.projectId != null && shared.some((p) => p.id === row.projectId && roleAtLeast(p.role, "collaborator"));
  }
  if (row.projectId != null && shared.some((p) => p.id === row.projectId)) return true;
  return usedByAny(db, row, shared);
}
