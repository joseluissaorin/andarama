import type { QuizHotspot, Tour } from "@andarama/schema";
import { quizHotspotPassed, quizQuestionPoints, quizQuestions } from "@andarama/schema";
import type { QuizStateEvent } from "../types.js";
import { quizGateOpen } from "./gate.js";

interface Answer {
  correct: boolean;
  points: number;
  selected?: string[];
}

/** Resultado de registrar una respuesta. */
export interface QuizRecordResult {
  /** Pregunta a la que corresponde (la heredada lleva el id del hotspot). */
  questionId: string;
  /** El marcador acaba de quedar (o ya estaba) superado. */
  hotspotPassed: boolean;
}

/**
 * Cuenta del quiz de un tour: respuestas por pregunta, nota y marcadores
 * superados. Sin DOM, para poder probarla sola; el visor la consulta para el
 * estado del quiz y para las compuertas.
 *
 * - La nota es la de la primera respuesta terminada de cada pregunta: volver
 *   a contestar sirve para abrir la compuerta, no para mejorar la nota.
 * - Un marcador queda superado cuando sus preguntas acertadas (en cualquier
 *   intento) cumplen `quizHotspotPassed`: todas, o la nota mínima del marcador.
 * - Solo se registran respuestas terminadas: acertadas, o falladas sin
 *   intentos que gastar. Con intentos limitados, un marcador con todas sus
 *   preguntas terminadas deja de retener aunque no esté superado
 *   (`quizGateOpen`).
 */
export class QuizTracker {
  private answers = new Map<string, Answer>();
  private correctByHotspot = new Map<string, Set<string>>();
  private passedHotspots = new Set<string>();
  private finishedByHotspot = new Map<string, Set<string>>();
  /** Marcadores de quiz en el orden del tour (con su escena). */
  private readonly list: { hotspot: QuizHotspot; sceneId: string }[] = [];
  private readonly hotspots = new Map<string, { hotspot: QuizHotspot; sceneId: string }>();

  constructor(private readonly tour: Pick<Tour, "scenes" | "quiz">) {
    for (const scene of tour.scenes) {
      for (const hs of scene.hotspots) {
        if (hs.type !== "quiz") continue;
        const entry = { hotspot: hs, sceneId: scene.id };
        this.list.push(entry);
        if (!this.hotspots.has(hs.id)) this.hotspots.set(hs.id, entry);
      }
    }
  }

  record(
    hotspotId: string,
    correct: boolean,
    points: number,
    opts: { selected?: string[]; questionId?: string } = {},
  ): QuizRecordResult {
    const entry = this.hotspots.get(hotspotId);
    const preguntas = entry != null ? quizQuestions(entry.hotspot) : [];
    const pregunta = opts.questionId != null ? preguntas.find((q) => q.id === opts.questionId) : preguntas[0];
    const questionId = opts.questionId ?? pregunta?.id ?? hotspotId;
    const key = answerKey(hotspotId, questionId);
    if (!this.answers.has(key)) {
      const puntos = pregunta != null ? quizQuestionPoints(pregunta) : points;
      this.answers.set(key, {
        correct,
        points: correct ? puntos : 0,
        ...(opts.selected != null ? { selected: opts.selected } : {}),
      });
    }
    const terminadas = this.finishedByHotspot.get(hotspotId) ?? new Set<string>();
    terminadas.add(questionId);
    this.finishedByHotspot.set(hotspotId, terminadas);
    if (correct) {
      const acertadas = this.correctByHotspot.get(hotspotId) ?? new Set<string>();
      acertadas.add(questionId);
      this.correctByHotspot.set(hotspotId, acertadas);
      if (entry == null || quizHotspotPassed(entry.hotspot, acertadas)) this.passedHotspots.add(hotspotId);
    }
    return { questionId, hotspotPassed: this.passedHotspots.has(hotspotId) };
  }

  /** Primera respuesta terminada de una pregunta (sin pregunta: la primera). */
  answer(hotspotId: string, questionId?: string): { correct: boolean; points: number; selected?: string[] } | null {
    const entry = this.hotspots.get(hotspotId);
    const qid = questionId ?? (entry != null ? quizQuestions(entry.hotspot)[0]?.id : undefined) ?? hotspotId;
    const a = this.answers.get(answerKey(hotspotId, qid));
    return a != null ? { correct: a.correct, points: a.points, ...(a.selected != null ? { selected: a.selected } : {}) } : null;
  }

  /** ¿Superado el quiz de este marcador (todas acertadas o nota mínima)? */
  passed(hotspotId: string): boolean {
    return this.passedHotspots.has(hotspotId);
  }

  /**
   * ¿Ha dejado de retener la compuerta de este marcador? Superado, o con
   * intentos limitados y todas sus preguntas terminadas.
   */
  gateOpen(hotspotId: string): boolean {
    if (this.passedHotspots.has(hotspotId)) return true;
    const entry = this.hotspots.get(hotspotId);
    if (entry == null) return false;
    return quizGateOpen(
      entry.hotspot,
      this.correctByHotspot.get(hotspotId) ?? new Set(),
      this.finishedByHotspot.get(hotspotId) ?? new Set(),
    );
  }

  /**
   * Estado del quiz del tour. Cada pregunta cuenta por separado: un marcador
   * con cinco preguntas suma cinco al total y sus puntos al máximo (es lo que
   * reciben el informe final, el certificado, SCORM y el servidor).
   */
  state(): QuizStateEvent {
    let total = 0;
    let maxScore = 0;
    const detail: QuizStateEvent["detail"] = [];
    for (const { hotspot: hs, sceneId } of this.list) {
      const multi = Array.isArray(hs.questions) && hs.questions.length > 0;
      for (const q of quizQuestions(hs)) {
        total++;
        maxScore += quizQuestionPoints(q);
        const answer = this.answers.get(answerKey(hs.id, q.id));
        if (answer == null) continue;
        detail.push({
          hotspotId: hs.id,
          ...(multi ? { questionId: q.id } : {}),
          sceneId,
          correct: answer.correct,
          points: answer.points,
          ...(answer.selected != null ? { selected: answer.selected } : {}),
        });
      }
    }
    const score = Math.min(maxScore, detail.reduce((a, d) => a + d.points, 0));
    const passing = this.tour.quiz?.passingScore;
    const answered = detail.length;
    const passed =
      answered < total ? null : passing != null ? (maxScore > 0 ? (score / maxScore) * 100 >= passing : true) : null;
    return { score, maxScore, answered, total, passed, detail };
  }
}

function answerKey(hotspotId: string, questionId: string): string {
  return `${hotspotId}\u0000${questionId}`;
}
