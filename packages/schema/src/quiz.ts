import type { QuizHotspot, QuizQuestion } from "./types.js";

type QuizLike = Pick<QuizHotspot, "id"> & Partial<Omit<QuizHotspot, "id">>;

/**
 * Preguntas de un hotspot de quiz, sea de la forma heredada (una pregunta en
 * los campos sueltos del hotspot) o de la nueva (`questions`). La pregunta
 * heredada toma el id del propio hotspot: así los resultados guardados antes
 * de las preguntas múltiples (sin `questionId`) siguen casando.
 */
export function quizQuestions(hs: QuizLike): QuizQuestion[] {
  if (Array.isArray(hs.questions) && hs.questions.length > 0) return hs.questions;
  return [
    {
      id: hs.id,
      question: hs.question ?? "",
      kind: hs.kind ?? "single",
      options: Array.isArray(hs.options) ? hs.options : [],
      ...(hs.feedbackCorrect != null ? { feedbackCorrect: hs.feedbackCorrect } : {}),
      ...(hs.feedbackWrong != null ? { feedbackWrong: hs.feedbackWrong } : {}),
      ...(hs.points != null ? { points: hs.points } : {}),
    },
  ];
}

/** Puntos que vale una pregunta (1 por defecto, enteros y nunca negativos). */
export function quizQuestionPoints(q: Pick<QuizQuestion, "points">): number {
  const p = q.points ?? 1;
  return Number.isFinite(p) ? Math.max(0, Math.floor(p)) : 1;
}

/** Puntos máximos de un hotspot de quiz: la suma de sus preguntas. */
export function quizMaxPoints(hs: QuizLike): number {
  return quizQuestions(hs).reduce((a, q) => a + quizQuestionPoints(q), 0);
}

/**
 * ¿Es correcta esta selección? Hay que marcar exactamente las correctas: una
 * de más, una de menos o repetida es fallo. Sin ninguna correcta, nunca.
 */
export function isQuizAnswerCorrect(q: Pick<QuizQuestion, "options">, selected: readonly string[]): boolean {
  const correctas = new Set((q.options ?? []).filter((o) => o.correct === true).map((o) => o.id));
  return (
    correctas.size > 0 &&
    selected.length === correctas.size &&
    new Set(selected).size === correctas.size &&
    selected.every((id) => correctas.has(id))
  );
}

/**
 * ¿Está superado el quiz del hotspot? `correctIds` son las preguntas
 * acertadas. Sin `passScore` hay que acertarlas todas (la misma exigencia que
 * la pregunta única de siempre); con `passScore`, basta llegar a ese
 * porcentaje de los puntos del marcador.
 */
export function quizHotspotPassed(hs: QuizLike, correctIds: ReadonlySet<string>): boolean {
  const preguntas = quizQuestions(hs);
  const todas = preguntas.every((q) => correctIds.has(q.id));
  const passScore = hs.passScore;
  if (passScore == null || !Number.isFinite(passScore)) return todas;
  const max = preguntas.reduce((a, q) => a + quizQuestionPoints(q), 0);
  if (max === 0) return todas;
  const got = preguntas.reduce((a, q) => a + (correctIds.has(q.id) ? quizQuestionPoints(q) : 0), 0);
  return (got / max) * 100 >= passScore;
}
