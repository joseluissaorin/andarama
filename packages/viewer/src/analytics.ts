import type { ViewerAnalyticsEvent } from "./types.js";

/**
 * Cliente de analitica sin cookies. Identificador de sesion efimero en
 * sessionStorage (se descarta al cerrar la pestana; no identifica al
 * usuario entre visitas). Envio por sendBeacon con lotes pequenos.
 */
export class AnalyticsClient {
  private queue: Record<string, unknown>[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private enabled: boolean;

  constructor(
    private endpoint: string | null,
    private tourSlug: string,
    private lang: () => string,
    private extra?: (event: ViewerAnalyticsEvent) => void,
  ) {
    this.enabled = endpoint != null && endpoint !== "";
    this.sessionId = this.ensureSessionId();
    if (this.enabled) {
      this.timer = setInterval(() => this.flush(), 5000);
      addEventListener("pagehide", () => this.flush());
      addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.flush();
      });
    }
  }

  private ensureSessionId(): string {
    try {
      let id = sessionStorage.getItem("andarama:sid");
      if (id == null) {
        id = crypto.randomUUID();
        sessionStorage.setItem("andarama:sid", id);
      }
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  private device(): string {
    const ua = navigator.userAgent;
    if (/Quest|OculusBrowser|Pico/i.test(ua)) return "vr";
    if (/iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return "tablet";
    if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
    return "desktop";
  }

  track(event: ViewerAnalyticsEvent): void {
    this.extra?.(event);
    if (!this.enabled) return;
    this.queue.push({
      t: this.tourSlug,
      e: event.event,
      s: event.sceneId,
      h: event.hotspotId,
      l: this.lang(),
      d: this.device(),
      sid: this.sessionId,
      dur: event.durationMs,
      yb: event.yaw != null ? yawBucket(event.yaw) : undefined,
      pb: event.pitch != null ? pitchBucket(event.pitch) : undefined,
      r: document.referrer !== "" ? safeHost(document.referrer) : undefined,
    });
    if (this.queue.length >= 20) this.flush();
  }

  flush(): void {
    if (!this.enabled || this.queue.length === 0) return;
    const payload = JSON.stringify({ events: this.queue.splice(0, this.queue.length) });
    try {
      if (navigator.sendBeacon != null) {
        navigator.sendBeacon(this.endpoint!, new Blob([payload], { type: "application/json" }));
      } else {
        void fetch(this.endpoint!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // sin red: descartar
    }
  }

  destroy(): void {
    this.flush();
    if (this.timer != null) clearInterval(this.timer);
  }
}

/** Cuantiza yaw a 16 sectores (para el mapa de calor de orientaciones). */
export function yawBucket(yaw: number): number {
  const n = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(15, Math.floor((n / (2 * Math.PI)) * 16));
}

/** Cuantiza pitch a 8 bandas. */
export function pitchBucket(pitch: number): number {
  const t = (pitch + Math.PI / 2) / Math.PI;
  return Math.min(7, Math.max(0, Math.floor(t * 8)));
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
