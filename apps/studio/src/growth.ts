import { api } from "./api";
import { clearAttribution, pendingAttribution } from "./attribution";
import type { Me } from "./stores";

/**
 * Medición del embudo en la instancia alojada: Plausible y atribución.
 *
 * Cuatro eventos, sin datos personales: `registro` (la primera vez que
 * existe la cuenta local), `prueba_inicio` (si esa cuenta arranca en prueba),
 * `primer_publicado` (la primera vez que publica un recorrido suyo, que es
 * la activación) y `pago` con el plan (cuando el plan de Clerk pasa de nada
 * a algo). Lo que
 * ya se ha contado se apunta en localStorage por usuario para no repetirlo
 * al recargar. En el self-host no hay Plausible ni Clerk: nada de esto corre.
 */

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: Record<string, string | number | boolean> }) => void;
  }
}

/** Manda un evento a Plausible si el script está (lo inyecta el worker en modo Clerk). */
export function trackEvent(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    window.plausible?.(name, props != null ? { props } : undefined);
  } catch {
    // la medición nunca rompe el Studio
  }
}

/** Ventana en la que una cuenta recién creada cuenta como alta nueva. */
const ALTA_RECIENTE_MS = 15 * 60 * 1000;

export interface GrowthDeps {
  storage: Pick<Storage, "getItem" | "setItem">;
  track: (name: string, props?: Record<string, string | number | boolean>) => void;
  now?: () => number;
}

/** Lo que decide `onMeLoaded`, separado del envío para poder probarlo. */
export interface GrowthDecision {
  registro: boolean;
  pruebaInicio: boolean;
  /** Plan por el que se dispara `pago`, o null si no toca. */
  pago: string | null;
}

/**
 * Decide qué eventos disparar con lo que devuelve `/me`, y deja apuntado en
 * el almacenamiento lo ya contado. Es idempotente entre recargas.
 */
export function decideGrowth(me: Me, deps: GrowthDeps): GrowthDecision {
  const nada: GrowthDecision = { registro: false, pruebaInicio: false, pago: null };
  if (me.user == null || me.billing?.mode !== "clerk") return nada;
  const now = deps.now?.() ?? Date.now();
  const id = me.user.id;
  const decision = { ...nada };

  // Alta: la cuenta es reciente y aún no se ha contado
  const claveAlta = `andarama:alta:${id}`;
  if (me.user.createdAt != null && now - me.user.createdAt < ALTA_RECIENTE_MS && deps.storage.getItem(claveAlta) == null) {
    decision.registro = true;
    decision.pruebaInicio = me.billing.trialEndsAt != null && me.billing.trialEndsAt > now;
    deps.storage.setItem(claveAlta, String(now));
  }

  // Pago: el plan de Clerk pasa de nada a algo desde la última vez que se miró
  const clavePlan = `andarama:plan:${id}`;
  const anterior = deps.storage.getItem(clavePlan);
  const actual = me.billing.planFromClerk ?? null;
  if (anterior === "" && actual != null) decision.pago = actual;
  if (anterior == null || anterior !== (actual ?? "")) deps.storage.setItem(clavePlan, actual ?? "");

  return decision;
}

/** Envía a Plausible lo que toque tras cargar `/me`. */
export function reportGrowth(me: Me, deps: GrowthDeps): GrowthDecision {
  const d = decideGrowth(me, deps);
  if (d.registro) deps.track("registro");
  if (d.pruebaInicio) deps.track("prueba_inicio");
  if (d.pago != null) deps.track("pago", { plan: d.pago });
  return d;
}

/**
 * Manda la atribución guardada en el primer toque si la cuenta aún no la
 * tiene. Se borra al aceptarla o si el servidor ya tenía una.
 */
export async function sendPendingAttribution(me: Me, storage: Storage = localStorage): Promise<void> {
  if (me.user == null || me.billing?.mode !== "clerk" || me.billing.attributionPending !== true) return;
  const data = pendingAttribution({ storage });
  if (data == null) return;
  try {
    const res = await api<{ ok: boolean; reason?: string }>("/me/attribution", { method: "POST", body: data });
    if (res.ok || res.reason === "already") clearAttribution(storage);
  } catch {
    // se reintenta en la siguiente carga
  }
}

/**
 * Primera publicación: la API dice si es la primera de esta persona
 * (`firstForUser`); aquí se evita contarla dos veces si se reintenta. Solo
 * en la instancia alojada. Devuelve si se ha enviado el evento.
 */
export function reportFirstPublish(
  me: Me | null,
  firstForUser: boolean | undefined,
  deps: Pick<GrowthDeps, "storage" | "track">,
): boolean {
  if (firstForUser !== true || me?.user == null || me.billing?.mode !== "clerk") return false;
  const clave = `andarama:primer-publicado:${me.user.id}`;
  if (deps.storage.getItem(clave) != null) return false;
  deps.storage.setItem(clave, "1");
  deps.track("primer_publicado");
  return true;
}

/** Todo lo que hay que hacer al saber quién soy: eventos y atribución. */
export function onMeLoaded(me: Me): void {
  if (typeof window === "undefined") return;
  reportGrowth(me, { storage: localStorage, track: trackEvent });
  void sendPendingAttribution(me);
}
