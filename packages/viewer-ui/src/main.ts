import { mountViewer } from "./skin.js";
import type { Tour } from "@andarama/schema";
import { baseFromTourUrl } from "./url.js";

/**
 * Punto de entrada del bundle standalone: paginas de tour publicadas
 * (/t/{slug}) y paquetes exportados. Lee la configuracion de
 * window.Andarama_CONFIG o de atributos data-* del contenedor #andarama.
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
    Andarama_CONFIG?: StandaloneConfig;
    Andarama?: { mount: typeof mountViewer; instance?: ReturnType<typeof mountViewer> };
  }
}

window.Andarama = { mount: mountViewer };


async function boot(): Promise<void> {
  const container = document.getElementById("andarama");
  if (container == null) return;
  const cfg: StandaloneConfig = window.Andarama_CONFIG ?? {};
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
  // La instancia queda accesible en window.Andarama.instance: los integradores
  // (y las pruebas) pueden pilotar el visor ya montado sin volver a montarlo.
  window.Andarama!.instance = mountViewer({
    container,
    tour,
    baseUrl: cfg.baseUrl ?? container.dataset.base ?? baseFromTourUrl(tourUrl),
    analyticsEndpoint: cfg.analyticsEndpoint,
    formEndpoint: cfg.formEndpoint,
    turnstileSiteKey: cfg.turnstileSiteKey,
    // ?kiosk=1 lo enciende y ?kiosk=0 lo apaga aunque el paquete venga en
    // quiosco: una misma dirección sirve para la pantalla y para la persona.
    kiosk: params.get("kiosk") === "0" ? false : cfg.kiosk === true || params.get("kiosk") === "1",
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
