import type { QuizStateEvent } from "@andarama/viewer";

/**
 * Resultado del quiz hacia el servidor (`POST /api/v1/public/quiz/{slug}`).
 *
 * El navegador manda lo que ha visto (opciones marcadas por pregunta); la
 * nota que cuenta la recalcula el servidor con el tour publicado. Si el tour
 * se abrió desde un LMS (LTI), el identificador del lanzamiento viaja con el
 * resultado para que la nota llegue al libro de calificaciones.
 */
export interface QuizResultPayload {
  sessionId: string;
  score: number;
  maxScore: number;
  passed: boolean | null;
  detail: QuizStateEvent["detail"];
  participantName?: string;
  ltiLaunchId?: string;
  visitorId?: string;
}

export interface QuizResultContext {
  sessionId: string;
  participantName?: string | null;
  ltiLaunchId?: string | null;
  visitorId?: string | null;
}

/** ¿Está el quiz completo (todas las preguntas terminadas)? */
export function quizComplete(state: QuizStateEvent): boolean {
  return state.total > 0 && state.answered >= state.total;
}

export function buildQuizPayload(state: QuizStateEvent, ctx: QuizResultContext): QuizResultPayload {
  const nombre = ctx.participantName?.trim();
  return {
    sessionId: ctx.sessionId.slice(0, 60),
    score: state.score,
    maxScore: state.maxScore,
    passed: state.passed,
    detail: state.detail.slice(0, 200),
    ...(nombre != null && nombre !== "" ? { participantName: nombre.slice(0, 120) } : {}),
    ...(ctx.ltiLaunchId != null && ctx.ltiLaunchId !== "" ? { ltiLaunchId: ctx.ltiLaunchId } : {}),
    ...(ctx.visitorId != null && ctx.visitorId !== "" ? { visitorId: ctx.visitorId } : {}),
  };
}

/** Huella del resultado: el mismo resultado no se manda dos veces. */
export function quizSignature(state: QuizStateEvent, participantName?: string | null): string {
  const partes = state.detail
    .map((d) => `${d.hotspotId}:${d.correct ? 1 : 0}:${(d.selected ?? []).join("+")}`)
    .sort()
    .join("|");
  return `${state.score}/${state.maxScore}#${partes}#${participantName?.trim() ?? ""}`;
}

export async function sendQuizResult(
  endpoint: string,
  payload: QuizResultPayload,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Parámetros de lanzamiento: `?lti=` (lo pone `/api/v1/lti/launch`) y `?name=`. */
export function launchParams(search: string): { ltiLaunchId: string | null; participantName: string | null } {
  const params = new URLSearchParams(search);
  const lti = params.get("lti");
  const name = params.get("name");
  return {
    ltiLaunchId: lti != null && /^[A-Za-z0-9_-]{8,128}$/.test(lti) ? lti : null,
    participantName: name != null && name.trim() !== "" ? name.trim().slice(0, 120) : null,
  };
}
