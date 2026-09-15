import { describe, expect, it } from "vitest";
import { coordsFromSnapshot, countryOptions, galleryPayload, initialGalleryForm, parseCoords, validateGallery, type GalleryForm } from "./gallery";
import type { EditorSnapshot } from "../stores";

const valida: GalleryForm = {
  enabled: true,
  title: "Catedral de La Laguna: recorrido virtual 360",
  description: "x".repeat(350),
  credits: "",
  placeName: "San Cristóbal de La Laguna",
  placeCountry: "ES",
  lat: "28.4874",
  lng: "-16.3159",
  lang: "es",
};

describe("ficha de la galería", () => {
  it("apagada nunca tiene errores; encendida exige título, descripción, lugar y país", () => {
    expect(validateGallery({ ...valida, enabled: false, title: "", description: "" })).toEqual([]);
    expect(validateGallery(valida)).toEqual([]);
    expect(validateGallery({ ...valida, title: "ab" })).toContain("title");
    expect(validateGallery({ ...valida, description: "corta" })).toContain("description_short");
    expect(validateGallery({ ...valida, description: "x".repeat(601) })).toContain("description_long");
    expect(validateGallery({ ...valida, placeName: " " })).toContain("place");
    expect(validateGallery({ ...valida, placeCountry: "" })).toContain("country");
    expect(validateGallery({ ...valida, lng: "" })).toContain("coords");
  });

  it("las coordenadas van juntas, admiten coma decimal y respetan el rango", () => {
    expect(parseCoords("", "")).toBeNull();
    expect(parseCoords("28,5", "-16,3")).toEqual({ lat: 28.5, lng: -16.3 });
    expect(parseCoords("28.5", "")).toBe("invalid");
    expect(parseCoords("91", "0")).toBe("invalid");
    expect(parseCoords("0", "181")).toBe("invalid");
  });

  it("el cuerpo que se manda va recortado y sin coordenadas si no las hay", () => {
    expect(galleryPayload({ ...valida, enabled: false })).toEqual({ enabled: false });
    const cuerpo = galleryPayload({ ...valida, title: "  Título  ", lat: "", lng: "" });
    expect(cuerpo.title).toBe("Título");
    expect(cuerpo).not.toHaveProperty("lat");
    const conCoords = galleryPayload(valida);
    expect(conCoords.lat).toBe(28.4874);
    expect(conCoords.lng).toBe(-16.3159);
  });

  it("prerrellena las coordenadas con el centro del mapa o la primera escena situada", () => {
    const base: EditorSnapshot = { scenes: [], hotspots: [], settings: {} };
    expect(coordsFromSnapshot(null)).toBeNull();
    expect(coordsFromSnapshot(base)).toBeNull();
    expect(coordsFromSnapshot({ ...base, settings: { geoMap: { center: { lat: 1, lng: 2 } } } })).toEqual({ lat: 1, lng: 2 });
    const escena = { id: "s", projectId: "p", sort: 0, title: "S", type: "image" as const, mediaId: null, sourceJson: null, initialViewJson: null, limitsJson: null, audioJson: null, metaJson: "{}" };
    expect(coordsFromSnapshot({ ...base, scenes: [{ ...escena, mapJson: "{bad" }, { ...escena, mapJson: JSON.stringify({ lat: 3, lng: 4 }) }] })).toEqual({ lat: 3, lng: 4 });
    const form = initialGalleryForm(null, { ...base, settings: { geoMap: { center: { lat: 1, lng: 2 } } } }, "Mi tour", "es");
    expect(form.enabled).toBe(false);
    expect(form.title).toBe("Mi tour");
    expect(form.lat).toBe("1");
    // Lo guardado manda sobre lo que sabe el tour
    const guardado = initialGalleryForm({ enabled: true, title: "T", description: "D", credits: null, placeName: "L", placeCountry: "ES", lat: 9, lng: 8, lang: "en" }, base, "Mi tour", "es");
    expect(guardado.enabled).toBe(true);
    expect(guardado.lat).toBe("9");
    expect(guardado.lang).toBe("en");
  });

  it("lista los países con nombre en el idioma del editor", () => {
    const paises = countryOptions("es");
    expect(paises.length).toBeGreaterThan(200);
    expect(paises.find((p) => p.code === "ES")?.name).toBe("España");
    // Ordenados por nombre, no por código
    const nombres = paises.map((p) => p.name);
    expect(nombres.indexOf("Alemania")).toBeLessThan(nombres.indexOf("España"));
  });
});
