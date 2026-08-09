import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import { Badge, Button, Field, Input, Select, Tabs, TabList, TabTrigger, Textarea, useToast } from "@ull360/ui";
import { api } from "../api";
import { useT } from "../i18n";

/** Panel de administracion global de la instancia (§3.7). */
export function AdminPage(): React.ReactNode {
  const t = useT();
  const [tab, setTab] = useState("overview");
  return (
    <div className="mx-auto max-w-5xl p-6">
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
            <Overview />
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

function Overview(): React.ReactNode {
  const t = useT();
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Record<string, number>>("/admin/overview") });
  const items: [string, string][] = [
    ["users", t("users")],
    ["orgs", t("organizations")],
    ["projects", t("projects")],
    ["publications", t("publications")],
    ["queuedJobs", t("jobs_queue")],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([key, label]) => (
        <div key={key} className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
          <p className="text-2xl font-bold">{q.data?.[key] ?? "-"}</p>
          <p className="text-xs text-[var(--ull-text-dim)]">{label}</p>
        </div>
      ))}
      <div className="rounded-xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4">
        <p className="text-2xl font-bold">{q.data != null ? (q.data.storageBytes! / 1024 / 1024 / 1024).toFixed(1) : "-"} GB</p>
        <p className="text-xs text-[var(--ull-text-dim)]">{t("storage")}</p>
      </div>
    </div>
  );
}

function InstanceSettings(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<Record<string, unknown>>("/admin/settings") });
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const data = draft ?? q.data ?? {};
  const set = (k: string, v: unknown): void => setDraft({ ...data, [k]: v });
  const save = async (): Promise<void> => {
    await api("/admin/settings", { method: "PUT", body: draft });
    toast.push(t("saved"), "ok");
  };
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
      <Field label={t("max_upload")} htmlFor="in-upload">
        <Input id="in-upload" type="number" value={String(data.maxUploadMb ?? 512)} onChange={(e) => set("maxUploadMb", parseInt(e.target.value, 10))} />
      </Field>
      <Field label={`${t("trash")} (dias)`} htmlFor="in-trash">
        <Input id="in-trash" type="number" value={String(data.trashRetentionDays ?? 30)} onChange={(e) => set("trashRetentionDays", parseInt(e.target.value, 10))} />
      </Field>
      <Field label={t("privacy_policy")} htmlFor="in-privacy">
        <Textarea id="in-privacy" value={String((data.legal as { privacy?: string })?.privacy ?? "")} onChange={(e) => set("legal", { ...(data.legal as object), privacy: e.target.value })} />
      </Field>
      <Button onClick={() => void save()} disabled={draft == null}>
        {t("save")}
      </Button>
    </div>
  );
}

