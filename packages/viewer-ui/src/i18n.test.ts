import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@andarama/schema";
import { createTranslator, ensureUiLang, resolveUiLang, supportedUiLangs } from "./i18n.js";

/**
 * Cada idioma del visor tiene su diccionario con exactamente las claves de
 * es.json, en el mismo orden y con los mismos marcadores {así}; y el mapa de
 * cargadores perezosos de i18n.ts conoce todos los ficheros que hay.
 */
const carpeta = fileURLToPath(new URL("./i18n/", import.meta.url));
const leer = (lang: string): Record<string, string> => JSON.parse(readFileSync(`${carpeta}${lang}.json`, "utf8")) as Record<string, string>;
const es = leer("es");
const marcadores = (s: string): string[] => (s.match(/\{[A-Za-z0-9_]+\}/g) ?? []).sort();

describe("diccionarios del visor", () => {
  it("hay un fichero por idioma de la interfaz y el mapa de carga los conoce todos", () => {
    const ficheros = readdirSync(carpeta)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(ficheros).toEqual([...UI_LANGS].sort());
    expect(supportedUiLangs().sort()).toEqual([...UI_LANGS].sort());
  });

  it.each(UI_LANGS)("%s tiene las claves y los marcadores de es.json", (lang) => {
    const tabla = leer(lang);
    expect(Object.keys(tabla)).toEqual(Object.keys(es));
    for (const [clave, original] of Object.entries(es)) {
      expect(tabla[clave]!.trim(), `${lang}.${clave} vacía`).not.toBe("");
      expect(marcadores(tabla[clave]!), `${lang}.${clave}`).toEqual(marcadores(original));
    }
  });

  it("carga un idioma bajo demanda y lo usa con sus marcadores", async () => {
    expect(resolveUiLang("de")).toBe("de");
    expect(await ensureUiLang("de-AT")).toBe("de");
    const t = createTranslator("de");
    expect(t("scene_of", { index: 2, total: 5 })).toBe(leer("de").scene_of!.replace("{index}", "2").replace("{total}", "5"));
  });

  it("cae al navegador o al inglés cuando el tour habla un idioma sin diccionario", () => {
    const efectivo = resolveUiLang("eu");
    expect(supportedUiLangs()).toContain(efectivo);
    expect(createTranslator("eu")("close")).not.toBe("close");
  });
});
