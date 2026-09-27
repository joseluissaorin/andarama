import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PricingTable } from "@clerk/react";
import { BadgeCheck, Home, Hourglass, Sparkles, Ticket } from "lucide-react";
import { Badge, Button, Field, Input, useToast } from "@andarama/ui";
import { api, ApiRequestError } from "../api";
import { getClerk, isClerkMode, studioPrefix } from "../clerk";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { Cabecera } from "../components/Cabecera";

interface BillingMe {
  mode: "clerk" | "local";
  plan: string | null;
  planName: string | null;
  planFromClerk: string | null;
  planOverride: string | null;
  quota: { quotaTours: number; quotaBytes: number } | null;
  capabilities: string[] | null;
  trialEndsAt: number | null;
  trialDaysLeft: number;
  instanceAdmin: boolean;
}

/** Las capacidades que se explican en la página, en el orden en que se cuentan. */
const CAPABILITIES = ["classroom", "scorm", "lti", "whiteLabel", "customDomain", "team", "invoice"] as const;

const DOCS_SELF_HOST = "https://docs.andarama.com/despliegue/docker/";

/** El plan del usuario y la tabla de precios de Clerk. */
export function PlanPage(): React.ReactNode {
  const t = useT();
  if (!isClerkMode()) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Cabecera title={t("plan_title")} hint={t("plan_self_host_hint")} />
        <SelfHostCard />
      </div>
    );
  }
  return <PlanPageClerk />;
}

function PlanPageClerk(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const refresh = useAuth((s) => s.refresh);
  const billing = useQuery({ queryKey: ["billing-me"], queryFn: () => api<BillingMe>("/billing/me") });

  // Al volver de la pasarela el token viejo aún trae el plan viejo: se pide
  // uno nuevo y se vuelve a preguntar al servidor
  useEffect(() => {
    void getClerk()
      ?.refreshToken()
      .then(() => refresh())
      .then(() => queryClient.invalidateQueries({ queryKey: ["billing-me"] }))
      .then(() => queryClient.invalidateQueries({ queryKey: ["usage"] }));
  }, [refresh, queryClient]);

  const data = billing.data;
  const tamano = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
  };
  const enPrueba = data?.plan === "prueba";
  const pruebaCaducada = data != null && data.plan == null && data.trialEndsAt != null && !data.instanceAdmin;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <Cabecera title={t("plan_title")} hint={t("plan_intro")} />

      {/* La prueba gratuita: cuánto queda y la llamada a elegir plan */}
      {data != null && (enPrueba || pruebaCaducada) && (
        <section className="anda-bloque border-[var(--anda-primary)] p-5" role="status">
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
            <Hourglass className="h-4 w-4" /> {enPrueba ? t("plan_trial_title", { days: data.trialDaysLeft }) : t("plan_trial_over_title")}
          </h2>
          <p className="mb-3 text-[13.5px] text-[var(--anda-text-dim)]">{enPrueba ? t("plan_trial_hint") : t("plan_trial_over_hint")}</p>
          <a
            href="#planes"
            className="inline-block rounded-[var(--anda-radius)] bg-[var(--anda-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            {t("plan_trial_cta")}
          </a>
        </section>
      )}

      <section className="anda-bloque p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
          <BadgeCheck className="h-4 w-4" /> {t("plan_current")}
        </h2>
        {data != null && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[22px] font-bold tracking-tight">{data.planName ?? t("plan_none")}</span>
              {data.plan != null && data.quota != null && (
                <Badge tone="ok">{t("plan_quota", { tours: data.quota.quotaTours, size: tamano(data.quota.quotaBytes) })}</Badge>
              )}
            </div>
            {data.instanceAdmin && <p className="text-[13px] text-[var(--anda-text-dim)]">{t("plan_admin_note")}</p>}
            {data.planOverride != null && <p className="text-[13px] text-[var(--anda-text-dim)]">{t("plan_override_note")}</p>}
            {data.plan == null && !data.instanceAdmin && !pruebaCaducada && <p className="text-[13.5px]">{t("plan_none_hint")}</p>}
            {data.planFromClerk != null && (
              <Button variant="outline" size="sm" onClick={() => getClerk()?.openUserProfile()}>
                {t("plan_manage")}
              </Button>
            )}
            {data.capabilities != null && !data.instanceAdmin && (
              <ul className="mt-3 grid gap-1 text-[13px] sm:grid-cols-2" aria-label={t("plan_capabilities")}>
                {CAPABILITIES.map((cap) => {
                  const incluida = data.capabilities!.includes(cap);
                  return (
                    <li key={cap} className={incluida ? "" : "text-[var(--anda-text-dim)]"}>
                      <span aria-hidden="true">{incluida ? "✓" : "–"}</span> {t(`plan_cap_${cap}`)}
                      <span className="sr-only">{incluida ? t("plan_cap_included") : t("plan_cap_not_included")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <CouponBox />

      <section id="planes" className="anda-bloque p-5">
        <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
          <Sparkles className="h-4 w-4" /> andarama.com
        </h2>
        <PricingTable for="user" newSubscriptionRedirectUrl={`${studioPrefix()}/plan`} />
        <p className="mt-4 text-[12.5px] text-[var(--anda-text-dim)]">{t("plan_currency_note")}</p>
      </section>

      <SelfHostCard />

      <p className="text-[13px] leading-relaxed text-[var(--anda-text-dim)]">{t("plan_fair_use")}</p>
    </div>
  );
}

/** Canje de un cupón: quien tiene un código no necesita pasar por la pasarela. */
function CouponBox(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useAuth((s) => s.refresh);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const redeem = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await api<{ planName: string; keptPrevious: boolean }>("/billing/coupon", {
        method: "POST",
        body: { code: code.trim() },
      });
      setCode("");
      toast.push(res.keptPrevious ? t("coupon_kept_previous") : t("coupon_ok", { plan: res.planName }), "ok");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["billing-me"] });
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
    } catch (err) {
      toast.push(err instanceof ApiRequestError ? (err.detail ?? err.title) : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="anda-bloque p-5">
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
        <Ticket className="h-4 w-4" /> {t("coupon_title")}
      </h2>
      <p className="mb-3 text-[13.5px] text-[var(--anda-text-dim)]">{t("coupon_hint")}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void redeem();
        }}
      >
        <Field label={t("coupon_code")} htmlFor="coupon-code">
          <Input
            id="coupon-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ANDA-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="w-56 font-mono uppercase"
          />
        </Field>
        <Button type="submit" loading={busy} disabled={code.trim() === ""}>
          {t("coupon_redeem")}
        </Button>
      </form>
    </section>
  );
}

function SelfHostCard(): React.ReactNode {
  const t = useT();
  return (
    <section className="anda-bloque p-5">
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
        <Home className="h-4 w-4" /> {t("plan_self_host")}
      </h2>
      <p className="mb-3 text-[13.5px] text-[var(--anda-text-dim)]">{t("plan_self_host_hint")}</p>
      <a
        href={DOCS_SELF_HOST}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-[var(--anda-radius)] border border-[var(--anda-border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--anda-surface-2)]"
      >
        {t("plan_self_host_link")}
      </a>
    </section>
  );
}
