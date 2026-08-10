import { asc, eq, inArray } from "drizzle-orm";
import {
  hotspots as hotspotsTable,
  media as mediaTable,
  mediaDerivatives,
  projects,
  scenes as scenesTable,
  translations as translationsTable,
} from "@andarama/db";
import type { Hotspot, Scene, SceneSource, Tour } from "@andarama/schema";
import { TOUR_SCHEMA_URL, TOUR_SCHEMA_VERSION, validateTour } from "@andarama/schema";
import type { Db } from "./lib/context.js";
import { notFound } from "./lib/errors.js";
import { parseJson } from "./lib/util.js";

/**
 * Compilador: filas normalizadas del borrador -> tour.json inmutable.
 *
 * Contrato de medios: el Studio guarda referencias "media:{id}",
 * "thumb:{id}" u "og:{id}" en cualquier campo de texto. El compilador las
 * resuelve a rutas relativas "a/..." y devuelve el mapa de assets
 * (ruta relativa -> clave de almacenamiento) que se congela junto al tour.
 * El visor publico nunca consulta la base de datos (§5.4).
 */

export interface CompiledTour {
  tour: Tour;
  /** ruta relativa -> clave exacta de almacenamiento */
  assets: Record<string, string>;
  /** prefijo relativo -> prefijo de almacenamiento (tiles) */
  prefixes: Record<string, string>;
  issues: ReturnType<typeof validateTour>["issues"];
}

interface MediaInfo {
  row: typeof mediaTable.$inferSelect;
  derivatives: (typeof mediaDerivatives.$inferSelect)[];
}

