/**
 * Modo VR: sesion inmersiva WebXR para visores (Quest, Pico...) y modo
 * cardboard (estereo side-by-side + giroscopio) para moviles sin WebXR.
 * Renderer WebGL propio minimo: esfera equirectangular (imagen, canvas o
 * video) + hotspots de navegacion como billboards con seleccion por mirada
 * (temporizador) y por mandos (select). Sin dependencias de servidor: los
 * tours exportados conservan el modo VR.
 */

export interface VrHotspot {
  id: string;
  yaw: number;
  pitch: number;
  label: string;
  target: string;
}

export interface VrEnvironment {
  /** Imagen/lienzo/video equirectangular a proyectar. */
  element: TexImageSource & { videoWidth?: number };
  /** Layout estereo del contenido. */
  stereo: "mono" | "tb" | "sbs";
  /** true si es video (retexturizar cada frame). */
  dynamic: boolean;
}

export interface VrCallbacks {
  getEnvironment(): Promise<VrEnvironment>;
  getHotspots(): VrHotspot[];
  onNavigate(target: string): Promise<void>;
  onExit(): void;
  getViewYawPitch(): { yaw: number; pitch: number };
}

const GAZE_ANGLE = 0.22;
const GAZE_TIME_MS = 1600;

const SPHERE_VS = `
attribute vec3 aPos; attribute vec2 aUv; varying vec2 vUv;
uniform mat4 uProj; uniform mat4 uView;
void main(){ vUv = aUv; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;

const SPHERE_FS = `
precision mediump float; varying vec2 vUv; uniform sampler2D uTex;
uniform vec2 uUvOffset; uniform vec2 uUvScale;
void main(){ gl_FragColor = texture2D(uTex, uUvOffset + vUv * uUvScale); }`;

const QUAD_VS = `
attribute vec2 aPos; varying vec2 vUv;
uniform mat4 uProj; uniform mat4 uView; uniform vec3 uCenter; uniform float uSize;
void main(){
  vUv = aPos * 0.5 + 0.5;
  // billboard orientado al origen
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 fwd = normalize(-uCenter);
  vec3 right = normalize(cross(up, fwd));
  vec3 up2 = cross(fwd, right);
  vec3 world = uCenter + (right * aPos.x + up2 * aPos.y) * uSize;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const QUAD_FS = `
precision mediump float; varying vec2 vUv; uniform sampler2D uTex;
void main(){ vec4 c = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)); if (c.a < 0.01) discard; gl_FragColor = c; }`;

export class VRManager {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private xrSession: any = null;
  private mode: "xr" | "cardboard" | null = null;
  private sphereProgram: WebGLProgram | null = null;
  private quadProgram: WebGLProgram | null = null;
  private sphereBuffers: { pos: WebGLBuffer; uv: WebGLBuffer; idx: WebGLBuffer; count: number } | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private envTex: WebGLTexture | null = null;
  private env: VrEnvironment | null = null;
  private hotspotTex = new Map<string, { tex: WebGLTexture; gazeStart: number | null }>();
  private raf = 0;
  private cardboardYawPitch = { yaw: 0, pitch: 0 };
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private exitButton: HTMLButtonElement | null = null;
  private navigating = false;

  onChange: ((active: boolean, mode: "xr" | "cardboard" | null) => void) | null = null;

  constructor(
    private container: HTMLElement,
    private callbacks: VrCallbacks,
  ) {}

  static async xrSupported(): Promise<boolean> {
    const xr = (navigator as any).xr;
    if (xr == null) return false;
    try {
      return await xr.isSessionSupported("immersive-vr");
    } catch {
      return false;
    }
  }

  get active(): boolean {
    return this.mode != null;
  }

  async enter(): Promise<void> {
    if (this.mode != null) return;
    if (await VRManager.xrSupported()) {
      await this.enterXr();
    } else {
      await this.enterCardboard();
    }
  }

  private setupGl(xrCompatible: boolean): WebGLRenderingContext {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:40;background:#000;";
    this.container.appendChild(this.canvas);
    const gl = this.canvas.getContext("webgl", {
      xrCompatible,
      antialias: true,
    } as WebGLContextAttributes) as WebGLRenderingContext;
    this.gl = gl;
    this.sphereProgram = buildProgram(gl, SPHERE_VS, SPHERE_FS);
    this.quadProgram = buildProgram(gl, QUAD_VS, QUAD_FS);
    this.sphereBuffers = buildSphere(gl, 40, 28);
    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    this.envTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.envTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return gl;
  }

  async refreshEnvironment(): Promise<void> {
    if (this.gl == null) return;
    this.env = await this.callbacks.getEnvironment();
    this.uploadEnv();
    this.hotspotTex.clear();
  }

  private uploadEnv(): void {
    const gl = this.gl;
    if (gl == null || this.env == null) return;
    gl.bindTexture(gl.TEXTURE_2D, this.envTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.env.element as TexImageSource);
    } catch {
      // frame de video aun no disponible
    }
  }

  private async enterXr(): Promise<void> {
    const xr = (navigator as any).xr;
    const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    this.xrSession = session;
    this.mode = "xr";
    const gl = this.setupGl(true);
    await (gl as any).makeXRCompatible?.();
    const layer = new (window as any).XRWebGLLayer(session, gl);
    session.updateRenderState({ baseLayer: layer });
    const refSpace = await session.requestReferenceSpace("local");
    await this.refreshEnvironment();
    this.onChange?.(true, "xr");

    session.addEventListener("select", () => {
      const gazed = this.currentGazeTarget();
      if (gazed != null) void this.navigate(gazed.target);
    });
    session.addEventListener("end", () => this.teardown());

    const onFrame = (_t: number, frame: any): void => {
      if (this.xrSession == null) return;
      session.requestAnimationFrame(onFrame);
      const pose = frame.getViewerPose(refSpace);
      if (pose == null) return;
      const glLayer = session.renderState.baseLayer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (this.env?.dynamic === true) this.uploadEnv();
      let eyeIndex = 0;
      for (const view of pose.views) {
        const vp = glLayer.getViewport(view);
        gl.viewport(vp.x, vp.y, vp.width, vp.height);
        this.drawScene(view.projectionMatrix, view.transform.inverse.matrix, eyeIndex);
        eyeIndex++;
      }
      // Seleccion por mirada con la orientacion del pose.
      const fwd = forwardFromMatrix(pose.views[0].transform.matrix);
      this.updateGaze(fwd);
    };
    session.requestAnimationFrame(onFrame);
  }

  private async enterCardboard(): Promise<void> {
    this.mode = "cardboard";
    const gl = this.setupGl(false);
    await this.refreshEnvironment();
    try {
      await this.container.requestFullscreen?.();
      await (screen.orientation as any)?.lock?.("landscape").catch(() => {});
    } catch {
      // fullscreen no disponible
    }
    this.exitButton = document.createElement("button");
    this.exitButton.textContent = "Salir de VR";
    this.exitButton.setAttribute("aria-label", "Salir del modo VR");
    this.exitButton.style.cssText =
      "position:absolute;top:12px;right:12px;z-index:41;background:rgba(0,0,0,.6);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:8px 14px;font:14px system-ui;cursor:pointer;";
    this.exitButton.addEventListener("click", () => this.exit());
    this.container.appendChild(this.exitButton);

    const initial = this.callbacks.getViewYawPitch();
    this.cardboardYawPitch = { ...initial };
    let last: { yaw: number; pitch: number } | null = null;
    this.orientationHandler = (e: DeviceOrientationEvent): void => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const yaw = (-e.alpha * Math.PI) / 180;
      const pitch = ((e.beta - 90) * Math.PI) / 180;
      if (last != null) {
        this.cardboardYawPitch.yaw += yaw - last.yaw;
        this.cardboardYawPitch.pitch = Math.max(-1.4, Math.min(1.4, this.cardboardYawPitch.pitch + (pitch - last.pitch)));
      }
      last = { yaw, pitch };
    };
    window.addEventListener("deviceorientation", this.orientationHandler);
    this.onChange?.(true, "cardboard");

    const loop = (): void => {
      if (this.mode !== "cardboard" || this.gl == null || this.canvas == null) return;
      this.raf = requestAnimationFrame(loop);
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = this.container.clientWidth * dpr;
      const h = this.container.clientHeight * dpr;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      if (this.env?.dynamic === true) this.uploadEnv();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const proj = perspective(1.05, w / 2 / h, 0.1, 100);
      const { yaw, pitch } = this.cardboardYawPitch;
      const viewM = viewMatrix(yaw, pitch);
      gl.viewport(0, 0, w / 2, h);
      this.drawScene(proj, viewM, 0);
      gl.viewport(w / 2, 0, w / 2, h);
      this.drawScene(proj, viewM, 1);
      this.updateGaze(dirFromYawPitch(yaw, pitch));
    };
    loop();
  }

  private drawScene(proj: Float32Array | number[], view: Float32Array | number[], eyeIndex: number): void {
    const gl = this.gl!;
    // Esfera
    gl.useProgram(this.sphereProgram);
    gl.disable(gl.DEPTH_TEST);
    const sp = this.sphereProgram!;
    bindMat4(gl, sp, "uProj", proj);
    bindMat4(gl, sp, "uView", view);
    let uvOffset: [number, number] = [0, 0];
    let uvScale: [number, number] = [1, 1];
    if (this.env?.stereo === "tb") {
      uvScale = [1, 0.5];
      uvOffset = eyeIndex === 0 ? [0, 0] : [0, 0.5];
    } else if (this.env?.stereo === "sbs") {
      uvScale = [0.5, 1];
      uvOffset = eyeIndex === 0 ? [0, 0] : [0.5, 0];
    }
    gl.uniform2fv(gl.getUniformLocation(sp, "uUvOffset"), uvOffset);
    gl.uniform2fv(gl.getUniformLocation(sp, "uUvScale"), uvScale);
    gl.bindTexture(gl.TEXTURE_2D, this.envTex);
    const b = this.sphereBuffers!;
    const posLoc = gl.getAttribLocation(sp, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    const uvLoc = gl.getAttribLocation(sp, "aUv");
    gl.bindBuffer(gl.ARRAY_BUFFER, b.uv);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
    gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);

    // Hotspots de navegacion (billboards agrandados para VR)
    gl.useProgram(this.quadProgram);
    const qp = this.quadProgram!;
    bindMat4(gl, qp, "uProj", proj);
    bindMat4(gl, qp, "uView", view);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const qLoc = gl.getAttribLocation(qp, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(qLoc);
    gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);
    for (const hs of this.callbacks.getHotspots()) {
      const entry = this.hotspotTexFor(hs);
      const dir = dirFromYawPitch(hs.yaw, hs.pitch);
      gl.uniform3f(gl.getUniformLocation(qp, "uCenter"), dir[0] * 6, dir[1] * 6, dir[2] * 6);
      gl.uniform1f(gl.getUniformLocation(qp, "uSize"), 0.9);
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.BLEND);
  }

  private hotspotTexFor(hs: VrHotspot): { tex: WebGLTexture; gazeStart: number | null } {
    let entry = this.hotspotTex.get(hs.id);
    if (entry == null) {
      const tex = this.gl!.createTexture()!;
      entry = { tex, gazeStart: null };
      this.hotspotTex.set(hs.id, entry);
      this.renderHotspotTexture(hs, 0);
    }
    return entry;
  }

  private renderHotspotTexture(hs: VrHotspot, progress: number): void {
    const gl = this.gl!;
    const entry = this.hotspotTex.get(hs.id);
    if (entry == null) return;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 256);
    ctx.beginPath();
    ctx.arc(128, 108, 64, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10, 20, 35, 0.75)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.stroke();
    if (progress > 0) {
      ctx.beginPath();
      ctx.arc(128, 108, 76, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#4fc3f7";
      ctx.stroke();
    }
    // Flecha de navegacion (SVG path equivalente a lucide arrow-up)
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(128, 140);
    ctx.lineTo(128, 76);
    ctx.moveTo(96, 106);
    ctx.lineTo(128, 74);
    ctx.lineTo(160, 106);
    ctx.stroke();
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(hs.label.slice(0, 22), 128, 218);
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private currentGazeTarget(): VrHotspot | null {
    for (const hs of this.callbacks.getHotspots()) {
      const entry = this.hotspotTex.get(hs.id);
      if (entry?.gazeStart != null) return hs;
    }
    return null;
  }

  private updateGaze(forward: [number, number, number]): void {
    const now = performance.now();
    for (const hs of this.callbacks.getHotspots()) {
      const entry = this.hotspotTexFor(hs);
      const dir = dirFromYawPitch(hs.yaw, hs.pitch);
      const dot = forward[0] * dir[0] + forward[1] * dir[1] + forward[2] * dir[2];
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle < GAZE_ANGLE) {
        if (entry.gazeStart == null) entry.gazeStart = now;
        const progress = Math.min(1, (now - entry.gazeStart) / GAZE_TIME_MS);
        this.renderHotspotTexture(hs, progress);
        if (progress >= 1) {
          entry.gazeStart = null;
          void this.navigate(hs.target);
        }
      } else if (entry.gazeStart != null) {
        entry.gazeStart = null;
        this.renderHotspotTexture(hs, 0);
      }
    }
  }

  private async navigate(target: string): Promise<void> {
    if (this.navigating) return;
    this.navigating = true;
    try {
      await this.callbacks.onNavigate(target);
      await this.refreshEnvironment();
    } finally {
      this.navigating = false;
    }
  }

  exit(): void {
    if (this.xrSession != null) {
      void this.xrSession.end().catch(() => {});
      // teardown lo dispara el evento "end"
      return;
    }
    this.teardown();
  }

  private teardown(): void {
    this.xrSession = null;
    cancelAnimationFrame(this.raf);
    if (this.orientationHandler != null) {
      window.removeEventListener("deviceorientation", this.orientationHandler);
      this.orientationHandler = null;
    }
    this.exitButton?.remove();
    this.exitButton = null;
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    this.hotspotTex.clear();
    if (document.fullscreenElement != null) void document.exitFullscreen().catch(() => {});
    const wasActive = this.mode != null;
    this.mode = null;
    if (wasActive) {
      this.onChange?.(false, null);
      this.callbacks.onExit();
    }
  }

  destroy(): void {
    this.exit();
  }
}

