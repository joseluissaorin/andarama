import type { Projection } from "@ull360/schema";

/**
 * Proyecciones de salida (little planet estereográfica, ojo de pez, Panini,
 * arquitectónica) renderizadas con shader propio sobre una TEXTURA DE ENTORNO
 * equirectangular completa (360×180) de la escena actual, no sobre el
 * fotograma rectilíneo. Así cada proyección dispone de la esfera entera y es
 * geométricamente correcta.
 *
 * El pase vive en un canvas superpuesto con pointer-events:none: el arrastre
 * y la rueda siguen llegando al canvas de Marzipano, y el shader lee
 * yaw/pitch/fov de la vista en cada frame, de modo que la interacción
 * funciona igual con la proyección activa. La entrada/salida se funde con
 * la opacidad del canvas (uMix).
 */

const VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;   // entorno equirectangular (fila 0 = cenit)
uniform float uYaw;
uniform float uPitch;     // positivo = mirar hacia arriba (convencion Marzipano)
uniform float uFov;       // fov vertical actual (rad)
uniform float uAspect;    // ancho/alto del canvas
uniform int uMode;        // 1 littlePlanet 2 fisheye 3 panini 4 arquitectonica
uniform float uMix;       // mezcla rectilinea->proyeccion [0,1]

// Rota una direccion de camara (x dcha, y arriba, z delante) al mundo segun la vista.
vec3 camToWorld(vec3 d, float yaw, float pitch) {
  float cp = cos(pitch); float sp = sin(pitch);
  vec3 p = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(yaw); float sy = sin(yaw);
  return vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
}

