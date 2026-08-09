import Marzipano from "marzipano";

/**
 * Metodo de control por giroscopio (DeviceOrientation) para Marzipano,
 * adaptado del patron de los demos oficiales (Apache-2.0). Combinable con
 * el arrastre tactil: emite dinamicas de offset en vez de valores absolutos.
 * En iOS >= 13 requiere permiso explicito (DeviceOrientationEvent.requestPermission).
 */
export class DeviceOrientationControlMethod {
  private dynamics = { yaw: new (Marzipano as any).Dynamics(), pitch: new (Marzipano as any).Dynamics() };
  private listeners: { [k: string]: ((...args: any[]) => void)[] } = {};
  private previous: { yaw: number; pitch: number } | null = null;
  private boundHandler = (e: DeviceOrientationEvent): void => this.handleData(e);
  private started = false;

  addEventListener(name: string, fn: (...args: any[]) => void): void {
    (this.listeners[name] ??= []).push(fn);
  }

  removeEventListener(name: string, fn: (...args: any[]) => void): void {
    const arr = this.listeners[name];
    if (arr != null) {
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    }
  }

  private emit(name: string, ...args: any[]): void {
    for (const fn of this.listeners[name] ?? []) fn(...args);
  }

  static async requestPermission(): Promise<boolean> {
    const anyDOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof anyDOE.requestPermission === "function") {
      try {
        return (await anyDOE.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return typeof DeviceOrientationEvent !== "undefined";
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.previous = null;
    window.addEventListener("deviceorientation", this.boundHandler);
    this.emit("active");
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener("deviceorientation", this.boundHandler);
    this.previous = null;
    this.emit("inactive");
  }

  get active(): boolean {
    return this.started;
  }

  destroy(): void {
    this.stop();
  }

  private handleData(e: DeviceOrientationEvent): void {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const { yaw, pitch } = orientationToYawPitch(e.alpha, e.beta, e.gamma, screenOrientationAngle());
    if (this.previous != null) {
      // Delta respecto a la muestra anterior: permite combinar con arrastre.
      let dyaw = yaw - this.previous.yaw;
      const dpitch = pitch - this.previous.pitch;
      if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      this.dynamics.yaw.offset = -dyaw;
      this.dynamics.pitch.offset = dpitch;
      this.emit("parameterDynamics", "yaw", this.dynamics.yaw);
      this.emit("parameterDynamics", "pitch", this.dynamics.pitch);
    }
    this.previous = { yaw, pitch };
  }
}

function screenOrientationAngle(): number {
  if (typeof screen !== "undefined" && screen.orientation != null) {
    return (screen.orientation.angle * Math.PI) / 180;
  }
  return 0;
}

/**
 * Convierte angulos deviceorientation (grados, convenio Tait-Bryan Z-X'-Y'')
 * a yaw/pitch de camara compensando la rotacion de pantalla.
 */
export function orientationToYawPitch(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenAngle: number,
): { yaw: number; pitch: number } {
  const alpha = (alphaDeg * Math.PI) / 180;
  const beta = (betaDeg * Math.PI) / 180;
  const gamma = (gammaDeg * Math.PI) / 180;

  const cA = Math.cos(alpha), sA = Math.sin(alpha);
  const cB = Math.cos(beta), sB = Math.sin(beta);
  const cG = Math.cos(gamma), sG = Math.sin(gamma);

  // Vector "hacia atras de la pantalla" (0,0,-1) rotado al marco del mundo.
  let vx = -(sA * sB * cG + cA * sG) * -1;
  let vy = -(cA * sB * cG - sA * sG) * -1;
  let vz = -(cB * cG) * -1;

  // Compensar orientacion de pantalla (rotacion en el plano XY del dispositivo).
  if (screenAngle !== 0) {
    const cS = Math.cos(screenAngle), sS = Math.sin(screenAngle);
    const nx = vx * cS - vy * sS;
    const ny = vx * sS + vy * cS;
    vx = nx;
    vy = ny;
  }

  const yaw = Math.atan2(vx, vy);
  const pitch = Math.asin(Math.max(-1, Math.min(1, vz)));
  return { yaw, pitch };
}
