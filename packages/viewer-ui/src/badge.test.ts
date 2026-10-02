import { describe, expect, it } from "vitest";
import { badgeLabel } from "./badge.js";

describe("texto de la insignia", () => {
  it("usa el del autor cuando lo hay", () => {
    expect(badgeLabel("Un recorrido del Museo de la Ciencia", "Hecho con Andarama")).toBe("Un recorrido del Museo de la Ciencia");
  });

  it("sin texto propio (o en blanco), el traducido", () => {
    expect(badgeLabel(undefined, "Hecho con Andarama")).toBe("Hecho con Andarama");
    expect(badgeLabel("   ", "Hecho con Andarama")).toBe("Hecho con Andarama");
  });

  it("recorta los textos desmesurados", () => {
    expect(badgeLabel("x".repeat(200), "f")).toHaveLength(80);
  });
});
