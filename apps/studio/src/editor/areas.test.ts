import { describe, expect, it } from "vitest";
import {
  areaOfScene,
  areasOf,
  areasWithPlan,
  areaTree,
  legacyAreaId,
  assignScene,
  clearPlacement,
  createArea,
  deleteArea,
  distanceMeters,
  geoOf,
  migrateAreas,
  needsAreaMigration,
  nextAreaTitle,
  patchArea,
  placeScene,
  placementOf,
  readAreas,
  renameArea,
  setAreaPlan,
  setGeo,
  setNorth,
} from "./areas";
import type { EditorSnapshot, SceneRow } from "../stores";

/**
 * El área es a la vez planta, zona y categoría. Estas pruebas fijan esa
 * equivalencia y la migración de lo anterior, que es lo que evita volver a
 * tener tres sitios distintos donde decir de qué parte del edificio es una
 * sala.
 */

function scene(id: string, meta: Record<string, unknown> = {}, map: Record<string, unknown> | null = null): SceneRow {
  return {
    id,
    projectId: "p",
    sort: 0,
    title: id,
    type: "image",
    mediaId: null,
    sourceJson: null,
    initialViewJson: null,
    limitsJson: null,
    audioJson: null,
    mapJson: map != null ? JSON.stringify(map) : null,
    metaJson: JSON.stringify(meta),
  };
}

function snapshot(scenes: SceneRow[], settings: Record<string, unknown> = {}): EditorSnapshot {
  return { scenes, hotspots: [], settings };
}

describe("migración a áreas", () => {
  it("convierte los planos antiguos conservando su identificador", () => {
    const draft = snapshot([scene("a", {}, { floorplan: "planta0", x: 0.3, y: 0.4 })], {
      floorplans: [{ id: "planta0", title: "Planta baja", url: "media:xyz", level: 0 }],
    });
    expect(needsAreaMigration(draft)).toBe(true);
    migrateAreas(draft);
    const areas = readAreas(draft.settings);
    expect(areas).toHaveLength(1);
    expect(areas[0]!.id).toBe("planta0");
    expect(areas[0]!.plan?.url).toBe("media:xyz");
    // La colocación ya existente sigue apuntando a su sitio
    expect(placementOf(draft.scenes[0]!)).toEqual({ area: "planta0", x: 0.3, y: 0.4, north: undefined });
    expect(areaOfScene(draft.scenes[0]!)).toBe("planta0");
    expect(draft.settings.floorplans).toBeUndefined();
  });

  it("convierte las categorías sueltas en áreas sin plano", () => {
    const draft = snapshot([scene("a", { category: "Interiores" }), scene("b", { category: "Interiores" }), scene("c", { category: "Jardín" })]);
    migrateAreas(draft);
    const areas = readAreas(draft.settings);
    expect(areas.map((a) => a.title).sort()).toEqual(["Interiores", "Jardín"]);
    expect(areaOfScene(draft.scenes[0]!)).toBe(areaOfScene(draft.scenes[1]!));
    expect(areaOfScene(draft.scenes[2]!)).not.toBe(areaOfScene(draft.scenes[0]!));
    expect(areas.every((a) => a.plan == null)).toBe(true);
  });

  it("no duplica el área si la categoría se llama como un plano", () => {
    const draft = snapshot([scene("a", { category: "Planta baja" })], {
      floorplans: [{ id: "p0", title: "Planta baja", url: "media:x" }],
    });
    migrateAreas(draft);
    expect(readAreas(draft.settings)).toHaveLength(1);
    expect(areaOfScene(draft.scenes[0]!)).toBe("p0");
  });

  it("una vez migrado ya no hace falta volver a migrar", () => {
    const draft = snapshot([scene("a", { category: "Interiores" })]);
    migrateAreas(draft);
    expect(needsAreaMigration(draft)).toBe(false);
  });

  it("un proyecto sin planos ni categorías no necesita migración", () => {
    expect(needsAreaMigration(snapshot([scene("a")]))).toBe(false);
  });
});

