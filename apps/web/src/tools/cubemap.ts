/**
 * Equirectangular ↔ cubemap con Canvas 2D y la geometría de caras del tiler
 * de Andarama (`FACES`, `faceDirection`, `directionToEquirect`). Se calcula
 * cara a cara cediendo el hilo entre una y otra para que la barra avance.
 */
import { FACES, faceDirection, directionToEquirect, type Face } from "@andarama/tiler";
import { aviso, canvasABlob, contarUso, decodificar, descargarBlob, esDosAUno, nombreBase, plantilla, respirar, textos, zonaDeSoltar } from "./comun";
import { crearZip } from "./zip";

const MAX_WIDTH = 16384;

/** Nombres de fichero por convenio: Marzipano/krpano o Unity/Three.js. */
const NOMBRES: Record<string, Record<Face, string>> = {
  marzipano: { f: "f", b: "b", l: "l", r: "r", u: "u", d: "d" },
  three: { f: "pz", b: "nz", l: "nx", r: "px", u: "py", d: "ny" },
};

function leerPixeles(bitmap: ImageBitmap): { data: Uint8ClampedArray; w: number; h: number } {
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}

/** Muestreo bilineal del equirect con envoltura horizontal. */
function bilineal(src: { data: Uint8ClampedArray; w: number; h: number }, fx: number, fy: number, out: Uint8ClampedArray, o: number): void {
  const x = fx * src.w - 0.5;
  const y = fy * src.h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.max(0, Math.min(src.h - 1, Math.floor(y)));
  const y1 = Math.min(src.h - 1, y0 + 1);
  const tx = x - x0;
  const ty = Math.max(0, Math.min(1, y - y0));
  const xa = ((x0 % src.w) + src.w) % src.w;
  const xb = (xa + 1) % src.w;
  const i00 = (y0 * src.w + xa) * 4;
  const i01 = (y0 * src.w + xb) * 4;
  const i10 = (y1 * src.w + xa) * 4;
  const i11 = (y1 * src.w + xb) * 4;
  for (let c = 0; c < 3; c++) {
    const top = src.data[i00 + c]! * (1 - tx) + src.data[i01 + c]! * tx;
    const bottom = src.data[i10 + c]! * (1 - tx) + src.data[i11 + c]! * tx;
    out[o + c] = top * (1 - ty) + bottom * ty;
  }
  out[o + 3] = 255;
}

