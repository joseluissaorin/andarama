import { useEffect, useId, useState } from "react";
import { create } from "zustand";
import { Button, Dialog, Field, Textarea, useToast } from "@andarama/ui";
import { api } from "../api";
import { useT } from "../i18n";
import { useAuth, useEditor } from "../stores";
import { STUDIO_VERSION } from "../version";

/**
 * «Informar de un problema»: diálogo global del Studio. Lo abre la barra
 * lateral (y cualquier otra parte con `abrirInformeProblema()`); va montado
 * en la raíz para servir también dentro del editor. Adjunta solo el
 * contexto: dirección, proyecto, escena, navegador, ventana y versión.
 */

/** Tamaño máximo de la captura (el mismo límite que la API). */
export const CAPTURA_MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_CAPTURA = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const useInforme = create<{ abierto: boolean; set: (abierto: boolean) => void }>((set) => ({
  abierto: false,
  set: (abierto) => set({ abierto }),
}));

export function abrirInformeProblema(): void {
  useInforme.getState().set(true);
}

export interface ContextoInforme {
  url: string;
  projectId: string | null;
  sceneId: string | null;
  userAgent: string;
  viewport: string;
  version: string;
  lang: string;
}

/** El contexto que se adjunta a cada informe, tal como está ahora la página. */
export function contextoActual(): ContextoInforme {
  const m = /\/p\/([^/?#]+)/.exec(location.pathname);
  const projectId = m?.[1] != null ? decodeURIComponent(m[1]) : null;
  return {
    url: location.href.slice(0, 2000),
    projectId,
    sceneId: projectId != null ? useEditor.getState().selectedSceneId : null,
    userAgent: navigator.userAgent.slice(0, 500),
    viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    version: STUDIO_VERSION,
    lang: document.documentElement.lang,
  };
}

export function InformeProblemaDialog(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const conSesion = useAuth((s) => s.me?.user != null);
  const { abierto, set } = useInforme();
  const [descripcion, setDescripcion] = useState("");
  const [captura, setCaptura] = useState<File | null>(null);
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [contexto, setContexto] = useState<ContextoInforme | null>(null);
  const idDescripcion = useId();
  const idCaptura = useId();

  // El contexto se toma al abrir: es la página sobre la que se informa
  useEffect(() => {
    if (abierto) setContexto(contextoActual());
  }, [abierto]);

  if (!conSesion) return null;

  const cerrar = (): void => {
    set(false);
    setDescripcion("");
    setCaptura(null);
    setErrorCaptura(null);
  };

  const elegirCaptura = (file: File | null): void => {
    setErrorCaptura(null);
    if (file == null) {
      setCaptura(null);
      return;
    }
    if (!TIPOS_CAPTURA.includes(file.type)) {
      setErrorCaptura(t("report_screenshot_type"));
      setCaptura(null);
      return;
    }
    if (file.size > CAPTURA_MAX_BYTES) {
      setErrorCaptura(t("report_screenshot_too_big"));
      setCaptura(null);
      return;
    }
    setCaptura(file);
  };

  const enviar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (descripcion.trim() === "" || enviando) return;
    setEnviando(true);
    try {
      const data = { description: descripcion.trim(), context: contexto ?? contextoActual() };
      if (captura != null) {
        const form = new FormData();
        form.set("data", JSON.stringify(data));
        form.set("image", captura, captura.name);
        await api("/feedback", { method: "POST", body: form });
      } else {
        await api("/feedback", { method: "POST", body: data });
      }
      toast.push(t("report_sent"), "ok");
      cerrar();
    } catch (err) {
      toast.push(`${t("report_error")} ${err instanceof Error ? err.message : ""}`.trim(), "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => (v ? set(true) : cerrar())}
      title={t("report_problem")}
      description={t("report_problem_hint")}
    >
      <form className="space-y-4" onSubmit={(e) => void enviar(e)}>
        <Field label={t("report_description")} htmlFor={idDescripcion} hint={t("report_description_hint")}>
          <Textarea
            id={idDescripcion}
            required
            aria-required="true"
            rows={5}
            maxLength={5000}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Field>
        <Field label={t("report_screenshot")} htmlFor={idCaptura} hint={t("report_screenshot_hint")} error={errorCaptura ?? undefined}>
          <input
            id={idCaptura}
            type="file"
            accept={TIPOS_CAPTURA.join(",")}
            className="block w-full text-[13px] file:mr-3 file:rounded-lg file:border file:border-[var(--anda-border)] file:bg-[var(--anda-surface-2)] file:px-3 file:py-1.5 file:text-[13px]"
            onChange={(e) => elegirCaptura(e.target.files?.[0] ?? null)}
          />
        </Field>
        {contexto != null && (
          <details className="rounded-lg border border-[var(--anda-border)] px-3 py-2 text-xs text-[var(--anda-text-dim)]">
            <summary className="cursor-pointer font-medium">{t("report_context")}</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 break-all font-mono">
              <dt>URL</dt>
              <dd>{contexto.url}</dd>
              {contexto.projectId != null && (
                <>
                  <dt>{t("report_project")}</dt>
                  <dd>{contexto.projectId}</dd>
                </>
              )}
              {contexto.sceneId != null && (
                <>
                  <dt>{t("report_scene")}</dt>
                  <dd>{contexto.sceneId}</dd>
                </>
              )}
              <dt>{t("report_browser")}</dt>
              <dd>{contexto.userAgent}</dd>
              <dt>{t("report_viewport")}</dt>
              <dd>{contexto.viewport}</dd>
              <dt>{t("report_version")}</dt>
              <dd>{contexto.version}</dd>
            </dl>
          </details>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cerrar}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={enviando} disabled={descripcion.trim() === ""}>
            {t("report_send")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