describe("un tour sin convertir se ve igual", () => {
  it("deduce las áreas de los planos y las categorías antiguas", () => {
    const draft = snapshot([scene("a", { category: "Interiores" }), scene("b", {}, { floorplan: "p0", x: 0.2, y: 0.2 })], {
      floorplans: [{ id: "p0", title: "Planta baja", url: "media:x", level: 0 }],
    });
    const areas = areasOf(draft);
    expect(areas.map((a) => a.title)).toEqual(["Planta baja", "Interiores"]);
    expect(areas[0]!.plan?.url).toBe("media:x");
    // Y cada escena cae en la suya sin haber tocado nada
    expect(areaOfScene(draft.scenes[1]!)).toBe("p0");
    expect(areaOfScene(draft.scenes[0]!)).toBe(areas[1]!.id);
  });

  it("convertirlo no cambia a qué área pertenece cada escena", () => {
    const draft = snapshot([scene("a", { category: "Interiores" }), scene("b", { category: "Jardín" })]);
    const antes = draft.scenes.map((s) => areaOfScene(s));
    migrateAreas(draft);
    expect(draft.scenes.map((s) => areaOfScene(s))).toEqual(antes);
  });

  it("una vez convertido manda lo guardado, no lo deducido", () => {
    const draft = snapshot([scene("a", { category: "Interiores" })]);
    migrateAreas(draft);
    createArea(draft, "Nueva");
    expect(areasOf(draft).map((a) => a.title)).toEqual(["Interiores", "Nueva"]);
  });

  it("el identificador deducido no depende del azar", () => {
    expect(legacyAreaId("Planta baja")).toBe(legacyAreaId(" PLANTA  BAJA "));
    expect(legacyAreaId("Jardín")).toBe("cat-jardin");
  });
});

describe("áreas y categorías son lo mismo", () => {
  it("meter una escena en un área le pone la categoría del visor", () => {
    const draft = snapshot([scene("a")]);
    const id = createArea(draft, "Biblioteca");
    assignScene(draft, "a", id);
    expect(JSON.parse(draft.scenes[0]!.metaJson).category).toBe("Biblioteca");
  });

  it("renombrar el área renombra la categoría de todas sus escenas", () => {
    const draft = snapshot([scene("a"), scene("b")]);
    const id = createArea(draft, "Biblioteca");
    assignScene(draft, "a", id);
    assignScene(draft, "b", id);
    renameArea(draft, id, "Biblioteca general");
    expect(draft.scenes.map((s) => JSON.parse(s.metaJson).category)).toEqual(["Biblioteca general", "Biblioteca general"]);
  });

  it("sacar la escena del área le quita la categoría", () => {
    const draft = snapshot([scene("a")]);
    const id = createArea(draft, "Biblioteca");
    assignScene(draft, "a", id);
    assignScene(draft, "a", null);
    expect(JSON.parse(draft.scenes[0]!.metaJson).category).toBeUndefined();
    expect(areaOfScene(draft.scenes[0]!)).toBeNull();
  });

  it("no repite nombres de área", () => {
    const draft = snapshot([]);
    createArea(draft, "Planta");
    createArea(draft, "Planta");
    const titles = readAreas(draft.settings).map((a) => a.title);
    expect(new Set(titles).size).toBe(2);
    expect(nextAreaTitle(readAreas(draft.settings), "Planta")).toBe("Planta 3");
  });
});

