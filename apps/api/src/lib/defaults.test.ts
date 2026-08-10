import { describe, expect, it } from "vitest";
import { clearOverride, markOverride, mergeDefaults, propagateOrgDefaults, resolveNewTourSettings } from "./defaults.js";

describe("cascada de valores por defecto", () => {
  it("la organización manda sobre la instancia", () => {
    const s = resolveNewTourSettings({
      instanceLangs: ["es", "en"],
      org: { ui: { theme: { base: "ull", primaryColor: "#5c068c" } } },
      user: {},
      explicit: {},
    });
    expect((s.ui as any).theme.primaryColor).toBe("#5c068c");
    expect(s.langs).toEqual(["es", "en"]);
  });

  it("el usuario manda sobre la organización, y lo elegido al crear sobre todo", () => {
    const s = resolveNewTourSettings({
      instanceLangs: ["es"],
      org: { defaultLang: "en" },
      user: { defaultLang: "fr" },
      explicit: { defaultLang: "de" },
    });
    expect(s.defaultLang).toBe("de");
    expect(s.langs).toContain("de");
  });

  it("la plantilla aporta su configuración sin perder la herencia previa", () => {
    const s = resolveNewTourSettings({
      instanceLangs: ["es"],
      org: { ui: { theme: { base: "ull" }, compass: true } },
      user: {},
      template: { ui: { theme: { primaryColor: "#123456" } } },
      explicit: {},
    });
    expect((s.ui as any).theme.base).toBe("ull");
    expect((s.ui as any).theme.primaryColor).toBe("#123456");
    expect((s.ui as any).compass).toBe(true);
  });

  it("mergeDefaults no fusiona arrays: el nivel específico los reemplaza", () => {
    expect(mergeDefaults({ langs: ["es", "en"] }, { langs: ["fr"] }).langs).toEqual(["fr"]);
  });

  it("un cambio de la organización llega a los borradores que no lo personalizaron", () => {
    const tour: Record<string, unknown> = { ui: { theme: { base: "ull" } } };
    const next = propagateOrgDefaults(tour, { ui: { theme: { base: "dark" } } }, ["ui"]);
    expect((next.ui as any).theme.base).toBe("dark");
  });

  it("y no pisa lo que el tour personalizó a mano", () => {
    const tour: Record<string, unknown> = { ui: { theme: { base: "light" } } };
    markOverride(tour, "ui");
    const next = propagateOrgDefaults(tour, { ui: { theme: { base: "dark" } } }, ["ui"]);
    expect((next.ui as any).theme.base).toBe("light");
  });

  it("volver a heredar reactiva la propagación", () => {
    const tour: Record<string, unknown> = { ui: { theme: { base: "light" } } };
    markOverride(tour, "ui");
    clearOverride(tour, "ui");
    expect(tour.__overrides).toBeUndefined();
    const next = propagateOrgDefaults(tour, { ui: { theme: { base: "dark" } } }, ["ui"]);
    expect((next.ui as any).theme.base).toBe("dark");
  });

  it("el idioma por defecto siempre está entre los idiomas del tour", () => {
    const s = resolveNewTourSettings({ instanceLangs: ["en"], org: {}, user: {}, explicit: { defaultLang: "es" } });
    expect(s.langs).toContain("es");
    expect(s.defaultLang).toBe("es");
  });
});
