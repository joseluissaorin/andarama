/**
 * Visor 360 online: la foto elegida se monta en el visor de Andarama
 * (`@andarama/viewer-ui`) como un tour de una sola escena equirectangular.
 * El motor se carga bajo demanda, solo cuando hay una foto.
 */
import type { Tour } from "@andarama/schema";
import { aviso, contarUso, decodificar, esDosAUno, plantilla, textos, zonaDeSoltar } from "./comun";

const MAX_WIDTH = 16384;

export function montarVisor(root: HTMLElement): void {
  const tx = textos(root);
  const zona = root.querySelector<HTMLElement>(".zona")!;
  const input = root.querySelector<HTMLInputElement>("input[type=file]")!;
  const avisoEl = root.querySelector<HTMLElement>(".herramienta__aviso")!;
  const visor = root.querySelector<HTMLElement>(".visor360")!;
  const host = visor.querySelector<HTMLElement>("div")!;
  const barra = root.querySelector<HTMLElement>(".herramienta__barra")!;
  const otra = root.querySelector<HTMLButtonElement>("[data-otra]")!;
  const rvNo = root.querySelector<HTMLElement>("[data-rv-no]");

  let montado: { destroy: () => void } | null = null;
  let objectUrl: string | null = null;

  const limpiar = () => {
    montado?.destroy();
    montado = null;
    if (objectUrl != null) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    host.innerHTML = "";
    visor.classList.remove("es-visible");
    barra.classList.add("oculto");
    zona.classList.remove("oculto");
    aviso(avisoEl, null);
  };

  const abrir = async (file: File) => {
    aviso(avisoEl, tx.procesando);
    try {
      // Solo para comprobar que es una imagen y medirla: el visor la carga por URL
      const dec = await decodificar(file, MAX_WIDTH);
      const { width, height, original } = dec;
      dec.bitmap.close();
      const notas: string[] = [];
      if (!esDosAUno(original?.width ?? width, original?.height ?? height)) notas.push(plantilla(tx.error_proporcion, { w: original?.width ?? width, h: original?.height ?? height }));
      if (original != null) notas.push(plantilla(tx.error_grande, { w: original.width, h: original.height, max: MAX_WIDTH }));
      limpiar();
      aviso(avisoEl, notas.length > 0 ? notas.join(" ") : null);

      objectUrl = URL.createObjectURL(file);
      const tour: Tour = {
        version: 1,
        meta: { title: file.name, defaultLang: document.documentElement.lang || "es", langs: [document.documentElement.lang || "es"] },
        start: { scene: "foto" },
        scenes: [{ id: "foto", type: "image", title: file.name, altText: file.name, source: { kind: "equirect", url: objectUrl }, hotspots: [] }],
        ui: { titleBar: false, sceneMenu: false, thumbnails: false, share: false, help: false, langSelector: false, vr: true, fullscreen: true, gyroToggle: true, zoomControls: true },
      };
      const { mountViewer } = await import("@andarama/viewer-ui");
      zona.classList.add("oculto");
      visor.classList.add("es-visible");
      barra.classList.remove("oculto");
      montado = mountViewer({ container: host, tour, baseUrl: "", deepLinks: false, lang: document.documentElement.lang || "es" });
      contarUso("visor-360");
      if (rvNo != null) {
        const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
        const soporta = xr != null ? await xr.isSessionSupported("immersive-vr").catch(() => false) : false;
        rvNo.classList.toggle("oculto", soporta);
      }
    } catch (err) {
      limpiar();
      aviso(avisoEl, (err as Error).message === "formato" ? tx.error_formato : String(err), true);
    }
  };

  zonaDeSoltar(zona, input, (files) => void abrir(files[0]!));
  otra.addEventListener("click", limpiar);
}
