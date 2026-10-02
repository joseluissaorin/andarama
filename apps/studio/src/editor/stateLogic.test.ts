import { describe, expect, it } from "vitest";
import { conditionsToRows, parseVarValue, rowsToConditions, summarizeStateHotspot, type StateSummaryWords } from "./stateLogic";
import { mediaRenameTarget } from "./mediaRename";

describe("condiciones de variables en filas", () => {
  it("las filas se guardan como condiciones con el valor tipado", () => {
    expect(
      rowsToConditions([
        { var: "llave", op: "eq", value: "true" },
        { var: " puntos ", op: "gte", value: "3" },
        { var: "sala", op: "ne", value: "cocina" },
        { var: "visto", op: "falsy", value: "lo que sea" },
      ]),
    ).toEqual([
      { var: "llave", op: "eq", value: true },
      { var: "puntos", op: "gte", value: 3 },
      { var: "sala", op: "ne", value: "cocina" },
      // truthy y falsy no llevan valor
      { var: "visto", op: "falsy" },
    ]);
  });

  it("una fila sin variable (la que se está escribiendo) no se guarda", () => {
    expect(rowsToConditions([{ var: "  ", op: "eq", value: "1" }])).toEqual([]);
  });

  it("ida y vuelta: lo guardado vuelve a las mismas filas", () => {
    const guardado = [
      { var: "llave", op: "eq" as const, value: true },
      { var: "puntos", op: "lt" as const, value: 10 },
      { var: "puerta", op: "truthy" as const },
    ];
    const filas = conditionsToRows(guardado)!;
    expect(filas).toEqual([
      { var: "llave", op: "eq", value: "true" },
      { var: "puntos", op: "lt", value: "10" },
      { var: "puerta", op: "truthy", value: "" },
    ]);
    expect(rowsToConditions(filas)).toEqual(guardado);
  });

  it("lo que no cabe en filas se señala con null para abrir el modo avanzado", () => {
    expect(conditionsToRows(undefined)).toEqual([]);
    expect(conditionsToRows({ var: "x", op: "eq" })).toBeNull();
    expect(conditionsToRows([{ var: "x", op: "contiene", value: 1 }])).toBeNull();
    expect(conditionsToRows([{ op: "eq", value: 1 }])).toBeNull();
  });

  it("verdadero y falso en español también se entienden", () => {
    expect(parseVarValue("Verdadero")).toBe(true);
    expect(parseVarValue("falso")).toBe(false);
    expect(parseVarValue("2.5")).toBe(2.5);
    expect(parseVarValue("abierta")).toBe("abierta");
    expect(parseVarValue("")).toBe("");
  });
});

describe("resumen del hotspot de acción", () => {
  const words: StateSummaryWords = {
    prefix: "Al pulsar",
    nothing: "todavía no cambia nada",
    yes: "verdadero",
    no: "falso",
    toggle: "alternar",
    goto: (name) => `ir a ${name}`,
  };
  const titulo = (id: string): string | undefined => ({ s2: "Pasillo" })[id];

  it("dice lo que pasa al pulsar, con la escena de destino", () => {
    expect(
      summarizeStateHotspot({ actions: [{ var: "llave", op: "set", value: true }], thenGoto: "s2" }, titulo, words),
    ).toBe("Al pulsar: llave = verdadero → ir a Pasillo");
  });

  it("suma, resta y alterna", () => {
    expect(
      summarizeStateHotspot(
        { actions: [{ var: "puntos", op: "inc", value: 5 }, { var: "vidas", op: "dec" }, { var: "luz", op: "toggle" }] },
        titulo,
        words,
      ),
    ).toBe("Al pulsar: puntos + 5, vidas − 1, luz: alternar");
  });

  it("sin cambios lo dice en vez de dejar la línea vacía", () => {
    expect(summarizeStateHotspot({ actions: [{ var: "", op: "set" }] }, titulo, words)).toBe("Al pulsar: todavía no cambia nada");
  });
});

describe("renombrar la foto con el título de la escena", () => {
  it("conserva la extensión y limpia los caracteres que no valen en un nombre de fichero", () => {
    expect(mediaRenameTarget("IMG_2024.JPG", "Sala: norte/sur")).toBe("Sala- norte-sur.JPG");
  });

  it("no ofrece nada si el nombre ya coincide o el título está vacío", () => {
    expect(mediaRenameTarget("Pasillo.jpg", "Pasillo")).toBeNull();
    expect(mediaRenameTarget("foto.jpg", "   ")).toBeNull();
  });
});
