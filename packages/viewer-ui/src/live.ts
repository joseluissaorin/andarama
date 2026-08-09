import type { TourViewer } from "@ull360/viewer";
import { createIconSvg } from "@ull360/viewer";
import { el } from "./dom.js";
import type { Translator } from "./i18n.js";

/**
 * Cliente de tours guiados en vivo: un guia controla escena y orientacion
 * de N asistentes via WebSocket (Durable Object en Cloudflare, ws integrado
 * en self-host). Los asistentes pueden "soltarse" y volver a sincronizar.
 * Incluye puntero del guia y chat de texto. El audio se asume en una
 * videollamada externa en paralelo (Meet/Teams), documentado en la guia.
 */

type LiveMessage =
  | { type: "hello"; role: "guide" | "attendee"; name?: string; key?: string }
  | { type: "state"; scene: string; yaw: number; pitch: number; fov: number; participants: number; pointer?: { yaw: number; pitch: number } | null }
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

  constructor(
    private viewer: TourViewer,
    private t: Translator,
    private container: HTMLElement,
    private opts: LiveOptions,
  ) {}

  connect(): void {
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener("open", () => {
      this.send({ type: "hello", role: this.opts.role, name: this.opts.name, key: this.opts.guideKey });
      this.mountUi();
      if (this.opts.role === "guide") this.startBroadcast();
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
        }
        break;
      }
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
    const head = el("div", { className: "ull360-live__head" });
    head.appendChild(createIconSvg("eye", 16));
    const headText = el("span", { text: this.t("live_connected"), style: "flex:1;" });
    head.appendChild(headText);
    this.msgs = el("div", { className: "ull360-live__msgs", "aria-live": "polite" });
    const input = el("input", { type: "text", "aria-label": this.t("live_chat"), placeholder: this.t("live_chat") });
    const sendBtn = el("button", { className: "ull360-btn", "aria-label": this.t("live_send"), style: "width:38px;height:38px;" });
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
    const inputRow = el("div", { className: "ull360-live__input" }, input, sendBtn);
    this.panel = el("div", { className: "ull360-live" }, head, this.msgs, inputRow);

    if (this.opts.role === "attendee") {
      this.followBtn = el("button", {
        className: "ull360-primary-btn",
        type: "button",
        text: this.t("live_free"),
        style: "margin:0 10px 10px;",
      });
      this.followBtn.addEventListener("click", () => {
        this.following = !this.following;
        this.followBtn!.textContent = this.following ? this.t("live_free") : this.t("live_follow");
      });
      this.panel.insertBefore(this.followBtn, inputRow);
      const onInteract = (): void => {
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
    const headText = this.panel?.querySelector(".ull360-live__head span");
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
      this.pointerEl = el("div", { className: "ull360-live-pointer", "aria-hidden": "true" });
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