export async function compileProject(db: Db, projectId: string): Promise<CompiledTour> {
  const projectRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = projectRows[0];
  if (project == null) throw notFound("Proyecto no encontrado");

  const settings = parseJson<Record<string, unknown>>(project.settingsJson, {});
  const sceneRows = await db
    .select()
    .from(scenesTable)
    .where(eq(scenesTable.projectId, projectId))
    .orderBy(asc(scenesTable.sort));
  const sceneIds = sceneRows.map((s) => s.id);
  const hotspotRows =
    sceneIds.length > 0
      ? await db
          .select()
          .from(hotspotsTable)
          .where(inArray(hotspotsTable.sceneId, sceneIds))
          .orderBy(asc(hotspotsTable.sort))
      : [];
  const translationRows = await db
    .select()
    .from(translationsTable)
    .where(eq(translationsTable.projectId, projectId));

  // Medios referenciados
  const mediaIds = new Set<string>();
  const collectMediaRefs = (value: unknown): void => {
    if (typeof value === "string") {
      const m = /^(media|thumb|og|preview):([A-Za-z0-9_-]+)$/.exec(value);
      if (m != null) mediaIds.add(m[2]!);
    } else if (Array.isArray(value)) {
      value.forEach(collectMediaRefs);
    } else if (value != null && typeof value === "object") {
      Object.values(value).forEach(collectMediaRefs);
    }
  };
  for (const s of sceneRows) {
    if (s.mediaId != null) mediaIds.add(s.mediaId);
    collectMediaRefs(parseJson(s.sourceJson, {}));
    collectMediaRefs(parseJson(s.audioJson, {}));
    collectMediaRefs(parseJson(s.metaJson, {}));
  }
  for (const h of hotspotRows) {
    collectMediaRefs(parseJson(h.contentJson, {}));
    collectMediaRefs(parseJson(h.styleJson, {}));
  }
  collectMediaRefs(settings);

  const mediaRows =
    mediaIds.size > 0
      ? await db.select().from(mediaTable).where(inArray(mediaTable.id, [...mediaIds]))
      : [];
  const derivativeRows =
    mediaIds.size > 0
      ? await db.select().from(mediaDerivatives).where(inArray(mediaDerivatives.mediaId, [...mediaIds]))
      : [];
  const mediaMap = new Map<string, MediaInfo>();
  for (const row of mediaRows) {
    mediaMap.set(row.id, { row, derivatives: derivativeRows.filter((d) => d.mediaId === row.id) });
  }

  const assets: Record<string, string> = {};
  const prefixes: Record<string, string> = {};

  const filenameExt = (name: string): string => {
    const ext = name.split(".").pop();
    return ext != null && ext.length <= 5 ? `.${ext.toLowerCase()}` : "";
  };

  /** Resuelve una referencia media:/thumb:/og:/preview: a ruta relativa. */
  const resolveRef = (ref: string): string => {
    const m = /^(media|thumb|og|preview):([A-Za-z0-9_-]+)$/.exec(ref);
    if (m == null) return ref;
    const kind = m[1]!;
    const id = m[2]!;
    const info = mediaMap.get(id);
    if (info == null) return ref;
    if (kind === "media") {
      const rel = `a/media/${id}${filenameExt(info.row.filename)}`;
      assets[rel] = info.row.r2Key;
      return rel;
    }
    const derivativeKind = kind === "thumb" ? "thumb" : kind === "og" ? "og" : "preview";
    const der = info.derivatives.find((d) => d.kind === derivativeKind);
    if (der == null) return ref;
    const rel = `a/${derivativeKind}/${id}.jpg`;
    assets[rel] = der.r2Prefix;
    return rel;
  };

  const deepResolve = <T>(value: T): T => {
    if (typeof value === "string") return resolveRef(value) as unknown as T;
    if (Array.isArray(value)) return value.map(deepResolve) as unknown as T;
    if (value != null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepResolve(v);
      return out as unknown as T;
    }
    return value;
  };

  // Traducciones agrupadas por entidad
  const trByEntity = new Map<string, { lang: string; field: string; value: string }[]>();
  for (const tr of translationRows) {
    const key = `${tr.entity}:${tr.entityId}`;
    const arr = trByEntity.get(key) ?? [];
    arr.push({ lang: tr.lang, field: tr.field, value: tr.value });
    trByEntity.set(key, arr);
  }

  const defaultLang = (settings.defaultLang as string) ?? "es";
  const langs = (settings.langs as string[]) ?? [defaultLang];

  /** Convierte un valor base + traducciones de un campo en L10n. */
  const l10n = (base: string | undefined, entity: string, entityId: string, field: string): unknown => {
    const trs = (trByEntity.get(`${entity}:${entityId}`) ?? []).filter((t) => t.field === field);
    if (trs.length === 0) return base;
    const map: Record<string, string> = {};
    if (base != null && base !== "") map[defaultLang] = base;
    for (const t of trs) map[t.lang] = t.value;
    return map;
  };

  /** Aplica traducciones con rutas anidadas ("items.0.title") a un objeto. */
  const applyNestedTranslations = (obj: Record<string, unknown>, entity: string, entityId: string): void => {
    const trs = trByEntity.get(`${entity}:${entityId}`) ?? [];
    for (const t of trs) {
      const path = t.field.split(".");
      let target: Record<string, unknown> | unknown[] = obj;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i]!;
        const next = Array.isArray(target) ? (target as unknown[])[parseInt(seg, 10)] : (target as Record<string, unknown>)[seg];
        if (next == null || typeof next !== "object") {
          target = null as never;
          break;
        }
        target = next as Record<string, unknown>;
      }
      if (target == null) continue;
      const last = path[path.length - 1]!;
      const container = target as Record<string, unknown>;
      const idx = Array.isArray(target) ? parseInt(last, 10) : last;
      const current = Array.isArray(target) ? (target as unknown[])[idx as number] : container[last];
      if (typeof current === "string") {
        const map: Record<string, string> = { [defaultLang]: current, [t.lang]: t.value };
        if (Array.isArray(target)) (target as unknown[])[idx as number] = map;
        else container[last] = map;
      } else if (current != null && typeof current === "object" && !Array.isArray(current)) {
        (current as Record<string, string>)[t.lang] = t.value;
      } else if (current == null) {
        if (!Array.isArray(target)) container[last] = { [t.lang]: t.value };
      }
    }
  };

  // Escenas
  /**
   * Áreas del tour: planta, zona y categoría son la misma cosa. Las que
   * tienen plano se publican como `floorplans`, que es lo que ya lee el visor.
   * Los tours anteriores a las áreas conservan su lista de planos suelta.
   */
  interface AreaRow {
    id: string;
    title: string;
    level?: number;
    plan?: { url?: string };
  }
  const areaList: AreaRow[] = Array.isArray(settings.areas)
    ? (settings.areas as Record<string, unknown>[])
        .filter((a) => a != null && typeof a.id === "string")
        .map((a) => ({
          id: a.id as string,
          title: typeof a.title === "string" ? a.title : "",
          level: typeof a.level === "number" && Number.isFinite(a.level) ? a.level : undefined,
          plan: a.plan != null && typeof a.plan === "object" ? (a.plan as { url?: string }) : undefined,
        }))
    : [];

  const compileFloorplans = (): Tour["floorplans"] => {
    if (areaList.length > 0) {
      const list = areaList
        .filter((a) => typeof a.plan?.url === "string" && a.plan.url !== "")
        .map((a) => ({
          id: a.id,
          title: l10n(a.title, "area", a.id, "title") as never,
          url: resolveRef(a.plan!.url!),
          ...(a.level != null ? { level: a.level } : {}),
        }));
      return list.length > 0 ? list : undefined;
    }
    return deepResolve(settings.floorplans as Tour["floorplans"]) ?? undefined;
  };

  const compiledScenes: Scene[] = [];
  for (const row of sceneRows) {
    const meta = parseJson<Record<string, unknown>>(row.metaJson, {});
    const sourceOverride = parseJson<Record<string, unknown> | null>(row.sourceJson, null);
    let source: SceneSource | null = null;

    if (sourceOverride != null && typeof sourceOverride.kind === "string") {
      source = deepResolve(sourceOverride) as unknown as SceneSource;
    } else if (row.mediaId != null) {
      const info = mediaMap.get(row.mediaId);
      if (info != null) {
        source = buildSourceFromMedia(info, row.type, assets, prefixes, sourceOverride ?? {});
      }
    }
    if (source == null) {
      // Escena sin medios: se omite en la compilacion pero se avisa
      continue;
    }

    const hs = hotspotRows.filter((h) => h.sceneId === row.id);
    const compiledHotspots: Hotspot[] = hs.map((h) => {
      const content = deepResolve(parseJson<Record<string, unknown>>(h.contentJson, {}));
      applyNestedTranslations(content, "hotspot", h.id);
      // `unplaced` marca en el editor los pasos creados desde el grafo que
      // aún no se han arrastrado al panorama: no pinta nada en el tour.
      delete (content as Record<string, unknown>).unplaced;
      const position = parseJson<Record<string, unknown>>(h.positionJson, {});
      return {
        id: h.id,
        type: h.type,
        yaw: (position.yaw as number) ?? 0,
        pitch: (position.pitch as number) ?? 0,
        ...(position.points != null ? { points: position.points } : {}),
        ...(h.styleJson != null ? { style: deepResolve(parseJson(h.styleJson, {})) } : {}),
        ...(h.conditionsJson != null ? { conditions: parseJson(h.conditionsJson, {}) } : {}),
        ...content,
      } as unknown as Hotspot;
    });

    // El área da la categoría del menú de escenas; si la escena no tiene
    // área, se conserva la categoría suelta de los tours antiguos.
    const areaId = typeof meta.area === "string" ? meta.area : null;
    const area = areaId != null ? areaList.find((a) => a.id === areaId) : undefined;
    const category =
      area != null
        ? l10n(area.title, "area", area.id, "title")
        : l10n(meta.category as string | undefined, "scene", row.id, "category");

    const thumbnailRef = meta.thumbnail as string | undefined;
    const scene: Scene = {
      id: row.id,
      type: row.type as Scene["type"],
      title: l10n(row.title, "scene", row.id, "title") as Scene["title"],
      description: l10n(meta.description as string | undefined, "scene", row.id, "description") as Scene["description"],
      altText: l10n(meta.altText as string | undefined, "scene", row.id, "altText") as Scene["altText"],
      category: category as Scene["category"],
      source,
      thumbnail: thumbnailRef != null ? resolveRef(thumbnailRef) : undefined,
      initialView: parseJson(row.initialViewJson, undefined as never) ?? undefined,
      limits: parseJson(row.limitsJson, undefined as never) ?? undefined,
      audio: deepResolve(parseJson(row.audioJson, undefined as never) ?? undefined),
      map: parseJson(row.mapJson, undefined as never) ?? undefined,
      hidden: meta.hidden === true ? true : undefined,
      autorotate: (meta.autorotate as Scene["autorotate"]) ?? undefined,
      hotspots: compiledHotspots,
    };
    compiledScenes.push(scene);
  }


  const startScene = (settings.startScene as string) ?? compiledScenes[0]?.id ?? "";

  const tour: Tour = {
    $schema: TOUR_SCHEMA_URL,
    version: TOUR_SCHEMA_VERSION,
    meta: {
      title: l10n(project.title, "tour", "meta", "title") as Tour["meta"]["title"],
      description: l10n(settings.description as string | undefined, "tour", "meta", "description") as never,
      author: settings.author as string | undefined,
      defaultLang,
      langs,
      ogImage: settings.ogImage != null ? resolveRef(settings.ogImage as string) : undefined,
    },
    start: {
      scene: startScene,
      view: (settings.startView as Tour["start"]["view"]) ?? undefined,
      intro: (settings.intro as Tour["start"]["intro"]) ?? "none",
    },
    scenes: compiledScenes,
    floorplans: compileFloorplans(),
    geoMap: (settings.geoMap as Tour["geoMap"]) ?? undefined,
    ui: deepResolve(settings.ui as Tour["ui"]) ?? undefined,
    controls: (settings.controls as Tour["controls"]) ?? undefined,
    vr: (settings.vr as Tour["vr"]) ?? undefined,
    social: deepResolve(settings.social as Tour["social"]) ?? undefined,
    transition: (settings.transition as Tour["transition"]) ?? undefined,
    autorotate: (settings.autorotate as Tour["autorotate"]) ?? undefined,
    // Las rutas sin paradas son borradores a medias: viven en el editor pero
    // no tienen nada que reproducir en el tour publicado
    autopilot: filtrarAutopilot(settings.autopilot as Tour["autopilot"]),
    variables: (settings.variables as Tour["variables"]) ?? undefined,
    quiz: (settings.quiz as Tour["quiz"]) ?? undefined,
    treasureHunt: (settings.treasureHunt as Tour["treasureHunt"]) ?? undefined,
    globalAudio: deepResolve(settings.globalAudio as Tour["globalAudio"]) ?? undefined,
    analytics: (settings.analytics as Tour["analytics"]) ?? undefined,
  };

  const validation = validateTour(tour);
  return { tour, assets, prefixes, issues: validation.issues };
}

