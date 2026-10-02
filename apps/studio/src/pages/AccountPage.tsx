import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { KeyRound, Languages, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button, Dialog, Field, Input, useToast } from "@andarama/ui";
import { api } from "../api";
import { getClerk, isClerkMode } from "../clerk";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { Cabecera } from "../components/Cabecera";
import { LangPicker } from "../components/LangPicker";

export function AccountPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me, refresh } = useAuth();
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [tokenDialog, setTokenDialog] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["projects:read"]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<{ id: string; name: string; scopes: string[]; lastUsedAt: number | null }[]>("/tokens"),
  });
  const startTotp = async (): Promise<void> => {
    const res = await api<{ secret: string; uri: string }>("/auth/totp/setup", { method: "POST", body: {} });
    const qr = await QRCode.toDataURL(res.uri, { width: 220 });
    setTotpSetup({ ...res, qr });
  };

  const confirmTotp = async (): Promise<void> => {
    try {
      await api("/auth/totp/confirm", { method: "POST", body: { code: totpCode } });
      setTotpSetup(null);
      setTotpCode("");
      await refresh();
      toast.push(t("saved"), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const createToken = async (): Promise<void> => {
    const res = await api<{ token: string }>("/tokens", { method: "POST", body: { name: tokenName, scopes: tokenScopes } });
    setCreatedToken(res.token);
    setTokenName("");
    void queryClient.invalidateQueries({ queryKey: ["tokens"] });
  };

  const SCOPES = ["projects:read", "projects:write", "media:read", "media:write", "publish", "orgs:write", "admin"];

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <Cabecera title={me?.user?.name ?? ""} hint={me?.user?.email} />

      <section className="anda-bloque p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
          <Languages className="h-4 w-4" /> {t("preferences")}
        </h2>
        <Field label={t("ui_language")} htmlFor="pref-lang" hint={t("ui_language_hint")}>
          <LangPicker id="pref-lang" className="max-w-64" />
        </Field>
      </section>

      {isClerkMode() ? (
        <section className="anda-bloque p-5">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
            <ShieldCheck className="h-4 w-4" /> {t("clerk_account")}
          </h2>
          <p className="mb-3 text-[13.5px] text-[var(--anda-text-dim)]">{t("clerk_account_hint")}</p>
          <Button variant="outline" onClick={() => getClerk()?.openUserProfile()}>
            {t("clerk_manage_account")}
          </Button>
        </section>
      ) : (
      <section className="anda-bloque p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
          <ShieldCheck className="h-4 w-4" /> {t("security")}
        </h2>
        {me?.user?.totpEnabled === true ? (
          <Button
            variant="outline"
            onClick={() => {
              const password = prompt(t("password"));
              if (password != null) {
                void api("/auth/totp/disable", { method: "POST", body: { password } }).then(() => refresh());
              }
            }}
          >
            {t("disable_2fa")}
          </Button>
        ) : totpSetup == null ? (
          <Button onClick={() => void startTotp()}>{t("enable_2fa")}</Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--anda-text-dim)]">{t("totp_scan")}</p>
            <img src={totpSetup.qr} alt="Código QR TOTP" className="rounded-lg border border-[var(--anda-border)]" />
            <p className="font-mono text-xs">{totpSetup.secret}</p>
            <div className="flex gap-2">
              <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" className="max-w-36" aria-label={t("totp_code")} />
              <Button onClick={() => void confirmTotp()}>{t("save")}</Button>
            </div>
          </div>
        )}
      </section>
      )}

      {/* El equipo tiene su propia página (Equipo, en la barra lateral) */}
      <section className="anda-bloque flex flex-wrap items-center gap-3 p-5">
        <Users className="h-4 w-4" aria-hidden="true" />
        <p className="flex-1 text-[13.5px]">{t("team_moved_hint")}</p>
        <Link to="/team" className="text-[13.5px] font-semibold text-[var(--anda-primary-ink)] hover:underline">
          {t("team")}
        </Link>
      </section>

      <section className="anda-bloque p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <KeyRound className="h-4 w-4" /> {t("api_tokens")}
          </h2>
          <Button size="sm" onClick={() => setTokenDialog(true)}>
            <Plus className="h-4 w-4" /> {t("new_token")}
          </Button>
        </div>
        <div className="space-y-2">
          {(tokens.data ?? []).map((tok) => (
            <div key={tok.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate font-medium">{tok.name}</span>
              <span className="text-xs text-[var(--anda-text-dim)]">{tok.scopes.join(", ")}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("delete")}
                onClick={() => {
                  void api(`/tokens/${tok.id}`, { method: "DELETE" }).then(() =>
                    queryClient.invalidateQueries({ queryKey: ["tokens"] }),
                  );
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Dialog
        open={tokenDialog}
        onOpenChange={(o) => {
          setTokenDialog(o);
          if (!o) setCreatedToken(null);
        }}
        title={t("new_token")}
        footer={
          createdToken == null ? (
            <Button onClick={() => void createToken()} disabled={tokenName === "" || tokenScopes.length === 0}>
              {t("create")}
            </Button>
          ) : undefined
        }
      >
        {createdToken == null ? (
          <div className="space-y-4">
            <Field label={t("name")} htmlFor="tk-name">
              <Input id="tk-name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
            </Field>
            <Field label={t("scopes")}>
              <div className="grid grid-cols-2 gap-1.5">
                {SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tokenScopes.includes(scope)}
                      onChange={(e) =>
                        setTokenScopes((prev) => (e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)))
                      }
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--anda-text-dim)]">{t("token_created_note")}</p>
            <code className="block break-all rounded-lg bg-[var(--anda-surface-2)] p-3 text-xs">{createdToken}</code>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(createdToken).then(() => toast.push(t("copied"), "ok"));
              }}
            >
              {t("copy")}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
