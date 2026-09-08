/**
 * Planes de la instancia alojada (andarama.com).
 *
 * El plan gratuito es montárselo en casa: el código es abierto y el
 * self-host no tiene ninguna de estas cuotas (allí manda el administrador
 * de la instancia). Aquí se describe lo que compra quien prefiere no
 * mantener un servidor. Todos los planes son de proyectos limitados y
 * están sujetos a una política de uso razonable.
 *
 * Los slugs coinciden con los planes definidos en Clerk Billing; el token de
 * sesión los trae en el claim `pla` ("u:paseo"). El plan vitalicio también
 * vive en Clerk (pago único), y además puede concederse a mano desde el
 * panel de administración (`plan_override`).
 */

export type PlanSlug = "andar" | "paseo" | "excursion" | "vitalicio";

export interface PlanInfo {
  slug: PlanSlug;
  name: string;
  /** Precio en la moneda de Clerk (por ahora USD), en céntimos. */
  amountCents: number;
  /** month | year | once */
  period: "month" | "year" | "once";
  quotaTours: number;
  quotaBytes: number;
}

const GB = 1024 * 1024 * 1024;

export const PLANS: Record<PlanSlug, PlanInfo> = {
  andar: { slug: "andar", name: "Andar", amountCents: 200, period: "month", quotaTours: 1, quotaBytes: 5 * GB },
  paseo: { slug: "paseo", name: "Paseo", amountCents: 2000, period: "month", quotaTours: 10, quotaBytes: 50 * GB },
  excursion: { slug: "excursion", name: "Excursión", amountCents: 50000, period: "year", quotaTours: 500, quotaBytes: 100 * GB },
  vitalicio: { slug: "vitalicio", name: "De por vida", amountCents: 100000, period: "once", quotaTours: 1000, quotaBytes: 200 * GB },
};

/** Sin plan de pago no se puede crear ningún proyecto en la instancia alojada. */
export const NO_PLAN_QUOTA = { quotaTours: 0, quotaBytes: 0 };

export function isPlanSlug(value: string | null | undefined): value is PlanSlug {
  return value != null && Object.hasOwn(PLANS, value);
}

/**
 * Traduce el claim `pla` del token de Clerk ("u:paseo", "o:pro") al slug del
 * plan de usuario. El plan gratuito por defecto de Clerk (`free_user`) no es
 * un plan de Andarama: equivale a no tener plan.
 */
export function planFromClaim(pla: unknown): PlanSlug | null {
  if (typeof pla !== "string") return null;
  for (const part of pla.split(",")) {
    const [scope, slug] = part.trim().split(":");
    if (scope === "u" && isPlanSlug(slug)) return slug;
  }
  return null;
}

/** El plan efectivo de un usuario: lo concedido a mano manda sobre lo que dice Clerk. */
export function effectivePlan(user: { plan: string | null; planOverride: string | null }): PlanSlug | null {
  if (isPlanSlug(user.planOverride)) return user.planOverride;
  if (isPlanSlug(user.plan)) return user.plan;
  return null;
}

export function quotaForPlan(plan: PlanSlug | null): { quotaTours: number; quotaBytes: number } {
  if (plan == null) return { ...NO_PLAN_QUOTA };
  const info = PLANS[plan];
  return { quotaTours: info.quotaTours, quotaBytes: info.quotaBytes };
}
