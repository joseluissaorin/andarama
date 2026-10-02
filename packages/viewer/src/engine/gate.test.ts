import { describe, expect, it } from "vitest";
import type { Hotspot } from "@andarama/schema";
import { pendingGates, quizGateOpen, type GateState } from "./gate";

const quiz = (id: string, gate = true): Hotspot =>
  ({ id, type: "quiz", position: { yaw: 0, pitch: 0 }, question: "¿?", kind: "single", options: [], gate }) as unknown as Hotspot;
const form = (id: string, gate = true): Hotspot =>
  ({ id, type: "form", position: { yaw: 0, pitch: 0 }, fields: [], destination: {}, gate }) as unknown as Hotspot;
const treasure = (id: string, gate = true): Hotspot =>
  ({ id, type: "treasure", position: { yaw: 0, pitch: 0 }, gate }) as unknown as Hotspot;

function estado(correctas: string[] = [], enviados: string[] = [], hallados: string[] = []): GateState {
  return {
    quizCorrect: (id) => correctas.includes(id),
    formSent: (id) => enviados.includes(id),
    treasureFound: (id) => hallados.includes(id),
  };
}

describe("compuertas de escena", () => {
  it("sin compuertas, la salida está libre", () => {
    expect(pendingGates([quiz("a", false), form("f", false)], estado())).toEqual([]);
  });

  it("con dos preguntas con compuerta, acertar una no abre la salida (21b)", () => {
    const hs = [quiz("a"), quiz("b")];
    expect(pendingGates(hs, estado(["a"]))).toEqual([{ hotspotId: "b", reason: "quiz" }]);
    expect(pendingGates(hs, estado(["b"]))).toEqual([{ hotspotId: "a", reason: "quiz" }]);
    expect(pendingGates(hs, estado(["a", "b"]))).toEqual([]);
  });

  it("una pregunta sin compuerta no retiene aunque esté mal", () => {
    expect(pendingGates([quiz("a"), quiz("libre", false)], estado(["a"]))).toEqual([]);
  });

  it("el formulario con compuerta retiene hasta enviarlo", () => {
    expect(pendingGates([form("f")], estado())).toEqual([{ hotspotId: "f", reason: "form" }]);
    expect(pendingGates([form("f")], estado([], ["f"]))).toEqual([]);
  });

  it("el tesoro con compuerta retiene hasta encontrarlo", () => {
    expect(pendingGates([treasure("t")], estado())).toEqual([{ hotspotId: "t", reason: "treasure" }]);
    expect(pendingGates([treasure("t")], estado([], [], ["t"]))).toEqual([]);
  });

  it("se exigen todas a la vez y en el orden de la escena", () => {
    const hs = [treasure("t"), quiz("a"), form("f")];
    expect(pendingGates(hs, estado(["a"])).map((p) => p.reason)).toEqual(["treasure", "form"]);
  });
});

describe("compuerta de quiz con intentos limitados", () => {
  const una = { id: "q", type: "quiz" as const, question: "¿?", kind: "single" as const, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] };
  const varias = {
    id: "qm",
    type: "quiz" as const,
    questions: [
      { id: "p1", question: "Uno", kind: "single" as const, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
      { id: "p2", question: "Dos", kind: "single" as const, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] },
    ],
  };
  const s = (...ids: string[]): Set<string> => new Set(ids);

  it("agotar los intentos deja salir aunque la respuesta sea mala", () => {
    expect(quizGateOpen({ ...una, attempts: 2 }, s(), s())).toBe(false);
    // Terminada sin acertar (los dos intentos gastados)
    expect(quizGateOpen({ ...una, attempts: 2 }, s(), s("q"))).toBe(true);
    expect(quizGateOpen({ ...una, attempts: 2 }, s("q"), s("q"))).toBe(true);
  });

  it("con intentos ilimitados solo abre el acierto", () => {
    expect(quizGateOpen(una, s(), s("q"))).toBe(false);
    expect(quizGateOpen({ ...una, attempts: 0 }, s(), s("q"))).toBe(false);
    expect(quizGateOpen(una, s("q"), s("q"))).toBe(true);
  });

  it("con varias preguntas, abre al terminar el quiz sin intentos que gastar", () => {
    const conIntentos = { ...varias, attempts: 1 };
    expect(quizGateOpen(conIntentos, s("p1"), s("p1"))).toBe(false);
    expect(quizGateOpen(conIntentos, s("p1"), s("p1", "p2"))).toBe(true);
    expect(quizGateOpen(varias, s("p1"), s("p1", "p2"))).toBe(false);
  });

  it("la escena deja de retener con el quiz sin intentos", () => {
    const hs = [{ ...una, gate: true, attempts: 1 } as unknown as Hotspot];
    const terminado = { quizCorrect: (id: string) => quizGateOpen({ ...una, id, attempts: 1 }, s(), s(id)), formSent: () => false, treasureFound: () => false };
    expect(pendingGates(hs, terminado)).toEqual([]);
  });
});
