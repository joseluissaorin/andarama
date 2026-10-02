import type { StateAction, VarCondition } from "@andarama/schema";

/**
 * Variables del recorrido en el editor: las condiciones de visibilidad de un
 * hotspot y el resumen legible del hotspot de acción.
 *
 * Las condiciones se escribían en JSON a mano (`[{"var":"puerta","op":"truthy"}]`)
 * y nadie fuera del equipo sabía hacerlo. Ahora son filas de variable,
 * operador y valor, que es lo mismo pero se puede leer. El JSON sigue a mano
 * en «Avanzado».
 */

export type ConditionOp = VarCondition["op"];

/** Una fila del editor visual. El valor va como texto, tal cual se escribe. */
export interface ConditionRow {
  var: string;
  op: ConditionOp;
  value: string;
}

/** Operadores en el orden en que se ofrecen, con su signo. */
export const CONDITION_OPS: { op: ConditionOp; symbol: string }[] = [
  { op: "eq", symbol: "=" },
  { op: "ne", symbol: "≠" },
  { op: "gt", symbol: ">" },
  { op: "lt", symbol: "<" },
  { op: "gte", symbol: "≥" },
  { op: "lte", symbol: "≤" },
  // Las dos sin valor: «la variable es verdadera / falsa»
  { op: "truthy", symbol: "truthy" },
  { op: "falsy", symbol: "falsy" },
];

const OPS = new Set<string>(CONDITION_OPS.map((o) => o.op));

/** ¿El operador compara con un valor? truthy y falsy no lo necesitan. */
export function opNeedsValue(op: ConditionOp): boolean {
  return op !== "truthy" && op !== "falsy";
}

/**
 * Texto escrito → valor tipado. El visor compara con `===`: «3» como texto no
 * es igual a 3, así que números y verdadero/falso se guardan con su tipo.
 */
export function parseVarValue(raw: string): string | number | boolean {
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (lower === "true" || lower === "verdadero") return true;
  if (lower === "false" || lower === "falso") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return raw;
}

/** Valor tipado → texto para el campo. */
export function formatVarValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/**
 * Condiciones guardadas → filas. Devuelve null si lo guardado no cabe en el
 * editor visual (JSON que no es una lista de condiciones): entonces se abre el
 * modo avanzado para no perder nada.
 */
export function conditionsToRows(vars: unknown): ConditionRow[] | null {
  if (vars == null) return [];
  if (!Array.isArray(vars)) return null;
  const rows: ConditionRow[] = [];
  for (const c of vars) {
    if (c == null || typeof c !== "object") return null;
    const { var: name, op, value } = c as Record<string, unknown>;
    if (typeof name !== "string" || typeof op !== "string" || !OPS.has(op)) return null;
    rows.push({ var: name, op: op as ConditionOp, value: formatVarValue(value) });
  }
  return rows;
}

/**
 * Filas → condiciones para guardar. Las filas sin variable se ignoran (son las
 * que se están escribiendo); truthy y falsy no llevan valor.
 */
export function rowsToConditions(rows: ConditionRow[]): VarCondition[] {
  const out: VarCondition[] = [];
  for (const r of rows) {
    const name = r.var.trim();
    if (name === "") continue;
    if (!opNeedsValue(r.op)) out.push({ var: name, op: r.op });
    else out.push({ var: name, op: r.op, value: parseVarValue(r.value) });
  }
  return out;
}

export interface StateSummaryWords {
  /** «Al pulsar» */
  prefix: string;
  /** «no cambia nada» */
  nothing: string;
  /** «verdadero» / «falso» */
  yes: string;
  no: string;
  /** «cambia» (alternar verdadero/falso) */
  toggle: string;
  /** «ir a {name}» */
  goto: (name: string) => string;
}

function wordFor(value: unknown, words: StateSummaryWords): string {
  if (value === true) return words.yes;
  if (value === false) return words.no;
  return formatVarValue(value);
}

/**
 * Lo que hace el hotspot de acción, en una línea:
 * «Al pulsar: llave = verdadero → ir a Pasillo».
 */
export function summarizeStateHotspot(
  content: { actions?: StateAction[]; thenGoto?: string },
  sceneTitle: (id: string) => string | undefined,
  words: StateSummaryWords,
): string {
  const parts: string[] = [];
  for (const a of content.actions ?? []) {
    const name = a.var.trim();
    if (name === "") continue;
    if (a.op === "set") parts.push(`${name} = ${wordFor(a.value, words)}`);
    else if (a.op === "inc") parts.push(`${name} + ${formatVarValue(a.value ?? 1)}`);
    else if (a.op === "dec") parts.push(`${name} − ${formatVarValue(a.value ?? 1)}`);
    else if (a.op === "toggle") parts.push(`${name}: ${words.toggle}`);
  }
  let line = parts.length > 0 ? parts.join(", ") : words.nothing;
  const target = content.thenGoto != null && content.thenGoto !== "" ? sceneTitle(content.thenGoto) ?? content.thenGoto : null;
  if (target != null) line += ` → ${words.goto(target)}`;
  return `${words.prefix}: ${line}`;
}
