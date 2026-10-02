import { describe, expect, it } from "vitest";
import { entradasNovedades, fechaMasReciente, hayNovedadesSinLeer, ultimaFecha, type EntradaNovedades } from "./index";

const e = (fecha: string): EntradaNovedades => ({ fecha, titulo: fecha, items: ["x"] });

describe("novedades sin leer", () => {
  const entradas = [e("2026-09-20"), e("2026-10-02"), e("2026-09-01")];

  it("la última fecha es la más reciente, no la primera de la lista", () => {
    expect(ultimaFecha(entradas)).toBe("2026-10-02");
    expect(ultimaFecha([])).toBeNull();
  });

  it("quien nunca abrió el panel tiene novedades por leer", () => {
    expect(hayNovedadesSinLeer(entradas, null)).toBe(true);
    expect(hayNovedadesSinLeer(entradas, undefined)).toBe(true);
  });

  it("solo hay novedades si alguna entrada es posterior a la última vista", () => {
    expect(hayNovedadesSinLeer(entradas, "2026-09-20")).toBe(true);
    expect(hayNovedadesSinLeer(entradas, "2026-10-02")).toBe(false);
    expect(hayNovedadesSinLeer(entradas, "2026-11-01")).toBe(false);
    expect(hayNovedadesSinLeer([], null)).toBe(false);
  });

  it("entre la cuenta y el navegador manda la fecha más reciente y se ignoran las inválidas", () => {
    expect(fechaMasReciente("2026-09-01", "2026-10-02")).toBe("2026-10-02");
    expect(fechaMasReciente(undefined, "2026-10-02")).toBe("2026-10-02");
    expect(fechaMasReciente("basura", null)).toBeNull();
  });

  it("los ficheros de español e inglés tienen las mismas fechas, ordenadas de nueva a antigua", () => {
    const es = entradasNovedades("es").map((x) => x.fecha);
    const en = entradasNovedades("en").map((x) => x.fecha);
    expect(es).toEqual(en);
    expect([...es].sort().reverse()).toEqual(es);
    // Cualquier otro idioma ve el inglés
    expect(entradasNovedades("de")).toEqual(entradasNovedades("en"));
  });
});
