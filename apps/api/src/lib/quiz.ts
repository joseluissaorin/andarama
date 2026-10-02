import { isQuizAnswerCorrect, quizQuestionPoints, quizQuestions } from "@andarama/schema";
import type { FormHotspot, Hotspot, QuizHotspot, Tour } from "@andarama/schema";
import type { PlatformRuntime } from "@andarama/adapters";

/**
 * Nota del quiz calculada por el servidor.
 *
 * El navegador manda, por pregunta (`hotspotId` y, en los marcadores con
 * varias preguntas, `questionId`), las opciones que marcó (`selected`). La
 * nota sale de comparar eso con las opciones correctas del tour publicado:
 * lo que diga el navegador de `score`, `maxScore`, `correct` o `points` no
 * cuenta, porque cualquiera puede escribir un 10 en la consola.
 */
export interface ScoredQuiz {
  score: number;
  maxScore: number;
  passed: boolean | null;
  answered: number;
  total: number;
  detail: { hotspotId: string; questionId?: string; sceneId: string; correct: boolean; points: number; selected: string[] }[];
}

export function quizHotspots(tour: Tour): { hotspot: QuizHotspot; sceneId: string }[] {
  return tour.scenes.flatMap((s) =>
    s.hotspots.filter((h): h is QuizHotspot => h.type === "quiz").map((hotspot) => ({ hotspot, sceneId: s.id })),
  );
}

function selectedOf(entry: Record<string, unknown> | undefined): string[] | null {
  const sel = entry?.selected;
  if (!Array.isArray(sel)) return null;
  return sel.filter((v): v is string => typeof v === "string").slice(0, 50);
}

/**
 * Clave de una respuesta: hotspot + pregunta. Las respuestas sin `questionId`
 * (visores anteriores a las preguntas múltiples) son de la pregunta heredada,
 * que lleva el id del propio hotspot.
 */
function claveRespuesta(hotspotId: string, questionId: string | undefined): string {
  return `${hotspotId}\u0000${questionId ?? hotspotId}`;
}

export function scoreQuiz(tour: Tour, rawDetail: readonly Record<string, unknown>[]): ScoredQuiz {
  const porClave = new Map<string, Record<string, unknown>>();
  for (const d of rawDetail) {
    if (typeof d.hotspotId !== "string") continue;
    const clave = claveRespuesta(d.hotspotId, typeof d.questionId === "string" ? d.questionId : undefined);
    if (!porClave.has(clave)) porClave.set(clave, d);
  }
  let score = 0;
  let maxScore = 0;
  let answered = 0;
  let total = 0;
  const detail: ScoredQuiz["detail"] = [];
  // Cada pregunta cuenta por separado: un marcador con cinco preguntas aporta
  // cinco al total y la suma de sus puntos al máximo.
  for (const { hotspot, sceneId } of quizHotspots(tour)) {
    const multi = Array.isArray(hotspot.questions) && hotspot.questions.length > 0;
    for (const pregunta of quizQuestions(hotspot)) {
      total++;
      const puntos = quizQuestionPoints(pregunta);
      maxScore += puntos;
      const entrada = porClave.get(claveRespuesta(hotspot.id, pregunta.id));
      if (entrada == null) continue;
      answered++;
      const elegidas = selectedOf(entrada) ?? [];
      const acierto = isQuizAnswerCorrect(pregunta, elegidas);
      const obtenidos = acierto ? puntos : 0;
      score += obtenidos;
      detail.push({
        hotspotId: hotspot.id,
        ...(multi ? { questionId: pregunta.id } : {}),
        sceneId,
        correct: acierto,
        points: obtenidos,
        selected: elegidas,
      });
    }
  }
  score = Math.min(score, maxScore);
  const passing = tour.quiz?.passingScore;
  const passed =
    answered < total || passing == null ? null : maxScore > 0 ? (score / maxScore) * 100 >= passing : true;
  return { score, maxScore, passed, answered, total, detail };
}

/** El tour.json de la versión publicada ahora mismo (null si no hay). */
export async function loadPublishedTour(runtime: PlatformRuntime, slug: string): Promise<Tour | null> {
  try {
    const pointerBytes = await runtime.storage.getBytes(`pub/${slug}/current.json`);
    if (pointerBytes == null) return null;
    const pointer = JSON.parse(new TextDecoder().decode(pointerBytes)) as { version?: number };
    if (pointer.version == null) return null;
    const tourBytes = await runtime.storage.getBytes(`pub/${slug}/${pointer.version}/tour.json`);
    if (tourBytes == null) return null;
    return JSON.parse(new TextDecoder().decode(tourBytes)) as Tour;
  } catch {
    return null;
  }
}

export function findHotspot(tour: Tour, hotspotId: string): Hotspot | null {
  for (const s of tour.scenes) {
    const h = s.hotspots.find((x) => x.id === hotspotId);
    if (h != null) return h;
  }
  return null;
}

export function isOnceForm(h: Hotspot | null): h is FormHotspot {
  return h != null && h.type === "form" && h.once === true;
}
