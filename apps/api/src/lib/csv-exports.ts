import type { formSubmissions, quizResults } from "@andarama/db";
import { parseJson } from "./util.js";

/**
 * CSV de respuestas de formularios y de resultados de quiz. Los usan la
 * descarga por proyecto y la exportación completa de la organización. Llevan
 * BOM para que Excel reconozca el UTF-8 y saltos de línea CRLF.
 */

export function csvCell(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

const BOM = "﻿";

export function submissionsCsv(rows: (typeof formSubmissions.$inferSelect)[]): string {
  const fieldSet = new Set<string>();
  const parsed = rows.map((row) => {
    const data = parseJson<Record<string, unknown>>(row.dataJson, {});
    for (const key of Object.keys(data)) fieldSet.add(key);
    return { row, data };
  });
  const fields = [...fieldSet];
  const lines = [["fecha", "hotspot", "idioma", ...fields].map(csvCell).join(",")];
  for (const { row, data } of parsed) {
    lines.push(
      [new Date(row.createdAt).toISOString(), row.hotspotId, row.lang ?? "", ...fields.map((f) => String(data[f] ?? ""))]
        .map(csvCell)
        .join(","),
    );
  }
  return BOM + lines.join("\r\n");
}

export function quizResultsCsv(rows: (typeof quizResults.$inferSelect)[]): string {
  const lines = [["fecha", "sesión", "participante", "puntuación", "máximo", "aprobado", "lti"].map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        new Date(row.createdAt).toISOString(),
        row.sessionId,
        row.participantName ?? "",
        String(row.score),
        String(row.maxScore),
        row.passed == null ? "" : row.passed ? "sí" : "no",
        row.ltiLaunchJson != null ? "sí" : "no",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return BOM + lines.join("\r\n");
}
