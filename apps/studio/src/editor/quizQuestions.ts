/**
 * Preguntas del hotspot de quiz en el editor.
 *
 * Un quiz puede venir en la forma heredada (una pregunta en los campos
 * sueltos `question`, `kind`, `options`, `feedback*`, `points`) o en la nueva
 * (`questions`). El editor siempre trabaja con una lista; mientras haya una
 * sola pregunta heredada, editarla escribe los campos sueltos (el quiz queda
 * igual que antes). Al añadir o duplicar una pregunta se pasa a `questions`:
 * la heredada se convierte en `questions[0]` y los campos sueltos se borran.
 *
 * Cada función devuelve un parche para `setContent` (un `undefined` borra el
 * campo).
 */

export type QuizKind = "single" | "multiple" | "boolean";

export interface EditorQuizOption {
  id: string;
  text: string;
  correct?: boolean;
}

export interface EditorQuizQuestion {
  id: string;
  question: string;
  kind: QuizKind;
  options: EditorQuizOption[];
  feedbackCorrect?: string;
  feedbackWrong?: string;
  points?: number;
}

type Content = Record<string, unknown>;
type Patch = Record<string, unknown>;

const LEGACY_FIELDS = ["question", "kind", "options", "feedbackCorrect", "feedbackWrong", "points"] as const;

/** ¿Está el quiz ya en la forma de varias preguntas? */
export function hasQuestionList(content: Content): boolean {
  return Array.isArray(content.questions) && content.questions.length > 0;
}

function legacyQuestion(content: Content, hotspotId: string): EditorQuizQuestion {
  const q: EditorQuizQuestion = {
    // Mismo id que el hotspot: los resultados guardados antes siguen casando
    id: hotspotId,
    question: typeof content.question === "string" ? content.question : "",
    kind: (content.kind as QuizKind | undefined) ?? "single",
    options: Array.isArray(content.options) ? (content.options as EditorQuizOption[]) : [],
  };
  if (typeof content.feedbackCorrect === "string") q.feedbackCorrect = content.feedbackCorrect;
  if (typeof content.feedbackWrong === "string") q.feedbackWrong = content.feedbackWrong;
  if (typeof content.points === "number") q.points = content.points;
  return q;
}

/** Las preguntas del quiz, en cualquiera de las dos formas. */
export function editorQuestions(content: Content, hotspotId: string): EditorQuizQuestion[] {
  if (hasQuestionList(content)) return content.questions as EditorQuizQuestion[];
  return [legacyQuestion(content, hotspotId)];
}

/** Parche que borra los campos sueltos de la pregunta heredada. */
function clearLegacy(): Patch {
  return Object.fromEntries(LEGACY_FIELDS.map((k) => [k, undefined]));
}

/** Parche que deja el quiz con esta lista de preguntas. */
function withQuestions(content: Content, questions: EditorQuizQuestion[]): Patch {
  return hasQuestionList(content) ? { questions } : { ...clearLegacy(), questions };
}

/** Pasa la pregunta heredada a `questions[0]` y borra los campos sueltos. */
export function migrateToQuestions(content: Content, hotspotId: string): Patch {
  if (hasQuestionList(content)) return {};
  return withQuestions(content, [legacyQuestion(content, hotspotId)]);
}

/** Cambia una pregunta. En la forma heredada escribe los campos sueltos. */
export function patchQuestion(content: Content, hotspotId: string, index: number, patch: Partial<EditorQuizQuestion>): Patch {
  if (!hasQuestionList(content)) {
    if (index !== 0) return {};
    const campos: Patch = { ...patch };
    delete campos.id;
    return campos;
  }
  const questions = editorQuestions(content, hotspotId).map((q, i) => (i === index ? { ...q, ...patch } : q));
  return { questions };
}

/** Pregunta nueva en blanco (opción única, dos opciones, la primera correcta). */
export function blankQuestion(id: string, points?: number): EditorQuizQuestion {
  return {
    id,
    question: "",
    kind: "single",
    options: [
      { id: "a", text: "", correct: true },
      { id: "b", text: "" },
    ],
    ...(points != null ? { points } : {}),
  };
}

/** Añade una pregunta al final (y pasa a `questions` si hacía falta). */
export function addQuestion(content: Content, hotspotId: string, newId: string): Patch {
  const actuales = editorQuestions(content, hotspotId);
  const puntos = actuales[actuales.length - 1]?.points;
  return withQuestions(content, [...actuales, blankQuestion(newId, puntos)]);
}

/** Duplica una pregunta justo debajo, con id nuevo. */
export function duplicateQuestion(content: Content, hotspotId: string, index: number, newId: string): Patch {
  const actuales = editorQuestions(content, hotspotId);
  const original = actuales[index];
  if (original == null) return {};
  const copia: EditorQuizQuestion = { ...original, id: newId, options: original.options.map((o) => ({ ...o })) };
  return withQuestions(content, [...actuales.slice(0, index + 1), copia, ...actuales.slice(index + 1)]);
}

/** Quita una pregunta (la última que queda no se quita). */
export function removeQuestion(content: Content, hotspotId: string, index: number): Patch {
  const actuales = editorQuestions(content, hotspotId);
  if (actuales.length <= 1 || index < 0 || index >= actuales.length) return {};
  return withQuestions(content, actuales.filter((_, i) => i !== index));
}

/** Sube (-1) o baja (+1) una pregunta. */
export function moveQuestion(content: Content, hotspotId: string, index: number, delta: -1 | 1): Patch {
  const actuales = editorQuestions(content, hotspotId);
  const destino = index + delta;
  if (destino < 0 || destino >= actuales.length || index < 0 || index >= actuales.length) return {};
  const lista = [...actuales];
  [lista[index], lista[destino]] = [lista[destino]!, lista[index]!];
  return withQuestions(content, lista);
}