describe("colocación sobre el plano", () => {
  function conPlano(): { draft: EditorSnapshot; id: string } {
    const draft = snapshot([scene("a"), scene("b")]);
    const id = createArea(draft, "Planta 0");
    setAreaPlan(draft, id, { url: "media:plan" });
    return { draft, id };
  }

  it("colocar una escena en el plano la mete en el área", () => {
    const { draft, id } = conPlano();
    placeScene(draft, "a", id, 0.25, 0.75);
    expect(areaOfScene(draft.scenes[0]!)).toBe(id);
    expect(placementOf(draft.scenes[0]!)).toMatchObject({ area: id, x: 0.25, y: 0.75 });
  });

  it("la posición se recorta al plano", () => {
    const { draft, id } = conPlano();
    placeScene(draft, "a", id, -0.4, 1.9);
    expect(placementOf(draft.scenes[0]!)).toMatchObject({ x: 0, y: 1 });
  });

  it("cambiar de área tira la colocación anterior", () => {
    const { draft, id } = conPlano();
    placeScene(draft, "a", id, 0.5, 0.5);
    const otra = createArea(draft, "Planta 1");
    assignScene(draft, "a", otra);
    expect(placementOf(draft.scenes[0]!)).toBeNull();
  });

  it("quitar el plano descoloca a las escenas que estaban en él", () => {
    const { draft, id } = conPlano();
    placeScene(draft, "a", id, 0.5, 0.5);
    setAreaPlan(draft, id, null);
    expect(placementOf(draft.scenes[0]!)).toBeNull();
    // Pero siguen perteneciendo al área: el grupo no desaparece con la imagen
    expect(areaOfScene(draft.scenes[0]!)).toBe(id);
  });

  it("borrar el área no borra las escenas, las deja sueltas", () => {
    const { draft, id } = conPlano();
    placeScene(draft, "a", id, 0.5, 0.5);
    deleteArea(draft, id);
    expect(draft.scenes).toHaveLength(2);
    expect(areaOfScene(draft.scenes[0]!)).toBeNull();
    expect(placementOf(draft.scenes[0]!)).toBeNull();
  });

  it("no coloca en un área que no existe", () => {
    const draft = snapshot([scene("a")]);
    placeScene(draft, "a", "fantasma", 0.5, 0.5);
    expect(placementOf(draft.scenes[0]!)).toBeNull();
  });

  it("el norte se guarda normalizado y no arrastra basura", () => {
    const { draft } = conPlano();
    setNorth(draft, "a", Math.PI * 3);
    expect(Math.abs(JSON.parse(draft.scenes[0]!.mapJson!).north)).toBeCloseTo(Math.PI, 3);
  });

  it("descolocar deja el mapJson limpio si no queda nada", () => {
    const { draft, id } = conPlano();
    placeScene(draft, "a", id, 0.5, 0.5);
    clearPlacement(draft, "a");
    expect(draft.scenes[0]!.mapJson).toBeNull();
  });
});

describe("plantas, zonas y calibración", () => {
  it("las áreas con plano se ordenan por nivel descendente, como en el visor", () => {
    const draft = snapshot([]);
    const bajo = createArea(draft, "Sótano", { level: -1 });
    const alto = createArea(draft, "Planta 1", { level: 1 });
    setAreaPlan(draft, bajo, { url: "media:a" });
    setAreaPlan(draft, alto, { url: "media:b" });
    createArea(draft, "Zona sin plano");
    expect(areasWithPlan(draft.settings).map((a) => a.title)).toEqual(["Planta 1", "Sótano"]);
  });

  it("una zona vive dentro de una planta, pero no se anida sin fin", () => {
    const draft = snapshot([]);
    const planta = createArea(draft, "Planta 0");
    const ala = createArea(draft, "Ala oeste", { parent: planta });
    const sub = createArea(draft, "Pasillo", { parent: ala });
    const areas = readAreas(draft.settings);
    expect(areas.find((a) => a.id === ala)!.parent).toBe(planta);
    expect(areas.find((a) => a.id === sub)!.parent).toBeUndefined();
    const tree = areaTree(areas);
    expect(tree.find((n) => n.area.id === planta)!.children.map((c) => c.id)).toEqual([ala]);
  });

  it("con el plano calibrado hay distancias reales; sin calibrar, no se inventan", () => {
    const draft = snapshot([scene("a"), scene("b")]);
    const id = createArea(draft, "Planta 0");
    setAreaPlan(draft, id, { url: "media:plan" });
    placeScene(draft, "a", id, 0, 0);
    placeScene(draft, "b", id, 0.5, 0);
    expect(distanceMeters(draft.scenes[0]!, draft.scenes[1]!, readAreas(draft.settings))).toBeNull();
    patchArea(draft, id, { plan: { url: "media:plan", widthMeters: 40 } });
    expect(distanceMeters(draft.scenes[0]!, draft.scenes[1]!, readAreas(draft.settings))).toBeCloseTo(20, 5);
  });

  it("las coordenadas geográficas se guardan y se leen", () => {
    const draft = snapshot([scene("a")]);
    setGeo(draft, "a", 28.481234567, -16.3159876);
    expect(geoOf(draft.scenes[0]!)).toEqual({ lat: 28.481235, lng: -16.315988 });
  });
});
