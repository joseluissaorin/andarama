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
 * sesión los trae en el claim `pla` ("u:paseo"). Un mismo slug sirve para el
 * precio mensual y el anual (Clerk los trata como dos precios del mismo
 * plan). El plan vitalicio también vive en Clerk (pago único), y además
 * puede concederse a mano desde el panel de administración (`plan_override`).
 *
 * Además de los planes de pago existe la **prueba**: catorce días sin tarjeta
 * al crear la cuenta, con cuota pequeña y sin marca blanca. No es un plan de
 * Clerk (no se compra); sale de la columna `trial_ends_at` del usuario.
 */

export type PlanSlug = "andar" | "aula" | "paseo" | "excursion" | "formacion" | "vitalicio";

/** Lo que puede resolver `effectivePlan`: un plan de pago o la prueba. */
export type EffectivePlan = PlanSlug | "prueba";

/**
 * Capacidades que un plan enciende o apaga en la instancia alojada. En el
 * self-host todas están permitidas: allí no hay planes.
 */
export type PlanCapability =
  /** Código de clase, quiz con nota y escape room (aulas). */
  | "classroom"
  /** Exportación como paquete SCORM. */
  | "scorm"
  /** Lanzamiento desde un LMS por LTI 1.3. */
  | "lti"
  /** Sin la insignia «Hecho con Andarama» en los recorridos publicados. */
  | "whiteLabel"
  /** Servir un recorrido bajo un dominio propio (CNAME). */
  | "customDomain"
  /** Varias personas editando en la misma organización. */
  | "team"
  /** Factura con datos fiscales. */
  | "invoice";

export interface PlanInfo {
  slug: PlanSlug;
  name: string;
  /** Precio en la moneda de Clerk (por ahora USD), en céntimos. */
  amountCents: number;
  /** month | year | once */
  period: "month" | "year" | "once";
  /** Precio anual en céntimos cuando el plan también se vende por años. */
  yearlyAmountCents?: number;
  quotaTours: number;
  quotaBytes: number;
  /** Orden de menor a mayor: un cupón nunca rebaja el plan que ya se tiene. */
  rank: number;
  capabilities: PlanCapability[];
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const PLANS: Record<PlanSlug, PlanInfo> = {
  andar: {
    slug: "andar",
    name: "Andar",
    amountCents: 200,
    period: "month",
    quotaTours: 1,
    quotaBytes: 5 * GB,
    rank: 1,
    capabilities: [],
  },
  aula: {
    slug: "aula",
    name: "Aula",
    // En Clerk (13-09-2026): 42 $/año, y también 4 $/mes; aquí se anuncia el anual
    amountCents: 4200,
    period: "year",
    quotaTours: 5,
    quotaBytes: 10 * GB,
    rank: 2,
    capabilities: ["classroom"],
  },
  paseo: {
    slug: "paseo",
    name: "Paseo",
    amountCents: 2000,
    period: "month",
    // Clerk cobra el anual como 16,67 $/mes × 12 = 200,04 $
    yearlyAmountCents: 20000,
    quotaTours: 10,
    quotaBytes: 50 * GB,
    rank: 3,
    capabilities: [],
  },
  excursion: {
    slug: "excursion",
    name: "Excursión",
    // En Clerk también existe el mensual a 50 $ (el anual son 41,67 $/mes × 12 = 500,04 $)
    amountCents: 50000,
    period: "year",
    quotaTours: 500,
    quotaBytes: 100 * GB,
    rank: 4,
    capabilities: ["whiteLabel", "customDomain"],
  },
  formacion: {
    slug: "formacion",
    name: "Formación",
    amountCents: 9900,
    period: "month",
    yearlyAmountCents: 99000,
    quotaTours: 100,
    quotaBytes: 200 * GB,
    rank: 5,
    capabilities: ["scorm", "lti", "whiteLabel", "customDomain", "team", "invoice"],
  },
  vitalicio: {
    slug: "vitalicio",
    name: "De por vida",
    amountCents: 100000,
    period: "once",
    quotaTours: 1000,
    quotaBytes: 200 * GB,
    rank: 6,
    capabilities: ["whiteLabel", "customDomain"],
  },
};

/** Duración de la prueba gratuita al crear la cuenta. */
export const TRIAL_DAYS = 14;
export const TRIAL_MS = TRIAL_DAYS * 24 * 3600 * 1000;

/** La prueba: un recorrido, medio giga, con insignia. No se compra. */
export const TRIAL_PLAN = {
  slug: "prueba" as const,
  name: "Prueba gratuita",
  quotaTours: 1,
  quotaBytes: 500 * MB,
  capabilities: [] as PlanCapability[],
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

export interface PlanSource {
  plan: string | null;
  planOverride: string | null;
  /** Fin de la prueba gratuita (epoch ms); null si nunca la tuvo. */
  trialEndsAt?: number | null;
}

/**
 * El plan efectivo de un usuario: lo concedido a mano manda sobre lo que dice
 * Clerk; sin ninguno de los dos, la prueba mientras no haya caducado.
 */
export function effectivePlan(user: PlanSource, now: number = Date.now()): EffectivePlan | null {
  if (isPlanSlug(user.planOverride)) return user.planOverride;
  if (isPlanSlug(user.plan)) return user.plan;
  if (user.trialEndsAt != null && user.trialEndsAt > now) return "prueba";
  return null;
}

/** Solo el plan de pago, sin contar la prueba (para cupones y facturación). */
export function paidPlan(user: PlanSource): PlanSlug | null {
  const plan = effectivePlan(user);
  return plan != null && plan !== "prueba" ? plan : null;
}

/** Orden de un plan; sin plan (o en prueba), cero. Sirve para no rebajar a nadie al canjear un cupón. */
export function planRank(plan: EffectivePlan | null): number {
  return plan == null || plan === "prueba" ? 0 : PLANS[plan].rank;
}

export function quotaForPlan(plan: EffectivePlan | null): { quotaTours: number; quotaBytes: number } {
  if (plan == null) return { ...NO_PLAN_QUOTA };
  if (plan === "prueba") return { quotaTours: TRIAL_PLAN.quotaTours, quotaBytes: TRIAL_PLAN.quotaBytes };
  const info = PLANS[plan];
  return { quotaTours: info.quotaTours, quotaBytes: info.quotaBytes };
}

/** Nombre legible de un plan efectivo (incluida la prueba). */
export function planName(plan: EffectivePlan | null): string | null {
  if (plan == null) return null;
  return plan === "prueba" ? TRIAL_PLAN.name : PLANS[plan].name;
}

/** Capacidades de un plan efectivo; sin plan, ninguna. */
export function planCapabilities(plan: EffectivePlan | null): PlanCapability[] {
  if (plan == null) return [];
  return plan === "prueba" ? [...TRIAL_PLAN.capabilities] : [...PLANS[plan].capabilities];
}

/** ¿Tiene el plan esta capacidad? Solo tiene sentido en modo alojado. */
export function planHas(plan: EffectivePlan | null, capability: PlanCapability): boolean {
  return planCapabilities(plan).includes(capability);
}
