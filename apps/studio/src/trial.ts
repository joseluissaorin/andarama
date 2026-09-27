import type { Me } from "./stores";

/** Estado de la prueba gratuita según `/me`: en curso (con días), caducada o ninguna. */
export type TrialState = { kind: "none" } | { kind: "active"; daysLeft: number } | { kind: "over" };

export function trialState(me: Me | null, now: number = Date.now()): TrialState {
  const billing = me?.billing;
  if (billing?.mode !== "clerk" || me?.user == null || me.user.roleGlobal === "admin") return { kind: "none" };
  const ends = billing.trialEndsAt ?? null;
  if (billing.plan === "prueba" && ends != null) {
    return { kind: "active", daysLeft: Math.max(0, Math.ceil((ends - now) / 86_400_000)) };
  }
  if (billing.plan == null && ends != null && ends <= now) return { kind: "over" };
  return { kind: "none" };
}
