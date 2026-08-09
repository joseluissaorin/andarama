import type { AutorotateConfig, ControlsConfig, Tour, TransitionSpec, UIConfig } from "./types.js";
import { TOUR_SCHEMA_URL, TOUR_SCHEMA_VERSION } from "./types.js";

export const DEFAULT_UI: Required<
  Pick<
    UIConfig,
    | "titleBar"
    | "sceneMenu"
    | "thumbnails"
    | "compass"
    | "loadingIndicator"
    | "zoomControls"
    | "gyroToggle"
    | "vr"
    | "fullscreen"
    | "share"
    | "mute"
    | "help"
    | "langSelector"
    | "accessibleMode"
  >
> = {
  titleBar: true,
  sceneMenu: true,
  thumbnails: true,
  compass: true,
  loadingIndicator: true,
  zoomControls: true,
  gyroToggle: true,
  vr: true,
  fullscreen: true,
  share: true,
  mute: true,
  help: true,
  langSelector: true,
  accessibleMode: true,
};

export const DEFAULT_TRANSITION: Required<TransitionSpec> = {
  kind: "fade",
  duration: 800,
  easing: "easeInOut",
};

export const DEFAULT_AUTOROTATE: Required<AutorotateConfig> = {
  enabled: false,
  speed: 0.06,
  delay: 5,
  direction: "cw",
};

export const DEFAULT_CONTROLS: Required<ControlsConfig> = {
  sensitivity: 1,
  inertia: 0.85,
  invertX: false,
  invertY: false,
  wheelZoom: true,
  gyroAvailable: true,
  keyboard: true,
  gamepad: false,
};

export const DEFAULT_VIEW = { yaw: 0, pitch: 0, fov: 1.2 };

/** Tour minimo valido, punto de partida de un proyecto nuevo. */
export function createEmptyTour(title: string, lang = "es"): Tour {
  return {
    $schema: TOUR_SCHEMA_URL,
    version: TOUR_SCHEMA_VERSION,
    meta: { title, defaultLang: lang, langs: [lang] },
    start: { scene: "", intro: "none" },
    scenes: [],
    ui: { ...DEFAULT_UI, theme: { base: "ull" } },
    transition: { ...DEFAULT_TRANSITION },
    controls: { ...DEFAULT_CONTROLS },
  };
}
