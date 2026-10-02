import { describe, expect, it } from "vitest";
import {
  addQuestion,
  duplicateQuestion,
  editorQuestions,
  migrateToQuestions,
  moveQuestion,
  patchQuestion,
  removeQuestion,
} from "./quizQuestions";

/** Aplica un parche como `setContent`: `undefined` borra el campo. */
function aplicar(content: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const c = { ...content };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete c[k];
    else c[k] = v;
  }
  return c;
}

const legado = {
  question: "¿Capital de Canarias?",
  kind: "single",
  options: [
    { id: "a", text: "Santa Cruz", correct: true },
    { id: "b", text: "Madrid" },
  ],
  feedbackCorrect: "Bien",
  points: 2,
  gate: true,
  altText: "Pregunta",
};

describe("preguntas del quiz en el editor", () => {
  it("la pregunta heredada se ve como una lista de una, con el id del hotspot", () => {
    const qs = editorQuestions(legado, "hs1");
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ id: "hs1", question: "¿Capital de Canarias?", points: 2, feedbackCorrect: "Bien" });
  });

  it("editar la única pregunta heredada escribe los campos sueltos", () => {
    const c = aplicar(legado, patchQuestion(legado, "hs1", 0, { question: "Otra" }));
    expect(c.question).toBe("Otra");
    expect(c.questions).toBeUndefined();
  });

  it("añadir una pregunta migra la heredada a questions[0] y limpia los campos sueltos", () => {
    const c = aplicar(legado, addQuestion(legado, "hs1", "nueva"));
    for (const k of ["question", "kind", "options", "feedbackCorrect", "points"]) expect(c).not.toHaveProperty(k);
    // Lo que no es de la pregunta se queda en el marcador
    expect(c).toMatchObject({ gate: true, altText: "Pregunta" });
    const qs = c.questions as { id: string; question: string; points?: number; options: unknown[] }[];
    expect(qs.map((q) => q.id)).toEqual(["hs1", "nueva"]);
    expect(qs[0]).toMatchObject({ question: "¿Capital de Canarias?", points: 2, feedbackCorrect: "Bien" });
    expect(qs[0]!.options).toHaveLength(2);
    // La nueva hereda los puntos de la anterior y nace con dos opciones
    expect(qs[1]).toMatchObject({ question: "", points: 2 });
    expect(qs[1]!.options).toHaveLength(2);
  });

  it("migrar dos veces no cambia nada", () => {
    const c = aplicar(legado, migrateToQuestions(legado, "hs1"));
    expect(migrateToQuestions(c, "hs1")).toEqual({});
    expect(editorQuestions(c, "hs1")).toHaveLength(1);
  });

  it("duplicar copia debajo con id nuevo y opciones independientes", () => {
    let c = aplicar(legado, migrateToQuestions(legado, "hs1"));
    c = aplicar(c, addQuestion(c, "hs1", "p2"));
    c = aplicar(c, duplicateQuestion(c, "hs1", 0, "copia"));
    const qs = editorQuestions(c, "hs1");
    expect(qs.map((q) => q.id)).toEqual(["hs1", "copia", "p2"]);
    expect(qs[1]!.options).not.toBe(qs[0]!.options);
    expect(qs[1]!.question).toBe(qs[0]!.question);
  });

  it("subir, bajar y eliminar; la última pregunta no se elimina", () => {
    let c = aplicar(legado, addQuestion(legado, "hs1", "p2"));
    c = aplicar(c, addQuestion(c, "hs1", "p3"));
    c = aplicar(c, moveQuestion(c, "hs1", 2, -1));
    expect(editorQuestions(c, "hs1").map((q) => q.id)).toEqual(["hs1", "p3", "p2"]);
    expect(moveQuestion(c, "hs1", 0, -1)).toEqual({});
    expect(moveQuestion(c, "hs1", 2, 1)).toEqual({});
    c = aplicar(c, removeQuestion(c, "hs1", 0));
    c = aplicar(c, removeQuestion(c, "hs1", 0));
    expect(editorQuestions(c, "hs1").map((q) => q.id)).toEqual(["p2"]);
    expect(removeQuestion(c, "hs1", 0)).toEqual({});
  });

  it("con varias, editar una pregunta solo toca esa", () => {
    const c = aplicar(legado, addQuestion(legado, "hs1", "p2"));
    const d = aplicar(c, patchQuestion(c, "hs1", 1, { question: "Segunda", kind: "boolean" }));
    const qs = editorQuestions(d, "hs1");
    expect(qs[0]!.question).toBe("¿Capital de Canarias?");
    expect(qs[1]).toMatchObject({ question: "Segunda", kind: "boolean" });
  });
});
