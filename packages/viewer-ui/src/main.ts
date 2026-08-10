import { mountViewer } from "./skin.js";
import type { Tour } from "@ull360/schema";
import { baseFromTourUrl } from "./url.js";

/**
 * Punto de entrada del bundle standalone: paginas de tour publicadas
 * (/t/{slug}) y paquetes exportados. Lee la configuracion de
 * window.ULL360_CONFIG o de atributos data-* del contenedor #ull360.
 */

interface StandaloneConfig {
  tourUrl?: string;
  tour?: Tour;
  baseUrl?: string;
  analyticsEndpoint?: string | null;
  formEndpoint?: string | null;
  turnstileSiteKey?: string | null;
  kiosk?: boolean;
  liveUrl?: string;
  liveRole?: "guide" | "attendee";
  liveKey?: string;
  liveName?: string;
}

declare global {
  interface Window {
    ULL360_CONFIG?: StandaloneConfig;
    ULL360?: { mount: typeof mountViewer; instance?: ReturnType<typeof mountViewer> };
  }
}

window.ULL360 = { mount: mountViewer };


async function boot(): Promise<void> {
  const container = document.getElementById("ull360");
  if (container == null) return;
  const cfg: StandaloneConfig = window.ULL360_CONFIG ?? {};
  const tourUrl = cfg.tourUrl ?? container.dataset.tour;
  let tour = cfg.tour;
  if (tour == null && tourUrl != null) {
    const res = await fetch(tourUrl);
    if (!res.ok) {
      container.textContent = `Error ${res.status} cargando el tour`;
      return;
    }
    tour = (await res.json()) as Tour;
  }
  if (tour == null) {
    container.textContent = "Sin configuración de tour";
    return;
  }
  const params = new URLSearchParams(location.search);
  const liveRoom = params.get("live");
  // La instancia queda accesible en window.ULL360.instance: los integradores
  // (y las pruebas) pueden pilotar el visor ya montado sin volver a montarlo.
  window.ULL360!.instance = mountViewer({
    container,
    tour,
    baseUrl: cfg.baseUrl ?? container.dataset.base ?? baseFromTourUrl(tourUrl),
    analyticsEndpoint: cfg.analyticsEndpoint,
    formEndpoint: cfg.formEndpoint,
    turnstileSiteKey: cfg.turnstileSiteKey,
    kiosk: cfg.kiosk === true || params.get("kiosk") === "1",
    live:
      cfg.liveUrl != null || liveRoom != null
        ? {
            url:
              cfg.liveUrl ??
              `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/rt/live/${liveRoom}`,
            role: cfg.liveRole ?? (params.get("guide") != null ? "guide" : "attendee"),
            guideKey: cfg.liveKey ?? params.get("guide") ?? undefined,
            name: cfg.liveName ?? params.get("name") ?? undefined,
          }
        : undefined,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}
