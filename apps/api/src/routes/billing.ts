import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { requireAuth } from "../lib/session.js";
import { notFound } from "../lib/errors.js";
import { redeemCoupon } from "../lib/coupons.js";
import { audit } from "../lib/helpers.js";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN, effectivePlan, planCapabilities, planName, quotaForPlan } from "../lib/plans.js";

/**
 * Planes y facturación de la instancia alojada.
 *
 * El cobro lo hace Clerk Billing (tabla de precios y pasarela en el Studio);
 * aquí solo se cuenta lo que el servidor sabe: qué planes hay, cuál tiene el
 * usuario y qué cuota le da. El self-host responde `mode: "local"` y no
 * enseña planes: allí el plan gratuito es la propia instalación.
 */
export function billingRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Catálogo público de planes (lo lee también la portada). */
  r.get("/plans", (c) => {
    const hosted = c.get("config").clerk != null;
    return c.json({
      mode: hosted ? "clerk" : "local",
      currency: "usd",
      plans: hosted ? Object.values(PLANS) : [],
      trial: hosted ? { days: TRIAL_DAYS, quotaTours: TRIAL_PLAN.quotaTours, quotaBytes: TRIAL_PLAN.quotaBytes } : null,
      selfHost: {
        name: "En tu casa",
        amountCents: 0,
        note: "Código abierto (EUPL-1.2): la instalación propia no tiene cuotas de plan.",
      },
    });
  });

  /** El plan del usuario que pregunta. */
  r.get("/me", (c) => {
    const auth = requireAuth(c);
    const hosted = c.get("config").clerk != null;
    const plan = hosted ? effectivePlan(auth.user) : null;
    const trialEndsAt = hosted ? (auth.user.trialEndsAt ?? null) : null;
    return c.json({
      mode: hosted ? "clerk" : "local",
      plan,
      planName: planName(plan),
      planFromClerk: auth.user.plan,
      planOverride: auth.user.planOverride,
      quota: hosted ? quotaForPlan(plan) : null,
      // En el self-host todo está permitido: no hay planes que lo limiten
      capabilities: hosted ? planCapabilities(plan) : null,
      trialEndsAt,
      /** Días enteros que quedan de prueba; 0 si ya caducó o nunca la tuvo. */
      trialDaysLeft: trialEndsAt != null ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000)) : 0,
      instanceAdmin: auth.user.roleGlobal === "admin",
    });
  });

  /** Canje de un cupón: concede el plan sin pasar por la pasarela. */
  r.post("/coupon", async (c) => {
    const auth = requireAuth(c);
    if (c.get("config").clerk == null) throw notFound("Esta instancia no tiene planes: los cupones no hacen falta");
    const { code } = z.object({ code: z.string().min(4).max(40) }).parse(await c.req.json());
    const res = await redeemCoupon(c.get("db"), code, auth.user.id);
    await audit(c, "billing.coupon_redeem", "coupon", res.code, { plan: res.plan, keptPrevious: res.keptPrevious });
    return c.json(res);
  });

  return r;
}
