import { angleDiff } from "./math.js";

/**
 * Selección por permanencia de la mirada, común al modo cartón y a WebXR.
 *
 * Antes solo existía dentro del bucle del modo cartón. Chrome en Android entra
 * por WebXR (su runtime de Cardboard dice que sí a `immersive-vr`), y ahí no
 * había temporizador: el hotspot se ponía lila al mirarlo pero nada lo
 * accionaba. Esta clase no sabe de WebGL ni de relojes: recibe el objetivo
 * mirado, la orientación de la cabeza y la hora del fotograma (la del bucle de
 * la sesión XR o la de la ventana, según el modo) y dice cuándo disparar.
 *
 * - El contador se reinicia al cambiar de objetivo o si la cabeza se mueve
 *   más de `tolerance` radianes respecto al punto donde empezó.
 * - Lo que se acaba de accionar no se repite mientras la mirada siga ahí
 *   (sin esto, un enlace o un «siguiente» se disparaba una vez por periodo).
 */
export class GazeDwell {
  private target: string | null = null;
  private start = 0;
  private anchor = { yaw: 0, pitch: 0 };
  /** Objetivo ya accionado: no se rearma hasta que la mirada se va de él. */
  private fired: string | null = null;
  /** Avance del anillo, de 0 a 1. */
  progress = 0;

  constructor(
    public dwellMs: number,
    private tolerance = 0.1,
  ) {}

  /**
   * Avanza un fotograma. Devuelve true en el fotograma en que se cumple la
   * permanencia sobre `target`.
   */
  update(target: string | null, yaw: number, pitch: number, now: number): boolean {
    if (target !== this.fired) this.fired = null;
    const effective = target != null && target === this.fired ? null : target;
    const drift = Math.hypot(angleDiff(yaw, this.anchor.yaw), pitch - this.anchor.pitch);
    if (effective !== this.target || drift > this.tolerance) {
      this.target = effective;
      this.start = now;
      this.anchor = { yaw, pitch };
    } else if (effective != null && now - this.start >= this.dwellMs) {
      this.consume();
      return true;
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
