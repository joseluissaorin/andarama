import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { projects, translations as translationsTable } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { newId, parseJson } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { projectAccess } from "../lib/authz.js";

/**
 * Traducciones granulares (§3.4): la vista lado a lado del Studio lee y
 * escribe entradas (entity, entityId, field, lang, value); export/import
 * XLIFF 1.2 y CSV para traduccion externa.
 */

export function translationRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/:projectId/translations/:lang", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const lang = c.req.param("lang");
    const rows = await db
      .select()
      .from(translationsTable)
      .where(and(eq(translationsTable.projectId, access.project.id), eq(translationsTable.lang, lang)));
    return c.json(rows.map((t) => ({ entity: t.entity, entityId: t.entityId, field: t.field, value: t.value })));
  });

  r.put("/:projectId/translations/:lang", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:write");
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden();
    const lang = c.req.param("lang");
    const entries = z
      .array(
        z.object({
          entity: z.enum(["tour", "scene", "hotspot", "area"]),
          entityId: z.string(),
          field: z.string().max(200),
          value: z.string().max(20000),
        }),
      )
      .parse(await c.req.json());
    for (const entry of entries) {
      const existing = (await db
        .select()
        .from(translationsTable)
        .where(
          and(
            eq(translationsTable.projectId, access.project.id),
            eq(translationsTable.lang, lang),
            eq(translationsTable.entity, entry.entity),
            eq(translationsTable.entityId, entry.entityId),
            eq(translationsTable.field, entry.field),
          ),
        )
        .limit(1))[0];
      if (entry.value === "") {
        if (existing != null) await db.delete(translationsTable).where(eq(translationsTable.id, existing.id));
        continue;
      }
      if (existing != null) {
        await db.update(translationsTable).set({ value: entry.value }).where(eq(translationsTable.id, existing.id));
      } else {
        await db.insert(translationsTable).values({
          id: newId(),
          projectId: access.project.id,
          lang,
          entity: entry.entity,
          entityId: entry.entityId,
          field: entry.field,
          value: entry.value,
        });
      }
    }
    // Registrar el idioma en settings si es nuevo
    const settings = parseJson<Record<string, unknown>>(access.project.settingsJson, {});
    const langs = (settings.langs as string[]) ?? [];
    if (!langs.includes(lang)) {
      settings.langs = [...langs, lang];
      await db.update(projects).set({ settingsJson: JSON.stringify(settings) }).where(eq(projects.id, access.project.id));
    }
    return c.json({ ok: true });
  });

  // Export XLIFF 1.2
  r.get("/:projectId/translations/:lang/xliff", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const lang = c.req.param("lang");
    const settings = parseJson<Record<string, unknown>>(access.project.settingsJson, {});
    const sourceLang = (settings.defaultLang as string) ?? "es";
    const sources = await collectSourceStrings(db, access.project.id);
    const existing = await db
      .select()
      .from(translationsTable)
      .where(and(eq(translationsTable.projectId, access.project.id), eq(translationsTable.lang, lang)));
    const trMap = new Map(existing.map((t) => [`${t.entity}:${t.entityId}:${t.field}`, t.value]));
    const units = sources
      .map((s) => {
        const id = `${s.entity}:${s.entityId}:${s.field}`;
        const target = trMap.get(id) ?? "";
        return `    <trans-unit id="${escapeXml(id)}">
      <source>${escapeXml(s.value)}</source>
      <target${target === "" ? ' state="needs-translation"' : ""}>${escapeXml(target)}</target>
    </trans-unit>`;
      })
      .join("\n");
    const xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${escapeXml(access.project.slug)}" source-language="${sourceLang}" target-language="${lang}" datatype="plaintext">
    <body>
${units}
    </body>
  </file>
</xliff>`;
    return new Response(xliff, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${access.project.slug}-${lang}.xliff"`,
      },
    });
  });

  // Import XLIFF
  r.post("/:projectId/translations/:lang/xliff", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden();
    const lang = c.req.param("lang");
    const xml = await c.req.text();
    const entries: { entity: string; entityId: string; field: string; value: string }[] = [];
    const re = /<trans-unit id="([^"]+)">[\s\S]*?<target[^>]*>([\s\S]*?)<\/target>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) != null) {
      const id = unescapeXml(m[1]!);
      const value = unescapeXml(m[2]!).trim();
      const [entity, entityId, ...fieldParts] = id.split(":");
      if (entity == null || entityId == null || fieldParts.length === 0 || value === "") continue;
      if (!["tour", "scene", "hotspot", "area"].includes(entity)) continue;
      entries.push({ entity, entityId, field: fieldParts.join(":"), value });
    }
    if (entries.length === 0) throw badRequest("El XLIFF no contiene traducciones");
    await upsertMany(db, access.project.id, lang, entries);
    return c.json({ imported: entries.length });
  });

  // Export CSV
  r.get("/:projectId/translations/:lang/csv", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const lang = c.req.param("lang");
    const sources = await collectSourceStrings(db, access.project.id);
    const existing = await db
      .select()
      .from(translationsTable)
      .where(and(eq(translationsTable.projectId, access.project.id), eq(translationsTable.lang, lang)));
    const trMap = new Map(existing.map((t) => [`${t.entity}:${t.entityId}:${t.field}`, t.value]));
    const rows = [["id", "origen", "traduccion"]];
    for (const s of sources) {
      const id = `${s.entity}:${s.entityId}:${s.field}`;
      rows.push([id, s.value, trMap.get(id) ?? ""]);
    }
    const csv = rows.map((r2) => r2.map(csvCell).join(",")).join("\r\n");
    return new Response("﻿" + csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${access.project.slug}-${lang}.csv"`,
      },
    });
  });

  // Import CSV
  r.post("/:projectId/translations/:lang/csv", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden();
    const lang = c.req.param("lang");
    const text = (await c.req.text()).replace(/^﻿/, "");
    const lines = parseCsv(text);
    const entries: { entity: string; entityId: string; field: string; value: string }[] = [];
    for (const line of lines.slice(1)) {
      const [id, , value] = line;
      if (id == null || value == null || value.trim() === "") continue;
      const [entity, entityId, ...fieldParts] = id.split(":");
      if (entity == null || entityId == null || fieldParts.length === 0) continue;
      if (!["tour", "scene", "hotspot", "area"].includes(entity)) continue;
      entries.push({ entity, entityId, field: fieldParts.join(":"), value: value.trim() });
    }
    if (entries.length === 0) throw badRequest("El CSV no contiene traducciones");
    await upsertMany(db, access.project.id, lang, entries);
    return c.json({ imported: entries.length });
  });

  return r;
}

