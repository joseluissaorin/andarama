import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, Download, ExternalLink, Globe, Plus, RefreshCcw, Send, Trash2, Upload, UserPlus } from "lucide-react";
import { Badge, Button, Dialog, Field, Input, Select, Spinner, Switch, Tabs, TabList, TabTrigger, Textarea, useToast } from "@ull360/ui";
import { api, ApiRequestError } from "../api";
import { useT } from "../i18n";

/** Panel de administración global de la instancia (§3.7). */
export function AdminPage(): React.ReactNode {
  const t = useT();
  const [tab, setTab] = useState("overview");
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-5 text-xl font-bold">{t("admin")}</h1>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <TabList>
          <TabTrigger value="overview">{t("instance_overview")}</TabTrigger>
          <TabTrigger value="settings">{t("settings")}</TabTrigger>
          <TabTrigger value="users">{t("users")}</TabTrigger>
          <TabTrigger value="orgs">{t("organizations")}</TabTrigger>
          <TabTrigger value="pubs">{t("publications")}</TabTrigger>
          <TabTrigger value="jobs">{t("jobs_queue")}</TabTrigger>
          <TabTrigger value="audit">{t("audit_log")}</TabTrigger>
          <TabTrigger value="hooks">{t("webhooks")}</TabTrigger>
          <TabTrigger value="lti">LTI</TabTrigger>
          <TabTrigger value="backup">{t("backup")}</TabTrigger>
        </TabList>
        <div className="mt-5">
          <Tabs.Content value="overview">
            <Overview onNavigate={setTab} />
          </Tabs.Content>
          <Tabs.Content value="settings">
            <InstanceSettings />
          </Tabs.Content>
          <Tabs.Content value="users">
            <UsersTable />
          </Tabs.Content>
          <Tabs.Content value="orgs">
            <OrgsTable />
          </Tabs.Content>
          <Tabs.Content value="pubs">
            <PubsTable />
          </Tabs.Content>
          <Tabs.Content value="jobs">
            <JobsTable />
          </Tabs.Content>
          <Tabs.Content value="audit">
            <AuditTable />
          </Tabs.Content>
          <Tabs.Content value="hooks">
            <WebhooksPanel />
          </Tabs.Content>
          <Tabs.Content value="lti">
            <LtiPanel />
          </Tabs.Content>
          <Tabs.Content value="backup">
            <BackupPanel />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

/** Envuelve una mutación: los errores SIEMPRE se muestran (nunca en silencio). */
function useMutate(): (fn: () => Promise<unknown>, onOk?: () => void) => void {
  const toast = useToast();
  return (fn, onOk) => {
    void fn()
      .then(() => onOk?.())
      .catch((err) => {
        toast.push(err instanceof ApiRequestError ? (err.detail ?? err.title) : String(err), "error");
      });
  };
}

/** Entero con guarda: los campos vacíos no envían NaN al servidor. */
function intOr(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Resumen: dashboard con almacenamiento por organización y actividad
// ---------------------------------------------------------------------------

function Overview({ onNavigate }: { onNavigate: (tab: string) => void }): React.ReactNode {
  const t = useT();
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Record<string, number>>("/admin/overview") });
  const orgsQ = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => api<{ id: string; name: string; quotaBytes: number; usedBytes: number }[]>("/admin/orgs"),
  });
  const pubsQ = useQuery({
    queryKey: ["admin-pubs"],
    queryFn: () => api<{ projectId: string; slug: string; title: string; publishedAt: number }[]>("/admin/publications"),
  });
  const auditQ = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => api<{ id: string; action: string; entity: string; at: number }[]>("/admin/audit"),
  });
  const jobsQ = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => api<{ id: string; status: string }[]>("/admin/jobs"),
  });

  const cards: { key: string; label: string; tab: string; format?: (v: number) => string }[] = [
    { key: "users", label: t("users"), tab: "users" },
    { key: "orgs", label: t("organizations"), tab: "orgs" },
    { key: "projects", label: t("projects"), tab: "pubs" },
    { key: "publications", label: t("publications"), tab: "pubs" },
    { key: "queuedJobs", label: t("jobs_queue"), tab: "jobs" },
    { key: "storageBytes", label: t("storage"), tab: "orgs", format: (v) => `${(v / 1024 / 1024 / 1024).toFixed(1)} GB` },
  ];
  const failedJobs = (jobsQ.data ?? []).filter((j) => j.status === "error").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(({ key, label, tab, format }) => (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(tab)}
            className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4 text-left transition-shadow hover:shadow-md"
          >
            <p className="text-2xl font-bold tabular-nums">
              {q.data?.[key] != null ? (format != null ? format(q.data[key]!) : q.data[key]) : "—"}
            </p>
            <p className="text-xs text-[var(--ull-text-dim)]">{label}</p>
          </button>
        ))}
      </div>

      {failedJobs > 0 && (
        <button
          type="button"
          onClick={() => onNavigate("jobs")}
          className="flex w-full items-center gap-2 rounded-xl border border-red-300 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 hover:bg-red-500/15"
        >
          <Activity className="h-4 w-4" /> {t("failed_jobs_warning", { count: String(failedJobs) })}
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Almacenamiento por organización */}
        <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("storage_by_org")}</h2>
          <div className="space-y-3">
            {(orgsQ.data ?? []).map((o) => {
              const pct = Math.min(100, Math.round((o.usedBytes / Math.max(1, o.quotaBytes)) * 100));
              return (
                <div key={o.id}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="font-medium">{o.name}</span>
                    <span className="tabular-nums text-[var(--ull-text-dim)]">
                      {(o.usedBytes / 1024 / 1024 / 1024).toFixed(2)} / {(o.quotaBytes / 1024 / 1024 / 1024).toFixed(0)} GB
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--ull-surface-2)]">
                    <div
                      className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-[var(--ull-primary)]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {orgsQ.data?.length === 0 && <p className="text-sm text-[var(--ull-text-dim)]">—</p>}
          </div>
        </section>

        {/* Últimas publicaciones */}
        <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("latest_publications")}</h2>
          <div className="space-y-1.5">
            {(pubsQ.data ?? [])
              .slice()
              .sort((a, b) => b.publishedAt - a.publishedAt)
              .slice(0, 6)
              .map((p) => (
                <a
                  key={p.projectId}
                  href={`/t/${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--ull-surface-2)]"
                >
                  <span className="truncate font-medium text-[var(--ull-primary)]">{p.title}</span>
                  <span className="shrink-0 text-xs text-[var(--ull-text-dim)]">{new Date(p.publishedAt).toLocaleDateString()}</span>
                </a>
              ))}
            {pubsQ.data?.length === 0 && <p className="text-sm text-[var(--ull-text-dim)]">—</p>}
          </div>
        </section>
      </div>

      {/* Actividad reciente */}
      <section className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("recent_activity")}</h2>
        <div className="space-y-1 text-xs">
          {(auditQ.data ?? []).slice(0, 10).map((a) => (
            <div key={a.id} className="flex gap-3 border-b border-[var(--ull-border)] py-1.5 last:border-0">
              <span className="w-36 shrink-0 text-[var(--ull-text-dim)]">{new Date(a.at).toLocaleString()}</span>
              <span className="font-mono">{a.action}</span>
              <span className="truncate text-[var(--ull-text-dim)]">{a.entity}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajustes de instancia (todos los campos del schema)
// ---------------------------------------------------------------------------

function InstanceSettings(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const mutate = useMutate();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<Record<string, unknown>>("/admin/settings") });
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const data = draft ?? q.data ?? {};
  const set = (k: string, v: unknown): void => setDraft({ ...data, [k]: v });
  const legal = (data.legal as { privacy?: string; cookies?: string; terms?: string }) ?? {};
  return (
    <div className="max-w-xl space-y-4">
      <Field label={t("instance_name")} htmlFor="in-name">
        <Input id="in-name" value={String(data.name ?? "")} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label={t("registration_policy")} htmlFor="in-reg">
        <Select id="in-reg" value={String(data.registration ?? "open")} onChange={(e) => set("registration", e.target.value)}>
          <option value="open">{t("reg_open")}</option>
          <option value="invite">{t("reg_invite")}</option>
          <option value="domain">{t("reg_domain")}</option>
        </Select>
      </Field>
      <Field label={t("allowed_domains")} htmlFor="in-domains" hint="ull.edu.es, ull.es">
        <Input
          id="in-domains"
          value={((data.allowedDomains as string[]) ?? []).join(", ")}
          onChange={(e) => set("allowedDomains", e.target.value.split(",").map((d) => d.trim()).filter((d) => d !== ""))}
        />
      </Field>
      <Field label={t("default_langs")} htmlFor="in-langs" hint="es, en">
        <Input
          id="in-langs"
          value={((data.defaultLangs as string[]) ?? []).join(", ")}
          onChange={(e) => set("defaultLangs", e.target.value.split(",").map((d) => d.trim()).filter((d) => d !== ""))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("max_upload")} htmlFor="in-upload">
          <Input id="in-upload" type="number" value={String(data.maxUploadMb ?? 512)} onChange={(e) => set("maxUploadMb", intOr(e.target.value, 512))} />
        </Field>
        <Field label={t("trash_days")} htmlFor="in-trash">
          <Input id="in-trash" type="number" value={String(data.trashRetentionDays ?? 30)} onChange={(e) => set("trashRetentionDays", intOr(e.target.value, 30))} />
        </Field>
        <Field label={t("default_quota_gb")} htmlFor="in-qb">
          <Input
            id="in-qb"
            type="number"
            value={String(Math.round(Number(data.defaultQuotaBytes ?? 5368709120) / 1024 / 1024 / 1024))}
            onChange={(e) => set("defaultQuotaBytes", intOr(e.target.value, 5) * 1024 * 1024 * 1024)}
          />
        </Field>
        <Field label={t("default_quota_tours")} htmlFor="in-qt">
          <Input id="in-qt" type="number" value={String(data.defaultQuotaTours ?? 100)} onChange={(e) => set("defaultQuotaTours", intOr(e.target.value, 100))} />
        </Field>
      </div>
      <Field label={t("privacy_policy")} htmlFor="in-privacy">
        <Textarea id="in-privacy" value={String(legal.privacy ?? "")} onChange={(e) => set("legal", { ...legal, privacy: e.target.value })} />
      </Field>
      <Field label={t("cookies_policy")} htmlFor="in-cookies">
        <Textarea id="in-cookies" value={String(legal.cookies ?? "")} onChange={(e) => set("legal", { ...legal, cookies: e.target.value })} />
      </Field>
      <Field label={t("terms_of_use")} htmlFor="in-terms">
        <Textarea id="in-terms" value={String(legal.terms ?? "")} onChange={(e) => set("legal", { ...legal, terms: e.target.value })} />
      </Field>
      <Button
        onClick={() =>
          mutate(
            () => api("/admin/settings", { method: "PUT", body: draft }),
            () => toast.push(t("saved"), "ok"),
          )
        }
        disabled={draft == null}
      >
        {t("save")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usuarios: buscador + alta + borrado
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string;
  email: string;
  name: string;
  roleGlobal: string;
  totp: boolean;
  sso: boolean;
}

function UsersTable(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const mutate = useMutate();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", roleGlobal: "user", orgId: "" });
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users") });
  const orgsQ = useQuery({ queryKey: ["admin-orgs"], queryFn: () => api<{ id: string; name: string }[]>("/admin/orgs") });
  const rows = (q.data ?? []).filter(
    (u) => search === "" || u.email.toLowerCase().includes(search.toLowerCase()) || u.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" aria-label={t("search")} />
        <div className="flex-1" />
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" /> {t("create_user")}
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--ull-border)] text-left text-xs text-[var(--ull-text-dim)]">
            <th className="py-2">{t("name")}</th>
            <th>{t("email")}</th>
            <th>{t("role")}</th>
            <th aria-label={t("extras")} />
            <th aria-label={t("actions")} />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-[var(--ull-border)]">
              <td className="py-2">{u.name}</td>
              <td>{u.email}</td>
              <td>
                <Select
                  value={u.roleGlobal}
                  onChange={(e) =>
                    mutate(
                      () => api(`/admin/users/${u.id}`, { method: "PATCH", body: { roleGlobal: e.target.value } }),
                      () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
                    )
                  }
                  className="max-w-36"
                  aria-label={t("role")}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </Select>
              </td>
              <td className="text-right">
                {u.totp && <Badge tone="ok">2FA</Badge>} {u.sso && <Badge>SSO</Badge>}
              </td>
              <td className="w-10 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("delete")}
                  onClick={() => {
                    if (!confirm(t("confirm_delete_user", { name: u.email }))) return;
                    mutate(
                      () => api(`/admin/users/${u.id}`, { method: "DELETE" }),
                      () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
                    );
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("create_user")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={form.email === "" || form.name === "" || form.password.length < 10}
              onClick={() =>
                mutate(
                  () =>
                    api("/admin/users", {
                      method: "POST",
                      body: { ...form, orgId: form.orgId === "" ? undefined : form.orgId },
                    }),
                  () => {
                    setCreateOpen(false);
                    setForm({ email: "", name: "", password: "", roleGlobal: "user", orgId: "" });
                    toast.push(t("user_created"), "ok");
                    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                  },
                )
              }
            >
              {t("create")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("name")} htmlFor="cu-name">
            <Input id="cu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label={t("email")} htmlFor="cu-email">
            <Input id="cu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={t("temp_password")} htmlFor="cu-pass" hint={t("temp_password_hint")}>
            <Input id="cu-pass" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("role")} htmlFor="cu-role">
              <Select id="cu-role" value={form.roleGlobal} onChange={(e) => setForm({ ...form, roleGlobal: e.target.value })}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </Field>
            <Field label={t("organization")} htmlFor="cu-org">
              <Select id="cu-org" value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })}>
                <option value="">—</option>
                {(orgsQ.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organizaciones: alta + renombrar + cuotas
// ---------------------------------------------------------------------------

function OrgsTable(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const mutate = useMutate();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const q = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => api<{ id: string; name: string; quotaBytes: number; quotaTours: number; usedBytes: number }[]>("/admin/orgs"),
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t("create_org")}
        </Button>
      </div>
      <div className="space-y-2">
        {(q.data ?? []).map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5 text-sm">
            <Input
              defaultValue={o.name}
              className="max-w-56 font-medium"
              aria-label={t("name")}
              onBlur={(e) => {
                if (e.target.value.trim() === "" || e.target.value === o.name) return;
                mutate(
                  () => api(`/admin/orgs/${o.id}`, { method: "PATCH", body: { name: e.target.value.trim() } }),
                  () => void queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
                );
              }}
            />
            <span className="flex-1" />
            <span className="text-xs tabular-nums text-[var(--ull-text-dim)]">
              {(o.usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB {t("of")}
            </span>
            <Input
              type="number"
              className="max-w-24"
              defaultValue={String(Math.round(o.quotaBytes / 1024 / 1024 / 1024))}
              aria-label={t("quota_gb")}
              onBlur={(e) =>
                mutate(
                  () => api(`/admin/orgs/${o.id}`, { method: "PATCH", body: { quotaBytes: intOr(e.target.value, 5) * 1024 * 1024 * 1024 } }),
                  () => void queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
                )
              }
            />
            <span className="text-xs text-[var(--ull-text-dim)]">GB</span>
            <Input
              type="number"
              className="max-w-20"
              defaultValue={String(o.quotaTours)}
              aria-label={t("quota_tours")}
              onBlur={(e) =>
                mutate(
                  () => api(`/admin/orgs/${o.id}`, { method: "PATCH", body: { quotaTours: intOr(e.target.value, 100) } }),
                  () => void queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
                )
              }
            />
            <span className="text-xs text-[var(--ull-text-dim)]">{t("tours")}</span>
          </div>
        ))}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("create_org")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={name.trim() === ""}
              onClick={() =>
                mutate(
                  () => api("/admin/orgs", { method: "POST", body: { name: name.trim() } }),
                  () => {
                    setCreateOpen(false);
                    setName("");
                    toast.push(t("saved"), "ok");
                    void queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
                  },
                )
              }
            >
              {t("create")}
            </Button>
          </>
        }
      >
        <Field label={t("org_name")} htmlFor="co-name">
          <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publicaciones: buscar + abrir + despublicar
// ---------------------------------------------------------------------------

function PubsTable(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const mutate = useMutate();
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin-pubs"],
    queryFn: () => api<{ projectId: string; slug: string; title: string; visibility: string; publishedAt: number }[]>("/admin/publications"),
  });
  const rows = (q.data ?? []).filter(
    (p) => search === "" || p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" aria-label={t("search")} />
      <div className="space-y-2 text-sm">
        {rows.map((p) => (
          <div key={p.projectId} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5">
            <a href={`/t/${p.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-medium text-[var(--ull-primary)] hover:underline">
              {p.title} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span className="font-mono text-xs text-[var(--ull-text-dim)]">/t/{p.slug}</span>
            <div className="flex-1" />
            <Badge>{p.visibility}</Badge>
            <span className="text-xs text-[var(--ull-text-dim)]">{new Date(p.publishedAt).toLocaleString()}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!confirm(t("confirm_unpublish", { title: p.title }))) return;
                mutate(
                  () => api(`/admin/publications/${p.projectId}/unpublish`, { method: "POST", body: {} }),
                  () => void queryClient.invalidateQueries({ queryKey: ["admin-pubs"] }),
                );
              }}
            >
              {t("unpublish")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cola de trabajos: filtro por estado + reintentos
// ---------------------------------------------------------------------------

function JobsTable(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const mutate = useMutate();
  const [status, setStatus] = useState("");
  const q = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => api<{ id: string; kind: string; status: string; error: string | null; createdAt: number }[]>("/admin/jobs"),
    refetchInterval: 5000,
  });
  const rows = (q.data ?? []).filter((j) => status === "" || j.status === status);
  return (
    <div className="space-y-3">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-44" aria-label={t("status")}>
        <option value="">{t("all_statuses")}</option>
        {["queued", "running", "done", "error"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <div className="space-y-2 text-sm">
        {rows.map((j) => (
          <div key={j.id} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5">
            <span className="font-mono text-xs">{j.kind}</span>
            <Badge tone={j.status === "done" ? "ok" : j.status === "error" ? "danger" : "warn"}>{j.status}</Badge>
            <span className="flex-1 truncate text-xs text-[var(--ull-text-dim)]">{j.error ?? ""}</span>
            <span className="text-xs text-[var(--ull-text-dim)]">{new Date(j.createdAt).toLocaleTimeString()}</span>
            {j.status === "error" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("retry")}
                onClick={() =>
                  mutate(
                    () => api(`/admin/jobs/${j.id}/retry`, { method: "POST", body: {} }),
                    () => void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
                  )
                }
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-[var(--ull-text-dim)]">—</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auditoría con buscador
// ---------------------------------------------------------------------------

function AuditTable(): React.ReactNode {
  const t = useT();
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => api<{ id: string; action: string; entity: string; entityId: string | null; userId: string | null; at: number }[]>("/admin/audit"),
  });
  const rows = (q.data ?? []).filter(
    (a) => search === "" || a.action.includes(search.toLowerCase()) || a.entity.includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" aria-label={t("search")} />
      <div className="max-h-[60vh] space-y-1 overflow-y-auto text-xs">
        {rows.map((a) => (
          <div key={a.id} className="flex gap-3 border-b border-[var(--ull-border)] py-1.5">
            <span className="w-40 shrink-0 text-[var(--ull-text-dim)]">{new Date(a.at).toLocaleString()}</span>
            <span className="font-mono">{a.action}</span>
            <span className="truncate text-[var(--ull-text-dim)]">
              {a.entity} {a.entityId ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks: alta + conmutador + prueba de envío
// ---------------------------------------------------------------------------

function WebhooksPanel(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutate = useMutate();
  const q = useQuery({
    queryKey: ["admin-hooks"],
    queryFn: () => api<{ id: string; url: string; eventsJson: string; active: boolean }[]>("/admin/webhooks"),
  });
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["publish"]);
  const parseEvents = (json: string): string[] => {
    try {
      return JSON.parse(json) as string[];
    } catch {
      return [];
    }
  };
  return (
    <div className="max-w-2xl space-y-4">
      {(q.data ?? []).map((h) => (
        <div key={h.id} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5 text-sm">
          <Globe className={`h-4 w-4 shrink-0 ${h.active ? "text-emerald-500" : "text-[var(--ull-text-dim)]"}`} />
          <span className="flex-1 truncate font-mono text-xs">{h.url}</span>
          <span className="text-xs text-[var(--ull-text-dim)]">{parseEvents(h.eventsJson).join(", ")}</span>
          <Switch
            id={`wh-active-${h.id}`}
            checked={h.active}
            onCheckedChange={(v) =>
              mutate(
                () => api(`/admin/webhooks/${h.id}`, { method: "PATCH", body: { active: v } }),
                () => void queryClient.invalidateQueries({ queryKey: ["admin-hooks"] }),
              )
            }
            label={h.active ? t("active") : t("inactive")}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("send_test")}
            onClick={() =>
              mutate(async () => {
                const r = await api<{ ok: boolean; status: number; error?: string }>(`/admin/webhooks/${h.id}/test`, { method: "POST", body: {} });
                toast.push(r.ok ? t("test_ok", { status: String(r.status) }) : t("test_failed", { detail: r.error ?? String(r.status) }), r.ok ? "ok" : "error");
              })
            }
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("delete")}
            onClick={() =>
              mutate(
                () => api(`/admin/webhooks/${h.id}`, { method: "DELETE" }),
                () => void queryClient.invalidateQueries({ queryKey: ["admin-hooks"] }),
              )
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="space-y-3 rounded-lg border border-dashed border-[var(--ull-border)] p-4">
        <Field label={t("webhook_url")} htmlFor="wh-url">
          <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </Field>
        <Field label={t("webhook_secret")} htmlFor="wh-secret" hint={t("webhook_secret_hint")}>
          <Input id="wh-secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <div className="flex gap-4">
          {["publish", "unpublish", "form_submission"].map((ev) => (
            <label key={ev} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={(e) => setEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))}
              />
              {ev}
            </label>
          ))}
        </div>
        <Button
          onClick={() =>
            mutate(
              () => api("/admin/webhooks", { method: "POST", body: { url, events, secret: secret === "" ? undefined : secret } }),
              () => {
                setUrl("");
                setSecret("");
                void queryClient.invalidateQueries({ queryKey: ["admin-hooks"] });
              },
            )
          }
          disabled={url === ""}
        >
          <Plus className="h-4 w-4" /> {t("create")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LTI
// ---------------------------------------------------------------------------

function LtiPanel(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const mutate = useMutate();
  const q = useQuery({
    queryKey: ["admin-lti"],
    queryFn: () =>
      api<{ id: string; issuer: string; clientId: string; toolEndpoints: Record<string, string> }[]>("/lti/registrations"),
  });
  const [form, setForm] = useState({ issuer: "", clientId: "", deploymentId: "", authUrl: "", tokenUrl: "", jwksUrl: "" });
  const first = q.data?.[0];
  return (
    <div className="max-w-2xl space-y-5">
      {first != null && (
        <div className="rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4 text-xs">
          <p className="mb-2 font-semibold">{t("lti_endpoints_hint")}</p>
          {Object.entries(first.toolEndpoints).map(([k, v]) => (
            <p key={k} className="font-mono">
              {k}: {v}
            </p>
          ))}
        </div>
      )}
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5 text-sm">
          <span className="flex-1 truncate">{r.issuer}</span>
          <span className="font-mono text-xs text-[var(--ull-text-dim)]">{r.clientId}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("delete")}
            onClick={() =>
              mutate(
                () => api(`/lti/registrations/${r.id}`, { method: "DELETE" }),
                () => void queryClient.invalidateQueries({ queryKey: ["admin-lti"] }),
              )
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="space-y-3 rounded-lg border border-dashed border-[var(--ull-border)] p-4">
        {(
          [
            ["issuer", "Issuer (https://moodle.ull.es)"],
            ["clientId", "Client ID"],
            ["deploymentId", "Deployment ID"],
            ["authUrl", "Auth URL (/mod/lti/auth.php)"],
            ["tokenUrl", "Token URL (/mod/lti/token.php)"],
            ["jwksUrl", "JWKS URL (/mod/lti/certs.php)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`lti-${key}`}>
            <Input id={`lti-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </Field>
        ))}
        <Button
          onClick={() =>
            mutate(
              () => api("/lti/registrations", { method: "POST", body: { ...form, deploymentId: form.deploymentId || undefined } }),
              () => void queryClient.invalidateQueries({ queryKey: ["admin-lti"] }),
            )
          }
          disabled={form.issuer === "" || form.clientId === ""}
        >
          <Plus className="h-4 w-4" /> {t("create")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copia de seguridad
// ---------------------------------------------------------------------------

function BackupPanel(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const mutate = useMutate();
  const [importing, setImporting] = useState(false);
  return (
    <div className="max-w-md space-y-4">
      <Button variant="outline" onClick={() => window.open("/api/v1/admin/backup", "_blank")}>
        <Download className="h-4 w-4" /> {t("backup_download")}
      </Button>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--ull-radius)] border border-[var(--ull-border)] px-4 py-2 text-sm hover:bg-[var(--ull-surface-2)]">
          {importing ? <Spinner /> : <Upload className="h-4 w-4" />} {t("backup_import")}
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file == null) return;
              setImporting(true);
              void file
                .text()
                .then((text) =>
                  mutate(
                    async () => {
                      const r = await api<{ imported: number }>("/admin/backup/import", { method: "POST", body: JSON.parse(text) });
                      toast.push(t("rows_imported", { count: String(r.imported) }), "ok");
                    },
                  ),
                )
                .finally(() => setImporting(false));
            }}
          />
        </label>
      </div>
      <p className="text-xs text-[var(--ull-text-dim)]">{t("backup_hint")}</p>
    </div>
  );
}
