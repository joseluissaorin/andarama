import { describe, expect, it } from "vitest";
import { FAMILY_ORDER, HOTSPOT_CATALOG, fold, searchCatalog } from "./hotspotCatalog";

const LABELS: Record<string, string> = {
  navigation: "Navegación",
  quiz: "Pregunta (quiz)",
  embedVideo: "YouTube/Vimeo/PeerTube",
};
const labelOf = (type: string): string => LABELS[type] ?? type;

describe("catálogo de hotspots", () => {
  it("están los 17 tipos y todos tienen familia conocida", () => {
    expect(HOTSPOT_CATALOG).toHaveLength(17);
    for (const kind of HOTSPOT_CATALOG) expect(FAMILY_ORDER).toContain(kind.family);
  });

  it("no hay tipos repetidos", () => {
    expect(new Set(HOTSPOT_CATALOG.map((k) => k.type)).size).toBe(17);
  });

  it("busca sin tildes: quien escribe deprisa no las pone", () => {
    expect(searchCatalog("navegacion", labelOf).map((k) => k.type)).toContain("navigation");
    expect(searchCatalog("Navegación", labelOf).map((k) => k.type)).toContain("navigation");
  });

  it("busca por sinónimos, no solo por el nombre", () => {
    expect(searchCatalog("puerta", labelOf).map((k) => k.type)).toContain("navigation");
    expect(searchCatalog("examen", labelOf).map((k) => k.type)).toContain("quiz");
    expect(searchCatalog("glb", labelOf).map((k) => k.type)).toContain("model3d");
  });

  it("sin consulta devuelve el catálogo entero", () => {
    expect(searchCatalog("   ", labelOf)).toHaveLength(17);
  });

  it("fold quita diacríticos y mayúsculas", () => {
    expect(fold("Pregunta ÁÉÍÓÚñ")).toBe("pregunta aeioun");
  });
});
