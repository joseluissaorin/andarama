/**
 * Retículo de mirada del visor plano.
 *
 * Con el giroscopio activado el visitante mueve la escena girando el móvil y
 * ya no puede pulsar los marcadores: la pantalla se mira, no se toca. La
 * solución de siempre es un punto en el centro con un anillo que se va
 * dibujando mientras se sostiene la mirada, y que acciona lo enfocado al
 * completarse. Aquí está esa mecánica, sin depender del motor: se resuelve con
 * `elementFromPoint`, así que funciona con los diecisiete tipos de hotspot.
 */

export interface GazeOptions {
  /** Segundos de permanencia para activar. */
  seconds: number;
  /** Grados que puede derivar la vista sin reiniciar la cuenta. */
  toleranceDeg?: number;
  /** Orientación actual, para medir la deriva. */
  getView: () => { yaw: number; pitch: number };
}

export interface GazeHandle {
  stop: () => void;
}

const SIZE = 74;

/** Diferencia angular mínima entre dos yaw, en (-PI, PI]. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Elemento accionable bajo el centro de la pantalla, si lo hay. */
export function hotspotAtCenter(container: HTMLElement): HTMLElement | null {
  const rect = container.getBoundingClientRect();
  const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (el == null) return null;
  const hotspot = (el as HTMLElement).closest<HTMLElement>(".ull360-hotspot");
  return hotspot != null && container.contains(hotspot) ? hotspot : null;
}

export function startGaze(container: HTMLElement, options: GazeOptions): GazeHandle {
  const dwellMs = Math.max(800, options.seconds * 1000);
  const tolerance = ((options.toleranceDeg ?? 6) * Math.PI) / 180;

  const host = document.createElement("div");
  host.className = "ull360-gaze";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
      <circle class="ull360-gaze-track" cx="${SIZE / 2}" cy="${SIZE / 2}" r="30" />
      <circle class="ull360-gaze-ring" cx="${SIZE / 2}" cy="${SIZE / 2}" r="30" />
      <circle class="ull360-gaze-dot" cx="${SIZE / 2}" cy="${SIZE / 2}" r="4" />
    </svg>`;
  container.appendChild(host);

  const ring = host.querySelector<SVGCircleElement>(".ull360-gaze-ring")!;
  const circumference = 2 * Math.PI * 30;
  ring.style.strokeDasharray = String(circumference);
  ring.style.strokeDashoffset = String(circumference);

  let target: HTMLElement | null = null;
  let since = 0;
  let anchor = options.getView();
  let raf = 0;

  const reset = (next: HTMLElement | null): void => {
    target = next;
    since = performance.now();
    anchor = options.getView();
  };

  const frame = (): void => {
    raf = requestAnimationFrame(frame);
    const found = hotspotAtCenter(container);
    const view = options.getView();
    const drift = Math.hypot(angleDiff(view.yaw, anchor.yaw), view.pitch - anchor.pitch);
    if (found !== target || drift > tolerance) {
      reset(found);
    }
    if (target == null) {
      host.classList.remove("is-active");
      ring.style.strokeDashoffset = String(circumference);
      return;
    }
    host.classList.add("is-active");
    const progress = Math.min(1, (performance.now() - since) / dwellMs);
    ring.style.strokeDashoffset = String(circumference * (1 - progress));
    if (progress >= 1) {
      const el = target;
      reset(null);
      el.click();
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    stop: () => {
      cancelAnimationFrame(raf);
      host.remove();
    },
  };
}
