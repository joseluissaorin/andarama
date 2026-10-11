import { describe, expect, it } from "vitest";
import type { EditorSnapshot, HotspotRow, SceneRow } from "../../stores";
import { applyEvents, merge3, mergeRow, mergeSnapshots, sameJson, sameSnapshot, snapshotFromServer, type VersionBook } from "./merge";

function scene(id: string, extra: Partial<SceneRow> = {}): SceneRow {
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
    mapJson: null,
    metaJson: "{}",
    ...extra,
  };
}

function hotspot(id: string, sceneId: string, content: Record<string, unknown> = {}, extra: Partial<HotspotRow> = {}): HotspotRow {
  return {
    id,
    sceneId,
    type: "text",
    positionJson: JSON.stringify({ yaw: 0, pitch: 0 }),
    styleJson: null,
    contentJson: JSON.stringify(content),
    conditionsJson: null,
    sort: 0,
    ...extra,
  };
}

function tour(scenes: SceneRow[], hotspots: HotspotRow[] = [], settings: Record<string, unknown> = {}): EditorSnapshot {
  return structuredClone({ scenes, hotspots, settings });
}

describe("merge3", () => {
  it("lo que cambió una sola parte se queda", () => {
    expect(merge3(1, 1, 2)).toBe(2);
    expect(merge3(1, 3, 1)).toBe(3);
  });

  it("si cambian las dos lo mismo, gana lo que se está escribiendo", () => {
    expect(merge3("a", "local", "remoto")).toBe("local");
  });

  it("baja por las claves de los objetos y respeta los borrados", () => {
    const base = { a: 1, b: 1, c: 1 };
    const local = { a: 2, b: 1 };
    const remote = { a: 1, b: 3, c: 1, d: 4 };
    expect(merge3(base, local, remote)).toEqual({ a: 2, b: 3, d: 4 });
  });

  it("las listas son atómicas", () => {
    expect(merge3([1], [1, 2], [1, 3])).toEqual([1, 2]);
    expect(merge3([1], [1], [1, 3])).toEqual([1, 3]);
  });

  it("el orden de las claves no cuenta como cambio", () => {
    expect(sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(merge3({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 5, b: 2 })).toEqual({ a: 5, b: 2 });
  });
});

describe("mergeRow", () => {
  it("dos personas en campos distintos del mismo punto no se pisan", () => {
    const base = hotspot("h", "s", { title: "Hola", body: "Texto" });
    const local = hotspot("h", "s", { title: "Hola, mundo", body: "Texto" });
    const remote = hotspot("h", "s", { title: "Hola", body: "Texto revisado" });
    expect(JSON.parse(mergeRow(base, local, remote).contentJson)).toEqual({ title: "Hola, mundo", body: "Texto revisado" });
  });

  it("posición movida por otro y texto escrito aquí", () => {
    const base = hotspot("h", "s", { title: "A" });
    const local = hotspot("h", "s", { title: "B" });
    const remote = hotspot("h", "s", { title: "A" }, { positionJson: JSON.stringify({ yaw: 1, pitch: 0.5 }) });
    const merged = mergeRow(base, local, remote);
    expect(JSON.parse(merged.positionJson)).toEqual({ yaw: 1, pitch: 0.5 });
    expect(JSON.parse(merged.contentJson)).toEqual({ title: "B" });
  });

  it("el mismo campo de texto: gana lo que se está escribiendo", () => {
    const merged = mergeRow(scene("s", { title: "Aula" }), scene("s", { title: "Aula magna" }), scene("s", { title: "Aula 1" }));
    expect(merged.title).toBe("Aula magna");
  });

  it("un JSON reescrito por el servidor con otro orden de claves no cuenta como cambio", () => {
    const base = scene("s", { metaJson: JSON.stringify({ a: 1, b: 2 }) });
    const local = scene("s", { metaJson: JSON.stringify({ a: 1, b: 2, c: 3 }) });
    const remote = scene("s", { metaJson: JSON.stringify({ b: 2, a: 1 }) });
    expect(JSON.parse(mergeRow(base, local, remote).metaJson)).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe("mergeSnapshots", () => {
  const base = tour([scene("s1"), scene("s2")], [hotspot("h1", "s1"), hotspot("h2", "s2")], { lang: "es" });

  it("escenas y puntos nuevos de otro aparecen; los nuevos de aquí se conservan", () => {
    const local = tour([...base.scenes, scene("mia")], [...base.hotspots, hotspot("hmia", "s1")], base.settings);
    const remote = tour([...base.scenes, scene("suya")], [...base.hotspots, hotspot("hsuyo", "s2")], base.settings);
    const merged = mergeSnapshots(base, local, remote);
    // Lo nuevo de aquí sigue detrás de quien lo precedía en pantalla
    expect(merged.scenes.map((s) => s.id)).toEqual(["s1", "s2", "mia", "suya"]);
    expect(merged.hotspots.map((h) => h.id).sort()).toEqual(["h1", "h2", "hmia", "hsuyo"]);
  });

  it("lo que otro borró desaparece, también sus puntos y los nuevos de aquí en esa escena", () => {
    const local = tour(base.scenes, [...base.hotspots, hotspot("hmia", "s2")], base.settings);
    const remote = tour([scene("s1")], [hotspot("h1", "s1")], base.settings);
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.scenes.map((s) => s.id)).toEqual(["s1"]);
    expect(merged.hotspots.map((h) => h.id)).toEqual(["h1"]);
  });

  it("lo que aquí se borró no vuelve aunque otro lo haya tocado", () => {
    const local = tour([scene("s1")], [hotspot("h1", "s1")], base.settings);
    const remote = tour([scene("s1"), scene("s2", { title: "Cambiada" })], base.hotspots, base.settings);
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.scenes.map((s) => s.id)).toEqual(["s1"]);
  });

  it("un orden nuevo del servidor se aplica si aquí no se reordenó", () => {
    const local = tour([scene("s1", { title: "Editada" }), scene("s2"), scene("nueva")], base.hotspots, base.settings);
    const remote = tour([scene("s2"), scene("s1")], base.hotspots, base.settings);
    const merged = mergeSnapshots(base, local, remote);
    expect(merged.scenes.map((s) => s.id)).toEqual(["s2", "nueva", "s1"]);
    expect(merged.scenes[2]!.title).toBe("Editada");
  });

  it("si aquí se reordenó, manda el orden de aquí", () => {
    const local = tour([scene("s2"), scene("s1")], base.hotspots, base.settings);
    const remote = tour([scene("s1"), scene("s2"), scene("s3")], base.hotspots, base.settings);
    expect(mergeSnapshots(base, local, remote).scenes.map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("ajustes: claves distintas se suman, la misma gana aquí", () => {
    const b = tour([], [], { ui: { theme: "claro", size: 44 }, lang: "es" });
    const local = tour([], [], { ui: { theme: "oscuro", size: 44 }, lang: "es" });
    const remote = tour([], [], { ui: { theme: "claro", size: 52 }, lang: "es", autorotate: true });
    expect(mergeSnapshots(b, local, remote).settings).toEqual({ ui: { theme: "oscuro", size: 52 }, lang: "es", autorotate: true });
  });

  it("con `touched`, lo no tocado queda tal cual en pantalla", () => {
    const local = tour([scene("s1", { title: "Mía" }), scene("s2")], base.hotspots, base.settings);
    const remote = tour([scene("s1"), scene("s2", { title: "Suya" })], base.hotspots, base.settings);
    const merged = mergeSnapshots(base, local, remote, { scenes: new Set(["s2"]), hotspots: new Set(), settings: false, order: false });
    expect(merged.scenes.map((s) => s.title)).toEqual(["Mía", "Suya"]);
    expect(merged.scenes[0]).toBe(local.scenes[0]);
  });

  it("sin cambios propios, el resultado es el servidor y no queda nada por guardar", () => {
    const remote = tour([scene("s1", { title: "Nuevo" }), scene("s2")], base.hotspots, { lang: "es", x: 1 });
    const merged = mergeSnapshots(base, structuredClone(base), remote);
    expect(sameSnapshot(merged, remote)).toBe(true);
  });
});

describe("applyEvents", () => {
  const base = tour([scene("s1"), scene("s2")], [hotspot("h1", "s1"), hotspot("h2", "s2")], { lang: "es" });

  it("aplica altas, cambios, borrados en cascada, orden y ajustes", () => {
    const versions: VersionBook = new Map([["scene:s1", 1]]);
    const { base: next, touched, changed } = applyEvents(
      base,
      [
        { kind: "scene", op: "upsert", row: { ...scene("s1", { title: "Nuevo título" }), version: 2 } },
        { kind: "hotspot", op: "upsert", row: { ...hotspot("h3", "s1"), version: 0 } },
        { kind: "scene", op: "delete", id: "s2" },
        { kind: "settings", settings: { lang: "en" }, version: 4 },
        { kind: "order", order: ["s1"] },
      ],
      versions,
    );
    expect(changed).toBe(true);
    expect(next.scenes.map((s) => [s.id, s.title])).toEqual([["s1", "Nuevo título"]]);
    expect(next.hotspots.map((h) => h.id)).toEqual(["h1", "h3"]);
    expect(next.settings).toEqual({ lang: "en" });
    expect(versions.get("scene:s1")).toBe(2);
    expect(versions.get("settings")).toBe(4);
    expect(touched.scenes).toEqual(new Set(["s1", "s2"]));
    expect(touched.hotspots).toEqual(new Set(["h3", "h2"]));
    expect(base.scenes.length).toBe(2);
  });

  it("ignora los avisos con una versión ya conocida", () => {
    const versions: VersionBook = new Map([["hotspot:h1", 5]]);
    const { changed } = applyEvents(base, [{ kind: "hotspot", op: "upsert", row: { ...hotspot("h1", "s1", { title: "viejo" }), version: 4 } }], versions);
    expect(changed).toBe(false);
  });

  it("la fila del servidor llega sin la versión, que va al libro", () => {
    const { snapshot, versions } = snapshotFromServer(
      { scenes: [{ ...scene("s1"), version: 3 }], hotspots: [{ ...hotspot("h1", "s1"), version: 7 }] },
      { lang: "es" },
      2,
    );
    expect("version" in snapshot.scenes[0]!).toBe(false);
    expect(versions).toEqual(new Map([["scene:s1", 3], ["hotspot:h1", 7], ["settings", 2]]));
  });
});

describe("escenario completo: dos personas a la vez", () => {
  it("Ana escribe el título de un punto mientras Luis mueve otro y cambia un ajuste", () => {
    const server = tour([scene("s1")], [hotspot("ha", "s1", { title: "Puerta" }), hotspot("hb", "s1")], { autorotate: false });
    const anaBase = structuredClone(server);
    // Ana está escribiendo (sin guardar todavía)
    const anaLocal = structuredClone(server);
    anaLocal.hotspots[0]!.contentJson = JSON.stringify({ title: "Puerta principal" });
    // Luis guarda: el servidor avisa
    const versions: VersionBook = new Map();
    const { base: newBase, touched } = applyEvents(
      anaBase,
      [
        { kind: "hotspot", op: "upsert", row: { ...hotspot("hb", "s1", {}, { positionJson: JSON.stringify({ yaw: 2, pitch: 0 }) }), version: 1 } },
        { kind: "settings", settings: { autorotate: true }, version: 1 },
      ],
      versions,
    );
    const merged = mergeSnapshots(anaBase, anaLocal, newBase, touched);
    expect(JSON.parse(merged.hotspots[0]!.contentJson)).toEqual({ title: "Puerta principal" });
    expect(JSON.parse(merged.hotspots[1]!.positionJson)).toEqual({ yaw: 2, pitch: 0 });
    expect(merged.settings).toEqual({ autorotate: true });
    // Lo que falta por guardar es solo lo de Ana
    expect(sameSnapshot(merged, newBase)).toBe(false);
    const onlyAna = structuredClone(newBase);
    onlyAna.hotspots[0]!.contentJson = JSON.stringify({ title: "Puerta principal" });
    expect(sameSnapshot(merged, onlyAna)).toBe(true);
  });
});
