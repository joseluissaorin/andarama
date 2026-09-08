import { and, asc, eq, isNull } from "drizzle-orm";
import { orgMembers, orgs, projects, users } from "@andarama/db";
import type { AppConfig, Db } from "./context.js";
import { notFound, quotaExceeded } from "./errors.js";
import { effectivePlan, quotaForPlan, type PlanSlug } from "./plans.js";

/**
 * Cuota efectiva de una organización.
 *
 * En el self-host manda lo que fijó el administrador en la propia
 * organización. En la instancia alojada (con Clerk) manda el plan de quien
 * responde de la organización; el administrador de la instancia y quien
 * tenga un plan concedido a mano conservan la cuota fijada en la
 * organización, que es la manera de dar cortesías.
 */

export interface OrgQuota {
  quotaTours: number;
  quotaBytes: number;
  /** Plan del que sale la cuota (solo en modo alojado). */
  plan: PlanSlug | null;
  /** La cuota viene de un plan de pago (true) o la fijó el administrador (false). */
  fromPlan: boolean;
  ownerId: string | null;
}

type OrgRow = typeof orgs.$inferSelect;

export async function orgQuota(db: Db, config: AppConfig, org: OrgRow): Promise<OrgQuota> {
  const local = { quotaTours: org.quotaTours, quotaBytes: org.quotaBytes, plan: null, fromPlan: false, ownerId: org.ownerId };
  if (config.clerk == null) return local;

  const ownerId = org.ownerId ?? (await firstAdmin(db, org.id));
  if (ownerId == null) return { ...local, quotaTours: 0, quotaBytes: 0 };
  const owner = (await db.select().from(users).where(eq(users.id, ownerId)).limit(1))[0];
  if (owner == null) return { ...local, ownerId, quotaTours: 0, quotaBytes: 0 };
  const plan = effectivePlan(owner);
  // El administrador de la instancia no se cobra a sí mismo
  if (owner.roleGlobal === "admin") return { ...local, ownerId, plan };
  const q = quotaForPlan(plan);
  return { quotaTours: q.quotaTours, quotaBytes: q.quotaBytes, plan, fromPlan: true, ownerId };
}

/** Organizaciones anteriores a la columna owner_id: responde su primer admin. */
async function firstAdmin(db: Db, orgId: string): Promise<string | null> {
  const rows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin")))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1);
  return rows[0]?.userId ?? null;
}

/** Comprueba que la organización puede recibir un proyecto más. */
export async function assertTourQuota(db: Db, config: AppConfig, orgId: string): Promise<OrgQuota> {
  const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
  if (org == null) throw notFound("Organización no encontrada");
  const quota = await orgQuota(db, config, org);
  const count = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  if (count.length >= quota.quotaTours) {
    const detail =
      quota.fromPlan && quota.plan == null
        ? "Hace falta un plan para crear recorridos en esta instancia"
        : `La organización ha alcanzado su cuota de ${quota.quotaTours} recorridos`;
    throw quotaExceeded(detail, { code: "quota_tours", plan: quota.plan, limit: quota.quotaTours });
  }
  return quota;
}
