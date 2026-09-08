import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { requireAuth } from "../lib/session.js";
import { PLANS, effectivePlan, quotaForPlan } from "../lib/plans.js";

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
    return c.json({
      mode: hosted ? "clerk" : "local",
      plan,
      planName: plan != null ? PLANS[plan].name : null,
      planFromClerk: auth.user.plan,
      planOverride: auth.user.planOverride,
      quota: hosted ? quotaForPlan(plan) : null,
      instanceAdmin: auth.user.roleGlobal === "admin",
    });
  });

  return r;
}
