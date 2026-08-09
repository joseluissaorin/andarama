import type { Projection } from "@ull360/schema";

/**
 * Proyecciones de salida adicionales (little planet estereografica, fisheye,
 * panini, arquitectonica) implementadas como pase de distorsion WebGL sobre
 * el fotograma rectilineo de Marzipano: cada pixel de salida se mapea a un
 * rayo de camara y este a coordenadas del render rectilineo de origen.
 * Mientras un modo esta activo, el visor amplia el FOV base para dar datos
 * suficientes al warp. La transicion entre proyecciones anima el parametro
 * de mezcla (uMix).
 */

const VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uSrcFov;    // fov vertical del render de origen (rad)
uniform float uAspect;    // ancho/alto
uniform int uMode;        // 0 rectilinea 1 littlePlanet 2 fisheye 3 panini 4 arquitectonica
uniform float uMix;       // mezcla rectilinea->proyeccion [0,1]

vec2 dirToSource(vec3 d) {
  // Proyecta una direccion de camara (z hacia delante) al plano rectilineo origen.
  if (d.z <= 0.001) return vec2(-10.0);
  float f = 1.0 / tan(uSrcFov * 0.5);
  vec2 p = vec2(d.x / d.z * f / uAspect, d.y / d.z * f);
  return p * 0.5 + 0.5;
}

vec3 rayFor(vec2 ndc) {
  // ndc en [-1,1]. Devuelve direccion de camara segun el modo.
  float x = ndc.x * uAspect;
  float y = ndc.y;
  if (uMode == 1) {
    // Estereografica (little planet): r = 2 f tan(theta/2)
    float r = length(vec2(x, y));
    float theta = 2.0 * atan(r * tan(uSrcFov * 0.25));
    float phi = atan(y, x);
    float s = sin(theta);
    return vec3(s * cos(phi), s * sin(phi), cos(theta));
  } else if (uMode == 2) {
    // Fisheye equidistante: theta = r * (fov/2)
    float r = length(vec2(x, y));
    float theta = r * uSrcFov * 0.55;
    float phi = atan(y, x);
    float s = sin(theta);
    return vec3(s * cos(phi), s * sin(phi), cos(theta));
  } else if (uMode == 3) {
    // Panini (d=1): compresion cilindrica horizontal.
    float d = 1.0;
    float hx = x * uSrcFov * 0.5;
    float k = hx / (d + 1.0);
    float phi = 2.0 * atan(k);
    float vy = y * uSrcFov * 0.5 * (cos(phi) + d) / (1.0 + d);
    return normalize(vec3(sin(phi), vy, cos(phi)));
  } else if (uMode == 4) {
    // Arquitectonica: rectilinea en horizontal, cilindrica en vertical
    // (mantiene las verticales rectas al mirar arriba/abajo).
    float hx = x * tan(uSrcFov * 0.5);
    float vphi = y * uSrcFov * 0.5;
    return normalize(vec3(hx, tan(vphi), 1.0));
  }
  return normalize(vec3(x * tan(uSrcFov * 0.5), y * tan(uSrcFov * 0.5), 1.0));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 warped = rayFor(ndc);
  vec3 straight = normalize(vec3(ndc.x * uAspect * tan(uSrcFov * 0.5), ndc.y * tan(uSrcFov * 0.5), 1.0));
  vec3 d = normalize(mix(straight, warped, uMix));
  vec2 uv = dirToSource(d);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0);
  } else {
    gl_FragColor = texture2D(uTex, uv);
  }
}
`;

const MODE_INDEX: Record<Projection, number> = {
  rectilinear: 0,
  littlePlanet: 1,
  fisheye: 2,
  pannini: 3,
  architectural: 4,
};

export class ProjectionPass {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private mode: Projection = "rectilinear";
  private mix = 0;
  private targetMix = 0;
  private raf = 0;
  private active = false;

  constructor(
    private container: HTMLElement,
    private sourceCanvasProvider: () => HTMLCanvasElement | null,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;z-index:5;";
    this.canvas.setAttribute("aria-hidden", "true");
    container.appendChild(this.canvas);
    this.gl = this.canvas.getContext("webgl", { premultipliedAlpha: false });
    if (this.gl != null) this.setup(this.gl);
  }

  get currentProjection(): Projection {
    return this.mode;
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
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const name of ["uTex", "uSrcFov", "uAspect", "uMode", "uMix"]) {
      this.uniforms[name] = gl.getUniformLocation(prog, name);
    }
  }

  /** FOV que debe usar la vista base mientras el warp esta activo. */
  baseFovFor(_projection: Projection): number {
    return 2.4;
  }

  get supported(): boolean {
    return this.gl != null;
  }

  setProjection(projection: Projection, animate = true): void {
    this.mode = projection;
    this.targetMix = projection === "rectilinear" ? 0 : 1;
    if (!animate) this.mix = this.targetMix;
    if (projection !== "rectilinear" && !this.active) {
      this.active = true;
      this.canvas.style.display = "block";
      this.loop();
    }
  }

  private loop = (): void => {
    if (!this.active || this.gl == null || this.program == null) return;
    const source = this.sourceCanvasProvider();
    if (source != null) {
      const gl = this.gl;
      if (this.canvas.width !== source.width || this.canvas.height !== source.height) {
        this.canvas.width = source.width;
        this.canvas.height = source.height;
        gl.viewport(0, 0, source.width, source.height);
      }
      this.mix += (this.targetMix - this.mix) * 0.12;
      if (Math.abs(this.targetMix - this.mix) < 0.005) this.mix = this.targetMix;
      gl.useProgram(this.program);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } catch {
        // canvas de origen aun sin fotograma
      }
      gl.uniform1i(this.uniforms.uTex ?? null, 0);
      gl.uniform1f(this.uniforms.uSrcFov ?? null, 2.4);
      gl.uniform1f(this.uniforms.uAspect ?? null, source.width / Math.max(1, source.height));
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
    this.canvas.remove();
  }
}

/**
 * Intro "little planet -> normal": parametros de vista inicial extremos
 * (mirando al nadir con FOV maximo) que se animan hasta la vista objetivo.
 * Se usa junto al efecto estereografico del ProjectionPass para el arranque.
 */
export function littlePlanetIntroParams(): { yaw: number; pitch: number; fov: number } {
  return { yaw: 0, pitch: -Math.PI / 2 + 0.02, fov: 2.9 };
}
