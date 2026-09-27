import { describe, expect, it } from "vitest";
import {
  PLANS,
  TRIAL_MS,
  effectivePlan,
  paidPlan,
  planCapabilities,
  planFromClaim,
  planHas,
  planName,
  planRank,
  quotaForPlan,
} from "./plans.js";

describe("planes de la instancia alojada", () => {
  it("lee el plan de usuario del claim pla de Clerk", () => {
    expect(planFromClaim("u:paseo")).toBe("paseo");
    expect(planFromClaim("u:aula")).toBe("aula");
    expect(planFromClaim("u:formacion")).toBe("formacion");
    expect(planFromClaim("u:free_user")).toBeNull();
    expect(planFromClaim("o:paseo")).toBeNull();
    expect(planFromClaim("o:pro,u:vitalicio")).toBe("vitalicio");
    expect(planFromClaim(undefined)).toBeNull();
    expect(planFromClaim(42)).toBeNull();
  });

  it("lo concedido a mano manda sobre lo que dice Clerk", () => {
    expect(effectivePlan({ plan: "andar", planOverride: null })).toBe("andar");
    expect(effectivePlan({ plan: "andar", planOverride: "vitalicio" })).toBe("vitalicio");
    expect(effectivePlan({ plan: null, planOverride: null })).toBeNull();
    expect(effectivePlan({ plan: "inventado", planOverride: "otro" })).toBeNull();
  });

  it("la prueba vale mientras no caduque y solo si no hay plan", () => {
    const now = 1_700_000_000_000;
    expect(effectivePlan({ plan: null, planOverride: null, trialEndsAt: now + TRIAL_MS }, now)).toBe("prueba");
    expect(effectivePlan({ plan: null, planOverride: null, trialEndsAt: now - 1 }, now)).toBeNull();
    expect(effectivePlan({ plan: null, planOverride: null, trialEndsAt: now }, now)).toBeNull();
    // Con plan de pago la prueba no pinta nada
    expect(effectivePlan({ plan: "andar", planOverride: null, trialEndsAt: now + TRIAL_MS }, now)).toBe("andar");
    expect(paidPlan({ plan: null, planOverride: null, trialEndsAt: Date.now() + TRIAL_MS })).toBeNull();
    expect(paidPlan({ plan: "paseo", planOverride: null })).toBe("paseo");
    expect(planName("prueba")).toBe("Prueba gratuita");
    expect(planRank("prueba")).toBe(0);
  });

  it("sin plan no hay recorridos; en prueba, uno; con plan, los del plan", () => {
    expect(quotaForPlan(null)).toEqual({ quotaTours: 0, quotaBytes: 0 });
    expect(quotaForPlan("prueba")).toEqual({ quotaTours: 1, quotaBytes: 500 * 1024 * 1024 });
    expect(quotaForPlan("andar").quotaTours).toBe(1);
    expect(quotaForPlan("aula").quotaTours).toBe(5);
    expect(quotaForPlan("paseo").quotaTours).toBe(10);
    expect(quotaForPlan("excursion").quotaTours).toBe(500);
    expect(quotaForPlan("formacion").quotaTours).toBe(100);
    expect(quotaForPlan("vitalicio").quotaTours).toBe(1000);
  });

  it("los precios son los acordados", () => {
    expect(PLANS.andar).toMatchObject({ amountCents: 200, period: "month" });
    expect(PLANS.aula).toMatchObject({ amountCents: 4200, period: "year" });
    expect(PLANS.paseo).toMatchObject({ amountCents: 2000, period: "month", yearlyAmountCents: 20000 });
    expect(PLANS.excursion).toMatchObject({ amountCents: 50000, period: "year" });
    expect(PLANS.formacion).toMatchObject({ amountCents: 9900, period: "month", yearlyAmountCents: 99000 });
    expect(PLANS.vitalicio).toMatchObject({ amountCents: 100000, period: "once" });
  });

  it("el orden de los planes es coherente y sin repetidos", () => {
    const ranks = Object.values(PLANS).map((p) => p.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect([...Object.values(PLANS)].sort((a, b) => a.rank - b.rank).map((p) => p.slug)).toEqual([
      "andar",
      "aula",
      "paseo",
      "excursion",
      "formacion",
      "vitalicio",
    ]);
  });

  it("cada plan enciende sus capacidades", () => {
    expect(planHas("aula", "classroom")).toBe(true);
    expect(planHas("paseo", "classroom")).toBe(false);
    expect(planHas("formacion", "scorm")).toBe(true);
    expect(planHas("formacion", "lti")).toBe(true);
    expect(planHas("formacion", "whiteLabel")).toBe(true);
    expect(planHas("formacion", "customDomain")).toBe(true);
    expect(planHas("formacion", "team")).toBe(true);
    expect(planHas("formacion", "invoice")).toBe(true);
    expect(planHas("excursion", "whiteLabel")).toBe(true);
    expect(planHas("excursion", "customDomain")).toBe(true);
    expect(planHas("excursion", "scorm")).toBe(false);
    expect(planHas("vitalicio", "whiteLabel")).toBe(true);
    expect(planHas("vitalicio", "customDomain")).toBe(true);
    expect(planHas("andar", "whiteLabel")).toBe(false);
    expect(planHas("prueba", "whiteLabel")).toBe(false);
    expect(planHas(null, "whiteLabel")).toBe(false);
    expect(planCapabilities(null)).toEqual([]);
  });
});
