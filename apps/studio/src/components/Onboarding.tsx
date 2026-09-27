import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@andarama/ui";
import { api } from "../api";
import { useI18nStore, useT } from "../i18n";

/**
 * Lista de primeros pasos (tablero y editor): subir una foto 360, añadir un
 * punto, publicar y compartir. El progreso lo guarda la API por usuario; si
 * aún no hay fotos propias, se ofrece la herramienta gratuita de la web.
 */

export const ONBOARDING_STEPS = ["upload", "hotspot", "publish", "share"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingData {
  steps: Record<OnboardingStep, boolean>;
  completed: boolean;
  dismissed: boolean;
  hasPhotos: boolean;
  sampleProjectId: string | null;
}

export const ONBOARDING_KEY = ["onboarding"] as const;

export function useOnboarding(): ReturnType<typeof useQuery<OnboardingData>> {
  return useQuery({ queryKey: ONBOARDING_KEY, queryFn: () => api<OnboardingData>("/me/onboarding"), staleTime: 30_000 });
}

/** Apunta un paso que no deja rastro en la base de datos (compartir). Nunca falla. */
export async function markOnboardingStep(step: OnboardingStep, queryClient?: QueryClient): Promise<void> {
  await api("/me/onboarding", { method: "POST", body: { step } }).catch(() => {});
  await queryClient?.invalidateQueries({ queryKey: ONBOARDING_KEY });
}

/** Herramientas gratuitas de andarama.com en el idioma de la web más cercano. */
const TOOLS_URL: Record<string, string> = {
  es: "https://andarama.com/herramientas/",
  en: "https://andarama.com/en/tools/",
  fr: "https://andarama.com/fr/outils/",
  it: "https://andarama.com/it/strumenti/",
  de: "https://andarama.com/de/werkzeuge/",
  pt: "https://andarama.com/pt/ferramentas/",
  ja: "https://andarama.com/ja/tools/",
};

export function toolsUrl(lang: string): string {
  return TOOLS_URL[lang.split("-")[0]!] ?? TOOLS_URL.en!;
}

export function OnboardingChecklist({ compact = false }: { compact?: boolean }): React.ReactNode {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const queryClient = useQueryClient();
  const q = useOnboarding();
  const data = q.data;
  if (data == null || data.dismissed) return null;

  const hechos = ONBOARDING_STEPS.filter((s) => data.steps[s]).length;
  const cerrar = async (): Promise<void> => {
    queryClient.setQueryData<OnboardingData>(ONBOARDING_KEY, { ...data, dismissed: true });
    await api("/me/onboarding", { method: "POST", body: { dismissed: true } }).catch(() => {});
  };

  const pasos = (
    <ol className={compact ? "flex flex-wrap items-center gap-x-4 gap-y-1" : "grid gap-2 sm:grid-cols-2"}>
      {ONBOARDING_STEPS.map((step) => {
        const hecho = data.steps[step];
        return (
          <li key={step} className={`flex items-center gap-2 text-[13px] ${hecho ? "text-[var(--anda-text-dim)]" : "font-medium"}`}>
            {hecho ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--anda-ok)]" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-[var(--anda-text-dim)]" aria-hidden="true" />
            )}
            {hecho ? <s>{t(`onboarding_${step}`)}</s> : <span>{t(`onboarding_${step}`)}</span>}
          </li>
        );
      })}
    </ol>
  );

  const sinFotos = !data.hasPhotos && !data.steps.upload && (
    <p className="text-[12.5px] text-[var(--anda-text-dim)]">
      {t("onboarding_no_photos")}{" "}
      <a href={toolsUrl(lang)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--anda-primary)] hover:underline">
        {t("onboarding_tools_link")}
      </a>
      {data.sampleProjectId != null && !compact && (
        <>
          {" · "}
          <Link
            to="/p/$projectId"
            params={{ projectId: data.sampleProjectId }}
            className="font-semibold text-[var(--anda-primary)] hover:underline"
          >
            {t("onboarding_open_sample")}
          </Link>
        </>
      )}
    </p>
  );

  if (compact) {
    return (
      <section
        aria-label={t("onboarding_title")}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--anda-border)] bg-[var(--anda-surface)] px-4 py-2"
      >
        <span className="text-[12.5px] font-semibold">
          {t("onboarding_title")} · {t("onboarding_progress", { done: hechos, total: ONBOARDING_STEPS.length })}
        </span>
        {data.completed ? <span className="text-[13px]">{t("onboarding_done")}</span> : pasos}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" aria-label={t("onboarding_dismiss")} onClick={() => void cerrar()}>
          <X className="h-4 w-4" />
        </Button>
      </section>
    );
  }

  return (
    <section className="anda-bloque mb-6 space-y-3 p-5" aria-labelledby="onboarding-title">
      <div className="flex items-center gap-3">
        <h2 id="onboarding-title" className="text-[15px] font-semibold">
          {t("onboarding_title")}
        </h2>
        <span className="font-mono text-[11px] text-[var(--anda-text-dim)]">
          {t("onboarding_progress", { done: hechos, total: ONBOARDING_STEPS.length })}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => void cerrar()}>
          {t("onboarding_dismiss")}
        </Button>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--anda-surface-2)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ONBOARDING_STEPS.length}
        aria-valuenow={hechos}
        aria-label={t("onboarding_title")}
      >
        <div className="h-full bg-[var(--anda-primary)] transition-[width]" style={{ width: `${(hechos / ONBOARDING_STEPS.length) * 100}%` }} />
      </div>
      {data.completed ? <p className="text-[13.5px] font-medium">{t("onboarding_done")}</p> : pasos}
      {sinFotos}
    </section>
  );
}
