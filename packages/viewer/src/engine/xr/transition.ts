/**
 * Cambio de escena dentro del modo inmersivo.
 *
 * En Meta Quest el salto parecía hacerse (salían los hotspots de la escena
 * nueva) pero la panorámica seguía siendo la vieja. El motivo: el salto
 * esperaba a que Marzipano terminara su transición, y esa transición avanza
 * con `window.requestAnimationFrame`, que el navegador del Quest suspende
 * mientras hay una sesión inmersiva. Solo corre `XRSession.requestAnimationFrame`.
 * La promesa no se resolvía nunca, la textura nueva no se subía y los saltos
 * siguientes se ignoraban.
 *
 * Aquí el cambio va en tres tiempos y el reloj lo pone quien llama a `frame`
 * —el bucle de la sesión XR, o el de la ventana en el modo cartón—; no se usa
 * ni `setTimeout` ni el `requestAnimationFrame` de la ventana:
 *
 * 1. Fundido a negro y se ocultan los hotspots (para que nunca se vean los
 *    de la escena nueva sobre la panorámica vieja).
 * 2. Se confirma el salto en el visor (`navigate`, que no espera a Marzipano)
 *    y se carga el entorno nuevo (`load`).
 * 3. En el primer fotograma con el negro completo y el entorno listo, se
 *    aplica (`apply`: subir la textura) y se funde de vuelta.
 */

export interface SceneTransitionDeps<T> {
  /** Confirma el cambio de escena en el visor. No debe esperar al render plano. */
  navigate(target: string): Promise<void>;
  /** Carga el entorno de la escena ya confirmada. */
  load(): Promise<T>;
  /** Aplica el entorno (sube la textura). Se llama desde `frame`. */
  apply(env: T): void;
  onError?(error: unknown): void;
}

type Phase = "idle" | "out" | "in";

export const FADE_OUT_MS = 180;
export const FADE_IN_MS = 260;

export class SceneTransition<T> {
  private phase: Phase = "idle";
  private phaseStart: number | null = null;
  private ready: { env: T } | { failed: true } | null = null;

  constructor(private deps: SceneTransitionDeps<T>) {}

  /** true mientras dura cualquier parte del cambio: se ignoran otros saltos. */
  get busy(): boolean {
    return this.phase !== "idle";
  }

  /** Mientras se funde a negro y se carga, los hotspots no se dibujan ni se apuntan. */
  get hideHotspots(): boolean {
    return this.phase === "out";
  }

  /**
   * Pide el salto. La promesa se resuelve cuando el entorno nuevo está
   * cargado (no cuando ya se ve: eso ocurre en el siguiente `frame`).
   */
  async request(target: string): Promise<void> {
    if (this.phase !== "idle") return;
    this.phase = "out";
    this.phaseStart = null;
    this.ready = null;
    try {
      await this.deps.navigate(target);
      this.ready = { env: await this.deps.load() };
    } catch (error) {
      this.ready = { failed: true };
      this.deps.onError?.(error);
    }
  }

  /**
   * Avanza un fotograma con la hora que da el bucle que llama. Devuelve la
   * opacidad del velo negro, de 0 a 1.
   */
  frame(now: number): number {
    if (this.phase === "idle") return 0;
    if (this.phaseStart == null) this.phaseStart = now;
    const elapsed = now - this.phaseStart;
    if (this.phase === "out") {
      const alpha = Math.min(1, elapsed / FADE_OUT_MS);
      if (alpha >= 1 && this.ready != null) {
        if ("env" in this.ready) {
          try {
            this.deps.apply(this.ready.env);
          } catch (error) {
            this.deps.onError?.(error);
          }
        }
        this.ready = null;
        this.phase = "in";
        this.phaseStart = now;
      }
      return alpha;
    }
    const alpha = 1 - Math.min(1, elapsed / FADE_IN_MS);
    if (alpha <= 0) {
      this.phase = "idle";
      this.phaseStart = null;
    }
    return alpha;
  }

  reset(): void {
    this.phase = "idle";
    this.phaseStart = null;
    this.ready = null;
  }
}

/** Lo mínimo de `Marzipano.Viewer` que hace falta para cambiar de escena. */
export interface SceneSwitcher {
  switchScene(scene: unknown, opts: Record<string, unknown>, done: () => void): void;
}

/**
 * Cambia de escena en Marzipano. Con `wait` se espera a que termine la
 * transición (el visor plano); sin él se lanza y se sigue, que es lo que
 * necesita el modo inmersivo: allí la transición de Marzipano no avanza hasta
 * salir de la sesión, porque depende del `requestAnimationFrame` de la ventana.
 */
export function switchMarzipanoScene(
  viewer: SceneSwitcher,
  scene: unknown,
  opts: Record<string, unknown>,
  wait: boolean,
): Promise<void> {
  const done = new Promise<void>((resolve) => {
    viewer.switchScene(scene, opts, () => resolve());
  });
  return wait ? done : Promise.resolve();
}
