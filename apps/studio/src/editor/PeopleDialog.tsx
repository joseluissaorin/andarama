import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, useToast } from "@andarama/ui";
import { api, ApiRequestError } from "../api";
import { useT } from "../i18n";
import type { ProjectInfo } from "./EditorPage";

/** Roles con los que se comparte un recorrido suelto (los mismos que acepta la API). */
const PROJECT_ROLES = ["editor", "collaborator", "reader"] as const;

interface ProjectMember {
  userId: string;
  role: string;
  name: string;
  email: string;
}

/**
 * Compartir un recorrido con personas concretas (§3.1). La API solo admite
 * cuentas que ya existen: si no la hay, se dice claro y se manda al equipo,
 * que es donde se invita por correo.
 */
export function PeopleDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");
  const [notFound, setNotFound] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = project.permissions.canManage;
  const key = ["project-members", project.id];

  const members = useQuery({
    queryKey: key,
    queryFn: () => api<ProjectMember[]>(`/projects/${project.id}/members`),
    enabled: open,
  });

  const add = async (): Promise<void> => {
    const address = email.trim();
    if (address === "") return;
    setBusy(true);
    setNotFound(null);
    try {
      await api(`/projects/${project.id}/members`, { method: "POST", body: { email: address, role } });
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: key });
      toast.push(t("people_added", { email: address }), "ok");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) setNotFound(address);
      else toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: ProjectMember): Promise<void> => {
    if (!confirm(t("people_remove_confirm", { name: m.name }))) return;
    try {
      await api(`/projects/${project.id}/members/${m.userId}`, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("people_title")} description={t("people_hint")}>
      <div className="space-y-4">
        <ul className="space-y-2" aria-label={t("people_title")}>
          {(members.data ?? []).map((m) => (
            <li key={m.userId} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.name} <span className="text-[var(--anda-text-dim)]">({m.email})</span>
              </span>
              <Badge>{t(`role_${m.role}`)}</Badge>
              {canManage && (
                <Button variant="ghost" size="icon" aria-label={`${t("delete")}: ${m.name}`} onClick={() => void remove(m)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
          {members.data != null && members.data.length === 0 && (
            <li className="text-[13px] text-[var(--anda-text-dim)]">{t("people_empty")}</li>
          )}
        </ul>

        {canManage ? (
          <Field label={t("people_add")} help={t("people_role_help")}>
            <div className="flex flex-wrap gap-2">
              <Input
                type="email"
                placeholder={t("email")}
                aria-label={t("email")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setNotFound(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add();
                }}
                className="min-w-0 flex-1"
              />
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="max-w-40" aria-label={t("role")}>
                {PROJECT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r}`)}
                  </option>
                ))}
              </Select>
              <Button onClick={() => void add()} disabled={busy || email.trim() === ""}>
                {t("people_add")}
              </Button>
            </div>
          </Field>
        ) : (
          <p className="text-[13px] text-[var(--anda-text-dim)]">{t("people_only_managers")}</p>
        )}

        {notFound != null && (
          <div role="alert" className="space-y-2 rounded-lg border border-[var(--anda-danger)] p-3 text-[13px]">
            <p>{t("people_not_found", { email: notFound })}</p>
            <Link to="/team" className="font-semibold text-[var(--anda-primary-ink)] hover:underline">
              {t("people_go_team")}
            </Link>
          </div>
        )}
      </div>
    </Dialog>
  );
}
