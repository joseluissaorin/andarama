import { describe, expect, it } from "vitest";
import { isLabelTruncated, shouldExpandLabel } from "./labels";

describe("etiquetas cortadas", () => {
  it("detecta el corte por altura (line-clamp) y por anchura", () => {
    expect(isLabelTruncated({ scrollHeight: 80, clientHeight: 49, scrollWidth: 200, clientWidth: 200 })).toBe(true);
    expect(isLabelTruncated({ scrollHeight: 20, clientHeight: 20, scrollWidth: 300, clientWidth: 200 })).toBe(true);
    // El redondeo de subpíxeles no cuenta como corte
    expect(isLabelTruncated({ scrollHeight: 50, clientHeight: 49, scrollWidth: 200, clientWidth: 200 })).toBe(false);
  });

  it("solo una etiqueta cortada abre el texto entero, fuera del editor y si no es un tooltip", () => {
    expect(shouldExpandLabel({ type: "navigation", editable: false, truncated: true })).toBe(true);
    expect(shouldExpandLabel({ type: "text", editable: false, truncated: true })).toBe(true);
    expect(shouldExpandLabel({ type: "navigation", editable: false, truncated: false })).toBe(false);
    expect(shouldExpandLabel({ type: "navigation", editable: true, truncated: true })).toBe(false);
    expect(shouldExpandLabel({ type: "tooltip", editable: false, truncated: true })).toBe(false);
  });
});
