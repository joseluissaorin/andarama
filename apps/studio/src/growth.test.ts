import { describe, expect, it } from "vitest";
import { reportGrowth } from "./growth";
import type { Me } from "./stores";

function memoria(): Pick<Storage, "getItem" | "setItem"> {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const ahora = 1_700_000_000_000;

function me(over: Partial<NonNullable<Me["billing"]>> & { createdAt?: number } = {}): Me {
  const { createdAt, ...billing } = over;
  return {
    user: {
      id: "u1",
      email: "x@y.z",
      name: "X",
      roleGlobal: "user",
      emailVerified: true,
      totpEnabled: false,
      ssoLinked: false,
      createdAt: createdAt ?? ahora - 60_000,
    },
    orgs: [],
    billing: { mode: "clerk", plan: null, planName: null, planFromClerk: null, trialEndsAt: null, attributionPending: false, capabilities: [], ...billing },
  };
}

describe("eventos de crecimiento", () => {
  it("cuenta el alta una sola vez, con la prueba si arranca en prueba", () => {
    const storage = memoria();
    const eventos: string[] = [];
    const deps = { storage, track: (n: string) => void eventos.push(n), now: () => ahora };
    const d = reportGrowth(me({ trialEndsAt: ahora + 14 * 86_400_000 }), deps);
    expect(d).toEqual({ registro: true, pruebaInicio: true, pago: null });
    expect(eventos).toEqual(["registro", "prueba_inicio"]);
    // Recarga: ya está contado
    reportGrowth(me({ trialEndsAt: ahora + 14 * 86_400_000 }), deps);
    expect(eventos).toEqual(["registro", "prueba_inicio"]);
  });

  it("una cuenta antigua no es un alta", () => {
    const storage = memoria();
    const eventos: string[] = [];
    const d = reportGrowth(me({ createdAt: ahora - 3 * 86_400_000 }), { storage, track: (n) => void eventos.push(n), now: () => ahora });
    expect(d.registro).toBe(false);
    expect(eventos).toEqual([]);
  });

  it("el pago se dispara cuando el plan de Clerk pasa de nada a algo, con el plan", () => {
    const storage = memoria();
    const eventos: [string, unknown][] = [];
    const deps = { storage, track: (n: string, p?: unknown) => void eventos.push([n, p]), now: () => ahora };
    reportGrowth(me({ createdAt: ahora - 3 * 86_400_000 }), deps);
    expect(eventos).toEqual([]);
    reportGrowth(me({ createdAt: ahora - 3 * 86_400_000, planFromClerk: "paseo", plan: "paseo" }), deps);
    expect(eventos).toEqual([["pago", { plan: "paseo" }]]);
    // Recargar con el mismo plan no lo repite; cambiar de plan tampoco es un primer pago
    reportGrowth(me({ createdAt: ahora - 3 * 86_400_000, planFromClerk: "paseo", plan: "paseo" }), deps);
    reportGrowth(me({ createdAt: ahora - 3 * 86_400_000, planFromClerk: "formacion", plan: "formacion" }), deps);
    expect(eventos).toHaveLength(1);
  });

  it("quien ya llega con plan la primera vez no cuenta como pago (no se sabe si es nuevo)", () => {
    const storage = memoria();
    const eventos: string[] = [];
    reportGrowth(me({ createdAt: ahora - 3 * 86_400_000, planFromClerk: "andar", plan: "andar" }), { storage, track: (n) => void eventos.push(n), now: () => ahora });
    expect(eventos).toEqual([]);
  });

  it("en el self-host no mide nada", () => {
    const eventos: string[] = [];
    const local: Me = { ...me(), billing: { mode: "local", plan: null, planName: null } };
    reportGrowth(local, { storage: memoria(), track: (n) => void eventos.push(n), now: () => ahora });
    expect(eventos).toEqual([]);
  });
});
