import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, Field, Input, useToast } from "@andarama/ui";
import { api, ApiRequestError } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { AndaLogo } from "../components/Shell";
import { CriaturaPaseo } from "../components/Criatura";

export function AuthPage({ mode }: { mode: "login" | "register" | "reset" | "invite" }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const refresh = useAuth((s) => s.refresh);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [totp, setTotp] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [ssoAvailable, setSsoAvailable] = useState(false);

  useEffect(() => {
    // El SSO esta disponible si el endpoint no devuelve 404
    void fetch("/api/v1/auth/oidc/start", { method: "HEAD" }).then((r) => setSsoAvailable(r.status !== 404));
  }, []);

  const params = new URLSearchParams(location.search);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (forgotMode) {
        await api("/auth/password/forgot", { method: "POST", body: { email } });
        toast.push(t("saved"), "ok");
        setForgotMode(false);
        return;
      }
      if (mode === "reset") {
        await api("/auth/password/reset", {
          method: "POST",
          body: { uid: params.get("uid"), token: params.get("token"), password },
        });
        toast.push(t("saved"), "ok");
        await navigate({ to: "/login" });
        return;
      }
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: { email, name, password, orgName: orgName || undefined },
        });
      } else {
        const res = await api<{ totpRequired?: boolean }>("/auth/login", {
          method: "POST",
          body: { email, password, totp: totp || undefined },
        });
        if (res.totpRequired === true) {
          setTotpRequired(true);
          setBusy(false);
          return;
        }
      }
      await refresh();
      if (mode === "invite") {
        await api("/orgs/invites/accept", {
          method: "POST",
          body: { token: params.get("token"), id: params.get("id") },
        });
        toast.push(t("saved"), "ok");
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? (err.detail ?? err.title) : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--anda-bg)] p-6">
      <div className="anda-enter flex w-full max-w-4xl overflow-hidden rounded-3xl border border-[var(--anda-border)] bg-[var(--anda-surface)] shadow-[var(--anda-relieve-alto)]">
        {/* Panel de marca: naranja plano de risografía, el grito con su
            desregistro y la criatura paseando por su suelo */}
        <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[#ff8a00] p-10 text-[#fff8ec] md:flex">
          <div className="flex items-center gap-3">
            <span className="text-[24px] font-bold tracking-tight">andarama</span>
          </div>
          <div className="relative">
            <h2
              className="-rotate-2 text-[64px] font-extrabold leading-none tracking-tight text-[#33260f]"
              style={{ textShadow: "4px 4px 0 #ffd900" }}
            >
              ¡anda!
            </h2>
            <p className="mt-4 max-w-[300px] text-[18px] font-bold leading-relaxed">
              andarama me deja <span className="rounded-md bg-[#ffd900] px-1.5 text-[#33260f]">andar</span> por panoramas
            </p>
            <p className="mt-4 max-w-[280px] text-[13.5px] leading-relaxed text-[#fff8ec]/85">
              Editor visual, publicación en un clic, realidad virtual y exportación abierta.
            </p>
          </div>
          <div>
            <CriaturaPaseo size={54} className="text-[#33260f]" />
            <p className="mt-3 font-mono text-[11px] text-[#fff8ec]/75">código abierto (EUPL-1.2)</p>
          </div>
        </div>

        {/* Formulario */}
        <div className="w-full p-8 sm:p-10 md:w-[54%]">
        <div className="mb-6 flex items-center gap-3 md:hidden">
          <AndaLogo size={34} />
          <div>
            <h1 className="text-lg font-bold leading-tight">{t("app_name")}</h1>
            <p className="text-xs text-[var(--anda-text-dim)]">¡anda! andarama me deja andar por panoramas</p>
          </div>
        </div>
        <h1 className="mb-1 hidden text-[22px] font-bold tracking-tight md:block">
          {forgotMode ? t("forgot") : mode === "register" ? t("register") : mode === "reset" ? t("password") : t("welcome_back")}
        </h1>
        <p className="mb-6 hidden text-[13.5px] text-[var(--anda-text-dim)] md:block">{t("app_name")}</p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "register" && (
            <Field label={t("name")} htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          {mode !== "reset" && (
            <Field label={t("email")} htmlFor="email">
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
          )}
          {!forgotMode && (
            <Field label={t("password")} htmlFor="password" hint={mode === "register" ? "Mínimo 10 caracteres" : undefined}>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" || mode === "reset" ? 10 : 1}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </Field>
          )}
          {mode === "register" && (
            <Field label={t("org_name")} htmlFor="orgName">
              <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
          )}
          {totpRequired && (
            <Field label={t("totp_code")} htmlFor="totp">
              <Input id="totp" inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} autoFocus />
            </Field>
          )}
          {error != null && <p className="text-sm text-[var(--anda-danger)]">{error}</p>}
          <Button type="submit" className="w-full" loading={busy}>
            {forgotMode ? t("forgot") : mode === "register" ? t("register") : mode === "reset" ? t("save") : t("login")}
          </Button>
        </form>
        {ssoAvailable && mode === "login" && (
          <a
            href="/api/v1/auth/oidc/start"
            className="mt-3 block rounded-[var(--anda-radius)] border border-[var(--anda-border)] px-4 py-2 text-center text-sm hover:bg-[var(--anda-surface-2)]"
          >
            {t("sso_login")}
          </a>
        )}
        <div className="mt-5 flex justify-between text-[13px] text-[var(--anda-text-dim)]">
          {mode === "login" ? (
            <>
              <button type="button" className="hover:underline" onClick={() => setForgotMode(!forgotMode)}>
                {t("forgot")}
              </button>
              <button type="button" className="font-semibold text-[var(--anda-primary)] hover:underline" onClick={() => void navigate({ to: "/register" })}>
                {t("register")}
              </button>
            </>
          ) : (
            <button type="button" className="font-semibold text-[var(--anda-primary)] hover:underline" onClick={() => void navigate({ to: "/login" })}>
              {t("login")}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
