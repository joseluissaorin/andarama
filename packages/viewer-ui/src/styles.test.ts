import { describe, expect, it } from "vitest";
import { VIEWER_CSS } from "./styles.js";

/** Declaraciones de la primera regla cuyo selector es exactamente `selector`. */
function rule(selector: string): string {
  const i = VIEWER_CSS.indexOf(`${selector} {`);
  expect(i, selector).toBeGreaterThanOrEqual(0);
  return VIEWER_CSS.slice(i, VIEWER_CSS.indexOf("}", i));
}

/**
 * Un texto de 712 caracteres en un panel y un tooltip de 483 no se podían
 * leer enteros. Las cajas con texto largo deben desplazarse por dentro con la
 * rueda y con el dedo, sin arrastrar la panorámica ni la página.
 */
describe("cajas de texto desplazables", () => {
  for (const selector of [".anda-tooltip-bubble", ".anda-panel__body"]) {
    it(`${selector} se desplaza con rueda y dedo`, () => {
      const css = rule(selector);
      expect(css).toContain("overflow-y: auto");
      expect(css).toContain("overscroll-behavior: contain");
      expect(css).toContain("touch-action: pan-y");
    });
  }

  it("la burbuja tiene un alto máximo", () => {
    expect(rule(".anda-tooltip-bubble")).toMatch(/max-height:/);
  });

  it("el cuerpo del panel puede encogerse dentro del flex (si no, no hay desplazamiento)", () => {
    expect(rule(".anda-panel__body")).toContain("min-height: 0");
  });
});

describe("etiquetas de los marcadores", () => {
  it("se pueden pulsar para leer el texto entero", () => {
    expect(rule(".anda-hotspot__label")).toContain("pointer-events: auto");
  });

  it("en pantallas táctiles las de «al pasar el ratón» se ven siempre, en una línea", () => {
    const i = VIEWER_CSS.indexOf("@media (hover: none)");
    expect(i).toBeGreaterThanOrEqual(0);
    const bloque = VIEWER_CSS.slice(i, VIEWER_CSS.indexOf("}\n}", i));
    expect(bloque).toContain(".anda-hotspot__label--hover");
    expect(bloque).toContain("opacity: 1");
    expect(bloque).toContain("line-clamp: 1");
  });
});