// --- utilidades de matrices/geometria (columna-mayor, convenio WebGL) ---

function buildProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    }
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

function buildSphere(gl: WebGLRenderingContext, lonSegs: number, latSegs: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const R = 50;
  for (let lat = 0; lat <= latSegs; lat++) {
    const v = lat / latSegs;
    const phi = v * Math.PI;
    for (let lon = 0; lon <= lonSegs; lon++) {
      const u = lon / lonSegs;
      const theta = u * 2 * Math.PI;
      // Interior de la esfera: x = -sin(phi)sin(theta) para orientar el este correctamente
      pos.push(-R * Math.sin(phi) * Math.sin(theta), R * Math.cos(phi), -R * Math.sin(phi) * Math.cos(theta));
      uv.push(u, v);
    }
  }
  for (let lat = 0; lat < latSegs; lat++) {
    for (let lon = 0; lon < lonSegs; lon++) {
      const a = lat * (lonSegs + 1) + lon;
      const b = a + lonSegs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const posBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  const uvBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  const idxBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return { pos: posBuf, uv: uvBuf, idx: idxBuf, count: idx.length };
}

function bindMat4(gl: WebGLRenderingContext, program: WebGLProgram, name: string, m: Float32Array | number[]): void {
  gl.uniformMatrix4fv(gl.getUniformLocation(program, name), false, m instanceof Float32Array ? m : new Float32Array(m));
}

function perspective(fovY: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function viewMatrix(yaw: number, pitch: number): number[] {
  // R = Rx(-pitch) * Ry(-yaw) aplicado a la camara en el origen.
  const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
  const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
  // columna-mayor
  return [cy, sy * sp, -sy * cp, 0, 0, cp, sp, 0, sy, -cy * sp, cy * cp, 0, 0, 0, 0, 1];
}

function dirFromYawPitch(yaw: number, pitch: number): [number, number, number] {
  return [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
}

function forwardFromMatrix(m: Float32Array | number[]): [number, number, number] {
  // Tercera columna negada de la matriz de transform (forward -z).
  return [-m[8]!, -m[9]!, -m[10]!];
}
