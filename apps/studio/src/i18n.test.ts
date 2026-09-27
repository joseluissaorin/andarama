import { describe, expect, it } from "vitest";
import { UI_LANGS } from "@andarama/schema";
import es from "./i18n/es.json";

/**
 * Cada idioma de la interfaz tiene su diccionario con exactamente las claves
 * de es.json (la fuente), en el mismo orden, sin huecos y con los mismos
 * marcadores {así}. Lo garantiza la tubería tooling/i18n/traducir.py; esta
 * prueba lo vuelve a comprobar en cada cambio.
 */
const tablas = import.meta.glob<Record<string, string>>("./i18n/*.json", { eager: true, import: "default" });

const marcadores = (s: string): string[] => (s.match(/\{[A-Za-z0-9_]+\}/g) ?? []).sort();
const etiquetas = (s: string): string[] => (s.match(/<\/?[A-Za-z][^<>]*>/g) ?? []).sort();

describe("diccionarios del Studio", () => {
  it("hay un diccionario por idioma de la interfaz y ninguno de más", () => {
    const presentes = Object.keys(tablas)
      .map((ruta) => ruta.replace(/^\.\/i18n\//, "").replace(/\.json$/, ""))
      .sort();
    expect(presentes).toEqual([...UI_LANGS].sort());
  });

  it.each(UI_LANGS)("%s tiene las claves, los marcadores y las etiquetas de es.json", (lang) => {
    const tabla = tablas[`./i18n/${lang}.json`];
    expect(tabla).toBeDefined();
    expect(Object.keys(tabla!)).toEqual(Object.keys(es));
    for (const [clave, original] of Object.entries(es)) {
      const valor = tabla![clave]!;
      expect(valor.trim(), `${lang}.${clave} vacía`).not.toBe("");
      expect(marcadores(valor), `${lang}.${clave}`).toEqual(marcadores(original));
      expect(etiquetas(valor), `${lang}.${clave}`).toEqual(etiquetas(original));
    }
  });
});
