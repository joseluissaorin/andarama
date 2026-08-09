import type { AudioTrack, NarrationTrack, SceneAudio, SpatialAudioSource } from "@ull360/schema";

/**
 * Motor de audio del visor sobre Web Audio API:
 * - musica global del tour con ducking automatico durante narraciones
 * - ambiente por escena con fundido cruzado
 * - narracion por escena (con bloqueo de navegacion opcional)
 * - fuentes espaciales/posicionales con PannerNode HRTF cuyo paneo sigue la vista
 * - silencio global persistente y desbloqueo en primer gesto (politicas autoplay)
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private globalGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private globalEl: HTMLAudioElement | null = null;
  private ambientEl: HTMLAudioElement | null = null;
  private narrationEl: HTMLAudioElement | null = null;
  private spatial: { src: SpatialAudioSource; el: HTMLAudioElement; panner: PannerNode; gain: GainNode }[] = [];
  private mutedFlag: boolean;
  private unlocked = false;
  private crossfadeSec = 1;
  private narrationBlocking = false;

  onNarrationBlockChange: ((blocked: boolean) => void) | null = null;

  constructor(
    private baseUrl: string,
    private resolveUrl: (base: string, url: string) => string,
    private langProvider: () => string,
  ) {
    this.mutedFlag = typeof localStorage !== "undefined" && localStorage.getItem("ull360:muted") === "1";
  }

  /** Debe llamarse en el primer gesto del usuario para desbloquear autoplay. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.ensureCtx();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    // Reintentar reproducciones pendientes.
    if (this.globalEl != null && this.globalEl.paused && !this.mutedFlag) void this.globalEl.play().catch(() => {});
    if (this.ambientEl != null && this.ambientEl.paused && !this.mutedFlag) void this.ambientEl.play().catch(() => {});
    for (const s of this.spatial) {
      if (s.el.paused && !this.mutedFlag) void s.el.play().catch(() => {});
    }
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    try {
      localStorage.setItem("ull360:muted", muted ? "1" : "0");
    } catch {
      // almacenamiento no disponible (modo privado)
    }
    if (this.master != null) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx!.currentTime, 0.05);
    }
    for (const el of [this.globalEl, this.ambientEl, this.narrationEl]) {
      if (el != null) el.muted = muted;
    }
    for (const s of this.spatial) s.el.muted = muted;
  }

  private ensureCtx(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (this.ctx == null) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mutedFlag ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.globalGain = this.ctx.createGain();
      this.globalGain.connect(this.master);
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.connect(this.master);
    }
    return this.ctx;
  }

  private trackUrl(track: AudioTrack): string {
    const lang = this.langProvider();
    const url = track.urlByLang?.[lang] ?? track.url;
    return this.resolveUrl(this.baseUrl, url);
  }

  private createMediaElement(url: string, loop: boolean, volume: number, viaGraph: GainNode | null): HTMLAudioElement {
    const el = new Audio(url);
    el.loop = loop;
    el.crossOrigin = "anonymous";
    el.muted = this.mutedFlag;
    el.volume = viaGraph != null ? 1 : volume;
    const ctx = this.ensureCtx();
    if (ctx != null && viaGraph != null) {
      const srcNode = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = volume;
      srcNode.connect(gain);
      gain.connect(viaGraph);
    }
    return el;
  }

  setGlobalMusic(track: AudioTrack | undefined): void {
    if (this.globalEl != null) {
      this.globalEl.pause();
      this.globalEl = null;
    }
    if (track == null) return;
    this.globalEl = this.createMediaElement(this.trackUrl(track), track.loop ?? true, track.volume ?? 0.35, this.globalGain);
    void this.globalEl.play().catch(() => {});
  }

  /** Cambia el ambiente con fundido cruzado. */
  setSceneAudio(audio: SceneAudio | undefined): void {
    this.crossfadeSec = audio?.crossfade ?? 1;
    const old = this.ambientEl;
    if (old != null) {
      fadeOutAndStop(old, this.crossfadeSec);
      this.ambientEl = null;
    }
    this.stopSpatial();
    this.stopNarration();
    if (audio?.ambient != null) {
      const el = this.createMediaElement(this.trackUrl(audio.ambient), audio.ambient.loop ?? true, 0, null);
      const target = (audio.ambient.volume ?? 0.5) * 1;
      el.volume = 0;
      this.ambientEl = el;
      void el.play().then(() => fadeTo(el, target, this.crossfadeSec)).catch(() => {
        el.volume = target;
      });
    }
    if (audio?.spatial != null && audio.spatial.length > 0) {
      this.startSpatial(audio.spatial);
    }
    if (audio?.narration != null && (audio.narration.autoplay ?? true)) {
      this.playNarration(audio.narration);
    }
  }

  playNarration(narration: NarrationTrack): void {
    this.stopNarration();
    const el = this.createMediaElement(this.trackUrl(narration), false, narration.volume ?? 1, null);
    this.narrationEl = el;
    if (narration.blockNavigation === true) {
      this.narrationBlocking = true;
      this.onNarrationBlockChange?.(true);
    }
    // Ducking de musica global y ambiente durante la narracion.
    this.duck(0.15);
    el.onended = () => {
      this.duck(1);
      if (this.narrationBlocking) {
        this.narrationBlocking = false;
        this.onNarrationBlockChange?.(false);
      }
    };
    void el.play().catch(() => {
      // autoplay bloqueado: se reintentara en unlock() si procede
      this.duck(1);
      if (this.narrationBlocking) {
        this.narrationBlocking = false;
        this.onNarrationBlockChange?.(false);
      }
    });
  }

  get narrationBlocked(): boolean {
    return this.narrationBlocking;
  }

  private duck(level: number): void {
    const t = this.ctx?.currentTime ?? 0;
    this.globalGain?.gain.setTargetAtTime(level, t, 0.25);
    if (this.ambientEl != null) fadeTo(this.ambientEl, level * 0.5, 0.4);
  }

  private stopNarration(): void {
    if (this.narrationEl != null) {
      this.narrationEl.pause();
      this.narrationEl = null;
    }
    if (this.narrationBlocking) {
      this.narrationBlocking = false;
      this.onNarrationBlockChange?.(false);
    }
  }

  private buildSpatial(src: SpatialAudioSource): { src: SpatialAudioSource; el: HTMLAudioElement; panner: PannerNode; gain: GainNode } | null {
    const ctx = this.ensureCtx();
    const el = new Audio(this.resolveUrl(this.baseUrl, src.url));
    el.loop = src.loop ?? true;
    el.crossOrigin = "anonymous";
    el.muted = this.mutedFlag;
    if (ctx == null || this.master == null) {
      void el.play().catch(() => {});
      return null;
    }
    const node = ctx.createMediaElementSource(el);
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    const gain = ctx.createGain();
    gain.gain.value = src.volume ?? 0.8;
    node.connect(gain);
    gain.connect(panner);
    panner.connect(this.master);
    // Posicion fija en la esfera; el listener rota con la vista.
    const r = 3;
    panner.positionX.value = r * Math.cos(src.pitch) * Math.sin(src.yaw);
    panner.positionY.value = r * Math.sin(src.pitch);
    panner.positionZ.value = -r * Math.cos(src.pitch) * Math.cos(src.yaw);
    const entry = { src, el, panner, gain };
    this.spatial.push(entry);
    void el.play().catch(() => {});
    return entry;
  }

  private startSpatial(sources: SpatialAudioSource[]): void {
    for (const src of sources) this.buildSpatial(src);
  }

  /**
   * Fuente espacial de un hotspot de audio: clic alterna reproducir/parar.
   * Devuelve true si ha quedado sonando.
   */
  toggleSpatialHotspot(id: string, src: SpatialAudioSource): boolean {
    this.unlock();
    const existing = this.hotspotSpatial.get(id);
    if (existing != null) {
      existing.el.pause();
      try {
        existing.panner.disconnect();
      } catch {
        // ya desconectado
      }
      this.spatial = this.spatial.filter((s) => s !== existing);
      this.hotspotSpatial.delete(id);
      return false;
    }
    const entry = this.buildSpatial(src);
    if (entry != null) this.hotspotSpatial.set(id, entry);
    return true;
  }

  private hotspotSpatial = new Map<string, { src: SpatialAudioSource; el: HTMLAudioElement; panner: PannerNode; gain: GainNode }>();

  private stopSpatial(): void {
    for (const s of this.spatial) {
      s.el.pause();
      try {
        s.panner.disconnect();
      } catch {
        // ya desconectado
      }
    }
    this.spatial = [];
    this.hotspotSpatial.clear();
  }

  /** Actualiza la orientacion del listener con la vista actual. */
  updateListener(yaw: number, pitch: number): void {
    if (this.ctx == null || this.spatial.length === 0) return;
    const l = this.ctx.listener;
    const fx = Math.cos(pitch) * Math.sin(yaw);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(pitch) * Math.cos(yaw);
    if (l.forwardX != null) {
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else if ((l as any).setOrientation != null) {
      (l as any).setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  destroy(): void {
    this.stopNarration();
    this.stopSpatial();
    this.globalEl?.pause();
    this.ambientEl?.pause();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

function fadeTo(el: HTMLAudioElement, target: number, seconds: number): void {
  const start = el.volume;
  const t0 = performance.now();
  const tick = (): void => {
    const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
    el.volume = start + (target - start) * t;
    if (t < 1 && !el.paused) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function fadeOutAndStop(el: HTMLAudioElement, seconds: number): void {
  const start = el.volume;
  const t0 = performance.now();
  const tick = (): void => {
    const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
    el.volume = start * (1 - t);
    if (t < 1) requestAnimationFrame(tick);
    else el.pause();
  };
  requestAnimationFrame(tick);
}
