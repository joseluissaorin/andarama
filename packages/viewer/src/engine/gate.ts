import type { Hotspot, QuizHotspot } from "@andarama/schema";
import { quizHotspotPassed, quizQuestions } from "@andarama/schema";

/** Tipos de hotspot que pueden cerrar la salida de una escena. */
export type GateReason = "quiz" | "form" | "treasure";

export interface GateState {
  /**
   * Marcadores de quiz que ya no retienen (ver `quizGateOpen`): superados, o
   * terminados sin intentos que gastar.
   */
  quizCorrect: (hotspotId: string) => boolean;
  /** Formularios enviados. */
  formSent: (hotspotId: string) => boolean;
  /** Tesoros encontrados. */
  treasureFound: (hotspotId: string) => boolean;
}

export interface PendingGate {
  hotspotId: string;
  reason: GateReason;
}

/**
 * Todo lo que retiene al visitante en la escena. La salida solo se abre
 * cuando la lista está vacía: con dos preguntas con compuerta, acertar una
 * no basta si la otra sigue mal.
 */
export function pendingGates(hotspots: readonly Hotspot[], state: GateState): PendingGate[] {
  const pendientes: PendingGate[] = [];
  for (const h of hotspots) {
    if ((h as { gate?: boolean }).gate !== true) continue;
    if (h.type === "quiz" && !state.quizCorrect(h.id)) pendientes.push({ hotspotId: h.id, reason: "quiz" });
    else if (h.type === "form" && !state.formSent(h.id)) pendientes.push({ hotspotId: h.id, reason: "form" });
    else if (h.type === "treasure" && !state.treasureFound(h.id)) pendientes.push({ hotspotId: h.id, reason: "treasure" });
  }
  return pendientes;
}

/**
 * ¿Deja de retener la compuerta de este quiz?
 *
 * - Superado: todas sus preguntas acertadas, o la nota mínima del marcador
 *   (`passScore`).
 * - Sin intentos: con intentos limitados (`attempts` > 0), cuando todas sus
 *   preguntas están terminadas (acertadas o con los intentos agotados). La
 *   nota sigue contando como fallo; solo se deja de retener al visitante.
 *
 * Con intentos ilimitados, fallar nunca abre la compuerta: se puede seguir
 * probando hasta acertar.
 *
 * `correct` son las preguntas acertadas y `finished` las terminadas
 * (acertadas o sin intentos).
 */
export function quizGateOpen(
  hs: Pick<QuizHotspot, "id"> & Partial<QuizHotspot>,
  correct: ReadonlySet<string>,
  finished: ReadonlySet<string>,
): boolean {
  if (quizHotspotPassed(hs, correct)) return true;
  if ((hs.attempts ?? 0) <= 0) return false;
  return quizQuestions(hs).every((q) => finished.has(q.id) || correct.has(q.id));
}
