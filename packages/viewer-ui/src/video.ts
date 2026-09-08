/**
 * Referencias de vídeo de YouTube y Vimeo.
 *
 * Nadie sabe «el ID» de un vídeo: se sabe su dirección, que es lo que se copia
 * de la barra del navegador o del botón de compartir. Aquí se acepta cualquier
 * forma habitual (youtu.be, watch?v=, shorts, embed, live, vimeo.com/123…) y
 * se saca el identificador que pide el reproductor. Un ID pelado se devuelve
 * tal cual.
 */

export interface VideoRef {
  id: string;
  /** Segundo de inicio si venía en la dirección (`t=90`, `t=1m30s`, `start=90`). */
  start?: number;
}

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;

function parseTime(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  // 1h2m3s
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw);
  if (m == null) return undefined;
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : undefined;
}

export function parseVideoRef(provider: "youtube" | "vimeo" | "peertube", raw: string): VideoRef | null {
  const value = raw.trim();
  if (value === "") return null;
  if (provider === "peertube") return { id: value };
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    url = null;
  }
  const looksLikeUrl = url != null && /\./.test(url.hostname) && (value.includes("/") || value.includes("."));
  if (!looksLikeUrl || url == null) {
    // ID pelado
    if (provider === "youtube") return YT_ID.test(value) ? { id: value } : null;
    return /^\d{5,12}$/.test(value) ? { id: value } : null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (provider === "youtube") {
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
    else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      const v = url.searchParams.get("v");
      const m = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]+)/.exec(url.pathname);
      id = v ?? m?.[1] ?? null;
    }
    if (id == null || !YT_ID.test(id)) return null;
    const start = parseTime(url.searchParams.get("t") ?? url.searchParams.get("start"));
    return start != null ? { id, start } : { id };
  }
  // vimeo.com/123456, vimeo.com/channels/x/123456, player.vimeo.com/video/123456
  if (/(^|\.)vimeo\.com$/.test(host)) {
    const m = /\/(\d{5,12})(?:[/?#]|$)/.exec(url.pathname);
    if (m != null) return { id: m[1]! };
  }
  return null;
}
