import type { HotspotConditions, StateAction, VarCondition } from "@andarama/schema";

export type VarValue = string | number | boolean;

/**
 * Variables de estado del tour: base de la interactividad avanzada
 * (puertas, dia/noche, progreso, busqueda del tesoro) y de las condiciones
 * de visibilidad de hotspots.
 */
export class VariableStore {
  private vars = new Map<string, VarValue>();
  private listeners = new Set<(vars: Record<string, VarValue>) => void>();

  constructor(initial?: Record<string, VarValue>) {
    if (initial != null) {
      for (const [k, v] of Object.entries(initial)) this.vars.set(k, v);
    }
  }

  get(name: string): VarValue | undefined {
    return this.vars.get(name);
  }

  snapshot(): Record<string, VarValue> {
    return Object.fromEntries(this.vars);
  }

  apply(actions: StateAction[]): void {
    for (const action of actions) {
      const current = this.vars.get(action.var);
      switch (action.op) {
        case "set":
          this.vars.set(action.var, action.value ?? true);
          break;
        case "inc":
          this.vars.set(action.var, (typeof current === "number" ? current : 0) + Number(action.value ?? 1));
          break;
        case "dec":
          this.vars.set(action.var, (typeof current === "number" ? current : 0) - Number(action.value ?? 1));
          break;
        case "toggle":
          this.vars.set(action.var, !isTruthy(current));
          break;
      }
    }
    this.emit();
  }

  set(name: string, value: VarValue): void {
    this.vars.set(name, value);
    this.emit();
  }

  subscribe(fn: (vars: Record<string, VarValue>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}

function isTruthy(v: VarValue | undefined): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v !== "" && v !== "false" && v !== "0";
}

export function evalVarCondition(cond: VarCondition, store: VariableStore): boolean {
  const v = store.get(cond.var);
  switch (cond.op) {
    case "truthy":
      return isTruthy(v);
    case "falsy":
      return !isTruthy(v);
    case "eq":
      return v === cond.value;
    case "ne":
      return v !== cond.value;
    case "gt":
      return typeof v === "number" && typeof cond.value === "number" && v > cond.value;
    case "gte":
      return typeof v === "number" && typeof cond.value === "number" && v >= cond.value;
    case "lt":
      return typeof v === "number" && typeof cond.value === "number" && v < cond.value;
    case "lte":
      return typeof v === "number" && typeof cond.value === "number" && v <= cond.value;
    default:
      return true;
  }
}

/**
 * Evalua las condiciones de visibilidad de un hotspot.
 * @param videoTime tiempo actual del video de la escena (s), si aplica.
 */
export function evalConditions(
  conditions: HotspotConditions | undefined,
  store: VariableStore,
  lang: string,
  videoTime: number | null,
): boolean {
  if (conditions == null) return true;
  if (conditions.langs != null && conditions.langs.length > 0 && !conditions.langs.includes(lang)) return false;
  if (conditions.vars != null) {
    for (const c of conditions.vars) {
      if (!evalVarCondition(c, store)) return false;
    }
  }
  if (conditions.videoTime != null) {
    if (videoTime == null) return false;
    if (videoTime < conditions.videoTime.from || videoTime > conditions.videoTime.to) return false;
  }
  return true;
}
