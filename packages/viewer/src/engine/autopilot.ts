import type { AutopilotRoute, AutorotateConfig } from "@andarama/schema";

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
  /**
   * Rumbo, en la escena actual, del paso que lleva a otra escena. El quiosco
   * lo usa para **mirar hacia la puerta por la que se va a salir** antes de
   * cruzarla: sin esto el salto es un corte y no se entiende de dónde a dónde.
   */
  doorYawTo?(sceneId: string): number | null;
  /** Gira hasta un rumbo absoluto (no relativo, como rotateBy). */
  turnTo?(yaw: number, durationMs: number): Promise<void>;
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

  /**
   * Encadena varias rutas, una tras otra, sin fin. Es lo que hace falta en un
   * quiosco: enseñar TODO lo que hay, no solo el primer recorrido.
   */
  async startChain(routes: AutopilotRoute[]): Promise<void> {
    if (routes.length === 0) return;
    this.chain = routes;
    this.cancelledChain = false;
    let i = 0;
    // Cada vuelta arranca la siguiente ruta; start() ya respeta cancelled
    while (!this.cancelledChain) {
      const route = routes[i % routes.length]!;
      // Dentro de la cadena, cada ruta se reproduce una vez aunque tenga
      // `loop`: quedarse en la primera para siempre sería no enseñar el resto
      await this.start({ ...route, loop: false });
      if (this.cancelledChain || this.cancelled) return;
      i++;
      // Un respiro entre recorridos. Además de dar tiempo a leer el rótulo,
      // impide que una cadena de rutas sin pausas gire en vacío y se coma la
      // CPU del quiosco sin ceder nunca el hilo.
      await sleep(900);
    }
  }

  private chain: AutopilotRoute[] | null = null;
  private cancelledChain = false;

  async start(route: AutopilotRoute): Promise<void> {
    this.stopCurrent();
    this.route = route;
    this.cancelled = false;
    this.running = true;
    this.onChange?.(true, route.id);
    try {
      do {
        for (let si = 0; si < route.steps.length; si++) {
          const step = route.steps[si]!;
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
          // Antes de saltar, mirar hacia la puerta por la que se sale: así se
          // ve de dónde a dónde se va en vez de aparecer de golpe en otro sitio
          const siguiente = route.steps[si + 1];
          if (siguiente != null && !this.cancelled) {
            const rumbo = this.host.doorYawTo?.(siguiente.scene);
            if (rumbo != null && this.host.turnTo != null) {
              await this.host.turnTo(rumbo, 1200);
              if (this.cancelled) return;
              await sleep(500);
            }
          }
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

  /** Corta la ruta en curso sin tocar la cadena del quiosco. */
  private stopCurrent(): void {
    this.cancelled = true;
    this.running = false;
    if (this.resumeTimer != null) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
  }

  stop(): void {
    this.cancelledChain = true;
    this.chain = null;
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
