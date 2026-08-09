import { describe, expect, it } from "vitest";
import {
  collectL10nEntries,
  createEmptyTour,
  migrateTour,
  resolveL10n,
  setL10n,
  TOUR_SCHEMA_VERSION,
  translationCompleteness,
  validateTour,
  type Tour,
} from "./index.js";

function sampleTour(): Tour {
  return {
    version: 1,
    meta: {
      title: { es: "Campus de Guajara", en: "Guajara Campus" },
      defaultLang: "es",
      langs: ["es", "en"],
    },
    start: { scene: "entrada", view: { yaw: 0.4, pitch: 0, fov: 1.2 }, intro: "littlePlanet" },
    scenes: [
      {
        id: "entrada",
        type: "image",
        title: { es: "Entrada", en: "Entrance" },
        altText: { es: "Patio de entrada del edificio" },
        source: {
          kind: "multires",
          levels: 5,
          tileSize: 512,
          faceSize: 4096,
          base: "tiles/m_8f2a/",
          preview: "tiles/m_8f2a/preview.jpg",
        },
        initialView: { yaw: 0.4, pitch: 0, fov: 1.2 },
        hotspots: [
          {
            id: "h1",
            type: "navigation",
            yaw: 1.1,
            pitch: -0.1,
            target: "pasillo",
            altText: { es: "Ir al pasillo" },
            entry: { mode: "fixed", yaw: 0, pitch: 0, fov: 1.2 },
            label: { es: "Ir al pasillo", en: "Go to hallway" },
          },
        ],
      },
      {
        id: "pasillo",
        type: "image",
        title: { es: "Pasillo" },
        altText: { es: "Pasillo principal" },
        source: { kind: "equirect", url: "media/pasillo.jpg" },
        hotspots: [
          {
            id: "volver",
            type: "navigation",
            yaw: -2,
            pitch: 0,
            target: "entrada",
            altText: "Volver",
          },
        ],
      },
    ],
  };
}

describe("validateTour", () => {
  it("acepta un tour valido", () => {
    const result = validateTour(sampleTour());
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rechaza escena inicial inexistente", () => {
    const tour = sampleTour();
    tour.start.scene = "no-existe";
    const result = validateTour(tour);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "start-not-found")).toBe(true);
  });

  it("rechaza destino de navegacion inexistente", () => {
    const tour = sampleTour();
    (tour.scenes[0]!.hotspots[0] as { target: string }).target = "nada";
    const result = validateTour(tour);
    expect(result.issues.some((i) => i.code === "nav-target-missing")).toBe(true);
  });

  it("detecta IDs duplicados", () => {
    const tour = sampleTour();
    tour.scenes[1]!.id = "entrada";
    const result = validateTour(tour);
    expect(result.issues.some((i) => i.code === "dup-scene-id")).toBe(true);
  });

  it("avisa de escenas huerfanas", () => {
    const tour = sampleTour();
    tour.scenes.push({
      id: "aislada",
      type: "image",
      title: "Aislada",
      source: { kind: "equirect", url: "x.jpg" },
      hotspots: [],
    });
    const result = validateTour(tour);
    expect(result.issues.some((i) => i.code === "orphan-scene")).toBe(true);
    expect(result.valid).toBe(true); // huerfana es warning, no error
  });

  it("avisa de alt-text ausente", () => {
    const tour = sampleTour();
    delete tour.scenes[0]!.altText;
    const result = validateTour(tour);
    expect(result.issues.some((i) => i.code === "scene-no-alt")).toBe(true);
  });

  it("valida quiz sin correcta", () => {
    const tour = sampleTour();
    tour.scenes[0]!.hotspots.push({
      id: "q1",
      type: "quiz",
      yaw: 0,
      pitch: 0,
      question: "Pregunta",
      kind: "single",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
    });
    const result = validateTour(tour);
    expect(result.issues.some((i) => i.code === "quiz-no-correct")).toBe(true);
  });
});

describe("migrateTour", () => {
  it("es idempotente en la version actual", () => {
    const tour = sampleTour();
    expect(migrateTour(tour)).toEqual(tour);
  });

  it("migra el formato v0 del prototipo", () => {
    const v0 = {
      title: "Antiguo",
      lang: "es",
      startScene: "a",
      panoramas: [
        {
          id: "a",
          source: { kind: "equirect", url: "a.jpg" },
          view: { yaw: 90, pitch: 0, fov: 70 },
          hotspots: [],
        },
      ],
    };
    const tour = migrateTour(v0);
    expect(tour.version).toBe(TOUR_SCHEMA_VERSION);
    expect(tour.scenes[0]!.id).toBe("a");
    expect(tour.scenes[0]!.initialView!.yaw).toBeCloseTo(Math.PI / 2);
    expect(tour.start.scene).toBe("a");
  });

  it("rechaza versiones futuras", () => {
    expect(() => migrateTour({ version: 99, scenes: [] })).toThrowError(/posterior/);
  });
});

describe("l10n", () => {
  it("resuelve con fallback", () => {
    expect(resolveL10n({ es: "Hola", en: "Hello" }, "en", "es")).toBe("Hello");
    expect(resolveL10n({ es: "Hola" }, "en", "es")).toBe("Hola");
    expect(resolveL10n({ es: "Hola" }, "es-MX", "en")).toBe("Hola");
    expect(resolveL10n("Literal", "en", "es")).toBe("Literal");
    expect(resolveL10n(undefined, "en", "es")).toBe("");
  });

  it("setL10n convierte literal a mapa al anadir idioma", () => {
    expect(setL10n("Hola", "en", "Hello", "es")).toEqual({ es: "Hola", en: "Hello" });
    expect(setL10n("Hola", "es", "Adios", "es")).toBe("Adios");
  });

  it("calcula completitud de traduccion", () => {
    const entries = collectL10nEntries(sampleTour());
    expect(entries.length).toBeGreaterThan(3);
    const en = translationCompleteness(entries, "en");
    expect(en).toBeGreaterThan(0);
    expect(en).toBeLessThan(100);
    expect(translationCompleteness(entries, "es")).toBeGreaterThan(en);
  });
});

describe("createEmptyTour", () => {
  it("crea un tour con UI por defecto", () => {
    const tour = createEmptyTour("Nuevo tour");
    expect(tour.version).toBe(TOUR_SCHEMA_VERSION);
    expect(tour.ui?.sceneMenu).toBe(true);
    expect(tour.meta.defaultLang).toBe("es");
  });
});
