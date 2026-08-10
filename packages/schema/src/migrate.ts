import type { Tour } from "./types.js";
import { TOUR_SCHEMA_VERSION } from "./types.js";

/**
 * Migrador de una version N a N+1. Recibe el documento tal cual (unknown
 * porque el formato de origen ya no coincide con los tipos actuales) y
 * devuelve el documento en la version siguiente.
 */
export type TourMigration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registro de migradores: la clave es la version de ORIGEN.
 * migrations[0] convierte v0 -> v1, migrations[1] convertira v1 -> v2, etc.
 */
const migrations: Record<number, TourMigration> = {
  // v0 fue el formato del prototipo interno (fase 0): "panoramas" en vez de
  // "scenes", vistas en grados y sin bloque meta. Se mantiene el migrador
  // como garantia de que los tours antiguos siempre abren.
  0: (doc) => {
    const panoramas = (doc.panoramas ?? doc.scenes ?? []) as Record<string, unknown>[];
    const degToRad = (v: unknown): number | undefined =>
      typeof v === "number" ? (v * Math.PI) / 180 : undefined;
    const scenes = panoramas.map((p) => {
      const view = (p.view ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        type: p.type ?? "image",
        title: p.title ?? String(p.id),
        source: p.source,
        initialView:
          view.yaw != null || view.pitch != null || view.fov != null
            ? { yaw: degToRad(view.yaw) ?? 0, pitch: degToRad(view.pitch) ?? 0, fov: degToRad(view.fov) ?? 1.2 }
            : undefined,
        hotspots: (p.hotspots ?? []) as unknown[],
      };
    });
    return {
      version: 1,
      meta: {
        title: doc.title ?? "Tour sin título",
        defaultLang: (doc.lang as string) ?? "es",
        langs: [(doc.lang as string) ?? "es"],
      },
      start: { scene: (doc.startScene as string) ?? (scenes[0]?.id as string) },
      scenes,
    };
  },
};

export class TourMigrationError extends Error {
  constructor(
    message: string,
    public readonly fromVersion: number,
  ) {
    super(message);
    this.name = "TourMigrationError";
  }
}

/**
 * Lleva un documento de tour de cualquier version anterior a la actual.
 * Idempotente si ya esta en la version actual.
 */
export function migrateTour(input: unknown): Tour {
  if (typeof input !== "object" || input === null) {
    throw new TourMigrationError("El documento no es un objeto", -1);
  }
  let doc = input as Record<string, unknown>;
  let version = typeof doc.version === "number" ? doc.version : 0;
  if (version > TOUR_SCHEMA_VERSION) {
    throw new TourMigrationError(
      `El tour usa la version ${version}, posterior a la soportada (${TOUR_SCHEMA_VERSION}); actualiza Andarama`,
      version,
    );
  }
  while (version < TOUR_SCHEMA_VERSION) {
    const migration = migrations[version];
    if (migration == null) {
      throw new TourMigrationError(`No hay migrador para la version ${version}`, version);
    }
    doc = migration(doc);
    const next = typeof doc.version === "number" ? doc.version : version + 1;
    if (next <= version) {
      throw new TourMigrationError(`El migrador de v${version} no avanzó la version`, version);
    }
    version = next;
  }
  return doc as unknown as Tour;
}
