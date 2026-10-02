import type { TourViewer } from "@andarama/viewer";
import { createIconSvg } from "@andarama/viewer";
import { el } from "./dom.js";
import type { Translator } from "./i18n.js";

/** Lo que la visita necesita del host de paneles (PanelHost). */
export interface LivePanels {
  onPanelChange: ((hotspotId: string | null) => void) | null;
  readonly openHotspotId: string | null;
  close(): void;
  closeBubble(): void;
}

/**
 * Cliente de tours guiados en vivo: un guia controla escena y orientacion
 * de N asistentes via WebSocket (Durable Object en Cloudflare, ws integrado
 * en self-host). Los asistentes pueden "soltarse" y volver a sincronizar.
 * Incluye puntero del guia, los paneles que abre el guia (quien le sigue ve
 * el mismo texto, imagen, video o PDF, y se le cierra cuando el guia lo
 * cierra) y chat de texto. El audio se asume en una
 * videollamada externa en paralelo (Meet/Teams), documentado en la guia.
 */

type LiveMessage =
  | { type: "hello"; role: "guide" | "attendee"; name?: string; key?: string }
  | {
      type: "state";
      scene: string;
      yaw: number;
      pitch: number;
      fov: number;
      participants: number;
      pointer?: { yaw: number; pitch: number } | null;
      panel?: string | null;
    }
  | { type: "panel"; hotspot: string | null }
  | { type: "view"; scene: string; yaw: number; pitch: number; fov: number }
  | { type: "pointer"; pointer: { yaw: number; pitch: number } | null }
  | { type: "chat"; from?: string; text: string }
  | { type: "participants"; count: number }
  | { type: "end" }
  | { type: "error"; message: string };

export interface LiveOptions {
  url: string;
  role: "guide" | "attendee";
  name?: string;
  /** Clave de guia (la genera el creador de la sala). */
  guideKey?: string;
}

export class LiveClient {
  private ws: WebSocket | null = null;
  private following = true;
  private panel: HTMLElement | null = null;
  private pointerEl: HTMLElement | null = null;
  private lastSent = 0;
  private participants = 0;
  private msgs: HTMLElement | null = null;
  private followBtn: HTMLButtonElement | null = null;
  private unsubs: (() => void)[] = [];
  private closedByUser = false;
  /** Último panel del guía (lo que hay que tener abierto al seguirle). */
  private guidePanel: string | null = null;
  /** Panel que se abrió por seguir al guía (el único que se cierra solo). */
  private syncedPanel: string | null = null;

  constructor(
    private viewer: TourViewer,
    private t: Translator,
    private container: HTMLElement,
    private opts: LiveOptions,
    private panels: LivePanels | null = null,
  ) {}

