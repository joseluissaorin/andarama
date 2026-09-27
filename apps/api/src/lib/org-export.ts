import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  comments,
  formSubmissions,
  hotspots,
  media,
  orgMembers,
  orgs,
  projects,
  publications,
  quizResults,
  scenes,
  translations,
  users,
  versions,
} from "@andarama/db";
import { buildZip } from "@andarama/exporter";
import type { Db } from "./context.js";
import { compileProject } from "../compiler.js";
import { quizResultsCsv, submissionsCsv } from "./csv-exports.js";
import { parseJson } from "./util.js";

/**
 * Exportación completa de una organización para su administrador (derecho
 * de portabilidad): un ZIP con los datos de la organización, cada proyecto
 * (borrador en tablas, tour compilado, comentarios), las respuestas de sus
 * formularios y los resultados de sus quiz en CSV, y el inventario de medios.
 *
 * Los ficheros de los medios no van dentro (un ZIP de gigas no cabe en la
 * memoria de un Worker): el inventario trae, para cada uno, la ruta de la API
 * desde la que se descarga el original con la misma sesión.
 */

const enc = new TextEncoder();
const json = (value: unknown): Uint8Array => enc.encode(JSON.stringify(value, null, 2));

/** Nombre de carpeta seguro y único para un proyecto. */
function folderName(slug: string, used: Set<string>): string {
  const base = slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 60) || "proyecto";
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}-${i}`;
  used.add(name);
  return name;
}

export async function buildOrgExport(db: Db, orgId: string, publicUrl: string): Promise<{ zip: Uint8Array; slug: string }> {
  const org = (await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1))[0];
  if (org == null) throw new Error("Organización no encontrada");
  const members = await db
    .select({ userId: orgMembers.userId, role: orgMembers.role, name: users.name, email: users.email, since: orgMembers.createdAt })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId));
  const projectRows = await db.select().from(projects).where(eq(projects.orgId, orgId)).orderBy(asc(projects.createdAt));
  const projectIds = projectRows.map((p) => p.id);
  const pubs = projectIds.length > 0 ? await db.select().from(publications).where(inArray(publications.projectId, projectIds)) : [];
  const mediaRows = await db.select().from(media).where(eq(media.orgId, orgId));

  const files: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  const index: { id: string; title: string; folder: string; status: string; publishedSlug: string | null; submissions: number; quizResults: number }[] = [];

  for (const p of projectRows) {
    const folder = `proyectos/${folderName(p.slug, used)}`;
    const sceneRows = await db.select().from(scenes).where(eq(scenes.projectId, p.id)).orderBy(asc(scenes.sort));
    const sceneIds = sceneRows.map((s) => s.id);
    const hotspotRows = sceneIds.length > 0 ? await db.select().from(hotspots).where(inArray(hotspots.sceneId, sceneIds)) : [];
    const translationRows = await db.select().from(translations).where(eq(translations.projectId, p.id));
    const versionRows = await db.select().from(versions).where(eq(versions.projectId, p.id)).orderBy(asc(versions.number));
    const commentRows = await db.select().from(comments).where(eq(comments.projectId, p.id)).orderBy(asc(comments.createdAt));
    const submissionRows = await db.select().from(formSubmissions).where(eq(formSubmissions.projectId, p.id)).orderBy(desc(formSubmissions.createdAt));
    const quizRows = await db.select().from(quizResults).where(eq(quizResults.projectId, p.id)).orderBy(desc(quizResults.createdAt));
    const pub = pubs.find((x) => x.projectId === p.id) ?? null;

    files.push({
      name: `${folder}/proyecto.json`,
      data: json({
        project: { ...p, settings: parseJson(p.settingsJson, {}), tags: parseJson(p.tagsJson, []) },
        publication: pub != null ? { ...pub, passwordHash: undefined } : null,
        scenes: sceneRows,
        hotspots: hotspotRows,
        translations: translationRows,
        versions: versionRows.map((v) => ({ id: v.id, number: v.number, kind: v.kind, note: v.note, createdAt: v.createdAt })),
      }),
    });
    try {
      const compiled = await compileProject(db, p.id);
      files.push({ name: `${folder}/tour.json`, data: json(compiled.tour) });
    } catch {
      // Un borrador que no compila se exporta igualmente en tablas
    }
    if (commentRows.length > 0) files.push({ name: `${folder}/comentarios.json`, data: json(commentRows) });
    if (submissionRows.length > 0) files.push({ name: `${folder}/formularios.csv`, data: enc.encode(submissionsCsv(submissionRows)) });
    if (quizRows.length > 0) files.push({ name: `${folder}/resultados-quiz.csv`, data: enc.encode(quizResultsCsv(quizRows)) });
    index.push({
      id: p.id,
      title: p.title,
      folder,
      status: p.status,
      publishedSlug: pub?.slug ?? null,
      submissions: submissionRows.length,
      quizResults: quizRows.length,
    });
  }

  const exportedAt = new Date().toISOString();
  files.unshift(
    {
      name: "LEEME.txt",
      data: enc.encode(
        [
          `Exportación de la organización «${org.name}» en Andarama`,
          `Fecha: ${exportedAt}`,
          "",
          "organizacion.json   datos de la organización, sus miembros y el índice de proyectos",
          "medios.json         inventario de medios; cada original se descarga desde la ruta indicada con tu sesión",
          "proyectos/<nombre>/ un directorio por proyecto:",
          "  proyecto.json        el borrador tal como está en la base de datos (escenas, hotspots, traducciones, versiones)",
          "  tour.json            el recorrido compilado, en el formato que lee el visor",
          "  formularios.csv      las respuestas recogidas por los formularios del recorrido",
          "  resultados-quiz.csv  los resultados de los quiz",
          "  comentarios.json     los comentarios del equipo",
          "",
          "Los CSV van en UTF-8 con BOM y se abren directamente en Excel, Numbers o LibreOffice.",
        ].join("\r\n"),
      ),
    },
    {
      name: "organizacion.json",
      data: json({
        format: "andarama-org-export",
        version: 1,
        exportedAt,
        org: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt, settings: parseJson(org.settingsJson, {}) },
        members,
        projects: index,
      }),
    },
    {
      name: "medios.json",
      data: json(
        mediaRows.map((m) => ({
          id: m.id,
          kind: m.kind,
          filename: m.filename,
          mime: m.mime,
          bytes: m.bytes,
          width: m.width,
          height: m.height,
          folder: m.folder,
          projectId: m.projectId,
          sha256: m.sha256,
          createdAt: m.createdAt,
          deletedAt: m.deletedAt,
          download: m.deletedAt == null ? `${publicUrl}/api/v1/media/${m.id}/file` : null,
        })),
      ),
    },
  );
  return { zip: await buildZip(files), slug: org.slug };
}
