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
    mounted = mountViewer({
      container: contenedor,
      tour,
      baseUrl: `/api/v1/projects/${projectId}/preview`,
      deepLinks: false,
      analyticsEndpoint: null,
    });

    const glCanvas = await esperarLienzoConImagen(contenedor);
    if (glCanvas == null) return null;

    // Normalizar a 1200x630 exactos: el lienzo WebGL va multiplicado por el
    // devicePixelRatio de la máquina que publica, que no es asunto de la tarjeta
    const salida = document.createElement("canvas");
    salida.width = 1200;
    salida.height = 630;
    salida.getContext("2d")!.drawImage(glCanvas, 0, 0, 1200, 630);
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

/** Espera a que el lienzo exista y tenga imagen de verdad (no negro). */
async function esperarLienzoConImagen(contenedor: HTMLElement): Promise<HTMLCanvasElement | null> {
  for (let intento = 0; intento < 20; intento++) {
    await new Promise((r) => setTimeout(r, 250));
    const canvas = contenedor.querySelector("canvas");
    if (canvas == null) continue;
    try {
      const muestra = document.createElement("canvas");
      muestra.width = 24;
      muestra.height = 24;
      const ctx = muestra.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let suma = 0;
      for (let i = 0; i < d.length; i += 4) suma += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      const media = suma / (d.length / 4);
      // Un panorama cargado casi nunca promedia por debajo de 8; el negro del
      // lienzo vacío sí. Tras media docena de intentos con algo de luz, vale.
      if (media > 8 && intento >= 4) return canvas;
      if (media > 30) return canvas;
    } catch {
      // lienzo aún no legible
    }
  }
  return contenedor.querySelector("canvas");
}
