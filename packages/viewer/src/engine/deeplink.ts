import type { ViewParams } from "@andarama/schema";

/**
 * Deep links: la URL refleja escena y orientacion
 * (#s=aulario&y=120&p=-5&f=70, angulos en grados para legibilidad)
 * y ?lang=en para el idioma.
 *
 * El visor reescribe el hash mientras se mira alrededor, asi que al recargar
 * la pagina la vista del hash pisaba la vista inicial fijada en el editor
 * («Usar vista actual»). Por eso la orientacion solo se aplica si el enlace se
 * compartio a proposito: el boton de compartir anade el marcador `v=1`; el
 * hash vivo no lo lleva y de el solo se toma la escena.
 */

/** Marcador de «vista compartida»: solo lo pone buildDeepLink. */
export const VIEW_MARKER = "v";

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
      // Un "s" vacio no es una escena: se ignora (robustez ante enlaces mal formados)
      sceneId = params.get("s") || null;
      const compartida = params.get(VIEW_MARKER) === "1";
      const y = params.get("y");
      const p = params.get("p");
      const f = params.get("f");
      if (compartida && (y != null || p != null || f != null)) {
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
  params.set(VIEW_MARKER, "1");
  url.hash = params.toString();
  return url.toString();
}

/** Actualiza el hash sin crear entradas de historial (sin el marcador `v=1`). */
export function replaceHash(sceneId: string, view: ViewParams): void {
  const params = new URLSearchParams();
  params.set("s", sceneId);
  params.set("y", (view.yaw / RAD).toFixed(1));
  params.set("p", (view.pitch / RAD).toFixed(1));
  params.set("f", (view.fov / RAD).toFixed(1));
  const newUrl = `${location.pathname}${location.search}#${params.toString()}`;
  history.replaceState(history.state, "", newUrl);
}
