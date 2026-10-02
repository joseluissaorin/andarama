import { useMemo, useState } from "react";
import { Bug, Sparkles } from "lucide-react";
import { Dialog } from "@andarama/ui";
import { useI18nStore, useT } from "../i18n";
import { savePrefs, useAuth } from "../stores";
import { STUDIO_VERSION } from "../version";
import {
  entradasNovedades,
  fechaMasReciente,
  guardarVistaLocal,
  hayNovedadesSinLeer,
  leerVistaLocal,
  ultimaFecha,
} from "../novedades";
import { abrirInformeProblema } from "./InformeProblema";

/**
 * Pie de la barra lateral para la beta: «Novedades» (con un punto si hay
 * entradas sin leer), «Informar de un problema» y la versión del Studio en
 * letra pequeña, para que cada informe diga qué versión se probó.
 */
export function AyudaBeta(): React.ReactNode {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const vistaCuenta = useAuth((s) => s.me?.user?.prefs?.novedadesVistas);
  const [vistaLocal, setVistaLocal] = useState(leerVistaLocal);
  const [abierto, setAbierto] = useState(false);
  const entradas = useMemo(() => entradasNovedades(lang), [lang]);
  const sinLeer = hayNovedadesSinLeer(entradas, fechaMasReciente(vistaCuenta, vistaLocal));

  const abrir = (): void => {
    setAbierto(true);
    const ultima = ultimaFecha(entradas);
    if (ultima == null || !sinLeer) return;
    guardarVistaLocal(ultima);
    setVistaLocal(ultima);
    void savePrefs({ novedadesVistas: ultima }).catch(() => {
      // Sin red: queda al menos en este navegador
    });
  };

  const fmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-3 mb-2 space-y-0.5">
      <button type="button" onClick={abrir} className="anda-nav w-full text-left">
        <span className="anda-nav__icono">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="truncate">{t("whats_new")}</span>
        {sinLeer && (
          <>
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--anda-danger)]" aria-hidden="true" />
            <span className="sr-only">{t("whats_new_unread")}</span>
          </>
        )}
      </button>
      <button type="button" onClick={abrirInformeProblema} className="anda-nav w-full text-left">
        <span className="anda-nav__icono">
          <Bug className="h-4 w-4" />
        </span>
        <span className="truncate">{t("report_problem")}</span>
      </button>
      <p className="truncate px-3 pt-1 font-mono text-[10px] text-[var(--anda-text-dim)]" title={STUDIO_VERSION}>
        {t("studio_version", { version: STUDIO_VERSION })}
      </p>
      <Dialog open={abierto} onOpenChange={setAbierto} title={t("whats_new_title")} wide>
        <div className="space-y-6">
          {entradas.map((e) => (
            <section key={`${e.fecha}-${e.titulo}`} aria-labelledby={`novedades-${e.fecha}`}>
              <h3 id={`novedades-${e.fecha}`} className="text-[14px] font-semibold">
                {e.titulo}
              </h3>
              <p className="mb-2 font-mono text-[11px] text-[var(--anda-text-dim)]">
                <time dateTime={e.fecha}>{fmt.format(new Date(`${e.fecha}T00:00:00Z`))}</time>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                {e.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
