import { describe, expect, it } from "vitest";
import { LANG_NAMES, UI_LANGS, langDir, langNativeName, matchUiLang, normalizeUiLang } from "./langs.js";

describe("idiomas de la interfaz", () => {
  it("son 32 y todos tienen nombre en su propia lengua", () => {
    expect(UI_LANGS).toHaveLength(32);
    for (const lang of UI_LANGS) expect(LANG_NAMES[lang]).toBeTruthy();
  });

  it("normaliza códigos del navegador y de tours", () => {
    expect(normalizeUiLang("pt-BR")).toBe("pt");
    expect(normalizeUiLang("es-ES")).toBe("es");
    expect(normalizeUiLang("ZH_HANS")).toBe("zh-Hans");
    expect(normalizeUiLang("zh-TW")).toBe("zh-Hant");
    expect(normalizeUiLang("zh-Hant-HK")).toBe("zh-Hant");
    expect(normalizeUiLang("zh")).toBe("zh-Hans");
    expect(normalizeUiLang("nb-NO")).toBe("no");
    expect(normalizeUiLang("tl")).toBe("fil");
    expect(normalizeUiLang("iw")).toBe("he");
    expect(normalizeUiLang("eu")).toBeUndefined();
    expect(normalizeUiLang("")).toBeUndefined();
    expect(normalizeUiLang(null)).toBeUndefined();
  });

  it("elige el primer candidato con diccionario", () => {
    expect(matchUiLang(["eu-ES", "ca", "fr-CA", "en"])).toBe("fr");
    expect(matchUiLang(["eu-ES", "ca"])).toBeUndefined();
    expect(matchUiLang([])).toBeUndefined();
  });

  it("da el nombre nativo y cae al código cuando no lo conoce", () => {
    expect(langNativeName("de")).toBe("Deutsch");
    expect(langNativeName("zh-tw")).toBe("繁體中文");
    expect(langNativeName("xx-YY")).toBe("XX-YY");
  });

  it("marca árabe y hebreo como derecha a izquierda", () => {
    expect(langDir("ar")).toBe("rtl");
    expect(langDir("he-IL")).toBe("rtl");
    expect(langDir("es")).toBe("ltr");
  });
});
