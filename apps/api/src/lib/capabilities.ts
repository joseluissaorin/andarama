import { eq } from "drizzle-orm";
import { orgs, projects, publications, users } from "@andarama/db";
import type { AppConfig, Db } from "./context.js";
import { capabilityMissing, planRequired } from "./errors.js";
import { planHas, planName, type EffectivePlan, type PlanCapability } from "./plans.js";
import { orgQuota } from "./quota.js";

/**
 * Capacidades por plan en la instancia alojada.
 *
 * Igual que la cuota, la capacidad la da el plan de quien responde de la
 * organización; el administrador de la instancia lo tiene todo. En el
 * self-host no hay planes y todo está permitido: estas funciones devuelven
 * siempre que sí.
 */

export interface OrgPlan {
  plan: EffectivePlan | null;
  /** Sin planes (self-host) o administrador de la instancia: nada se limita. */
  unlimited: boolean;
}

/** Plan del que salen las capacidades de una organización. */
export async function orgPlan(db: Db, config: AppConfig, orgId: string): Promise<OrgPlan> {
  if (config.clerk == null) return { plan: null, unlimited: true };
  const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
  if (org == null) return { plan: null, unlimited: false };
  const quota = await orgQuota(db, config, org);
  if (!quota.fromPlan) return { plan: quota.plan, unlimited: true };
  return { plan: quota.plan, unlimited: false };
}

/** ¿Puede la organización usar esta capacidad? */
export async function orgHas(db: Db, config: AppConfig, orgId: string, capability: PlanCapability): Promise<boolean> {
  const { plan, unlimited } = await orgPlan(db, config, orgId);
  return unlimited || planHas(plan, capability);
}

const DESCRIPCION: Record<PlanCapability, string> = {
  classroom: "el código de clase",
  scorm: "la exportación SCORM",
  lti: "el lanzamiento desde un LMS (LTI)",
  whiteLabel: "la marca blanca",
  customDomain: "el dominio propio",
  team: "el trabajo en equipo",
  invoice: "la factura con datos fiscales",
};

/** Lanza 403 con el código de la capacidad si el plan no la incluye. */
export async function requireOrgCapability(db: Db, config: AppConfig, orgId: string, capability: PlanCapability): Promise<void> {
  const { plan, unlimited } = await orgPlan(db, config, orgId);
  if (unlimited || planHas(plan, capability)) return;
  const nombre = planName(plan);
  throw capabilityMissing(
    nombre != null
      ? `El plan ${nombre} no incluye ${DESCRIPCION[capability]}`
      : `Hace falta un plan que incluya ${DESCRIPCION[capability]}`,
    { capability, plan },
  );
}

/**
 * ¿Tiene la organización un plan vigente (o la prueba sin caducar)? En el
 * self-host, y si responde el administrador de la instancia, siempre.
 */
export async function orgPlanActive(db: Db, config: AppConfig, orgId: string): Promise<boolean> {
  const { plan, unlimited } = await orgPlan(db, config, orgId);
  return unlimited || plan != null;
}

/**
 * Lo que pasa al acabar la prueba: el recorrido publicado sigue en línea con
 * la insignia y exportar sigue libre (es la promesa), pero editar, republicar
 * y subir medios exigen plan. Lanza 403 con `code: "plan_required"`.
 */
export async function requireActivePlan(db: Db, config: AppConfig, orgId: string): Promise<void> {
  if (config.clerk == null) return;
  const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
  if (org == null) return;
  const quota = await orgQuota(db, config, org);
  if (!quota.fromPlan || quota.plan != null) return;
  let trialEnded = false;
  if (quota.ownerId != null) {
    const owner = (await db.select({ trialEndsAt: users.trialEndsAt }).from(users).where(eq(users.id, quota.ownerId)).limit(1))[0];
    trialEnded = owner?.trialEndsAt != null;
  }
  throw planRequired(
    trialEnded
      ? "La prueba gratuita ha terminado: el recorrido publicado sigue en línea y puedes exportarlo, pero para editar, republicar o subir medios hace falta un plan"
      : "Hace falta un plan para editar, publicar o subir medios en esta instancia",
    { plan: null, trialEnded },
  );
}

/** Organización dueña de un recorrido publicado, por su slug. */
export async function orgIdOfSlug(db: Db, slug: string): Promise<string | null> {
  const row = (await db
    .select({ orgId: projects.orgId })
    .from(publications)
    .innerJoin(projects, eq(publications.projectId, projects.id))
    .where(eq(publications.slug, slug))
    .limit(1))[0];
  return row?.orgId ?? null;
}
