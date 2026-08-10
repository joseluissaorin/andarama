/**
 * Retículo de mirada del visor plano.
 *
 * Con el giroscopio activado el visitante mueve la escena girando el móvil y ya
 * no puede pulsar los marcadores: la pantalla se mira, no se toca. La solución
 * de siempre es un punto con un anillo que se va dibujando mientras se sostiene
 * la mirada, y que acciona lo enfocado al completarse. Se resuelve con
 * `elementFromPoint`, así que sirve para los diecisiete tipos de hotspot.
 *
 * Tiene dos modos, y el segundo es el que hace que esto sea usable de verdad:
 *
 *  - **Apuntando al panorama**: el retículo vive en el centro. Girar la cabeza
 *    mueve la escena, así que centrar un marcador es apuntarlo.
 *  - **Con un panel abierto**: el panel es un cuadro fijo en la pantalla, y un
 *    retículo también fijo en el centro no alcanzaría jamás su aspa por mucho
 *    que uno gire. Entonces el retículo se convierte en un cursor que la cabeza
 *    arrastra por la pantalla, y así se llega al botón de cerrar.
 */

export interface GazeOptions {
  /** Segundos de permanencia para activar. */
  seconds: number;
  /** Grados que puede derivar la vista sin reiniciar la cuenta. */
  toleranceDeg?: number;
  /** Orientación actual, para medir la deriva y mover el cursor. */
  getView: () => { yaw: number; pitch: number };
}

export interface GazeHandle {
  stop: () => void;
}

const SIZE = 74;

/** Píxeles que recorre el cursor por radián de giro de cabeza. */
const PIXELS_PER_RADIAN = 900;

/**
 * Qué se puede accionar con la mirada: los marcadores del panorama y lo que
 * esté marcado con `data-gaze` —el aspa de los paneles, sobre todo—. No vale
 * cualquier botón: con un panel abierto, hacerlo todo accionable dispararía
 * cosas sin querer.
 */
export const GAZE_SELECTOR = ".ull360-hotspot, [data-gaze]";

/** Diferencia angular mínima entre dos yaw, en (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Posición del cursor dentro del contenedor a partir del giro acumulado desde
 * que se abrió el panel. Se limita al propio contenedor: el cursor no se
 * escapa de la pantalla por mucho que uno siga girando.
 */
export function cursorFromRotation(
  view: { yaw: number; pitch: number },
  anchor: { yaw: number; pitch: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  const dx = angleDiff(view.yaw, anchor.yaw) * PIXELS_PER_RADIAN;
  // Mirar hacia arriba sube el cursor: el eje de pantalla va al revés.
  const dy = -(view.pitch - anchor.pitch) * PIXELS_PER_RADIAN;
  return {
    x: Math.max(24, Math.min(size.width - 24, size.width / 2 + dx)),
    y: Math.max(24, Math.min(size.height - 24, size.height / 2 + dy)),
  };
}

/** Elemento accionable bajo un punto del contenedor, si lo hay. */
export function gazeTargetAt(container: HTMLElement, x: number, y: number): HTMLElement | null {
  const rect = container.getBoundingClientRect();
  const el = document.elementFromPoint(rect.left + x, rect.top + y);
  if (el == null) return null;
  const target = (el as HTMLElement).closest<HTMLElement>(GAZE_SELECTOR);
  return target != null && container.contains(target) ? target : null;
}

/** Elemento accionable bajo el centro de la pantalla, si lo hay. */
export function hotspotAtCenter(container: HTMLElement): HTMLElement | null {
  const rect = container.getBoundingClientRect();
  return gazeTargetAt(container, rect.width / 2, rect.height / 2);
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
  /** Lo último accionado: no se repite hasta que la mirada se va de ahí. */
  let justFired: HTMLElement | null = null;
  let since = 0;
  let anchor = options.getView();
  /** Orientación al abrirse el panel: origen del cursor. */
  let cursorAnchor: { yaw: number; pitch: number } | null = null;
  let raf = 0;

  const reset = (next: HTMLElement | null): void => {
    target = next;
    since = performance.now();
    anchor = options.getView();
  };

  const frame = (): void => {
    raf = requestAnimationFrame(frame);
    const view = options.getView();
    const rect = container.getBoundingClientRect();
    const panelOpen = container.querySelector(".ull360-panel") != null;

    // Al abrirse o cerrarse un panel se cambia de modo y se recentra el cursor
    if (panelOpen && cursorAnchor == null) {
      cursorAnchor = view;
      host.classList.add("is-cursor");
    } else if (!panelOpen && cursorAnchor != null) {
      cursorAnchor = null;
      host.classList.remove("is-cursor");
      host.style.transform = "";
    }

    let x = rect.width / 2;
    let y = rect.height / 2;
    if (cursorAnchor != null) {
      const pos = cursorFromRotation(view, cursorAnchor, { width: rect.width, height: rect.height });
      x = pos.x;
      y = pos.y;
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
    } else {
      host.style.left = "";
      host.style.top = "";
    }

    let found = gazeTargetAt(container, x, y);
    // Sostener la mirada sobre lo ya accionado no lo vuelve a disparar: sin
    // esto, quedarse mirando un enlace lo abriría una vez cada dos segundos.
    if (found != null && found === justFired) found = null;
    else if (found !== justFired) justFired = null;
    // En modo cursor la cabeza sí se mueve a propósito: solo reinicia el
    // contador cambiar de objetivo.
    const drift = cursorAnchor != null ? 0 : Math.hypot(angleDiff(view.yaw, anchor.yaw), view.pitch - anchor.pitch);
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
      justFired = el;
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
