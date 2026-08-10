import { matIdentity, type Vec3 } from "./math.js";

/**
 * Capa de dibujo del modo XR: un único programa WebGL con matriz de modelo,
 * textura opcional y color plano, y las geometrías que necesita la escena
 * (esfera de entorno, esfera pequeña para los joints de la mano, cuadrilátero
 * para billboards y paneles, y segmento para el rayo de apuntado).
 *
 * Todo es WebGL 1: los visores autónomos (Quest, Pico) lo soportan siempre y
 * el paquete exportado no necesita nada más.
 */

const VS = `
attribute vec3 aPos;
attribute vec2 aUv;
varying vec2 vUv;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
void main() {
  vUv = aUv;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}`;

const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uUseTex;
uniform vec4 uColor;
uniform vec2 uUvOffset;
uniform vec2 uUvScale;
uniform float uFlipY;
void main() {
  if (uUseTex > 0.5) {
    vec2 uv = uUvOffset + vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipY)) * uUvScale;
    vec4 c = texture2D(uTex, uv);
    if (c.a < 0.02) discard;
    gl_FragColor = vec4(c.rgb, c.a * uColor.a);
  } else {
    gl_FragColor = uColor;
  }
}`;

export interface Geometry {
  pos: WebGLBuffer;
  uv: WebGLBuffer;
  index: WebGLBuffer | null;
  count: number;
  mode: number;
}

export class XrRenderer {
  readonly gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private attrPos = 0;
  private attrUv = 0;

  readonly envSphere: Geometry;
  readonly jointSphere: Geometry;
  readonly quad: Geometry;
  readonly line: Geometry;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = buildProgram(gl, VS, FS);
    gl.useProgram(this.program);
    for (const name of ["uProj", "uView", "uModel", "uTex", "uUseTex", "uColor", "uUvOffset", "uUvScale", "uFlipY"]) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }
    this.attrPos = gl.getAttribLocation(this.program, "aPos");
    this.attrUv = gl.getAttribLocation(this.program, "aUv");
    this.envSphere = buildSphere(gl, 48, 32, 50, true);
    this.jointSphere = buildSphere(gl, 10, 8, 1, false);
    this.quad = buildQuad(gl);
    this.line = buildLine(gl);
  }

  beginFrame(proj: Float32Array | number[], view: Float32Array | number[]): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.loc.uProj!, false, toF32(proj));
    gl.uniformMatrix4fv(this.loc.uView!, false, toF32(view));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  draw(
    geometry: Geometry,
    model: Float32Array | number[],
    opts: {
      texture?: WebGLTexture | null;
      color?: [number, number, number, number];
      uvOffset?: [number, number];
      uvScale?: [number, number];
      flipY?: boolean;
      depthTest?: boolean;
    } = {},
  ): void {
    const gl = this.gl;
    if (opts.depthTest === false) gl.disable(gl.DEPTH_TEST);
    else gl.enable(gl.DEPTH_TEST);
    gl.uniformMatrix4fv(this.loc.uModel!, false, toF32(model));
    const color = opts.color ?? [1, 1, 1, 1];
    gl.uniform4fv(this.loc.uColor!, color);
    gl.uniform2fv(this.loc.uUvOffset!, opts.uvOffset ?? [0, 0]);
    gl.uniform2fv(this.loc.uUvScale!, opts.uvScale ?? [1, 1]);
    gl.uniform1f(this.loc.uFlipY!, opts.flipY === true ? 1 : 0);
    if (opts.texture != null) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, opts.texture);
      gl.uniform1i(this.loc.uTex!, 0);
      gl.uniform1f(this.loc.uUseTex!, 1);
    } else {
      gl.uniform1f(this.loc.uUseTex!, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.pos);
    gl.enableVertexAttribArray(this.attrPos);
    gl.vertexAttribPointer(this.attrPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.uv);
    gl.enableVertexAttribArray(this.attrUv);
    gl.vertexAttribPointer(this.attrUv, 2, gl.FLOAT, false, 0, 0);
    if (geometry.index != null) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.index);
      gl.drawElements(geometry.mode, geometry.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(geometry.mode, 0, geometry.count);
    }
  }

  createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  upload(texture: WebGLTexture, source: TexImageSource): boolean {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return true;
    } catch {
      return false;
    }
  }

  /** Matriz de modelo de un billboard centrado en `center` y orientado al usuario. */
  billboardMatrix(center: Vec3, eye: Vec3, size: number): Float32Array {
    return billboardModelMatrix(center, eye, size);
  }

  /** Matriz de un segmento desde `from` hasta `to` (la geometría `line` va de 0 a 1 en Z). */
  segmentMatrix(from: Vec3, to: Vec3, thickness: number): Float32Array {
    const dir: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1e-6;
    const fwd = normalize(dir);
    const worldUp: Vec3 = Math.abs(fwd[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
    const right = normalize(cross(worldUp, fwd));
    const up = cross(fwd, right);
    return new Float32Array([
      right[0] * thickness, right[1] * thickness, right[2] * thickness, 0,
      up[0] * thickness, up[1] * thickness, up[2] * thickness, 0,
      fwd[0] * len, fwd[1] * len, fwd[2] * len, 0,
      from[0], from[1], from[2], 1,
    ]);
  }

  destroy(): void {
    const gl = this.gl;
    for (const g of [this.envSphere, this.jointSphere, this.quad, this.line]) {
      gl.deleteBuffer(g.pos);
      gl.deleteBuffer(g.uv);
      if (g.index != null) gl.deleteBuffer(g.index);
    }
    gl.deleteProgram(this.program);
  }
}

export { matIdentity };

function toF32(m: Float32Array | number[]): Float32Array {
  return m instanceof Float32Array ? m : new Float32Array(m);
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1e-6;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function buildProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}

/**
 * Punto de la esfera para una coordenada de textura equirectangular.
 *
 * Para verla desde dentro no basta con negar la X: eso es una **reflexión**, y
 * el panorama salía en espejo —los rótulos al revés— tanto en cartón como en
 * gafas. Hay que invertir X y Z a la vez, que es lo que coloca el centro de la
 * imagen (u = 0,5) justo al frente, mirando a −Z.
 */
/**
 * Matriz de un billboard mirando al ojo. El eje local +X debe caer a la derecha
 * de quien mira: si se invierte, los rótulos salen en espejo.
 */
export function billboardModelMatrix(center: Vec3, eye: Vec3, size: number): Float32Array {
  const fwd = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const worldUp: Vec3 = Math.abs(fwd[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  const right = normalize(cross(worldUp, fwd));
  const up = cross(fwd, right);
  return new Float32Array([
    right[0] * size, right[1] * size, right[2] * size, 0,
    up[0] * size, up[1] * size, up[2] * size, 0,
    fwd[0], fwd[1], fwd[2], 0,
    center[0], center[1], center[2], 1,
  ]);
}

export function spherePoint(u: number, v: number, radius: number, inside: boolean): [number, number, number] {
  const phi = v * Math.PI;
  const theta = u * 2 * Math.PI;
  const inward = inside ? -1 : 1;
  return [
    inward * radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    -inward * radius * Math.sin(phi) * Math.cos(theta),
  ];
}

function buildSphere(gl: WebGLRenderingContext, lonSegs: number, latSegs: number, radius: number, inside: boolean): Geometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let lat = 0; lat <= latSegs; lat++) {
    const v = lat / latSegs;
    for (let lon = 0; lon <= lonSegs; lon++) {
      const u = lon / lonSegs;
      pos.push(...spherePoint(u, v, radius, inside));
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
  return {
    pos: bufferOf(gl, gl.ARRAY_BUFFER, new Float32Array(pos)),
    uv: bufferOf(gl, gl.ARRAY_BUFFER, new Float32Array(uv)),
    index: bufferOf(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx)),
    count: idx.length,
    mode: gl.TRIANGLES,
  };
}

function buildQuad(gl: WebGLRenderingContext): Geometry {
  // Cuadrilátero de lado 1 centrado en el origen, en el plano XY.
  const pos = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const uv = new Float32Array([0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0]);
  return {
    pos: bufferOf(gl, gl.ARRAY_BUFFER, pos),
    uv: bufferOf(gl, gl.ARRAY_BUFFER, uv),
    index: null,
    count: 6,
    mode: gl.TRIANGLES,
  };
}

function buildLine(gl: WebGLRenderingContext): Geometry {
  // Prisma finísimo de 0 a 1 en Z: se ve como un rayo y funciona sin
  // extensiones de anchura de línea (lineWidth suele estar limitado a 1).
  const s = 0.5;
  const pos = new Float32Array([
    -s, 0, 0, s, 0, 0, -s, 0, 1, s, 0, 0, s, 0, 1, -s, 0, 1,
    0, -s, 0, 0, s, 0, 0, -s, 1, 0, s, 0, 0, s, 1, 0, -s, 1,
  ]);
  const uv = new Float32Array(new Array(12 * 2).fill(0.5));
  return {
    pos: bufferOf(gl, gl.ARRAY_BUFFER, pos),
    uv: bufferOf(gl, gl.ARRAY_BUFFER, uv),
    index: null,
    count: 12,
    mode: gl.TRIANGLES,
  };
}

function bufferOf(gl: WebGLRenderingContext, target: number, data: ArrayBufferView): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buf;
}
