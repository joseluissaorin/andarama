/**
 * Códigos de inserción (el HTML que dan Sketchfab, Genially, Google Maps,
 * H5P, Thinglink…).
 *
 * Casi todos son un único `<iframe>`: en ese caso se usa su `src` directamente,
 * que funciona en cualquier sitio y sin trucos. Si el código trae más marcado
 * (scripts, varios elementos), se sirve como documento aparte dentro de un
 * sandbox: `embed/{id}.html`, que escribe el exportador y sirve la API.
 *
 * Se analiza con expresiones regulares y no con el DOM para que valga igual
 * en el navegador, en el exportador y en el servidor.
 */

export interface EmbedSource {
  src: string;
  allow?: string;
  allowFullscreen: boolean;
  /** Proporción declarada en el propio iframe (ancho/alto), si la hay. */
  aspect?: number;
}

const WRAPPERS = /<\/?(?:div|p|span)\b[^>]*>/gi;
const IFRAME = /<iframe\b([^>]*)>\s*<\/iframe>|<iframe\b([^>]*)\/?>/i;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  if (m == null) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, "i").test(attrs);
}

/** Si el código es un solo iframe (más espacios o un envoltorio), su fuente. */
export function embedSource(html: string): EmbedSource | null {
  const trimmed = html.trim();
  if (trimmed === "" || /<script\b/i.test(trimmed)) return null;
  const stripped = trimmed.replace(WRAPPERS, "").trim();
  const m = IFRAME.exec(stripped);
  if (m == null) return null;
  // Nada más que ese iframe
  if (stripped.replace(IFRAME, "").trim() !== "") return null;
  const attrs = m[1] ?? m[2] ?? "";
  const src = attr(attrs, "src") ?? "";
  if (!/^https?:\/\//i.test(src)) return null;
  const w = Number(attr(attrs, "width"));
  const h = Number(attr(attrs, "height"));
  const aspect = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : undefined;
  const allow = attr(attrs, "allow") ?? undefined;
  return {
    src,
    allow,
    allowFullscreen: hasAttr(attrs, "allowfullscreen") || /fullscreen/i.test(allow ?? ""),
    ...(aspect != null ? { aspect } : {}),
  };
}

/** Ruta relativa del documento aparte de un código de inserción. */
export function embedFileName(hotspotId: string): string {
  return `embed/${hotspotId}.html`;
}
