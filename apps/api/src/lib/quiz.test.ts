import { describe, expect, it } from "vitest";
import type { Tour } from "@andarama/schema";
import { scoreQuiz } from "./quiz.js";

function tour(passingScore?: number): Tour {
  return {
    version: 1,
    meta: { title: "T", defaultLang: "es", langs: ["es"] },
    start: { scene: "s1" },
    quiz: passingScore != null ? { passingScore } : undefined,
    scenes: [
      {
        id: "s1",
        title: "Uno",
        source: { kind: "equirect", url: "x.jpg" },
        hotspots: [
          { id: "q1", type: "quiz", position: { yaw: 0, pitch: 0 }, question: "¿?", kind: "single", points: 2, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
          { id: "q2", type: "quiz", position: { yaw: 0, pitch: 0 }, question: "¿?", kind: "multiple", options: [{ id: "x", text: "X", correct: true }, { id: "y", text: "Y", correct: true }, { id: "z", text: "Z" }] },
        ],
      },
    ],
  } as unknown as Tour;
}

describe("nota del quiz en el servidor", () => {
  it("puntúa con las opciones correctas del tour publicado", () => {
    const r = scoreQuiz(tour(), [
      { hotspotId: "q1", selected: ["a"] },
      { hotspotId: "q2", selected: ["y", "x"] },
    ]);
    expect(r).toMatchObject({ score: 3, maxScore: 3, answered: 2, total: 2, passed: null });
  });

  it("una opción de más o de menos en la múltiple es fallo", () => {
    expect(scoreQuiz(tour(), [{ hotspotId: "q2", selected: ["x"] }]).score).toBe(0);
    expect(scoreQuiz(tour(), [{ hotspotId: "q2", selected: ["x", "y", "z"] }]).score).toBe(0);
    expect(scoreQuiz(tour(), [{ hotspotId: "q2", selected: ["x", "x"] }]).score).toBe(0);
  });

  it("no se fía de correct ni de points del navegador", () => {
    const r = scoreQuiz(tour(), [{ hotspotId: "q1", correct: true, points: 500 }]);
    expect(r.score).toBe(0);
    expect(r.detail[0]).toMatchObject({ correct: false, points: 0 });
  });

  it("preguntas inventadas o repetidas no suman y la nota nunca pasa del máximo", () => {
    const r = scoreQuiz(tour(), [
      { hotspotId: "q1", selected: ["a"] },
      { hotspotId: "q1", selected: ["a"] },
      { hotspotId: "otra", selected: ["a"] },
    ]);
    expect(r.score).toBe(2);
    expect(r.score).toBeLessThanOrEqual(r.maxScore);
    expect(r.answered).toBe(1);
  });

  it("el aprobado sale de la nota mínima, solo con todo respondido", () => {
    expect(scoreQuiz(tour(60), [{ hotspotId: "q1", selected: ["a"] }]).passed).toBeNull();
    expect(scoreQuiz(tour(60), [{ hotspotId: "q1", selected: ["a"] }, { hotspotId: "q2", selected: [] }]).passed).toBe(true);
    expect(scoreQuiz(tour(80), [{ hotspotId: "q1", selected: ["a"] }, { hotspotId: "q2", selected: [] }]).passed).toBe(false);
  });
});
