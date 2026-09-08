import { describe, expect, it } from "vitest";
import { PLANS, effectivePlan, planFromClaim, quotaForPlan } from "./plans.js";

describe("planes de la instancia alojada", () => {
  it("lee el plan de usuario del claim pla de Clerk", () => {
    expect(planFromClaim("u:paseo")).toBe("paseo");
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

  it("sin plan no hay recorridos; con plan, los del plan", () => {
    expect(quotaForPlan(null)).toEqual({ quotaTours: 0, quotaBytes: 0 });
    expect(quotaForPlan("andar").quotaTours).toBe(1);
    expect(quotaForPlan("paseo").quotaTours).toBe(100);
    expect(quotaForPlan("excursion").quotaTours).toBe(500);
    expect(quotaForPlan("vitalicio").quotaTours).toBe(1000);
  });

  it("los precios son los acordados", () => {
    expect(PLANS.andar).toMatchObject({ amountCents: 200, period: "month" });
    expect(PLANS.paseo).toMatchObject({ amountCents: 2000, period: "month" });
    expect(PLANS.excursion).toMatchObject({ amountCents: 50000, period: "year" });
    expect(PLANS.vitalicio).toMatchObject({ amountCents: 100000, period: "once" });
  });
});
