import { describe, expect, it } from "vitest";
import { baseFromTourUrl } from "./url.js";

/**
 * El paquete exportado carga "tour.json" sin barras: la base debe quedar
 * vacía (mismo directorio del documento) para que los medios se resuelvan
 * como "a/tiles/...". Un recorte ingenuo del último segmento producía
 * "tour.json/a/tiles/..." y rompía el tour en cualquier alojamiento.
 */
describe("baseFromTourUrl", () => {
  it("deja la base vacía cuando el tour está junto al index.html", () => {
    expect(baseFromTourUrl("tour.json")).toBe("");
  });

  it("recorta el último segmento cuando hay ruta", () => {
    expect(baseFromTourUrl("/t/mi-tour/tour.json")).toBe("/t/mi-tour");
    expect(baseFromTourUrl("https://ull.es/tours/x/tour.json")).toBe("https://ull.es/tours/x");
    expect(baseFromTourUrl("../datos/tour.json")).toBe("../datos");
  });

  it("ignora la cadena de consulta y el fragmento", () => {
    expect(baseFromTourUrl("tour.json?v=2")).toBe("");
    expect(baseFromTourUrl("/t/x/tour.json?v=2#s=a")).toBe("/t/x");
  });

  it("sin URL de tour la base es vacía", () => {
    expect(baseFromTourUrl(undefined)).toBe("");
  });
});