/** Cadenas de origen (idioma por defecto) del proyecto, para la vista de traduccion. */
export async function collectSourceStrings(
  db: import("../lib/context.js").Db,
  projectId: string,
): Promise<{ entity: string; entityId: string; field: string; value: string }[]> {
  const { scenes: scenesTable, hotspots: hotspotsTable } = await import("@andarama/db");
  const { asc, inArray } = await import("drizzle-orm");
  const out: { entity: string; entityId: string; field: string; value: string }[] = [];
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
  if (project == null) return out;
  out.push({ entity: "tour", entityId: "meta", field: "title", value: project.title });
  const settings = parseJson<Record<string, unknown>>(project.settingsJson, {});
  if (typeof settings.description === "string" && settings.description !== "") {
    out.push({ entity: "tour", entityId: "meta", field: "description", value: settings.description });
  }
  // Los nombres de las áreas titulan las plantas del minimapa y los grupos del
  // menú de escenas: sin traducirlos, un tour bilingüe enseña «Planta baja» a
  // todo el mundo.
  if (Array.isArray(settings.areas)) {
    for (const area of settings.areas as Record<string, unknown>[]) {
      if (typeof area?.id !== "string" || typeof area.title !== "string" || area.title.trim() === "") continue;
      out.push({ entity: "area", entityId: area.id, field: "title", value: area.title });
    }
  }
  const sceneRows = await db.select().from(scenesTable).where(eq(scenesTable.projectId, projectId)).orderBy(asc(scenesTable.sort));
  for (const s of sceneRows) {
    out.push({ entity: "scene", entityId: s.id, field: "title", value: s.title });
    const meta = parseJson<Record<string, unknown>>(s.metaJson, {});
    for (const field of ["description", "altText", "category"]) {
      if (typeof meta[field] === "string" && meta[field] !== "") {
        out.push({ entity: "scene", entityId: s.id, field, value: meta[field] as string });
      }
    }
  }
  const sceneIds = sceneRows.map((s) => s.id);
  if (sceneIds.length > 0) {
    const hs = await db.select().from(hotspotsTable).where(inArray(hotspotsTable.sceneId, sceneIds));
    const L10N_FIELDS = new Set([
      "label", "altText", "tooltip", "body", "title", "caption", "text", "question",
      "feedbackCorrect", "feedbackWrong", "successMessage", "submitLabel", "transcript",
    ]);
    for (const h of hs) {
      const content = parseJson<Record<string, unknown>>(h.contentJson, {});
      const walk = (obj: unknown, path: string): void => {
        if (obj == null) return;
        if (Array.isArray(obj)) {
          obj.forEach((v, i) => walk(v, path === "" ? String(i) : `${path}.${i}`));
          return;
        }
        if (typeof obj === "object") {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            const p = path === "" ? k : `${path}.${k}`;
            if (typeof v === "string" && v !== "" && (L10N_FIELDS.has(k) || /\.(title|description|label|text)$/.test(p))) {
              out.push({ entity: "hotspot", entityId: h.id, field: p, value: v });
            } else if (typeof v === "object") {
              walk(v, p);
            }
          }
        }
      };
      walk(content, "");
    }
  }
  return out;
}

async function upsertMany(
  db: import("../lib/context.js").Db,
  projectId: string,
  lang: string,
  entries: { entity: string; entityId: string; field: string; value: string }[],
): Promise<void> {
  for (const entry of entries) {
    const existing = (await db
      .select()
      .from(translationsTable)
      .where(
        and(
          eq(translationsTable.projectId, projectId),
          eq(translationsTable.lang, lang),
          eq(translationsTable.entity, entry.entity),
          eq(translationsTable.entityId, entry.entityId),
          eq(translationsTable.field, entry.field),
        ),
      )
      .limit(1))[0];
    if (existing != null) {
      await db.update(translationsTable).set({ value: entry.value }).where(eq(translationsTable.id, existing.id));
    } else {
      await db.insert(translationsTable).values({
        id: newId(),
        projectId,
        lang,
        entity: entry.entity,
        entityId: entry.entityId,
        field: entry.field,
        value: entry.value,
      });
    }
  }
}

function escapeXml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function unescapeXml(s: string): string {
  return s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}
