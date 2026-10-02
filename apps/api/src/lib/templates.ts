import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  hotspots as hotspotsTable,
  projects,
  scenes as scenesTable,
  translations as translationsTable,
} from "@andarama/db";
import type { AppConfig, Db } from "./context.js";
import { newId, nowMs, parseJson, slugify } from "./util.js";

/**
 * Plantillas del operador y tour de ejemplo.
 *
 * El operador de la instancia guarda en una organización propia («Plantillas»)
 * unos cuantos recorridos terminados. Dos variables de entorno dicen cuáles:
 *
 * - `SAMPLE_PROJECT_ID`: el recorrido que se clona a cada cuenta nueva para
 *   que el primer minuto no sea una pantalla vacía. Queda marcado como
 *   ejemplo (`is_sample`) y no cuenta en la cuota.
 * - `TEMPLATE_PROJECTS`: la lista de plantillas por sector que se ofrecen en
 *   «Nuevo proyecto», como `sector:id` separados por comas
 *   (`escape_room:abc,quiz:pqr,tesoro:stu,prl:def,museo:ghi,campus:jkl,inmobiliaria:mno`;
 *   escape_room, quiz y tesoro salen juntos bajo «Educación»). Un id
 *   sin sector también vale; entonces se muestra con su título.
 *
 * En los dos casos los medios **no se copian**: las escenas clonadas siguen
 * apuntando a los medios de la organización Plantillas, que el compilador
 * resuelve por id. Por eso quien tiene un clon puede leer (nunca escribir)
 * los medios de esa organización. Si la variable falta o el proyecto no
 * existe, no pasa nada: ni ejemplo ni sección de plantillas.
 */

export interface TemplatesConfig {
  sampleProjectId?: string;
  projects: { key: string; id: string }[];
}

/** Sectores con nombre propio en el Studio; cualquier otro se muestra con el título del proyecto. */
export const TEMPLATE_SECTORS = ["escape_room", "quiz", "tesoro", "prl", "museo", "campus", "inmobiliaria"] as const;

/** Lee las dos variables de entorno; sin ninguna de las dos, undefined. */
export function parseTemplatesConfig(sample: string | undefined, list: string | undefined): TemplatesConfig | undefined {
  const sampleProjectId = sample?.trim() || undefined;
  const items = (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const i = s.indexOf(":");
      return i > 0 ? { key: s.slice(0, i).trim(), id: s.slice(i + 1).trim() } : { key: "", id: s };
    })
    .filter((p) => p.id !== "");
  if (sampleProjectId == null && items.length === 0) return undefined;
  return { sampleProjectId, projects: items };
}

function configuredIds(config: AppConfig): string[] {
  const t = config.templates;
  if (t == null) return [];
  return [...(t.sampleProjectId != null ? [t.sampleProjectId] : []), ...t.projects.map((p) => p.id)];
}

/** ¿Es este proyecto una plantilla del operador (o el ejemplo)? Se puede clonar desde cualquier organización. */
export function isOperatorTemplate(config: AppConfig, projectId: string): boolean {
  return configuredIds(config).includes(projectId);
}

/** Organizaciones de las que salen las plantillas: sus medios son de lectura para todos. */
export async function templateOrgIds(db: Db, config: AppConfig): Promise<Set<string>> {
  const ids = configuredIds(config);
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(and(inArray(projects.id, ids), isNull(projects.deletedAt)));
  return new Set(rows.map((r) => r.orgId));
}

export interface SectorTemplate {
  id: string;
  /** Sector (clave de i18n en el Studio) o "" si no tiene. */
  key: string;
  title: string;
  /** Medio de la escena inicial, para la portada. */
  coverMediaId: string | null;
}

