import type { Hotspot } from "@andarama/schema";

/** Tipos de hotspot que pueden cerrar la salida de una escena. */
export type GateReason = "quiz" | "form" | "treasure";

export interface GateState {
  /** Preguntas acertadas (solo cuenta el acierto: fallar no abre la compuerta). */
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
