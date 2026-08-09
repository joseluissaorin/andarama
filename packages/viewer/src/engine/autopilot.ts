import type { AutopilotRoute, AutorotateConfig } from "@ull360/schema";

/**
 * Visita automatica (autopilot): recorrido autonomo por una ruta definida
 * (rotacion, pausa en hotspots, salto de escena), con pausa al interactuar
 * y reanudacion tras inactividad. Tambien gestiona la rotacion automatica
 * simple con retardo de inactividad.
 */

export interface AutopilotHost {
  goToScene(sceneId: string, opts?: { view?: { yaw?: number; pitch?: number; fov?: number } }): Promise<void>;
  rotateBy(deltaYaw: number, durationMs: number): Promise<void>;
  openHotspotPanel(hotspotId: string): void;
  closePanels(): void;
  currentSceneId(): string | null;
}

export class Autopilot {
  private route: AutopilotRoute | null = null;
  private running = false;
  private cancelled = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  onChange: ((active: boolean, routeId: string | null) => void) | null = null;

  constructor(private host: AutopilotHost) {}

  get active(): boolean {
    return this.running;
  }

  async start(route: AutopilotRoute): Promise<void> {
    this.stop();
    this.route = route;
    this.cancelled = false;
    this.running = true;
    this.onChange?.(true, route.id);
    try {
      do {
        for (const step of route.steps) {
          if (this.cancelled) return;
          await this.host.goToScene(step.scene, { view: step.view });
          if (this.cancelled) return;
          for (const hotspotId of step.pauseOnHotspots ?? []) {
            if (this.cancelled) return;
            this.host.openHotspotPanel(hotspotId);
            await sleep(4000);
            this.host.closePanels();
            await sleep(400);
          }
          if (step.rotate != null && step.rotate !== 0) {
            const duration = Math.abs(step.rotate) * 9000 / (2 * Math.PI);
            await this.host.rotateBy(step.rotate, duration);
          }
          if (step.dwell != null && step.dwell > 0) await sleep(step.dwell * 1000);
        }
      } while (route.loop === true && !this.cancelled);
    } finally {
      if (!this.cancelled) {
        this.running = false;
        this.onChange?.(false, null);
      }
    }
  }

  /** Pausa por interaccion del usuario; reanuda tras la inactividad configurada. */
  pauseForInteraction(): void {
    if (this.route == null || !this.running) return;
    this.cancelled = true;
    this.running = false;
    this.onChange?.(false, this.route.id);
    if (this.resumeTimer != null) clearTimeout(this.resumeTimer);
    const resumeAfter = this.route.resumeAfter ?? 20;
    if (resumeAfter > 0) {
      const route = this.route;
      this.resumeTimer = setTimeout(() => {
        void this.start(route);
      }, resumeAfter * 1000);
    }
  }

  stop(): void {
    this.cancelled = true;
    this.running = false;
    if (this.resumeTimer != null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    if (this.route != null) this.onChange?.(false, null);
    this.route = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function normalizeAutorotate(cfg: AutorotateConfig | undefined): Required<AutorotateConfig> | null {
  if (cfg == null || cfg.enabled !== true) return null;
  return {
    enabled: true,
    speed: cfg.speed ?? 0.06,
    delay: cfg.delay ?? 5,
    direction: cfg.direction ?? "cw",
  };
}