/** Las plantillas por sector que existen de verdad, en el orden de la variable. */
export async function listSectorTemplates(db: Db, config: AppConfig): Promise<SectorTemplate[]> {
  const list = config.templates?.projects ?? [];
  if (list.length === 0) return [];
  const rows = await db
    .select()
    .from(projects)
    .where(and(inArray(projects.id, list.map((p) => p.id)), isNull(projects.deletedAt)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sceneRows = rows.length > 0
    ? await db.select().from(scenesTable).where(inArray(scenesTable.projectId, rows.map((r) => r.id))).orderBy(asc(scenesTable.sort))
    : [];
  const out: SectorTemplate[] = [];
  for (const { key, id } of list) {
    const p = byId.get(id);
    if (p == null) continue;
    const start = parseJson<{ startScene?: string }>(p.settingsJson, {}).startScene;
    const own = sceneRows.filter((s) => s.projectId === id);
    const scene = own.find((s) => s.id === start) ?? own[0];
    out.push({ id, key, title: p.title, coverMediaId: scene?.mediaId ?? null });
  }
  return out;
}

/**
 * Copia escenas, hotspots y traducciones de un proyecto a otro. Los medios no
 * se copian: las escenas y los hotspots siguen apuntando a los mismos ids.
 */
export async function cloneProjectContent(db: Db, fromId: string, toId: string): Promise<void> {
  const sceneRows = await db.select().from(scenesTable).where(eq(scenesTable.projectId, fromId));
  const idMap = new Map<string, string>();
  for (const s of sceneRows) idMap.set(s.id, newId());
  for (const s of sceneRows) {
    await db.insert(scenesTable).values({ ...s, id: idMap.get(s.id)!, projectId: toId });
  }
  const sceneIds = sceneRows.map((s) => s.id);
  const hsIdMap = new Map<string, string>();
  if (sceneIds.length > 0) {
    const hsRows = await db.select().from(hotspotsTable).where(inArray(hotspotsTable.sceneId, sceneIds));
    for (const h of hsRows) hsIdMap.set(h.id, newId());
    for (const h of hsRows) {
      let content = h.contentJson;
      // Reapuntar targets de navegacion a los nuevos IDs de escena
      for (const [oldId, newSceneId] of idMap) {
        content = content.replaceAll(`"${oldId}"`, `"${newSceneId}"`);
      }
      await db.insert(hotspotsTable).values({ ...h, id: hsIdMap.get(h.id)!, sceneId: idMap.get(h.sceneId)!, contentJson: content });
    }
    const trRows = await db.select().from(translationsTable).where(eq(translationsTable.projectId, fromId));
    for (const t of trRows) {
      const entityId = t.entity === "scene" ? idMap.get(t.entityId) : t.entity === "hotspot" ? hsIdMap.get(t.entityId) : t.entityId;
      if (entityId == null && t.entity !== "tour") continue;
      await db.insert(translationsTable).values({ ...t, id: newId(), projectId: toId, entityId: entityId ?? t.entityId });
    }
  }
  // Reapuntar en los ajustes todo lo que nombra escenas o hotspots: la escena
  // inicial, las paradas de los recorridos automáticos (y sus pausas en
  // hotspots), los tesoros escritos a mano... Sin esto, el recorrido
  // automático de una plantilla apuntaba a escenas de otro proyecto.
  const proj = (await db.select().from(projects).where(eq(projects.id, toId)).limit(1))[0];
  if (proj != null) {
    let settingsJson = proj.settingsJson;
    for (const [oldId, nuevo] of [...idMap, ...hsIdMap]) settingsJson = settingsJson.replaceAll(`"${oldId}"`, `"${nuevo}"`);
    if (settingsJson !== proj.settingsJson) {
      await db.update(projects).set({ settingsJson }).where(eq(projects.id, toId));
    }
  }
}

/**
 * Clona el tour de ejemplo a la organización recién creada. Devuelve el id
 * del clon, o null si no hay ejemplo configurado (o no existe). Nunca lanza:
 * un alta no puede fallar por culpa del ejemplo.
 */
export async function provisionSample(db: Db, config: AppConfig, orgId: string, userId: string): Promise<string | null> {
  const sampleId = config.templates?.sampleProjectId;
  if (sampleId == null) return null;
  try {
    const source = (await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, sampleId), isNull(projects.deletedAt)))
      .limit(1))[0];
    if (source == null) return null;
    const id = newId();
    await db.insert(projects).values({
      id,
      orgId,
      title: source.title,
      slug: `${slugify(source.title) || "ejemplo"}-${newId(6).toLowerCase()}`,
      tagsJson: source.tagsJson,
      settingsJson: source.settingsJson,
      isSample: true,
      createdBy: userId,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    await cloneProjectContent(db, source.id, id);
    return id;
  } catch (err) {
    console.warn("[ejemplo] no se pudo clonar el tour de ejemplo:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
