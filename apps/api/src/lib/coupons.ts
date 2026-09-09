import { and, eq, isNull } from "drizzle-orm";
import { coupons, users } from "@andarama/db";
import type { Db } from "./context.js";
import { badRequest, conflict, notFound } from "./errors.js";
import { nowMs } from "./util.js";
import { PLANS, effectivePlan, isPlanSlug, planRank, type PlanSlug } from "./plans.js";

/**
 * Cupones canjeables.
 *
 * Un cupón es un código de un solo uso que concede un plan sin pasar por la
 * pasarela: escribe `plan_override` en la cuenta de quien lo canjea, que es
 * lo que ya manda sobre lo que diga Clerk. Sirve para las cien licencias
 * vitalicias de un lanzamiento, para una cortesía o para quien paga por
 * transferencia.
 *
 * El código se guarda en claro a propósito: hay que poder repartirlo y
 * volver a mirarlo. Solo lo lee el administrador de la instancia, que de
 * todos modos puede conceder planes a mano.
 */

/** Sin letras ni cifras que se confundan al dictado (0/O, 1/I/L, 5/S). */
const ALFABETO = "ACDEFGHJKMNPQRTUVWXY2346789";

/** Genera un código con la forma ANDA-XXXX-XXXX. */
export function newCouponCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += "-";
    out += ALFABETO[bytes[i]! % ALFABETO.length];
  }
  return `ANDA-${out}`;
}

/**
 * Normaliza lo que teclea una persona: minúsculas, espacios y guiones de
 * más, o el código sin el prefijo. Devuelve la forma canónica.
 */
export function normalizeCouponCode(raw: string): string {
  const limpio = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cuerpo = limpio.startsWith("ANDA") ? limpio.slice(4) : limpio;
  return `ANDA-${cuerpo.slice(0, 4)}-${cuerpo.slice(4)}`;
}

export interface NewCouponsOptions {
  count: number;
  plan: PlanSlug;
  batch?: string;
  note?: string;
  /** Epoch ms; sin valor, no caducan. */
  expiresAt?: number;
  createdBy: string;
}

/** Crea una tanda de cupones y devuelve los códigos en claro, en orden. */
export async function createCoupons(db: Db, opts: NewCouponsOptions): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < opts.count) codes.add(newCouponCode());
  const lista = [...codes];
  const at = nowMs();
  const filas = lista.map((code) => ({
    code,
    plan: opts.plan,
    batch: opts.batch ?? null,
    note: opts.note ?? null,
    expiresAt: opts.expiresAt ?? null,
    redeemedBy: null,
    redeemedAt: null,
    createdBy: opts.createdBy,
    createdAt: at,
  }));
  // D1 limita el tamaño de la sentencia: se insertan por tandas cortas
  for (let i = 0; i < filas.length; i += 25) {
    await db.insert(coupons).values(filas.slice(i, i + 25));
  }
  return lista;
}

export interface RedeemResult {
  code: string;
  plan: PlanSlug;
  planName: string;
  /** El plan que ya tenía era igual o mejor: el cupón se guarda gastado igualmente. */
  keptPrevious: boolean;
  previousPlan: PlanSlug | null;
}

/**
 * Canjea un cupón para un usuario. El reparto es atómico: el UPDATE solo
 * toca la fila si sigue sin canjear, y después se relee para saber si fue
 * este usuario quien se la llevó (D1 no tiene transacciones interactivas).
 */
export async function redeemCoupon(db: Db, rawCode: string, userId: string): Promise<RedeemResult> {
  const code = normalizeCouponCode(rawCode);
  const fila = (await db.select().from(coupons).where(eq(coupons.code, code)).limit(1))[0];
  if (fila == null) throw notFound("Ese cupón no existe");
  if (fila.redeemedBy != null) {
    throw conflict(fila.redeemedBy === userId ? "Ya has canjeado este cupón" : "Ese cupón ya está canjeado");
  }
  if (fila.expiresAt != null && fila.expiresAt < nowMs()) throw badRequest("Ese cupón ha caducado");
  if (!isPlanSlug(fila.plan)) throw badRequest("Ese cupón concede un plan que ya no existe");

  const at = nowMs();
  await db
    .update(coupons)
    .set({ redeemedBy: userId, redeemedAt: at })
    .where(and(eq(coupons.code, code), isNull(coupons.redeemedBy)));
  const tras = (await db.select().from(coupons).where(eq(coupons.code, code)).limit(1))[0];
  if (tras?.redeemedBy !== userId) throw conflict("Ese cupón ya está canjeado");

  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (user == null) throw notFound("Usuario no encontrado");
  const previo = effectivePlan(user);
  const mejora = planRank(fila.plan) > planRank(previo);
  if (mejora) {
    await db.update(users).set({ planOverride: fila.plan, planUpdatedAt: at, updatedAt: at }).where(eq(users.id, userId));
  }
  return {
    code,
    plan: fila.plan,
    planName: PLANS[fila.plan].name,
    keptPrevious: !mejora,
    previousPlan: previo,
  };
}
