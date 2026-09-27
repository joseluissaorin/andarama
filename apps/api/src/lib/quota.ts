import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { media, orgMembers, orgs, projects, users } from "@andarama/db";
import type { AppConfig, Db } from "./context.js";
import { notFound, quotaExceeded } from "./errors.js";
import { effectivePlan, quotaForPlan, type EffectivePlan } from "./plans.js";

/**
 * Cuota efectiva de una organización.
 *
 * En el self-host manda lo que fijó el administrador en la propia
 * organización. En la instancia alojada (con Clerk) manda el plan de quien
 * responde de la organización; el administrador de la instancia y quien
 * tenga un plan concedido a mano conservan la cuota fijada en la
 * organización, que es la manera de dar cortesías.
 *
 * La cuota de un plan es de la persona, no de cada organización: el uso se
 * suma en todas las organizaciones de las que responde el dueño, para que
 * abrir organizaciones nuevas no multiplique lo que compró.
 */

export interface OrgQuota {
  quotaTours: number;
  quotaBytes: number;
  /** Plan del que sale la cuota (solo en modo alojado); "prueba" durante la prueba gratuita. */
  plan: EffectivePlan | null;
  /** La cuota viene de un plan de pago (true) o la fijó el administrador (false). */
  fromPlan: boolean;
  ownerId: string | null;
  /** Organizaciones cuyo uso cuenta contra esta cuota (todas las del dueño si sale de un plan). */
  scopeOrgIds: string[];
}

type OrgRow = typeof orgs.$inferSelect;

export async function orgQuota(db: Db, config: AppConfig, org: OrgRow): Promise<OrgQuota> {
  const local = { quotaTours: org.quotaTours, quotaBytes: org.quotaBytes, plan: null, fromPlan: false, ownerId: org.ownerId, scopeOrgIds: [org.id] };
  if (config.clerk == null) return local;

  const ownerId = org.ownerId ?? (await firstAdmin(db, org.id));
  if (ownerId == null) return { ...local, quotaTours: 0, quotaBytes: 0 };
  const owner = (await db.select().from(users).where(eq(users.id, ownerId)).limit(1))[0];
  if (owner == null) return { ...local, ownerId, quotaTours: 0, quotaBytes: 0 };
  const plan = effectivePlan(owner);
  // El administrador de la instancia no se cobra a sí mismo
  if (owner.roleGlobal === "admin") return { ...local, ownerId, plan };
  const q = quotaForPlan(plan);
  const owned = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.ownerId, ownerId));
  const scopeOrgIds = [...new Set([org.id, ...owned.map((o) => o.id)])];
  return { quotaTours: q.quotaTours, quotaBytes: q.quotaBytes, plan, fromPlan: true, ownerId, scopeOrgIds };
}

/** Recorridos vivos (fuera de la papelera) que cuentan contra la cuota. */
export async function usedTours(db: Db, quota: OrgQuota): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)` })
    .from(projects)
    .where(and(inArray(projects.orgId, quota.scopeOrgIds), isNull(projects.deletedAt)));
  return Number(rows[0]?.total ?? 0);
}

/** Bytes de medios vivos que cuentan contra la cuota. */
export async function usedBytes(db: Db, quota: OrgQuota): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${media.bytes}), 0)` })
    .from(media)
    .where(and(inArray(media.orgId, quota.scopeOrgIds), isNull(media.deletedAt)));
  return Number(rows[0]?.total ?? 0);
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
  if ((await usedTours(db, quota)) >= quota.quotaTours) {
    const detail =
      quota.fromPlan && quota.plan == null
        ? "Hace falta un plan para crear recorridos en esta instancia"
        : quota.fromPlan
          ? `Tu plan ha alcanzado su cuota de ${quota.quotaTours} recorridos, sumando todas tus organizaciones`
          : `La organización ha alcanzado su cuota de ${quota.quotaTours} recorridos`;
    throw quotaExceeded(detail, { code: "quota_tours", plan: quota.plan, limit: quota.quotaTours });
  }
  return quota;
}