/** Deja fuera del tour publicado las rutas de autopilot sin paradas. */
function filtrarAutopilot(routes: Tour["autopilot"]): Tour["autopilot"] {
  if (routes == null) return undefined;
  const conParadas = routes.filter((r) => Array.isArray(r.steps) && r.steps.length > 0);
  return conParadas.length > 0 ? conParadas : undefined;
}

function buildSourceFromMedia(
  info: MediaInfo,
  sceneType: string,
  assets: Record<string, string>,
  prefixes: Record<string, string>,
  overrides: Record<string, unknown>,
): SceneSource | null {
  const { row, derivatives } = info;
  const tiles = derivatives.find((d) => d.kind === "tiles");
  const flatTiles = derivatives.find((d) => d.kind === "flat_tiles");

  if (sceneType === "video" || row.kind === "video") {
    const rel = `a/media/${row.id}.mp4`;
    assets[rel] = row.r2Key;
    const source: SceneSource = {
      kind: "video",
      renditions: [{ url: rel, type: row.mime, height: row.height ?? undefined }],
      streamUid: row.streamUid ?? undefined,
      ...(overrides as object),
    } as SceneSource;
    return source;
  }

  if (sceneType === "flat") {
    if (flatTiles != null) {
      const manifest = parseJson<{ levels: number; tileSize: number; width: number; height: number; extension: string }>(
        flatTiles.manifestJson,
        { levels: 1, tileSize: 512, width: row.width ?? 1024, height: row.height ?? 1024, extension: "webp" },
      );
      const rel = `a/ftiles/${row.id}`;
      prefixes[`${rel}/`] = `${flatTiles.r2Prefix.replace(/\/$/, "")}/`;
      return {
        kind: "flat",
        width: manifest.width,
        height: manifest.height,
        tiles: { levels: manifest.levels, tileSize: manifest.tileSize, base: rel, extension: manifest.extension },
      };
    }
    const rel = `a/media/${row.id}`;
    assets[rel] = row.r2Key;
    return { kind: "flat", width: row.width ?? 2048, height: row.height ?? 2048, url: rel };
  }

  if (tiles != null) {
    const manifest = parseJson<{ levels: number; tileSize: number; faceSize: number; extension: string; preview?: string }>(
      tiles.manifestJson,
      { levels: 1, tileSize: 512, faceSize: 512, extension: "webp" },
    );
    const rel = `a/tiles/${row.id}`;
    prefixes[`${rel}/`] = `${tiles.r2Prefix.replace(/\/$/, "")}/`;
    return {
      kind: "multires",
      levels: manifest.levels,
      tileSize: manifest.tileSize,
      faceSize: manifest.faceSize,
      base: rel,
      extension: manifest.extension,
      preview: manifest.preview,
    };
  }

  // Panorama sin procesar: servir el original como equirect
  const rel = `a/media/${row.id}`;
  assets[rel] = row.r2Key;
  return { kind: "equirect", url: rel, ...(overrides as object) } as SceneSource;
}