export function renderCara(src: { data: Uint8ClampedArray; w: number; h: number }, face: Face, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const out = img.data;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const [dx, dy, dz] = faceDirection(face, u, v);
      const [ex, ey] = directionToEquirect(dx, dy, dz);
      bilineal(src, ex, ey, out, (y * size + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Cara y coordenadas (u, v en [0,1]) a las que apunta una dirección. */
function direccionACara(x: number, y: number, z: number): { face: Face; u: number; v: number } {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  // Inversa de faceDirection: a = 2u-1, b = 1-2v
  let face: Face;
  let a: number;
  let b: number;
  if (az >= ax && az >= ay) {
    if (z > 0) {
      face = "f";
      a = x / z;
      b = y / z;
    } else {
      face = "b";
      a = x / z;
      b = -y / z;
    }
  } else if (ax >= ay) {
    if (x > 0) {
      face = "r";
      a = -z / x;
      b = y / x;
    } else {
      face = "l";
      a = -z / x;
      b = -y / x;
    }
  } else if (y > 0) {
    face = "u";
    a = x / y;
    b = -z / y;
  } else {
    face = "d";
    a = -x / y;
    b = -z / y;
  }
  return { face, u: (a + 1) / 2, v: (1 - b) / 2 };
}

export function renderEquirect(caras: Record<Face, { data: Uint8ClampedArray; w: number; h: number }>, width: number): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const out = img.data;
  for (let y = 0; y < height; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / height) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * 2 * Math.PI - Math.PI;
      const dx = cl * Math.sin(lon);
      const dy = sl;
      const dz = cl * Math.cos(lon);
      const { face, u, v } = direccionACara(dx, dy, dz);
      const src = caras[face];
      const o = (y * width + x) * 4;
      const fx = Math.max(0, Math.min(src.w - 1, Math.floor(u * src.w)));
      const fy = Math.max(0, Math.min(src.h - 1, Math.floor(v * src.h)));
      const i = (fy * src.w + fx) * 4;
      out[o] = src.data[i]!;
      out[o + 1] = src.data[i + 1]!;
      out[o + 2] = src.data[i + 2]!;
      out[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function montarCubemap(root: HTMLElement): void {
  const tx = textos(root);
  const modo = root.querySelectorAll<HTMLInputElement>("input[name=modo]");
  const panelCubo = root.querySelector<HTMLElement>("[data-panel=cubo]")!;
  const panelEqui = root.querySelector<HTMLElement>("[data-panel=equi]")!;
  const avisoEl = root.querySelector<HTMLElement>(".herramienta__aviso")!;
  const progreso = root.querySelector<HTMLElement>(".progreso > span")!;

  // --- equirect -> cubo ---
  const zona = panelCubo.querySelector<HTMLElement>(".zona")!;
  const input = panelCubo.querySelector<HTMLInputElement>("input[type=file]")!;
  const caras = panelCubo.querySelector<HTMLElement>(".caras")!;
  const barra = panelCubo.querySelector<HTMLElement>(".herramienta__barra")!;
  const tamano = panelCubo.querySelector<HTMLSelectElement>("[data-tamano]")!;
  const orden = panelCubo.querySelector<HTMLSelectElement>("[data-orden]")!;
  const zip = panelCubo.querySelector<HTMLButtonElement>("[data-zip]")!;
  const otra = panelCubo.querySelector<HTMLButtonElement>("[data-otra]")!;
  const etiquetas: Record<Face, string> = JSON.parse(root.dataset.caras ?? "{}");

  let fuente: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  let nombre = "panorama";
  let resultado: Partial<Record<Face, HTMLCanvasElement>> = {};

  const ajustarTamanos = (w: number) => {
    const sugerido = Math.min(4096, Math.max(256, 2 ** Math.round(Math.log2(w / 4))));
    tamano.value = String(sugerido);
    if (tamano.value !== String(sugerido)) tamano.value = "1024";
  };

  const generar = async () => {
    if (fuente == null) return;
    const size = Number(tamano.value);
    const nombres = NOMBRES[orden.value] ?? NOMBRES.marzipano!;
    resultado = {};
    caras.replaceChildren();
    caras.classList.add("es-visible");
    zip.disabled = true;
    aviso(avisoEl, tx.procesando);
    let i = 0;
    for (const face of FACES) {
      progreso.style.width = `${(i / FACES.length) * 100}%`;
      await respirar();
      const canvas = renderCara(fuente, face, size);
      resultado[face] = canvas;
      const fig = document.createElement("figure");
      const enlace = document.createElement("a");
      enlace.download = `${nombre}-${nombres![face]}.png`;
      enlace.href = "#";
      enlace.addEventListener("click", (ev) => {
        ev.preventDefault();
        void canvasABlob(canvas).then((b) => descargarBlob(b, enlace.download));
      });
      const vista = document.createElement("canvas");
      vista.width = 256;
      vista.height = 256;
      vista.getContext("2d")!.drawImage(canvas, 0, 0, 256, 256);
      enlace.appendChild(vista);
      const cap = document.createElement("figcaption");
      cap.textContent = `${nombres![face]} · ${etiquetas[face] ?? face}`;
      fig.append(enlace, cap);
      caras.appendChild(fig);
      i++;
    }
    progreso.style.width = "100%";
    aviso(avisoEl, null);
    zip.disabled = false;
    setTimeout(() => (progreso.style.width = "0"), 600);
  };

  const abrir = async (file: File) => {
    aviso(avisoEl, tx.procesando);
    try {
      const dec = await decodificar(file, MAX_WIDTH);
      const w = dec.original?.width ?? dec.width;
      const h = dec.original?.height ?? dec.height;
      const notas: string[] = [];
      if (!esDosAUno(w, h)) notas.push(plantilla(tx.error_proporcion, { w, h }));
      if (dec.original != null) notas.push(plantilla(tx.error_grande, { w, h, max: MAX_WIDTH }));
      fuente = leerPixeles(dec.bitmap);
      dec.bitmap.close();
      nombre = nombreBase(file);
      aviso(avisoEl, notas.length > 0 ? notas.join(" ") : null);
      zona.classList.add("oculto");
      barra.classList.remove("oculto");
      ajustarTamanos(fuente.w);
      contarUso("equirectangular-a-cubemap");
      await generar();
    } catch (err) {
      aviso(avisoEl, (err as Error).message === "formato" ? tx.error_formato : String(err), true);
    }
  };

  zonaDeSoltar(zona, input, (files) => void abrir(files[0]!));
  tamano.addEventListener("change", () => void generar());
  orden.addEventListener("change", () => void generar());
  zip.addEventListener("click", async () => {
    const nombres = NOMBRES[orden.value] ?? NOMBRES.marzipano!;
    const entradas = [];
    for (const face of FACES) {
      const canvas = resultado[face];
      if (canvas == null) continue;
      const blob = await canvasABlob(canvas);
      entradas.push({ nombre: `${nombre}/${nombres![face]}.png`, datos: new Uint8Array(await blob.arrayBuffer()) });
    }
    descargarBlob(crearZip(entradas), `${nombre}-cubemap.zip`);
  });
  otra.addEventListener("click", () => {
    fuente = null;
    resultado = {};
    caras.replaceChildren();
    caras.classList.remove("es-visible");
    barra.classList.add("oculto");
    zona.classList.remove("oculto");
    aviso(avisoEl, null);
  });

  // --- cubo -> equirect ---
  const entradasCara = panelEqui.querySelectorAll<HTMLInputElement>("input[type=file][data-cara]");
  const equiBarra = panelEqui.querySelector<HTMLElement>(".herramienta__barra")!;
  const equiBoton = panelEqui.querySelector<HTMLButtonElement>("[data-equi]")!;
  const equiLienzo = panelEqui.querySelector<HTMLElement>(".lienzo")!;
  const cargadas: Partial<Record<Face, { data: Uint8ClampedArray; w: number; h: number }>> = {};

  const comprobar = () => {
    const faltan = FACES.filter((f) => cargadas[f] == null);
    equiBoton.disabled = faltan.length > 0;
    aviso(avisoEl, faltan.length > 0 ? plantilla(tx.faltan, { lista: faltan.map((f) => etiquetas[f] ?? f).join(", ") }) : null);
  };

  for (const inp of entradasCara) {
    const face = inp.dataset.cara as Face;
    const zonaCara = inp.closest<HTMLElement>("label")!;
    zonaDeSoltar(zonaCara, inp, async (files) => {
      try {
        const dec = await decodificar(files[0]!, 4096);
        cargadas[face] = leerPixeles(dec.bitmap);
        const vista = zonaCara.querySelector<HTMLCanvasElement>("canvas") ?? document.createElement("canvas");
        vista.width = 128;
        vista.height = 128;
        vista.getContext("2d")!.drawImage(dec.bitmap, 0, 0, 128, 128);
        if (vista.parentElement == null) zonaCara.prepend(vista);
        dec.bitmap.close();
        comprobar();
      } catch {
        aviso(avisoEl, tx.error_formato, true);
      }
    });
  }
  equiBarra.classList.remove("oculto");
  equiBoton.disabled = true;
  equiBoton.addEventListener("click", async () => {
    if (FACES.some((f) => cargadas[f] == null)) return;
    equiBoton.disabled = true;
    aviso(avisoEl, tx.procesando);
    progreso.style.width = "50%";
    await respirar();
    const faceW = Math.max(...FACES.map((f) => cargadas[f]!.w));
    const width = Math.min(8192, faceW * 4);
    const canvas = renderEquirect(cargadas as Record<Face, { data: Uint8ClampedArray; w: number; h: number }>, width);
    equiLienzo.replaceChildren(canvas);
    equiLienzo.classList.add("es-visible");
    const blob = await canvasABlob(canvas);
    descargarBlob(blob, `equirectangular-${width}x${width / 2}.png`);
    progreso.style.width = "100%";
    aviso(avisoEl, null);
    equiBoton.disabled = false;
    contarUso("cubemap-a-equirectangular");
    setTimeout(() => (progreso.style.width = "0"), 600);
  });

  // --- cambio de modo ---
  const aplicarModo = () => {
    const activo = Array.from(modo).find((m) => m.checked)?.value ?? "cubo";
    panelCubo.classList.toggle("oculto", activo !== "cubo");
    panelEqui.classList.toggle("oculto", activo !== "equi");
    aviso(avisoEl, null);
    if (activo === "equi") comprobar();
  };
  for (const m of modo) m.addEventListener("change", aplicarModo);
  aplicarModo();
}
