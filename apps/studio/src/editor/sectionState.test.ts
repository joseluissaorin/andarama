import { describe, expect, it } from "vitest";
import { SECTION_KEY_PREFIX, readSectionOpen, writeSectionOpen } from "./sectionState";

function memoria(): Pick<Storage, "getItem" | "setItem"> & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
  };
}

describe("secciones plegables del panel", () => {
  it("sin nada guardado manda el valor por defecto de la sección", () => {
    const s = memoria();
    expect(readSectionOpen("scene-audio", false, s)).toBe(false);
    expect(readSectionOpen("scene-arrivals", true, s)).toBe(true);
  });

  it("recuerda cómo la dejó quien edita, por id", () => {
    const s = memoria();
    writeSectionOpen("scene-audio", true, s);
    writeSectionOpen("scene-arrivals", false, s);
    expect(s.datos.get(`${SECTION_KEY_PREFIX}scene-audio`)).toBe("1");
    expect(s.datos.get("andarama:section:scene-arrivals")).toBe("0");
    expect(readSectionOpen("scene-audio", false, s)).toBe(true);
    expect(readSectionOpen("scene-arrivals", true, s)).toBe(false);
    // Las demás no se enteran
    expect(readSectionOpen("scene-gps", false, s)).toBe(false);
  });

  it("sin almacenamiento, o si falla, no rompe nada", () => {
    expect(readSectionOpen("x", true, null)).toBe(true);
    const roto = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readSectionOpen("x", false, roto)).toBe(false);
    expect(() => writeSectionOpen("x", true, roto)).not.toThrow();
  });

  it("un valor guardado raro se ignora", () => {
    const s = memoria();
    s.setItem(`${SECTION_KEY_PREFIX}x`, "quizá");
    expect(readSectionOpen("x", true, s)).toBe(true);
  });
});
