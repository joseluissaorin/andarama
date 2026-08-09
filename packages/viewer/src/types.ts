import type { Hotspot, Scene, Tour, ViewParams } from "@ull360/schema";

export interface TourViewerOptions {
  /** Contenedor DOM donde montar el visor. */
  container: HTMLElement;
  tour: Tour;
  /** Idioma inicial (por defecto: de la URL o defaultLang). */
  lang?: string;
  /** Prefijo base para resolver rutas relativas de medios. */
  baseUrl?: string;
  /** Modo edicion (Studio): desactiva autorotate/autopilot/analytics. */
  editMode?: boolean;
  /** Sincronizar la vista con el hash de la URL (deep links). */
  deepLinks?: boolean;
  /** Endpoint de analitica; null desactiva el envio. */
  analyticsEndpoint?: string | null;
  /** Callback de eventos de analitica adicional (para el Studio o LTI). */
  onAnalytics?: (event: ViewerAnalyticsEvent) => void;
  /** Respetar prefers-reduced-motion (por defecto true). */
  respectReducedMotion?: boolean;
}

export interface ViewerAnalyticsEvent {
  event: "view" | "scene" | "hotspot" | "duration" | "quiz" | "form" | "share" | "vr" | "heartbeat";
  sceneId?: string;
  hotspotId?: string;
  durationMs?: number;
  yaw?: number;
  pitch?: number;
  meta?: Record<string, unknown>;
}

export interface SceneChangeEvent {
  scene: Scene;
  previous: Scene | null;
}

export interface HotspotActivateEvent {
  hotspot: Hotspot;
  scene: Scene;
  /** Elemento marcador (ancla para paneles). */
  element: HTMLElement | null;
}

export interface QuizStateEvent {
  score: number;
  maxScore: number;
  answered: number;
  total: number;
  passed: boolean | null;
  detail: { hotspotId: string; sceneId: string; correct: boolean; points: number }[];
}

export type ViewerEventMap = {
  ready: { scene: Scene };
  sceneChange: SceneChangeEvent;
  viewChange: ViewParams;
  hotspotActivate: HotspotActivateEvent;
  hotspotDeactivate: Record<string, never>;
  varsChange: Record<string, string | number | boolean>;
  quizChange: QuizStateEvent;
  langChange: { lang: string };
  muteChange: { muted: boolean };
  vrChange: { active: boolean; mode: "xr" | "cardboard" | null };
  autopilotChange: { active: boolean; routeId: string | null };
  narrationBlock: { blocked: boolean };
  treasureProgress: { found: number; total: number; lastFound?: string };
  error: { message: string; cause?: unknown };
};

export type ViewerEventName = keyof ViewerEventMap;

export type Unsubscribe = () => void;
