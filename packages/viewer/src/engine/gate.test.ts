import { describe, expect, it } from "vitest";
import type { Hotspot } from "@andarama/schema";
import { pendingGates, type GateState } from "./gate";

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
