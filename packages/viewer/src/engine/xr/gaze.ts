/**
 * Selección por permanencia de la mirada, común al modo cartón y a WebXR.
 *
 * Antes solo existía dentro del bucle del modo cartón. Chrome en Android entra
 * por WebXR (su runtime de Cardboard dice que sí a `immersive-vr`), y ahí no
 * había temporizador: el hotspot se ponía lila al mirarlo pero nada lo
 * accionaba. Esta clase no sabe de WebGL ni de relojes: recibe el objetivo
 * mirado y la hora del fotograma (la del bucle de la sesión XR o la de la
 * ventana, según el modo) y dice cuándo disparar.
 *
 * - El contador solo se reinicia al cambiar de objetivo. Antes también se
 *   reiniciaba si la cabeza se movía más de 0,1 rad respecto al punto donde
 *   empezó, y con un móvil sujeto a mano —Android con cartón— ese temblor
 *   bastaba para que el anillo no llegase nunca al final. Ahora la deriva se
 *   mide contra el propio objetivo: mientras el rayo siga dentro de su radio
 *   de impacto (con el margen de `gazeHitRadius`), se sigue contando.
 * - Un parpadeo breve mirando a la nada (`graceMs`) no reinicia el contador:
 *   es el temblor del borde, no un cambio de idea. Mientras dura no se
 *   dispara nada; solo se conserva lo acumulado.
 * - Lo que se acaba de accionar no se repite mientras la mirada siga ahí
 *   (sin esto, un enlace o un «siguiente» se disparaba una vez por periodo).
 */
export class GazeDwell {
  private target: string | null = null;
  private start = 0;
  /** Último fotograma en que el objetivo actual estaba bajo la mirada. */
  private lastSeen = 0;
  /** Objetivo ya accionado: no se rearma hasta que la mirada se va de él. */
  private fired: string | null = null;
  /** Avance del anillo, de 0 a 1. */
  progress = 0;

  constructor(
    public dwellMs: number,
    private graceMs = GAZE_GRACE_MS,
  ) {}

  /** Objetivo sobre el que se está acumulando permanencia, si lo hay. */
  get current(): string | null {
    return this.target;
  }

  /**
   * Avanza un fotograma. Devuelve true en el fotograma en que se cumple la
   * permanencia sobre `target`.
   */
  update(target: string | null, now: number): boolean {
    if (target !== this.fired) this.fired = null;
    const effective = target != null && target === this.fired ? null : target;
    if (effective != null && effective === this.target) {
      this.lastSeen = now;
      if (now - this.start >= this.dwellMs) {
        this.consume();
        return true;
      }
    } else if (target == null && this.target != null && now - this.lastSeen <= this.graceMs) {
      // Pérdida breve: se conserva el objetivo sin reiniciar ni disparar.
    } else if (effective !== this.target) {
      this.target = effective;
      this.start = now;
      this.lastSeen = now;
    }
    this.progress = this.target != null ? Math.max(0, Math.min(1, (now - this.start) / this.dwellMs)) : 0;
    return false;
  }

  /**
   * El objetivo actual se ha accionado por otra vía (un toque en la pantalla,
   * el botón del visor): se vacía el anillo y no se repite por permanencia.
   */
  consume(key: string | null = this.target): void {
    this.fired = key;
    this.target = null;
    this.progress = 0;
  }

  reset(): void {
    this.target = null;
    this.fired = null;
    this.progress = 0;
  }
}

/** Parpadeo máximo mirando a la nada que no reinicia la permanencia. */
export const GAZE_GRACE_MS = 220;

/**
 * Margen extra del radio de impacto para el hotspot que ya se está mirando.
 * Entrar exige el radio normal; salir, este radio ampliado (histéresis). Así
 * el temblor de un móvil en la mano no saca la mirada del objetivo.
 */
export const GAZE_STICKY_FACTOR = 1.4;

/** Radio de impacto de un hotspot para la mirada, con histéresis. */
export function gazeHitRadius(baseRadius: number, isCurrentTarget: boolean): number {
  return isCurrentTarget ? baseRadius * GAZE_STICKY_FACTOR : baseRadius;
}
