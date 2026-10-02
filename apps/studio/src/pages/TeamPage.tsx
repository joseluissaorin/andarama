import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, Users } from "lucide-react";
import { Badge, Button, Field, HelpTip, Input, Select, useToast } from "@andarama/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { Cabecera } from "../components/Cabecera";

export const ORG_ROLES = ["admin", "editor", "collaborator", "reader"] as const;

interface MembersResponse {
  members: { userId: string; role: string; name: string; email: string }[];
  invites: { id: string; email: string; role: string }[];
}

/**
 * El equipo de la organización. Antes vivía escondido en la página de la
 * cuenta, con el nombre de la persona como enlace: nadie lo encontraba.
 * El trabajo en equipo está en todos los planes.
 */
export function TeamPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me, currentOrgId } = useAuth();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const org = me?.orgs.find((o) => o.id === currentOrgId);
  const isAdmin = org?.role === "admin" || me?.user?.roleGlobal === "admin";

  const members = useQuery({
    queryKey: ["members", currentOrgId],
    queryFn: () => api<MembersResponse>(`/orgs/${currentOrgId}/members`),
    enabled: currentOrgId != null,
  });

  const fail = (err: unknown): void => {
    toast.push(String(err instanceof Error ? err.message : err), "error");
  };

  const invite = async (): Promise<void> => {
    try {
      const res = await api<{ inviteUrl?: string; added?: boolean }>(`/orgs/${currentOrgId}/members`, {
        method: "POST",
        body: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      if (res.inviteUrl != null) {
        // Sin correo configurado (self-host): el enlace se copia para mandarlo a mano
        await navigator.clipboard.writeText(res.inviteUrl).catch(() => {});
        toast.push(`${t("copied")}: ${res.inviteUrl}`, "ok");
      } else {
        toast.push(res.added === true ? t("team_added") : t("team_invited"), "ok");
      }
    } catch (err) {
      fail(err);
    }
  };

  const changeRole = async (userId: string, role: string): Promise<void> => {
    try {
      await api(`/orgs/${currentOrgId}/members/${userId}`, { method: "PATCH", body: { role } });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      toast.push(t("saved"), "ok");
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (userId: string, name: string): Promise<void> => {
    if (!confirm(t("team_remove_confirm", { name }))) return;
    try {
      await api(`/orgs/${currentOrgId}/members/${userId}`, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <Cabecera title={t("team")} hint={t("team_hint", { org: org?.name ?? "" })} />

      <section id="equipo" className="anda-bloque p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Users className="h-4 w-4" /> {t("members")}
          </h2>
          <HelpTip text={t("team_roles_help")} label={t("role")} />
        </div>
        <div className="mb-4 space-y-2">
          {(members.data?.members ?? []).map((m) => (
            <div key={m.userId} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.name} <span className="text-[var(--anda-text-dim)]">({m.email})</span>
              </span>
              {isAdmin ? (
                <>
                  <Select
                    value={m.role}
                    onChange={(e) => void changeRole(m.userId, e.target.value)}
                    className="max-w-40"
                    aria-label={`${t("role")}: ${m.name}`}
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role_${r}`)}
                      </option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="icon" aria-label={`${t("delete")}: ${m.name}`} onClick={() => void remove(m.userId, m.name)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Badge>{t(`role_${m.role}`)}</Badge>
              )}
            </div>
          ))}
          {(members.data?.invites ?? []).map((i) => (
            <div key={i.id} className="flex items-center gap-3 text-sm text-[var(--anda-text-dim)]">
              <span className="flex-1 truncate">{i.email}</span>
              <Badge tone="warn">{t("team_invite_pending")}</Badge>
            </div>
          ))}
        </div>
        {isAdmin ? (
          <Field label={t("team_invite_label")} help={t("team_invite_help")}>
            <div className="flex flex-wrap gap-2">
              <Input
                type="email"
                placeholder={t("email")}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inviteEmail.trim() !== "") void invite();
                }}
                className="max-w-60"
                aria-label={t("email")}
              />
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="max-w-44" aria-label={t("role")}>
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r}`)}
                  </option>
                ))}
              </Select>
              <Button onClick={() => void invite()} disabled={inviteEmail.trim() === ""}>
                {t("invite")}
              </Button>
            </div>
          </Field>
        ) : (
          <p className="text-[13px] text-[var(--anda-text-dim)]">{t("team_only_admins")}</p>
        )}
      </section>
    </div>
  );
}
