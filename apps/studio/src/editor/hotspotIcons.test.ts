import { describe, expect, it } from "vitest";
import { hasIcon } from "../../../../packages/viewer/src/hotspots/icons";
import { ICON_CATALOG } from "./hotspotIcons";

/**
 * El catálogo del editor y el registro del visor tienen que ir a la par: un
 * icono elegible que el visor no conozca se publicaría y aparecería como el
 * icono de reserva, que es un fallo silencioso de contenido.
 */
describe("catálogo de iconos de hotspot", () => {
  it("todo icono elegible existe en el registro del visor", () => {
    const desconocidos = ICON_CATALOG.filter((o) => !hasIcon(o.name)).map((o) => o.name);
    expect(desconocidos).toEqual([]);
  });

  it("no hay nombres repetidos", () => {
    const nombres = ICON_CATALOG.map((o) => o.name);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("hay bastantes iconos de verdad", () => {
    expect(ICON_CATALOG.length).toBeGreaterThanOrEqual(120);
  });
});
