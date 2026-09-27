import { describe, expect, it } from "vitest";
import { estaPublicado } from "./publicacion";

describe("publicación de artículos", () => {
  const hoy = new Date("2026-09-27T10:00:00Z");

  it("publica lo que tiene fecha de hoy o anterior", () => {
    expect(estaPublicado({ fecha: new Date("2026-09-13") }, hoy)).toBe(true);
    expect(estaPublicado({ fecha: new Date("2026-09-27") }, hoy)).toBe(true);
  });

  it("no publica fechas futuras ni borradores", () => {
    expect(estaPublicado({ fecha: new Date("2026-10-22") }, hoy)).toBe(false);
    expect(estaPublicado({ fecha: new Date("2026-09-01"), borrador: true }, hoy)).toBe(false);
  });

  it("en desarrollo enseña todo", () => {
    expect(estaPublicado({ fecha: new Date("2026-10-22"), borrador: true }, hoy, true)).toBe(true);
  });
});
