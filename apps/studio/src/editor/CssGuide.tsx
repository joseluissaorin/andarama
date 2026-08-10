import { Button, Dialog } from "@andarama/ui";
import { useT } from "../i18n";

/**
 * Guía del CSS propio del visor.
 *
 * El campo de CSS estaba ahí sin explicar nada: quien lo abría no sabía qué
 * clases existen ni qué variables puede tocar, y acababa peleándose con el
 * inspector del navegador. Esto documenta las piezas reales y, sobre todo,
 * ofrece un prompt listo para pegar en cualquier IA, que es como se escribe
 * hoy el CSS de un tour.
 */

/** Piezas del visor que un tema propio querrá tocar. */
export const CSS_HOOKS: { selector: string; what: string }[] = [
  { selector: ".anda-viewer", what: "Contenedor del visor. Aquí viven las variables del tema." },
  { selector: ".anda-title", what: "Barra de título con el nombre del tour." },
  { selector: ".anda-controls", what: "Dique de botones (zoom, VR, pantalla completa…)." },
  { selector: ".anda-hotspot", what: "Cada marcador sobre el panorama." },
  { selector: ".anda-hotspot-label", what: "Etiqueta de texto del marcador." },
  { selector: ".anda-panel", what: "Panel de contenido (texto, imagen, galería…)." },
  { selector: ".anda-compass", what: "Brújula." },
  { selector: ".anda-thumbs", what: "Carrusel de miniaturas de escena." },
  { selector: ".anda-menu", what: "Menú de escenas." },
  { selector: ".anda-gaze", what: "Retículo de mirada del modo giroscopio." },
  { selector: ".anda-loading", what: "Indicador de carga." },
];

export const CSS_VARS: { name: string; what: string }[] = [
  { name: "--u3-primary", what: "Color de marca: botones, anillos y acentos." },
  { name: "--u3-font", what: "Familia tipográfica del visor." },
  { name: "--u3-radius", what: "Radio de las esquinas." },
  { name: "--u3-surface", what: "Fondo de los paneles y del cromo." },
  { name: "--u3-text", what: "Color del texto principal." },
  { name: "--u3-text-dim", what: "Color del texto secundario." },
];

/** Prompt listo para pegar en una IA, con el contexto real del visor. */
export function cssPrompt(base: string, primary: string): string {
  return `Eres un diseñador web que escribe CSS para el visor de tours virtuales 360 Andarama.

CONTEXTO
- El CSS se inyecta dentro del visor y solo debe afectar a lo que hay bajo .anda-viewer.
- El tema base actual es "${base}" y el color de marca es ${primary}.
- No puedes usar JavaScript, ni @import, ni fuentes externas: el tour tiene que
  seguir funcionando exportado a un ZIP sin conexión.
- El visor se ve en móvil, en escritorio y dentro de unas gafas: nada de tamaños
  fijos en píxeles para el texto ni de posiciones absolutas frágiles.

SELECTORES DISPONIBLES
${CSS_HOOKS.map((h) => `- ${h.selector}: ${h.what}`).join("\n")}

VARIABLES DEL TEMA (cámbialas en .anda-viewer para afectar a todo)
${CSS_VARS.map((v) => `- ${v.name}: ${v.what}`).join("\n")}

REGLAS
1. Prefiere cambiar variables antes que sobrescribir reglas concretas.
2. Mantén el contraste accesible (AA): el texto sobre los paneles translúcidos
   debe leerse con el panorama claro y con el panorama oscuro.
3. No ocultes controles de accesibilidad ni reduzcas el área de pulsación por
   debajo de 44x44 px.
4. Devuelve solo el CSS, sin explicaciones ni bloques de código.

ENCARGO
Describe aquí el aspecto que quieres. Por ejemplo: «cromo más sobrio, paneles
con menos desenfoque y marcadores cuadrados con borde fino».`;
}

export function CssGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactNode {
  const t = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("css_guide")}
      wide
      footer={<Button onClick={onClose}>{t("close")}</Button>}
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-[var(--anda-text-dim)]">{t("css_guide_intro")}</p>

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold">{t("css_guide_vars")}</h3>
          <div className="overflow-hidden rounded-lg border border-[var(--anda-border)]">
            {CSS_VARS.map((v) => (
              <div key={v.name} className="flex gap-3 border-b border-[var(--anda-border)] px-3 py-1.5 last:border-0">
                <code className="w-40 shrink-0 font-mono text-xs text-[var(--anda-primary)]">{v.name}</code>
                <span className="text-[var(--anda-text-dim)]">{v.what}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold">{t("css_guide_hooks")}</h3>
          <div className="overflow-hidden rounded-lg border border-[var(--anda-border)]">
            {CSS_HOOKS.map((h) => (
              <div key={h.selector} className="flex gap-3 border-b border-[var(--anda-border)] px-3 py-1.5 last:border-0">
                <code className="w-40 shrink-0 font-mono text-xs text-[var(--anda-primary)]">{h.selector}</code>
                <span className="text-[var(--anda-text-dim)]">{h.what}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold">{t("css_guide_example")}</h3>
          <pre className="overflow-x-auto rounded-lg bg-[var(--anda-surface-2)] p-3 font-mono text-xs leading-relaxed">{`.anda-viewer {
  --u3-primary: #f59e00;
  --u3-radius: 4px;
}
.anda-hotspot-label {
  letter-spacing: .02em;
  text-transform: uppercase;
}
.anda-panel {
  backdrop-filter: blur(6px);
}`}</pre>
        </section>

        <p className="rounded-lg bg-[var(--anda-surface-2)] p-3 text-xs text-[var(--anda-text-dim)]">{t("css_guide_safety")}</p>
      </div>
    </Dialog>
  );
}
