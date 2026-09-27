/**
 * Lo que comparten las tres herramientas: la zona de soltar, la decodificación
 * de la imagen con tope de tamaño, la descarga y el evento de Plausible.
 * Ninguna imagen sale del navegador.
 */

export interface Textos {
  error_formato: string;
  error_proporcion: string;
  error_grande: string;
  procesando: string;
}

export function textos(root: HTMLElement): Textos & Record<string, string> {
  return JSON.parse(root.dataset.textos ?? "{}");
}

export function plantilla(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m));
}

/** Evento de uso de herramienta: `plausible('herramienta', {props:{nombre}})`. */
export function contarUso(nombre: string): void {
  const w = window as unknown as { plausible?: (n: string, o?: { props?: Record<string, string> }) => void };
  w.plausible?.("herramienta", { props: { nombre } });
}

/**
 * Conecta un <input type=file> y una zona de arrastre: llama a `onFiles` con
 * los ficheros elegidos o soltados.
 */
export function zonaDeSoltar(zona: HTMLElement, input: HTMLInputElement, onFiles: (files: File[]) => void): void {
  input.addEventListener("change", () => {
    const files = Array.from(input.files ?? []);
    if (files.length > 0) onFiles(files);
    input.value = "";
  });
  const activar = (ev: DragEvent) => {
    ev.preventDefault();
    zona.classList.add("es-arrastre");
  };
  zona.addEventListener("dragenter", activar);
  zona.addEventListener("dragover", activar);
  zona.addEventListener("dragleave", () => zona.classList.remove("es-arrastre"));
  zona.addEventListener("drop", (ev) => {
    ev.preventDefault();
    zona.classList.remove("es-arrastre");
    const files = Array.from(ev.dataTransfer?.files ?? []);
    if (files.length > 0) onFiles(files);
  });
}

export interface Decodificada {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Tamaño original antes de reducir, si se redujo. */
  original?: { width: number; height: number };
}

/**
 * Decodifica un fichero de imagen, reduciéndolo si supera `maxWidth` para que
 * el navegador no se ahogue con un equirect de 16K.
 */
export async function decodificar(file: File, maxWidth: number): Promise<Decodificada> {
  if (!file.type.startsWith("image/")) throw new Error("formato");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("formato");
  }
  if (bitmap.width <= maxWidth) return { bitmap, width: bitmap.width, height: bitmap.height };
  const original = { width: bitmap.width, height: bitmap.height };
  const scale = maxWidth / bitmap.width;
  const reduced = await createImageBitmap(bitmap, { resizeWidth: maxWidth, resizeHeight: Math.round(bitmap.height * scale), resizeQuality: "high" });
  bitmap.close();
  return { bitmap: reduced, width: reduced.width, height: reduced.height, original };
}

/** Comprueba la proporción 2:1 con un margen del 2 %. */
export function esDosAUno(w: number, h: number): boolean {
  return Math.abs(w / h - 2) < 0.04;
}

export function aviso(el: HTMLElement, texto: string | null, error = false): void {
  el.textContent = texto ?? "";
  el.classList.toggle("es-error", error && texto != null);
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canvasABlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b != null ? resolve(b) : reject(new Error("toBlob"))), type);
  });
}

/** Nombre base del fichero sin extensión, para nombrar las descargas. */
export function nombreBase(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "panorama";
}

/** Cede el hilo un instante para que la barra de progreso se pinte. */
export function respirar(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
