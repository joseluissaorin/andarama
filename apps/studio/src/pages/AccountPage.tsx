import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import QRCode from "qrcode";
import { KeyRound, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, useToast } from "@andarama/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { Cabecera } from "../components/Cabecera";

export function AccountPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me, currentOrgId, refresh } = useAuth();
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [tokenDialog, setTokenDialog] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["projects:read"]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");

  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<{ id: string; name: string; scopes: string[]; lastUsedAt: number | null }[]>("/tokens"),
  });
  const members = useQuery({
    queryKey: ["members", currentOrgId],
    queryFn: () =>
      api<{ members: { userId: string; role: string; name: string; email: string }[]; invites: { id: string; email: string; role: string }[] }>(
        `/orgs/${currentOrgId}/members`,
      ),
    enabled: currentOrgId != null,
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

  const invite = async (): Promise<void> => {
    try {
      const res = await api<{ inviteUrl?: string }>(`/orgs/${currentOrgId}/members`, {
        method: "POST",
        body: { email: inviteEmail, role: inviteRole },
      });
      setInviteEmail("");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      if (res.inviteUrl != null) {
        await navigator.clipboard.writeText(res.inviteUrl).catch(() => {});
        toast.push(`${t("copied")}: ${res.inviteUrl}`, "ok");
      } else {
        toast.push(t("saved"), "ok");
      }
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const SCOPES = ["projects:read", "projects:write", "media:read", "media:write", "publish", "orgs:write", "admin"];

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <Cabecera title={me?.user?.name ?? ""} hint={me?.user?.email} />

      <section className="rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
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

      <section className="rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Users className="h-4 w-4" /> {t("members")}
          </h2>
        </div>
        <div className="mb-4 space-y-2">
          {(members.data?.members ?? []).map((m) => (
            <div key={m.userId} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate">
                {m.name} <span className="text-[var(--anda-text-dim)]">({m.email})</span>
              </span>
              <Badge>{t(`role_${m.role}`)}</Badge>
            </div>
          ))}
          {(members.data?.invites ?? []).map((i) => (
            <div key={i.id} className="flex items-center gap-3 text-sm text-[var(--anda-text-dim)]">
              <span className="flex-1 truncate">{i.email}</span>
              <Badge tone="warn">{t("invite")}</Badge>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            placeholder={t("email")}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="max-w-60"
            aria-label={t("email")}
          />
          <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="max-w-44" aria-label={t("role")}>
            {["admin", "editor", "collaborator", "reader"].map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </Select>
          <Button onClick={() => void invite()} disabled={inviteEmail === ""}>
            {t("invite")}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--anda-border)] bg-[var(--anda-surface)] p-5">
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
