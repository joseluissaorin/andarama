import { Link, useRouterState } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { useAuth } from "../stores";
import { trialState } from "../trial";
import { useT } from "../i18n";

/**
 * Franja fina encima de todo el Studio: cuántos días quedan de prueba o que
 * ya terminó, siempre con el camino a los planes a mano. En la propia
 * página de planes no hace falta.
 */
export function TrialBanner(): React.ReactNode {
  const t = useT();
  const me = useAuth((s) => s.me);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const state = trialState(me);
  if (state.kind === "none" || path.endsWith("/plan")) return null;
  const texto =
    state.kind === "over"
      ? t("trial_banner_over")
      : state.daysLeft <= 1
        ? t("trial_banner_last_day")
        : t("trial_banner_days", { days: state.daysLeft });
  const urgente = state.kind === "over" || state.daysLeft <= 3;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[13px] font-medium ${
        urgente
          ? "border-[var(--anda-primary)] bg-[var(--anda-primary-soft)] text-[var(--anda-text)]"
          : "border-[var(--anda-border)] bg-[var(--anda-surface-2)] text-[var(--anda-text-dim)]"
      }`}
    >
      <Hourglass className="h-4 w-4 shrink-0 text-[var(--anda-primary-ink)]" aria-hidden="true" />
      <span className="flex-1">{texto}</span>
      <Link to="/plan" className="font-semibold text-[var(--anda-primary-ink)] hover:underline">
        {t("plan_trial_cta")}
      </Link>
    </div>
  );
}

/**
 * Pantalla clara al caducar la prueba: qué sigue funcionando y qué pide plan.
 * Sale en el tablero; el editor tiene su propio aviso de solo lectura.
 */
export function TrialOverCard(): React.ReactNode {
  const t = useT();
  const me = useAuth((s) => s.me);
  if (trialState(me).kind !== "over") return null;
  return (
    <section className="anda-bloque mb-6 border-[var(--anda-primary)] p-5" aria-labelledby="trial-over-title">
      <h2 id="trial-over-title" className="mb-2 flex items-center gap-2 text-[16px] font-bold">
        <Hourglass className="h-4 w-4 text-[var(--anda-primary-ink)]" aria-hidden="true" /> {t("trial_over_title")}
      </h2>
      <ul className="mb-4 space-y-1 text-[13.5px]">
        <li>
          <span aria-hidden="true">✓</span> {t("trial_over_online")}
        </li>
        <li>
          <span aria-hidden="true">✓</span> {t("trial_over_export")}
        </li>
        <li className="text-[var(--anda-text-dim)]">
          <span aria-hidden="true">·</span> {t("trial_over_locked")}
        </li>
      </ul>
      <Link
        to="/plan"
        className="inline-block rounded-[var(--anda-radius)] bg-[var(--anda-primary)] px-4 py-2 text-sm font-semibold text-white"
      >
        {t("plan_trial_cta")}
      </Link>
    </section>
  );
}
