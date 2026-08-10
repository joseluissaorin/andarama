import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { littlePlanetFor } from "../media/littlePlanet";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  FolderKanban,
  LayoutTemplate,
  MoreVertical,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  Dropdown,
  DropdownContent,
  DropdownItem,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  useToast,
} from "@ull360/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";

interface ProjectSummary {
  id: string;
  title: string;
  slug: string;
  folder: string | null;
  tags: string[];
  status: string;
  isTemplate: boolean;
  coverMediaId: string | null;
  updatedAt: number;
  publishedSlug: string | null;
}

interface Usage {
  quotaBytes: number;
  usedBytes: number;
  quotaTours: number;
  usedTours: number;
}

export function ProjectsPage(): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgId = useAuth((s) => s.currentOrgId);
  const [view, setView] = useState<"active" | "templates" | "trash">("active");
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<string | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [fromTemplate, setFromTemplate] = useState("");
  const [busy, setBusy] = useState(false);

  const projects = useQuery({
    queryKey: ["projects", orgId, view === "trash"],
    queryFn: () => api<ProjectSummary[]>(`/projects?org=${orgId}${view === "trash" ? "&trashed=1" : ""}`),
    enabled: orgId != null,
  });
  const usage = useQuery({
    queryKey: ["usage", orgId],
    queryFn: () => api<Usage>(`/orgs/${orgId}/usage`),
    enabled: orgId != null,
  });

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects.data ?? []) {
      if (p.folder != null && p.folder !== "") set.add(p.folder);
    }
    return [...set].sort();
  }, [projects.data]);

  const templates = (projects.data ?? []).filter((p) => p.isTemplate);
  const visible = (projects.data ?? []).filter((p) => {
    if (view === "templates" && !p.isTemplate) return false;
    if (view === "active" && p.isTemplate) return false;
    if (search !== "" && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.tags.some((tag) => tag.includes(search.toLowerCase()))) return false;
    if (folder !== "" && p.folder !== folder) return false;
    return true;
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
  };

  const createProject = async (): Promise<void> => {
    if (orgId == null || newTitle.trim() === "") return;
    setBusy(true);
    try {
      const res = await api<{ id: string }>("/projects", {
        method: "POST",
        body: {
          orgId,
          title: newTitle.trim(),
          folder: newFolder.trim() || undefined,
          fromTemplate: fromTemplate || undefined,
        },
      });
      setCreateOpen(false);
      setNewTitle("");
      await navigate({ to: "/p/$projectId", params: { projectId: res.id } });
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    } finally {
      setBusy(false);
    }
  };

  const gb = (bytes: number): string => (bytes / (1024 * 1024 * 1024)).toFixed(2);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t("projects")}</h1>
        <div className="flex-1" />
        {usage.data != null && (
          <div className="text-xs text-[var(--ull-text-dim)]">
            <span className="mr-3">
              {t("storage")}: {gb(usage.data.usedBytes)} {t("of")} {gb(usage.data.quotaBytes)} GB
            </span>
            <span>
              {usage.data.usedTours} {t("of")} {usage.data.quotaTours} {t("tours")}
            </span>
          </div>
        )}
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t("new_project")}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-56"
          aria-label={t("search")}
        />
        <Select value={folder} onChange={(e) => setFolder(e.target.value)} className="max-w-44" aria-label={t("folder")}>
          <option value="">{t("no_folder")} / *</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <div className="flex gap-1 rounded-lg bg-[var(--ull-surface-2)] p-1 text-sm">
          {(["active", "templates", "trash"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 ${view === v ? "bg-[var(--ull-surface)] font-medium shadow-sm" : "text-[var(--ull-text-dim)]"}`}
            >
              {v === "active" ? t("projects") : v === "templates" ? t("templates") : t("trash")}
            </button>
          ))}
        </div>
      </div>

      {view === "trash" && <p className="mb-4 text-[13px] text-[var(--ull-text-dim)]">{t("trash_note")}</p>}

      {projects.isLoading ? (
        <div className="flex justify-center p-16">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-10 w-10" />}
          title={t("no_projects")}
          action={
            view === "active" ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {t("new_project")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} inTrash={view === "trash"} onChanged={invalidate} />
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("new_project")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void createProject()} loading={busy} disabled={newTitle.trim() === ""}>
              {t("create")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("title")} htmlFor="np-title">
            <Input id="np-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
          </Field>
          <Field label={t("folder")} htmlFor="np-folder">
            <Input id="np-folder" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} list="folders" />
            <datalist id="folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          {templates.length > 0 && (
            <Field label={t("from_template")} htmlFor="np-template">
              <Select id="np-template" value={fromTemplate} onChange={(e) => setFromTemplate(e.target.value)}>
                <option value="">-</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function ProjectCard({ project, inTrash, onChanged }: {
  project: ProjectSummary;
  inTrash: boolean;
  onChanged: () => void;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const run = async (fn: () => Promise<unknown>, okMsg?: string): Promise<void> => {
    try {
      await fn();
      onChanged();
      if (okMsg != null) toast.push(okMsg, "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  // Portada con matiz derivado del id (estable por proyecto), de respaldo
  const hue = [...project.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;

  // Planeta de la escena inicial: se calcula del preview equirect del medio,
  // que pesa poco y se cachea, y se guarda en memoria entre navegaciones.
  const [planet, setPlanet] = useState<string | null>(null);
  useEffect(() => {
    const mediaId = project.coverMediaId;
    if (mediaId == null) {
      setPlanet(null);
      return;
    }
    let alive = true;
    void littlePlanetFor(mediaId, `/api/v1/media/${mediaId}/preview`, 320).then((url) => {
      if (alive) setPlanet(url);
    });
    return () => {
      alive = false;
    };
  }, [project.coverMediaId]);

  return (
    <div className="group overflow-hidden rounded-2xl border border-[var(--ull-border)] bg-[var(--ull-surface)] shadow-[var(--ull-shadow)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--ull-shadow-lg)]">
      <button
        type="button"
        className="relative block h-24 w-full overflow-hidden text-left"
        aria-label={project.title}
        onClick={() => {
          if (!inTrash) void navigate({ to: "/p/$projectId", params: { projectId: project.id } });
        }}
      >
        <span
          className="absolute inset-0 transition-transform duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(130deg, hsl(${hue}, 42%, 38%), hsl(${(hue + 45) % 360}, 48%, 55%))`,
          }}
        />
        {/* Portada: la escena inicial vista como planeta, que es lo que
            distingue un tour de otro mucho mejor que una inicial */}
        {planet != null ? (
          <img src={planet} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        ) : (
          <svg className="absolute -right-7 -top-9 h-36 w-36 opacity-25" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="1.5" />
            <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="white" strokeWidth="1" />
            <ellipse cx="50" cy="50" rx="16" ry="42" fill="none" stroke="white" strokeWidth="1" />
          </svg>
        )}
        {planet == null && (
          <span className="absolute bottom-3 left-4 text-[19px] font-bold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
            {project.title.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      <div className="p-4 pt-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            if (!inTrash) void navigate({ to: "/p/$projectId", params: { projectId: project.id } });
          }}
        >
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{project.title}</h2>
          <p className="mt-0.5 text-xs text-[var(--ull-text-dim)]">
            {project.folder != null && project.folder !== "" ? `${project.folder} - ` : ""}
            {new Date(project.updatedAt).toLocaleDateString()}
          </p>
        </button>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Acciones">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </Dropdown.Trigger>
          <DropdownContent align="end">
            {!inTrash && (
              <>
                <DropdownItem onSelect={() => void navigate({ to: "/p/$projectId", params: { projectId: project.id } })}>
                  <ExternalLink className="h-4 w-4" /> {t("open")}
                </DropdownItem>
                <DropdownItem onSelect={() => void run(() => api(`/projects/${project.id}/duplicate`, { method: "POST", body: {} }))}>
                  <Copy className="h-4 w-4" /> {t("duplicate")}
                </DropdownItem>
                <DropdownItem
                  onSelect={() =>
                    void run(() => api(`/projects/${project.id}`, { method: "PATCH", body: { isTemplate: !project.isTemplate } }))
                  }
                >
                  <LayoutTemplate className="h-4 w-4" /> {project.isTemplate ? t("projects") : t("make_template")}
                </DropdownItem>
                <DropdownItem danger onSelect={() => void run(() => api(`/projects/${project.id}`, { method: "DELETE" }))}>
                  <Trash2 className="h-4 w-4" /> {t("delete")}
                </DropdownItem>
              </>
            )}
            {inTrash && (
              <>
                <DropdownItem onSelect={() => void run(() => api(`/projects/${project.id}/restore`, { method: "POST", body: {} }))}>
                  <RotateCcw className="h-4 w-4" /> {t("restore")}
                </DropdownItem>
                <DropdownItem
                  danger
                  onSelect={() => {
                    if (confirm(t("confirm_delete"))) {
                      void run(() => api(`/projects/${project.id}/permanent`, { method: "DELETE" }));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> {t("delete_forever")}
                </DropdownItem>
              </>
            )}
          </DropdownContent>
        </Dropdown.Root>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {project.publishedSlug != null ? (
          <a href={`/t/${project.publishedSlug}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <Badge tone="ok">{t("published")}</Badge>
          </a>
        ) : (
          <Badge>{t("draft")}</Badge>
        )}
        {project.isTemplate && <Badge tone="warn">{t("templates")}</Badge>}
        {project.tags.map((tag) => (
          <Badge key={tag}>
            <Tag className="mr-1 h-3 w-3" />
            {tag}
          </Badge>
        ))}
      </div>
      </div>
    </div>
  );
}