vec2 dirToEquirect(vec3 d) {
  // Equirect estandar: u=0.5 en yaw 0, fila superior (v=0) = cenit.
  float u = 0.5 + atan(d.x, d.z) / 6.28318530718;
  float v = 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(u, v);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float x = ndc.x * uAspect;
  float y = ndc.y;
  // Con el entorno canonico (fila 0 = cenit) el eje vertical de pantalla
  // coincide con el de camara.
  float ys = y;
  float S = tan(uFov * 0.5);

  // Direccion rectilinea (para la mezcla de entrada/salida)
  vec3 straight = camToWorld(normalize(vec3(x * S, ys * S, 1.0)), uYaw, uPitch);

  vec3 world;
  if (uMode == 1) {
    // Little planet: estereografica desde el nadir; el arrastre gira y ladea el planeta.
    float r = length(vec2(x, y));
    float theta = 2.0 * atan(r * S * 0.9);
    // Con el eje en el nadir la quiralidad de pantalla se conserva con phi directa.
    float phi = atan(y, x);
    vec3 cam = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    world = camToWorld(cam, uYaw, 1.57079632679 + uPitch * 0.5);
  } else if (uMode == 2) {
    // Ojo de pez equidistante: theta proporcional al radio.
    float r = length(vec2(x, y));
    float theta = r * uFov * 0.75;
    float phi = atan(ys, x);
    vec3 cam = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    world = camToWorld(cam, uYaw, uPitch);
  } else if (uMode == 3) {
    // Panini (d=1): compresion cilindrica horizontal, correcta para interiores anchos.
    float hx = x * S;
    float hy = ys * S;
    float phi = 2.0 * atan(hx * 0.5);
    float tv = hy * (1.0 + cos(phi)) * 0.5;
    world = camToWorld(normalize(vec3(sin(phi), tv, cos(phi))), uYaw, uPitch);
  } else if (uMode == 4) {
    // Arquitectonica: cilindrica vertical, mantiene las verticales rectas.
    float hx = x * S;
    float vphi = clamp(ys * uFov * 0.5, -1.45, 1.45);
    world = camToWorld(normalize(vec3(hx, tan(vphi), 1.0)), uYaw, uPitch);
  } else {
    world = straight;
  }

  vec3 d = normalize(mix(straight, world, uMix));
  gl_FragColor = texture2D(uTex, dirToEquirect(d));
}
`;

const MODE_INDEX: Record<Projection, number> = {
  rectilinear: 0,
  littlePlanet: 1,
  fisheye: 2,
  pannini: 3,
  architectural: 4,
};

export interface ProjectionEnvironment {
  element: TexImageSource;
  dynamic: boolean;
}

export interface ProjectionPassOptions {
  getView: () => { yaw: number; pitch: number; fov: number } | null;
  /** Textura de entorno equirectangular de la escena actual. */
  getEnvironment: () => Promise<ProjectionEnvironment | null>;
}

const MAX_TEX = 4096;

export class ProjectionPass {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private mode: Projection = "rectilinear";
  private mix = 0;
  private targetMix = 0;
  private raf = 0;
  private active = false;
  private env: ProjectionEnvironment | null = null;
  private envLoading = false;
  private envStamp = 0;

  constructor(
    private container: HTMLElement,
    private options: ProjectionPassOptions,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;opacity:0;z-index:5;";
    this.canvas.setAttribute("aria-hidden", "true");
    container.appendChild(this.canvas);
    this.gl = this.canvas.getContext("webgl", { premultipliedAlpha: false });
    if (this.gl != null) this.setup(this.gl);
  }

  get currentProjection(): Projection {
    return this.mode;
  }

  get supported(): boolean {
    return this.gl != null;
  }

  private setup(gl: WebGLRenderingContext): void {
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`Shader: ${gl.getShaderInfoLog(sh) ?? ""}`);
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    this.program = prog;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // WRAP_S repeat permitiria el salto de yaw sin costura, pero exige potencia
    // de dos; se clampa y la costura se resuelve en el shader (atan continuo).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const name of ["uTex", "uYaw", "uPitch", "uFov", "uAspect", "uMode", "uMix"]) {
      this.uniforms[name] = gl.getUniformLocation(prog, name);
    }
  }

  /** Invalida la textura de entorno (llamar al cambiar de escena). */
  invalidateEnvironment(): void {
    this.env = null;
    this.envStamp++;
    if (this.mode !== "rectilinear") this.loadEnvironment();
  }

  private loadEnvironment(): void {
    if (this.envLoading) return;
    this.envLoading = true;
    const stamp = this.envStamp;
    void this.options
      .getEnvironment()
      .then((env) => {
        if (stamp !== this.envStamp || env == null) return;
        this.env = { element: normalizeEnvSize(env.element), dynamic: env.dynamic };
        this.uploadEnv();
      })
      .catch(() => {})
      .finally(() => {
        this.envLoading = false;
      });
  }

  private uploadEnv(): void {
    const gl = this.gl;
    if (gl == null || this.env == null) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.env.element as TexImageSource);
    } catch {
      this.env = null;
    }
  }

  setProjection(projection: Projection, animate = true): void {
    this.mode = projection;
    this.targetMix = projection === "rectilinear" ? 0 : 1;
    if (!animate) this.mix = this.targetMix;
    if (projection !== "rectilinear") {
      if (this.env == null) this.loadEnvironment();
      if (!this.active) {
        this.active = true;
        this.canvas.style.display = "block";
        this.loop();
      }
    }
  }

  private loop = (): void => {
    if (!this.active || this.gl == null || this.program == null) return;
    const gl = this.gl;
    const view = this.options.getView();
    if (view != null && this.env != null) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.min(2560, Math.round(this.container.clientWidth * dpr));
      const h = Math.round((w * this.container.clientHeight) / Math.max(1, this.container.clientWidth));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      this.mix += (this.targetMix - this.mix) * 0.14;
      if (Math.abs(this.targetMix - this.mix) < 0.004) this.mix = this.targetMix;
      this.canvas.style.opacity = String(this.mix);
      gl.useProgram(this.program);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      if (this.env.dynamic) this.uploadEnv();
      gl.uniform1i(this.uniforms.uTex ?? null, 0);
      gl.uniform1f(this.uniforms.uYaw ?? null, view.yaw);
      gl.uniform1f(this.uniforms.uPitch ?? null, view.pitch);
      gl.uniform1f(this.uniforms.uFov ?? null, Math.min(2.4, Math.max(0.3, view.fov)));
      gl.uniform1f(this.uniforms.uAspect ?? null, w / Math.max(1, h));
      gl.uniform1i(this.uniforms.uMode ?? null, MODE_INDEX[this.mode]);
      gl.uniform1f(this.uniforms.uMix ?? null, this.mix);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (this.mode === "rectilinear" && this.mix === 0) {
      this.active = false;
      this.canvas.style.display = "none";
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
    const gl = this.gl;
    if (gl != null) {
      if (this.tex != null) gl.deleteTexture(this.tex);
      if (this.buffer != null) gl.deleteBuffer(this.buffer);
      if (this.program != null) gl.deleteProgram(this.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.canvas.remove();
  }
}

/** Reduce el entorno a un tamano de textura seguro para GPUs modestas. */
function normalizeEnvSize(el: TexImageSource): TexImageSource {
  const width = (el as { width?: number }).width ?? 0;
  const height = (el as { height?: number }).height ?? 0;
  if (width <= MAX_TEX && height <= MAX_TEX) return el;
  const scale = MAX_TEX / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(el as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Intro "little planet -> normal": parametros de vista inicial extremos
 * (mirando al nadir con FOV maximo) que se animan hasta la vista objetivo.
 */
export function littlePlanetIntroParams(): { yaw: number; pitch: number; fov: number } {
  return { yaw: 0, pitch: -Math.PI / 2 + 0.02, fov: 2.9 };
}
