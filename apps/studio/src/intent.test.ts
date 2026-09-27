import { describe, expect, it } from "vitest";
import { normalizePlanSlug, peekPlanIntent, planQuery, rememberPlanIntent, takePlanIntent } from "./intent";
import { trialState } from "./trial";
import type { Me } from "./stores";

function memoria(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("plan elegido en la web", () => {
  it("solo acepta los slugs de los planes", () => {
    expect(normalizePlanSlug(" Paseo ")).toBe("paseo");
    expect(normalizePlanSlug("prueba")).toBeNull();
    expect(normalizePlanSlug("<script>")).toBeNull();
    expect(normalizePlanSlug(null)).toBeNull();
  });

  it("sobrevive al alta y se consume una sola vez", () => {
    const s = memoria();
    expect(rememberPlanIntent("?plan=aula&utm_source=google", s)).toBe("aula");
    // Una URL sin plan no borra lo apuntado (Clerk redirige sin la query)
    expect(rememberPlanIntent("", s)).toBeNull();
    expect(peekPlanIntent(s)).toBe("aula");
    expect(planQuery(s)).toBe("?plan=aula");
    expect(takePlanIntent(s)).toBe("aula");
    expect(takePlanIntent(s)).toBeNull();
    expect(planQuery(s)).toBe("");
  });
});

describe("estado de la prueba", () => {
  const ahora = 1_700_000_000_000;
  const dia = 86_400_000;
  const me = (billing: Partial<NonNullable<Me["billing"]>>, roleGlobal = "user"): Me => ({
    user: { id: "u", email: "u@x.y", name: "U", roleGlobal, emailVerified: true, totpEnabled: false, ssoLinked: false },
    orgs: [],
    billing: { mode: "clerk", plan: null, planName: null, ...billing },
  });

  it("cuenta los días que quedan", () => {
    expect(trialState(me({ plan: "prueba", trialEndsAt: ahora + 3.5 * dia }), ahora)).toEqual({ kind: "active", daysLeft: 4 });
  });

  it("dice que terminó cuando caduca sin plan", () => {
    expect(trialState(me({ plan: null, trialEndsAt: ahora - 1 }), ahora)).toEqual({ kind: "over" });
  });

  it("no dice nada con plan de pago, al administrador ni en el self-host", () => {
    expect(trialState(me({ plan: "paseo", trialEndsAt: ahora - dia }), ahora).kind).toBe("none");
    expect(trialState(me({ plan: null, trialEndsAt: ahora - 1 }, "admin"), ahora).kind).toBe("none");
    expect(trialState(me({ mode: "local", trialEndsAt: ahora - 1 }), ahora).kind).toBe("none");
  });
});
