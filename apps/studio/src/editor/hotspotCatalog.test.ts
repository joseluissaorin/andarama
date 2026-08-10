import { describe, expect, it } from "vitest";
import type { HotspotType } from "@andarama/schema";
import { FAMILY_ORDER, HOTSPOT_CATALOG, fold, searchCatalog } from "./hotspotCatalog";

/**
 * Los tipos que el esquema admite. Fijar aquí la lista, y no un número, es lo
 * que hace que añadir un tipo nuevo al esquema sin ofrecerlo en la paleta
 * salte en rojo: un tipo que no se puede colocar no existe para nadie.
 */
const TIPOS: HotspotType[] = [
  "navigation", "text", "image", "gallery", "videoFile", "embedVideo", "audio", "pdf",
  "model3d", "web", "form", "compare", "quiz", "polygon", "tooltip", "link", "state", "treasure",
];

const LABELS: Record<string, string> = {
  navigation: "Navegación",
  quiz: "Pregunta (quiz)",
  embedVideo: "YouTube/Vimeo/PeerTube",
};
const labelOf = (type: string): string => LABELS[type] ?? type;

describe("catálogo de hotspots", () => {
  it("la paleta ofrece todos los tipos del esquema, con familia conocida", () => {
    expect([...HOTSPOT_CATALOG.map((k) => k.type)].sort()).toEqual([...TIPOS].sort());
    for (const kind of HOTSPOT_CATALOG) expect(FAMILY_ORDER).toContain(kind.family);
  });

  it("no hay tipos repetidos", () => {
    expect(new Set(HOTSPOT_CATALOG.map((k) => k.type)).size).toBe(TIPOS.length);
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
    expect(searchCatalog("   ", labelOf)).toHaveLength(TIPOS.length);
  });

  it("fold quita diacríticos y mayúsculas", () => {
    expect(fold("Pregunta ÁÉÍÓÚñ")).toBe("pregunta aeioun");
  });
});
