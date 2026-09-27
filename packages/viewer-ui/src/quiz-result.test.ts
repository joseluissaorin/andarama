import { describe, expect, it, vi } from "vitest";
import type { QuizStateEvent } from "@andarama/viewer";
import { buildQuizPayload, launchParams, quizComplete, quizSignature, sendQuizResult } from "./quiz-result.js";

const estado = (over: Partial<QuizStateEvent> = {}): QuizStateEvent => ({
  score: 1,
  maxScore: 2,
  answered: 2,
  total: 2,
  passed: null,
  detail: [
    { hotspotId: "q1", sceneId: "s", correct: true, points: 1, selected: ["a"] },
    { hotspotId: "q2", sceneId: "s", correct: false, points: 0, selected: ["c"] },
  ],
  ...over,
});

describe("resultado del quiz", () => {
  it("solo está completo con todas las preguntas terminadas", () => {
    expect(quizComplete(estado())).toBe(true);
    expect(quizComplete(estado({ answered: 1 }))).toBe(false);
    expect(quizComplete(estado({ total: 0, answered: 0 }))).toBe(false);
  });

  it("el envío lleva el detalle, el nombre y el lanzamiento LTI", () => {
    const p = buildQuizPayload(estado(), { sessionId: "ses-1", participantName: "  Ana  ", ltiLaunchId: "abcdef0123456789" });
    expect(p).toMatchObject({ sessionId: "ses-1", score: 1, maxScore: 2, participantName: "Ana", ltiLaunchId: "abcdef0123456789" });
    expect(p.detail[0]!.selected).toEqual(["a"]);
  });

  it("sin nombre ni LTI, esos campos no viajan", () => {
    const p = buildQuizPayload(estado(), { sessionId: "s", participantName: " ", ltiLaunchId: null });
    expect(p).not.toHaveProperty("participantName");
    expect(p).not.toHaveProperty("ltiLaunchId");
  });

  it("la huella cambia si cambia la respuesta o el nombre, no el orden", () => {
    const a = quizSignature(estado());
    const b = quizSignature(estado({ detail: [...estado().detail].reverse() }));
    expect(a).toBe(b);
    expect(quizSignature(estado(), "Ana")).not.toBe(a);
    expect(quizSignature(estado({ score: 2 }))).not.toBe(a);
  });

  it("lee ?lti= y ?name= del lanzamiento y descarta basura", () => {
    expect(launchParams("?lti=0123456789abcdef&name=Ana%20P%C3%A9rez")).toEqual({
      ltiLaunchId: "0123456789abcdef",
      participantName: "Ana Pérez",
    });
    expect(launchParams("?lti=<x>")).toEqual({ ltiLaunchId: null, participantName: null });
    expect(launchParams("")).toEqual({ ltiLaunchId: null, participantName: null });
  });

  it("envía con POST JSON y no lanza si la red falla", async () => {
    const ok = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await sendQuizResult("/api/v1/public/quiz/x", buildQuizPayload(estado(), { sessionId: "s" }), ok as never)).toBe(true);
    const llamada = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(llamada[0]).toBe("/api/v1/public/quiz/x");
    expect(llamada[1].method).toBe("POST");
    expect(JSON.parse(String(llamada[1].body)).score).toBe(1);
    const roto = vi.fn(async () => {
      throw new Error("sin red");
    });
    expect(await sendQuizResult("/x", buildQuizPayload(estado(), { sessionId: "s" }), roto as never)).toBe(false);
  });
});
