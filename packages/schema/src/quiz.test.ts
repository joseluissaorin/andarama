import { describe, expect, it } from "vitest";
import { isQuizAnswerCorrect, quizHotspotPassed, quizMaxPoints, quizQuestions } from "./quiz.js";
import type { QuizHotspot, Tour } from "./types.js";
import { validateTour } from "./validate.js";

const legacy: QuizHotspot = {
  id: "q1",
  type: "quiz",
  yaw: 0,
  pitch: 0,
  question: "¿Capital de Canarias?",
  kind: "single",
  options: [
    { id: "a", text: "Santa Cruz", correct: true },
    { id: "b", text: "Madrid" },
  ],
  feedbackCorrect: "Bien",
  points: 3,
};

const multi: QuizHotspot = {
  id: "q2",
  type: "quiz",
  yaw: 0,
  pitch: 0,
  questions: [
    { id: "p1", question: "Uno", kind: "single", options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
    { id: "p2", question: "Dos", kind: "multiple", points: 2, options: [{ id: "x", text: "X", correct: true }, { id: "y", text: "Y", correct: true }, { id: "z", text: "Z" }] },
    { id: "p3", question: "Tres", kind: "boolean", options: [{ id: "v", text: "Verdadero" }, { id: "f", text: "Falso", correct: true }] },
  ],
};

describe("quizQuestions", () => {
  it("envuelve la pregunta heredada con el id del hotspot", () => {
    const qs = quizQuestions(legacy);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ id: "q1", question: "¿Capital de Canarias?", kind: "single", feedbackCorrect: "Bien", points: 3 });
    expect(qs[0]!.options).toHaveLength(2);
  });

  it("usa questions cuando las hay e ignora los campos sueltos", () => {
    const qs = quizQuestions({ ...multi, question: "vieja", options: [] });
    expect(qs.map((q) => q.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("una lista vacía cae en la forma heredada", () => {
    expect(quizQuestions({ ...legacy, questions: [] })[0]!.id).toBe("q1");
  });

  it("los puntos por defecto son 1 por pregunta", () => {
    expect(quizMaxPoints(multi)).toBe(4);
    expect(quizMaxPoints(legacy)).toBe(3);
  });
});

describe("corrección y aprobado del marcador", () => {
  it("exige marcar exactamente las correctas", () => {
    const q = multi.questions![1]!;
    expect(isQuizAnswerCorrect(q, ["y", "x"])).toBe(true);
    expect(isQuizAnswerCorrect(q, ["x"])).toBe(false);
    expect(isQuizAnswerCorrect(q, ["x", "y", "z"])).toBe(false);
    expect(isQuizAnswerCorrect(q, ["x", "x"])).toBe(false);
  });

  it("sin nota mínima hay que acertar todas", () => {
    expect(quizHotspotPassed(multi, new Set(["p1", "p2", "p3"]))).toBe(true);
    expect(quizHotspotPassed(multi, new Set(["p1", "p2"]))).toBe(false);
    expect(quizHotspotPassed(legacy, new Set(["q1"]))).toBe(true);
    expect(quizHotspotPassed(legacy, new Set())).toBe(false);
  });

  it("con nota mínima cuenta el porcentaje de puntos", () => {
    const conNota = { ...multi, passScore: 75 };
    // p2 vale 2 de 4: p1 + p2 = 75 %
    expect(quizHotspotPassed(conNota, new Set(["p1", "p2"]))).toBe(true);
    expect(quizHotspotPassed(conNota, new Set(["p1", "p3"]))).toBe(false);
  });
});

describe("validación del quiz con varias preguntas", () => {
  function tourCon(hs: QuizHotspot): Tour {
    return {
      version: 1,
      meta: { title: "T", defaultLang: "es", langs: ["es"] },
      start: { scene: "s1" },
      scenes: [{ id: "s1", title: "Uno", source: { kind: "equirect", url: "x.jpg" }, hotspots: [{ ...hs, altText: "Pregunta" }] }],
    } as unknown as Tour;
  }

  it("acepta questions sin los campos sueltos", () => {
    const r = validateTour(tourCon(multi));
    expect(r.issues.filter((i) => i.code.startsWith("quiz"))).toEqual([]);
  });

  it("señala la pregunta sin correcta con su ruta", () => {
    const roto = { ...multi, questions: [...multi.questions!, { id: "p4", question: "Cuatro", kind: "single" as const, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] }] };
    const r = validateTour(tourCon(roto));
    const issue = r.issues.find((i) => i.code === "quiz-no-correct");
    expect(issue?.path).toContain("questions[3]");
  });

  it("rechaza ids de pregunta repetidos y notas fuera de rango", () => {
    const roto = { ...multi, passScore: 140, questions: [multi.questions![0]!, multi.questions![0]!] };
    const codes = validateTour(tourCon(roto)).issues.map((i) => i.code);
    expect(codes).toContain("quiz-dup-question-id");
    expect(codes).toContain("quiz-bad-pass-score");
  });
});
