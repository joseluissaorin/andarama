import type { Tour } from "@andarama/schema";
import { embedDocuments } from "@andarama/exporter";
import { notFound } from "./errors.js";

/**
 * Documento aparte de un código de inserción (hotspot web con HTML), tanto en
 * el tour publicado como en la vista previa del Studio.
 *
 * Va con la directiva `sandbox` en la propia cabecera: aunque alguien lo abra
 * suelto en una pestaña, nunca corre con el origen del sitio y no puede tocar
 * las cookies ni la API.
 */
export function embedResponse(tour: Tour, file: string, lang: string): Response {
  const doc = embedDocuments(tour, lang).find((d) => d.path === `embed/${file}`);
  if (doc == null) throw notFound();
  return new Response(doc.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation",
      "cache-control": "public, max-age=300",
    },
  });
}