function UsersTable(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<{ id: string; email: string; name: string; roleGlobal: string; totp: boolean; sso: boolean }[]>("/admin/users"),
  });
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--ull-border)] text-left text-xs text-[var(--ull-text-dim)]">
          <th className="py-2">{t("name")}</th>
          <th>{t("email")}</th>
          <th>{t("role")}</th>
          <th aria-label="Extras" />
        </tr>
      </thead>
      <tbody>
        {(q.data ?? []).map((u) => (
          <tr key={u.id} className="border-b border-[var(--ull-border)]">
            <td className="py-2">{u.name}</td>
            <td>{u.email}</td>
            <td>
              <Select
                value={u.roleGlobal}
                onChange={(e) => {
                  void api(`/admin/users/${u.id}`, { method: "PATCH", body: { roleGlobal: e.target.value } }).then(() =>
                    queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
                  );
                }}
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrgsTable(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => api<{ id: string; name: string; quotaBytes: number; quotaTours: number; usedBytes: number }[]>("/admin/orgs"),
  });
  return (
    <div className="space-y-2">
      {(q.data ?? []).map((o) => (
        <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5 text-sm">
          <span className="flex-1 font-medium">{o.name}</span>
          <span className="text-xs text-[var(--ull-text-dim)]">
            {(o.usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB {t("of")}
          </span>
          <Input
            type="number"
            className="max-w-24"
            defaultValue={String(Math.round(o.quotaBytes / 1024 / 1024 / 1024))}
            aria-label="Cuota GB"
            onBlur={(e) => {
              void api(`/admin/orgs/${o.id}`, { method: "PATCH", body: { quotaBytes: parseInt(e.target.value, 10) * 1024 * 1024 * 1024 } }).then(() =>
                queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
              );
            }}
          />
          <span className="text-xs text-[var(--ull-text-dim)]">GB</span>
          <Input
            type="number"
            className="max-w-20"
            defaultValue={String(o.quotaTours)}
            aria-label="Cuota tours"
            onBlur={(e) => {
              void api(`/admin/orgs/${o.id}`, { method: "PATCH", body: { quotaTours: parseInt(e.target.value, 10) } });
            }}
          />
          <span className="text-xs text-[var(--ull-text-dim)]">{t("tours")}</span>
        </div>
      ))}
    </div>
  );
}

function PubsTable(): React.ReactNode {
  const q = useQuery({
    queryKey: ["admin-pubs"],
    queryFn: () => api<{ projectId: string; slug: string; title: string; visibility: string; publishedAt: number }[]>("/admin/publications"),
  });
  return (
    <div className="space-y-2 text-sm">
      {(q.data ?? []).map((p) => (
        <div key={p.projectId} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5">
          <a href={`/t/${p.slug}`} target="_blank" rel="noopener noreferrer" className="flex-1 font-medium text-[var(--ull-primary)] hover:underline">
            {p.title}
          </a>
          <Badge>{p.visibility}</Badge>
          <span className="text-xs text-[var(--ull-text-dim)]">{new Date(p.publishedAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function JobsTable(): React.ReactNode {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => api<{ id: string; kind: string; status: string; error: string | null; createdAt: number }[]>("/admin/jobs"),
    refetchInterval: 5000,
  });
  return (
    <div className="space-y-2 text-sm">
      {(q.data ?? []).map((j) => (
        <div key={j.id} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5">
          <span className="font-mono text-xs">{j.kind}</span>
          <Badge tone={j.status === "done" ? "ok" : j.status === "error" ? "danger" : "warn"}>{j.status}</Badge>
          <span className="flex-1 truncate text-xs text-[var(--ull-text-dim)]">{j.error ?? ""}</span>
          {j.status === "error" && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reintentar"
              onClick={() => {
                void api(`/admin/jobs/${j.id}/retry`, { method: "POST", body: {} }).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
                );
              }}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditTable(): React.ReactNode {
  const q = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => api<{ id: string; action: string; entity: string; entityId: string | null; userId: string | null; at: number }[]>("/admin/audit"),
  });
  return (
    <div className="max-h-[60vh] space-y-1 overflow-y-auto text-xs">
      {(q.data ?? []).map((a) => (
        <div key={a.id} className="flex gap-3 border-b border-[var(--ull-border)] py-1.5">
          <span className="w-40 shrink-0 text-[var(--ull-text-dim)]">{new Date(a.at).toLocaleString()}</span>
          <span className="font-mono">{a.action}</span>
          <span className="truncate text-[var(--ull-text-dim)]">
            {a.entity} {a.entityId ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function WebhooksPanel(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-hooks"],
    queryFn: () => api<{ id: string; url: string; eventsJson: string; active: boolean }[]>("/admin/webhooks"),
  });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["publish"]);
  return (
    <div className="max-w-xl space-y-4">
      {(q.data ?? []).map((h) => (
        <div key={h.id} className="flex items-center gap-3 rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] px-4 py-2.5 text-sm">
          <span className="flex-1 truncate font-mono text-xs">{h.url}</span>
          <span className="text-xs text-[var(--ull-text-dim)]">{JSON.parse(h.eventsJson).join(", ")}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("delete")}
            onClick={() => {
              void api(`/admin/webhooks/${h.id}`, { method: "DELETE" }).then(() =>
                queryClient.invalidateQueries({ queryKey: ["admin-hooks"] }),
              );
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="space-y-3 rounded-lg border border-dashed border-[var(--ull-border)] p-4">
        <Field label={t("webhook_url")} htmlFor="wh-url">
          <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
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
          onClick={() => {
            void api("/admin/webhooks", { method: "POST", body: { url, events } }).then(() => {
              setUrl("");
              void queryClient.invalidateQueries({ queryKey: ["admin-hooks"] });
            });
          }}
          disabled={url === ""}
        >
          <Plus className="h-4 w-4" /> {t("create")}
        </Button>
      </div>
    </div>
  );
}

function LtiPanel(): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
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
          <p className="mb-2 font-semibold">Endpoints de la herramienta (configuralos en Moodle):</p>
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
            onClick={() => {
              void api(`/lti/registrations/${r.id}`, { method: "DELETE" }).then(() =>
                queryClient.invalidateQueries({ queryKey: ["admin-lti"] }),
              );
            }}
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
          onClick={() => {
            void api("/lti/registrations", { method: "POST", body: { ...form, deploymentId: form.deploymentId || undefined } }).then(() => {
              void queryClient.invalidateQueries({ queryKey: ["admin-lti"] });
            });
          }}
          disabled={form.issuer === "" || form.clientId === ""}
        >
          <Plus className="h-4 w-4" /> {t("create")}
        </Button>
      </div>
    </div>
  );
}

function BackupPanel(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  return (
    <div className="max-w-md space-y-4">
      <a href="/api/v1/admin/backup" download>
        <Button variant="outline">
          <Download className="h-4 w-4" /> {t("backup_download")}
        </Button>
      </a>
      <div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--ull-radius)] border border-[var(--ull-border)] px-4 py-2 text-sm hover:bg-[var(--ull-surface-2)]">
          <Upload className="h-4 w-4" /> {t("backup_import")}
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file == null) return;
              void file.text().then((text) =>
                api<{ imported: number }>("/admin/backup/import", { method: "POST", body: JSON.parse(text) }).then((r) =>
                  toast.push(`${r.imported} filas importadas`, "ok"),
                ),
              );
            }}
          />
        </label>
      </div>
      <p className="text-xs text-[var(--ull-text-dim)]">
        La copia incluye la base de datos completa (sin binarios de medios). Los medios se sincronizan con las herramientas del
        almacenamiento (rclone/aws cli), vease la guia de administracion.
      </p>
    </div>
  );
}
