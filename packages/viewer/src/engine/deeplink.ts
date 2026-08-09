import type { ViewParams } from "@ull360/schema";

/**
 * Deep links: la URL refleja escena y orientacion
 * (#s=aulario&y=120&p=-5&f=70, angulos en grados para legibilidad)
 * y ?lang=en para el idioma. Cargar una URL restaura exactamente esa vista.
 */

export interface DeepLinkState {
  sceneId: string | null;
  view: Partial<ViewParams> | null;
  lang: string | null;
}

const RAD = Math.PI / 180;

export function parseDeepLink(href: string): DeepLinkState {
  let sceneId: string | null = null;
  let view: Partial<ViewParams> | null = null;
  let lang: string | null = null;
  try {
    const url = new URL(href);
    lang = url.searchParams.get("lang");
    const hash = url.hash.replace(/^#/, "");
    if (hash !== "") {
      const params = new URLSearchParams(hash);
      sceneId = params.get("s");
      const y = params.get("y");
      const p = params.get("p");
      const f = params.get("f");
      if (y != null || p != null || f != null) {
        view = {};
        if (y != null) view.yaw = parseFloat(y) * RAD;
        if (p != null) view.pitch = parseFloat(p) * RAD;
        if (f != null) view.fov = parseFloat(f) * RAD;
      }
    }
  } catch {
    // href invalido: sin estado
  }
  return { sceneId, view, lang };
}

export function buildDeepLink(
  base: string,
  sceneId: string,
  view: ViewParams,
  lang: string | null,
): string {
  const url = new URL(base);
  if (lang != null) url.searchParams.set("lang", lang);
  const params = new URLSearchParams();
  params.set("s", sceneId);
  params.set("y", (view.yaw / RAD).toFixed(1));
  params.set("p", (view.pitch / RAD).toFixed(1));
  params.set("f", (view.fov / RAD).toFixed(1));
  url.hash = params.toString();
  return url.toString();
}

/** Actualiza el hash sin crear entradas de historial. */
export function replaceHash(sceneId: string, view: ViewParams): void {
  const params = new URLSearchParams();
  params.set("s", sceneId);
  params.set("y", (view.yaw / RAD).toFixed(1));
  params.set("p", (view.pitch / RAD).toFixed(1));
  params.set("f", (view.fov / RAD).toFixed(1));
  const newUrl = `${location.pathname}${location.search}#${params.toString()}`;
  history.replaceState(history.state, "", newUrl);
}
