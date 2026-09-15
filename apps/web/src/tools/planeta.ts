/**
 * Pequeño planeta: la misma proyección que enseña la biblioteca del Studio
 * (`renderLittlePlanet` de `@andarama/tiler`), aquí con giro, apertura,
 * fondo y tamaño a elegir, y descarga en PNG.
 */
import { renderLittlePlanet, PLANET_RADIUS } from "@andarama/tiler";
import { aviso, canvasABlob, contarUso, decodificar, descargarBlob, esDosAUno, nombreBase, plantilla, respirar, textos, zonaDeSoltar } from "./comun";

const MAX_WIDTH = 8192;
const PREVIEW = 640;

export function montarPlaneta(root: HTMLElement): void {
  const tx = textos(root);
  const zona = root.querySelector<HTMLElement>(".zona")!;
  const input = root.querySelector<HTMLInputElement>("input[type=file]")!;
  const avisoEl = root.querySelector<HTMLElement>(".herramienta__aviso")!;
  const lienzo = root.querySelector<HTMLElement>(".lienzo")!;
  const barra = root.querySelector<HTMLElement>(".herramienta__barra")!;
  const giro = root.querySelector<HTMLInputElement>("[data-giro]")!;
  const apertura = root.querySelector<HTMLInputElement>("[data-apertura]")!;
  const fondo = root.querySelector<HTMLSelectElement>("[data-fondo]")!;
  const tamano = root.querySelector<HTMLSelectElement>("[data-tamano]")!;
  const descargar = root.querySelector<HTMLButtonElement>("[data-descargar]")!;
  const otra = root.querySelector<HTMLButtonElement>("[data-otra]")!;

  let fuente: ImageBitmap | null = null;
  let nombre = "planeta";
  let contado = false;

  const fondoCss = (): string | null => {
    switch (fondo.value) {
      case "blanco":
        return "#ffffff";
      case "negro":
        return "#000000";
      case "papel":
        return "#f7f2e7";
      default:
        return null;
    }
  };

  const opciones = (maxSourceWidth: number) => ({
    maxSourceWidth,
    yaw: (Number(giro.value) * Math.PI) / 180,
    radius: PLANET_RADIUS * Number(apertura.value),
    background: fondoCss(),
  });

  const previsualizar = () => {
    if (fuente == null) return;
    const canvas = renderLittlePlanet(fuente, PREVIEW, opciones(1024));
    canvas.setAttribute("aria-label", nombre);
    lienzo.replaceChildren(canvas);
  };

  const abrir = async (file: File) => {
    aviso(avisoEl, tx.procesando);
    try {
      const dec = await decodificar(file, MAX_WIDTH);
      fuente?.close();
      fuente = dec.bitmap;
      nombre = nombreBase(file);
      const notas: string[] = [];
      const w = dec.original?.width ?? dec.width;
      const h = dec.original?.height ?? dec.height;
      if (!esDosAUno(w, h)) notas.push(plantilla(tx.error_proporcion, { w, h }));
      if (dec.original != null) notas.push(plantilla(tx.error_grande, { w, h, max: MAX_WIDTH }));
      aviso(avisoEl, notas.length > 0 ? notas.join(" ") : null);
      zona.classList.add("oculto");
      lienzo.classList.add("es-visible");
      barra.classList.remove("oculto");
      previsualizar();
      if (!contado) {
        contarUso("pequeno-planeta");
        contado = true;
      }
    } catch (err) {
      aviso(avisoEl, (err as Error).message === "formato" ? tx.error_formato : String(err), true);
    }
  };

  const exportar = async () => {
    if (fuente == null) return;
    descargar.disabled = true;
    aviso(avisoEl, tx.procesando);
    await respirar();
    try {
      const size = Number(tamano.value);
      const canvas = renderLittlePlanet(fuente, size, opciones(Math.min(fuente.width, size * 4)));
      const blob = await canvasABlob(canvas);
      descargarBlob(blob, `${nombre}-little-planet-${size}.png`);
      aviso(avisoEl, null);
    } finally {
      descargar.disabled = false;
    }
  };

  zonaDeSoltar(zona, input, (files) => void abrir(files[0]!));
  for (const control of [giro, apertura, fondo]) control.addEventListener("input", previsualizar);
  descargar.addEventListener("click", () => void exportar());
  otra.addEventListener("click", () => {
    fuente?.close();
    fuente = null;
    lienzo.replaceChildren();
    lienzo.classList.remove("es-visible");
    barra.classList.add("oculto");
    zona.classList.remove("oculto");
    aviso(avisoEl, null);
  });
}
