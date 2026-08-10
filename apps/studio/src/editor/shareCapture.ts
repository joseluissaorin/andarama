import { mountViewer } from "@andarama/viewer-ui";
import type { Tour } from "@andarama/schema";
import { api } from "../api";

/**
 * Captura la portada para compartir: la escena inicial **tal como se ve al
 * entrar en el tour**, con la proyección rectilínea del visor y su vista
 * inicial. Ni little planet ni el rectángulo equirectangular: lo que verá el
 * visitante en el primer segundo.
 *
 * Se monta un visor invisible de 1200x630 (la proporción de las tarjetas
 * sociales), se espera a que las teselas pinten algo y se fotografía el
 * lienzo WebGL, que conserva su búfer (`preserveDrawingBuffer`).
 */
export async function captureShareImage(projectId: string): Promise<string | null> {
  const contenedor = document.createElement("div");
  contenedor.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:630px;pointer-events:none;";
  document.body.appendChild(contenedor);
  let mounted: { destroy: () => void } | null = null;
  try {
    const { tour } = await api<{ tour: Tour }>(`/projects/${projectId}/compile`, { method: "POST", body: {} });
    if (tour.scenes.length === 0) return null;
    // Sin efecto de entrada: el little planet arranca mirando al cénit y la
    // captura salía fotografiando el techo a media animación
    const tourQuieto: Tour = { ...tour, start: { ...tour.start, intro: undefined } };
    mounted = mountViewer({
      container: contenedor,
      tour: tourQuieto,
      baseUrl: `/api/v1/projects/${projectId}/preview`,
      deepLinks: false,
      analyticsEndpoint: null,
    });

    const glCanvas = await esperarLienzoConImagen(contenedor);
    if (glCanvas == null) return null;

    // Recortar a sangre la zona con imagen. El visor puede dejar franjas
    // negras alrededor del fotograma (viewport menor que el búfer durante el
    // primer ajuste de tamaño); en vez de fiarse del búfer, se localiza el
    // rectángulo con luz y se escala a cubrir los 1200x630 de la tarjeta.
    const zona = zonaConImagen(glCanvas);
    if (zona == null) return null;
    const escala = Math.max(1200 / zona.w, 630 / zona.h);
    const srcW = 1200 / escala;
    const srcH = 630 / escala;
    const sx = zona.x + (zona.w - srcW) / 2;
    const sy = zona.y + (zona.h - srcH) / 2;
    const salida = document.createElement("canvas");
    salida.width = 1200;
    salida.height = 630;
    salida.getContext("2d")!.drawImage(glCanvas, sx, sy, srcW, srcH, 0, 0, 1200, 630);
    return salida.toDataURL("image/jpeg", 0.82);
  } catch {
    // Sin portada capturada se sigue publicando: el servidor cae a la
    // previsualización equirectangular de siempre
    return null;
  } finally {
    mounted?.destroy();
    contenedor.remove();
  }
}

/** Rectángulo del lienzo que de verdad tiene imagen (no negro), en píxeles. */
function zonaConImagen(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const MW = 120;
  const MH = 63;
  const muestra = document.createElement("canvas");
  muestra.width = MW;
  muestra.height = MH;
  const ctx = muestra.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, MW, MH);
  const d = ctx.getImageData(0, 0, MW, MH).data;
  const luz = (x: number, y: number): number => {
    const i = (y * MW + x) * 4;
    return (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
  };
  const colLuz = (x: number): number => {
    let s = 0;
    for (let y = 0; y < MH; y++) s += luz(x, y);
    return s / MH;
  };
  const filaLuz = (y: number): number => {
    let s = 0;
    for (let x = 0; x < MW; x++) s += luz(x, y);
    return s / MW;
  };
  let x0 = 0;
  while (x0 < MW && colLuz(x0) < 3) x0++;
  let x1 = MW - 1;
  while (x1 > x0 && colLuz(x1) < 3) x1--;
  let y0 = 0;
  while (y0 < MH && filaLuz(y0) < 3) y0++;
  let y1 = MH - 1;
  while (y1 > y0 && filaLuz(y1) < 3) y1--;
  // Un lienzo prácticamente entero a oscuras no es una escena: mejor sin
  // tarjeta que con una tarjeta negra
  if (x1 - x0 < MW * 0.3 || y1 - y0 < MH * 0.3) return null;
  const fx = canvas.width / MW;
  const fy = canvas.height / MH;
  return { x: x0 * fx, y: y0 * fy, w: (x1 - x0 + 1) * fx, h: (y1 - y0 + 1) * fy };
}

/**
 * Espera a que el lienzo exista y tenga imagen de verdad **hasta los bordes**.
 *
 * No basta con que haya luz en el centro: al montar, el lienzo cambia de
 * tamaño (devicePixelRatio) y el búfer conservado puede traer un fotograma
 * viejo renderizado con un viewport más pequeño, centrado sobre negro. Eso
 * salía publicado como una tarjeta con bandas negras a los lados.
 */
async function esperarLienzoConImagen(contenedor: HTMLElement): Promise<HTMLCanvasElement | null> {
  const medir = (canvas: HTMLCanvasElement): { centro: number; bordes: number } | null => {
    try {
      const muestra = document.createElement("canvas");
      muestra.width = 48;
      muestra.height = 24;
      const ctx = muestra.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0, 48, 24);
      const d = ctx.getImageData(0, 0, 48, 24).data;
      let centro = 0;
      let nCentro = 0;
      let bordes = 0;
      let nBordes = 0;
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 48; x++) {
          const i = (y * 48 + x) * 4;
          const luz = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
          // Las cuatro columnas de cada extremo son «los bordes»
          if (x < 4 || x >= 44) {
            bordes += luz;
            nBordes++;
          } else {
            centro += luz;
            nCentro++;
          }
        }
      }
      return { centro: centro / nCentro, bordes: bordes / nBordes };
    } catch {
      return null;
    }
  };

  let canvas: HTMLCanvasElement | null = null;
  for (let intento = 0; intento < 28; intento++) {
    await new Promise((r) => setTimeout(r, 250));
    canvas = contenedor.querySelector("canvas");
    if (canvas == null) continue;
    const m = medir(canvas);
    if (m == null) continue;
    // Ideal: luz hasta los bordes (fotograma a búfer completo). Si el visor
    // se queda con franjas, tras unos intentos vale con luz en el centro: el
    // recorte de zonaConImagen se encarga de las franjas.
    const listo = (m.centro > 8 && m.bordes > 3) || (m.centro > 8 && intento >= 8);
    if (listo) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return canvas;
    }
  }
  return canvas;
}
