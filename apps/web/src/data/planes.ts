/**
 * Las tarjetas de la sección de precios, a partir de `plans.ts` de la API
 * (una sola fuente de verdad para cuotas y precios) y de los textos de i18n
 * (`precios.*` en cada JSON).
 *
 * Seis planes alojados en dos bloques (D11): «Para crear» (Andar, Paseo,
 * Excursión, De por vida) y «Para enseñar» (Aula, Formación). Todos se
 * muestran en dólares, tal cual los cobra la pasarela (Aula, 42 $ al año por
 * docente). La instalación propia gratuita va aparte, en una línea bajo los
 * bloques, y como tarjeta en `tarjetaCasa` para quien la quiera.
 */
import { PLANS, TRIAL_DAYS as API_TRIAL_DAYS, type PlanInfo, type PlanSlug } from "../../../api/src/lib/plans";
import { t, tv, type Lang } from "../i18n";

/** Duración de la prueba gratuita (la misma que aplica la API). */
export const TRIAL_DAYS: number = API_TRIAL_DAYS;


export type PlanCardKind = "casa" | PlanSlug;

export interface PlanCard {
  kind: PlanCardKind;
  name: string;
  /** La cifra grande («20 $», «42 $», «0 €»). */
  figure: string;
  /** Cuándo se paga («al mes», «al año por docente», «para siempre»). */
  when: string;
  /** Línea opcional con el precio anual («o 200 $ al año»). */
  yearly?: string;
  items: string[];
  href: string;
  cta: string;
}

/** Los dos bloques de planes alojados, cada uno de menor a mayor. */
export const BLOQUES = {
  crear: ["andar", "paseo", "excursion", "vitalicio"],
  ensenar: ["aula", "formacion"],
} as const satisfies Record<string, readonly PlanSlug[]>;

export type BloquePlanes = keyof typeof BLOQUES;

const GB = 1024 * 1024 * 1024;

/** Enlace del Studio con el plan preseleccionado. */
export function planHref(slug: PlanSlug): string {
  return `https://app.andarama.com/plan?plan=${slug}`;
}

function cifra(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function usd(lang: Lang, cents: number): string {
  return t(lang, "precios.formato.usd", { n: cifra(cents / 100) });
}

function tarjetaAlojada(lang: Lang, plan: PlanInfo): PlanCard {
  const esAula = plan.slug === "aula";
  // Aula se cobra en dólares como todo lo demás (42 $ al año por docente): sin equivalentes en euros que no cobre nadie
  const figure = usd(lang, plan.amountCents);
  const periodo = t(lang, `precios.periodo.${plan.period}`);
  const when = esAula ? `${periodo} ${t(lang, "precios.periodo.por_docente")}` : periodo;
  const yearly = plan.yearlyAmountCents != null ? t(lang, "precios.periodo.o_anual", { precio: usd(lang, plan.yearlyAmountCents) }) : undefined;
  const recorridos = plan.quotaTours === 1 ? t(lang, "precios.recorridos.uno") : t(lang, "precios.recorridos.varios", { n: plan.quotaTours });
  const medios = t(lang, "precios.medios", { n: Math.round(plan.quotaBytes / GB) });
  const propios = tv<string[]>(lang, `precios.planes.${plan.slug}.items`) ?? [];
  return {
    kind: plan.slug,
    name: plan.name,
    figure,
    when,
    yearly,
    items: [recorridos, medios, t(lang, "precios.todo"), ...propios],
    href: planHref(plan.slug),
    cta: t(lang, `precios.planes.${plan.slug}.cta`),
  };
}

export function tarjetaCasa(lang: Lang): PlanCard {
  return {
    kind: "casa",
    name: t(lang, "precios.planes.casa.nombre"),
    figure: t(lang, "precios.planes.casa.cifra"),
    when: t(lang, "precios.planes.casa.cuando"),
    items: tv<string[]>(lang, "precios.planes.casa.items") ?? [],
    href: CASA_URL,
    cta: t(lang, "precios.planes.casa.cta"),
  };
}

/** Las tarjetas de un bloque en el idioma pedido. */
export function planCards(lang: Lang, bloque: BloquePlanes): PlanCard[] {
  return BLOQUES[bloque].map((slug) => tarjetaAlojada(lang, PLANS[slug]));
}

/** Dónde se explica cómo instalarlo gratis (la documentación del ejecutable). */
export const CASA_URL = "https://docs.andarama.com/despliegue/escritorio/";
