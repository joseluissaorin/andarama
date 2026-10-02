import { describe, expect, it } from "vitest";
import type { Hotspot, Tour } from "@andarama/schema";
import { pendingGates } from "./gate";
import { QuizTracker } from "./quiz";

const legado = {
  id: "q1",
  type: "quiz",
  yaw: 0,
  pitch: 0,
  question: "¿?",
  kind: "single",
  points: 2,
  options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }],
};

function multi(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "qm",
    type: "quiz",
    yaw: 0,
    pitch: 0,
    gate: true,
    questions: [
      { id: "p1", question: "Uno", kind: "single", options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
      { id: "p2", question: "Dos", kind: "single", points: 2, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
      { id: "p3", question: "Tres", kind: "boolean", options: [{ id: "v", text: "V" }, { id: "f", text: "F", correct: true }] },
    ],
    ...extra,
  };
}

function tour(hotspots: Record<string, unknown>[], passingScore?: number): Tour {
  return {
    version: 1,
    meta: { title: "T", defaultLang: "es", langs: ["es"] },
    start: { scene: "s1" },
    ...(passingScore != null ? { quiz: { passingScore } } : {}),
    scenes: [{ id: "s1", title: "Uno", source: { kind: "equirect", url: "x.jpg" }, hotspots }],
  } as unknown as Tour;
}

describe("nota del quiz con varias preguntas", () => {
  it("cuenta cada pregunta en el total y sus puntos en el máximo", () => {
    const q = new QuizTracker(tour([legado, multi()]));
    expect(q.state()).toMatchObject({ score: 0, maxScore: 6, answered: 0, total: 4, passed: null });
  });

  it("todo acertado da la nota máxima", () => {
    const q = new QuizTracker(tour([legado, multi()], 50));
    q.record("q1", true, 2, { selected: ["a"] });
    q.record("qm", true, 1, { selected: ["a"], questionId: "p1" });
    q.record("qm", true, 2, { selected: ["a"], questionId: "p2" });
    q.record("qm", true, 1, { selected: ["f"], questionId: "p3" });
    const s = q.state();
    expect(s).toMatchObject({ score: 6, maxScore: 6, answered: 4, total: 4, passed: true });
    expect(s.detail.map((d) => d.questionId)).toEqual([undefined, "p1", "p2", "p3"]);
  });

  it("acierto parcial: suman las acertadas y la primera respuesta es la que puntúa", () => {
    const q = new QuizTracker(tour([multi()], 80));
    q.record("qm", false, 1, { selected: ["b"], questionId: "p1" });
    q.record("qm", true, 1, { selected: ["a"], questionId: "p1" });
    q.record("qm", true, 2, { selected: ["a"], questionId: "p2" });
    q.record("qm", false, 1, { selected: ["v"], questionId: "p3" });
    expect(q.state()).toMatchObject({ score: 2, maxScore: 4, answered: 3, total: 3, passed: false });
  });

  it("los puntos salen del tour, no de quien llama", () => {
    const q = new QuizTracker(tour([multi()]));
    q.record("qm", true, 500, { questionId: "p2" });
    expect(q.state().score).toBe(2);
  });

  it("sin pregunta explícita se apunta a la heredada", () => {
    const q = new QuizTracker(tour([legado]));
    q.record("q1", true, 1, { selected: ["a"] });
    expect(q.answer("q1")).toMatchObject({ correct: true, points: 2 });
    expect(q.passed("q1")).toBe(true);
  });
});

describe("compuerta de un marcador con varias preguntas", () => {
  function puertas(q: QuizTracker, hs: Record<string, unknown>): string[] {
    return pendingGates([hs as unknown as Hotspot], {
      quizCorrect: (id) => q.gateOpen(id),
      formSent: () => false,
      treasureFound: () => false,
    }).map((p) => p.hotspotId);
  }

  it("sin nota mínima no se abre hasta acertarlas todas", () => {
    const hs = multi();
    const q = new QuizTracker(tour([hs]));
    q.record("qm", true, 1, { questionId: "p1" });
    q.record("qm", true, 1, { questionId: "p2" });
    expect(puertas(q, hs)).toEqual(["qm"]);
    q.record("qm", false, 1, { questionId: "p3" });
    expect(puertas(q, hs)).toEqual(["qm"]);
    // Volver a intentarlo y acertar abre la salida
    q.record("qm", true, 1, { questionId: "p3" });
    expect(puertas(q, hs)).toEqual([]);
  });

  it("con intentos limitados, terminar todas sin acertar deja salir y cuenta como fallo", () => {
    const hs = multi({ attempts: 2 });
    const q = new QuizTracker(tour([hs]));
    q.record("qm", true, 1, { questionId: "p1" });
    q.record("qm", false, 1, { questionId: "p2" });
    expect(puertas(q, hs)).toEqual(["qm"]);
    q.record("qm", false, 1, { questionId: "p3" });
    expect(puertas(q, hs)).toEqual([]);
    expect(q.passed("qm")).toBe(false);
    expect(q.state()).toMatchObject({ score: 1, maxScore: 4 });
  });

  it("con nota mínima basta llegar al porcentaje de puntos del marcador", () => {
    const hs = multi({ passScore: 75 });
    const q = new QuizTracker(tour([hs]));
    q.record("qm", true, 1, { questionId: "p2" });
    expect(puertas(q, hs)).toEqual(["qm"]);
    q.record("qm", true, 1, { questionId: "p1" });
    // p1 + p2 = 3 de 4 puntos (75 %)
    expect(puertas(q, hs)).toEqual([]);
  });
});