  connect(): void {
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => {
      this.send({ type: "hello", role: this.opts.role, name: this.opts.name, key: this.opts.guideKey });
      this.mountUi();
      if (this.opts.role === "guide") this.startBroadcast();
      this.startPanelSync();
    });
    this.ws.addEventListener("message", (e) => {
      try {
        this.handle(JSON.parse(String(e.data)) as LiveMessage);
      } catch {
        // mensaje invalido
      }
    });
    this.ws.addEventListener("close", () => {
      if (!this.closedByUser) this.showEnded();
    });
  }

  private send(msg: LiveMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: LiveMessage): void {
    switch (msg.type) {
      case "state":
      case "view": {
        if (this.opts.role === "attendee" && this.following) {
          if (msg.scene !== this.viewer.currentSceneId()) {
            void this.viewer.goTo(msg.scene, { view: { yaw: msg.yaw, pitch: msg.pitch, fov: msg.fov }, force: true });
          } else {
            this.viewer.setView({ yaw: msg.yaw, pitch: msg.pitch, fov: msg.fov });
          }
        }
        if (msg.type === "state") {
          this.participants = msg.participants;
          this.updateHead();
          this.updatePointer(msg.pointer ?? null);
          if (msg.panel !== undefined) this.setGuidePanel(msg.panel);
        }
        break;
      }
      case "panel":
        this.setGuidePanel(msg.hotspot);
        break;
      case "pointer":
        this.updatePointer(msg.pointer);
        break;
      case "chat":
        this.appendChat(msg.from ?? "", msg.text);
        break;
      case "participants":
        this.participants = msg.count;
        this.updateHead();
        break;
      case "end":
        this.showEnded();
        break;
      default:
        break;
    }
  }

  private setGuidePanel(hotspot: string | null): void {
    if (this.opts.role !== "attendee") return;
    this.guidePanel = typeof hotspot === "string" && hotspot !== "" ? hotspot : null;
    if (this.following) this.applyGuidePanel();
  }

  /**
   * Deja abierto lo mismo que el guía. Quien se ha soltado no recibe nada
   * (lo recibe al volver a seguirle). Solo se cierra lo que se abrió por
   * seguirle: un panel que el asistente abrió por su cuenta no se le quita.
   */
  private applyGuidePanel(): void {
    const panels = this.panels;
    if (panels == null) return;
    const want = this.guidePanel;
    const open = panels.openHotspotId;
    if (want == null) {
      if (this.syncedPanel != null && open === this.syncedPanel) {
        panels.close();
        panels.closeBubble();
      }
      this.syncedPanel = null;
      return;
    }
    if (open === want) {
      this.syncedPanel = want;
      return;
    }
    // El hotspot es de la escena del guía: si aún se está cargando, se abre
    // al llegar (sceneChange)
    if (!this.hotspotInCurrentScene(want)) return;
    this.syncedPanel = want;
    this.viewer.openHotspot(want);
  }

  private hotspotInCurrentScene(id: string): boolean {
    const sceneId = this.viewer.currentSceneId();
    const scene = this.viewer.tour.scenes.find((s) => s.id === sceneId);
    return scene?.hotspots.some((h) => h.id === id) ?? false;
  }

  private startPanelSync(): void {
    const panels = this.panels;
    if (panels == null) return;
    if (this.opts.role === "guide") {
      panels.onPanelChange = (hotspot) => this.send({ type: "panel", hotspot });
      // Lo que ya estuviera abierto al conectar
      if (panels.openHotspotId != null) this.send({ type: "panel", hotspot: panels.openHotspotId });
      this.unsubs.push(() => {
        panels.onPanelChange = null;
      });
    } else {
      this.unsubs.push(
        this.viewer.on("sceneChange", () => {
          if (this.following && this.guidePanel != null) this.applyGuidePanel();
        }),
      );
    }
  }

  private startBroadcast(): void {
    this.unsubs.push(
      this.viewer.on("viewChange", (v) => {
        const now = Date.now();
        if (now - this.lastSent < 120) return;
        this.lastSent = now;
        this.send({ type: "view", scene: this.viewer.currentSceneId() ?? "", yaw: v.yaw, pitch: v.pitch, fov: v.fov });
      }),
    );
    this.unsubs.push(
      this.viewer.on("sceneChange", () => {
        const v = this.viewer.view();
        this.send({ type: "view", scene: this.viewer.currentSceneId() ?? "", yaw: v.yaw, pitch: v.pitch, fov: v.fov });
      }),
    );
    // Puntero del guia: Alt+clic marca un punto
    const onClick = (e: MouseEvent): void => {
      if (!e.altKey) return;
      const view = this.viewer.marzipanoViewer().view();
      const rect = this.container.getBoundingClientRect();
      const coords = view?.screenToCoordinates?.({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (coords != null) this.send({ type: "pointer", pointer: { yaw: coords.yaw, pitch: coords.pitch } });
    };
    this.container.addEventListener("click", onClick);
    this.unsubs.push(() => this.container.removeEventListener("click", onClick));
  }

  private mountUi(): void {
    const head = el("div", { className: "anda-live__head" });
    head.appendChild(createIconSvg("eye", 16));
    const headText = el("span", { text: this.t("live_connected"), style: "flex:1;" });
    head.appendChild(headText);
    this.msgs = el("div", { className: "anda-live__msgs", "aria-live": "polite" });
    const input = el("input", { type: "text", "aria-label": this.t("live_chat"), placeholder: this.t("live_chat") });
    const sendBtn = el("button", { className: "anda-btn", "aria-label": this.t("live_send"), style: "width:38px;height:38px;" });
    sendBtn.appendChild(createIconSvg("send", 16));
    const sendChat = (): void => {
      if (input.value.trim() === "") return;
      this.send({ type: "chat", text: input.value.trim() });
      input.value = "";
    };
    sendBtn.addEventListener("click", sendChat);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    const inputRow = el("div", { className: "anda-live__input" }, input, sendBtn);
    this.panel = el("div", { className: "anda-live" }, head, this.msgs, inputRow);

    if (this.opts.role === "attendee") {
      this.followBtn = el("button", {
        className: "anda-primary-btn",
        type: "button",
        text: this.t("live_free"),
        style: "margin:0 10px 10px;",
      });
      this.followBtn.addEventListener("click", () => {
        this.following = !this.following;
        this.followBtn!.textContent = this.following ? this.t("live_free") : this.t("live_follow");
        // Al volver a seguir, se abre (o cierra) lo que tenga el guía
        if (this.following) this.applyGuidePanel();
      });
      this.panel.insertBefore(this.followBtn, inputRow);
      const onInteract = (e: PointerEvent): void => {
        // Leer o desplazar el panel que abrió el guía, escribir en el chat o
        // cerrar una burbuja no es soltarse: solo mover la panorámica o
        // usar los mandos del visor
        if (shouldKeepFollowing(e.target)) return;
        if (this.following) {
          this.following = false;
          this.followBtn!.textContent = this.t("live_follow");
        }
      };
      this.container.addEventListener("pointerdown", onInteract);
      this.unsubs.push(() => this.container.removeEventListener("pointerdown", onInteract));
    }
    this.container.appendChild(this.panel);
    this.updateHead();

    // Reposicionar el puntero del guia en cada frame
    this.unsubs.push(this.viewer.on("viewChange", () => this.repositionPointer()));
  }

  private updateHead(): void {
    const headText = this.panel?.querySelector(".anda-live__head span");
    if (headText != null) headText.textContent = this.t("live_participants", { count: this.participants });
  }

  private pointerCoords: { yaw: number; pitch: number } | null = null;

  private updatePointer(pointer: { yaw: number; pitch: number } | null): void {
    this.pointerCoords = pointer;
    if (pointer == null) {
      this.pointerEl?.remove();
      this.pointerEl = null;
      return;
    }
    if (this.pointerEl == null) {
      this.pointerEl = el("div", { className: "anda-live-pointer", "aria-hidden": "true" });
      this.container.appendChild(this.pointerEl);
    }
    this.repositionPointer();
  }

  private repositionPointer(): void {
    if (this.pointerEl == null || this.pointerCoords == null) return;
    const view = this.viewer.marzipanoViewer().view();
    const pos = view?.coordinatesToScreen?.(this.pointerCoords);
    if (pos == null) {
      this.pointerEl.style.display = "none";
    } else {
      this.pointerEl.style.display = "";
      this.pointerEl.style.left = `${pos.x}px`;
      this.pointerEl.style.top = `${pos.y}px`;
    }
  }

  private appendChat(from: string, text: string): void {
    if (this.msgs == null) return;
    const p = el("p");
    if (from !== "") p.appendChild(el("span", { className: "who", text: `${from}: ` }));
    p.appendChild(document.createTextNode(text));
    this.msgs.appendChild(p);
    this.msgs.scrollTop = this.msgs.scrollHeight;
  }

  private showEnded(): void {
    if (this.panel != null) {
      this.appendChat("", this.t("live_ended"));
    }
  }

  disconnect(): void {
    this.closedByUser = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.ws?.close();
    this.panel?.remove();
    this.pointerEl?.remove();
  }
}

/** Zonas donde pulsar no suelta al asistente del guía. */
export const LIVE_KEEP_FOLLOWING_SELECTOR = ".anda-panel-backdrop, .anda-tooltip-bubble, .anda-live";

export function shouldKeepFollowing(target: EventTarget | null): boolean {
  const node = target as { closest?: (sel: string) => unknown } | null;
  return node?.closest?.(LIVE_KEEP_FOLLOWING_SELECTOR) != null;
}
