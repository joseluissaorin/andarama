import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { littlePlanetFor } from "../media/littlePlanet";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  Folder,
  Search,
  FolderPlus,
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
} from "@andarama/ui";
import { api } from "../api";
import { useAuth } from "../stores";
import { useT } from "../i18n";
import { Criatura } from "../components/Criatura";
import { Cabecera } from "../components/Cabecera";

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
  /** Carpeta abierta. "" es la raíz; se entra y se sale, como en un explorador. */
  const [folder, setFolder] = useState<string | "">("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
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

  // Las carpetas guardadas viven en la organización para que una recién
  // creada, todavía vacía, no desaparezca al recargar
  const guardadas = useQuery({
    queryKey: ["folders", orgId],
    queryFn: () => api<{ folders: string[] }>(`/orgs/${orgId}/folders`),
    enabled: orgId != null,
  });

  const folders = useMemo(() => {
    const set = new Set<string>(guardadas.data?.folders ?? []);
    for (const p of projects.data ?? []) {
      if (p.folder != null && p.folder !== "") set.add(p.folder);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [projects.data, guardadas.data]);

  const contarEn = (nombre: string): number =>
    (projects.data ?? []).filter((p) => !p.isTemplate && p.folder === nombre).length;

  const guardarCarpetas = async (lista: string[]): Promise<void> => {
    if (orgId == null) return;
    await api(`/orgs/${orgId}/folders`, { method: "PUT", body: { folders: lista } });
    void queryClient.invalidateQueries({ queryKey: ["folders"] });
  };

  const crearCarpeta = async (): Promise<void> => {
    const nombre = newFolderName.trim();
    if (nombre === "") return;
    try {
      await guardarCarpetas([...folders, nombre]);
      setFolderOpen(false);
      setNewFolderName("");
      setFolder(nombre);
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  /** Mueve un tour a una carpeta (o a la raíz con null). */
  const moverA = async (projectId: string, destino: string | null): Promise<void> => {
    try {
      await api(`/projects/${projectId}`, { method: "PATCH", body: { folder: destino } });
      invalidate();
      toast.push(destino != null ? t("moved_to_folder", { name: destino }) : t("moved_to_root"), "ok");
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };

  const templates = (projects.data ?? []).filter((p) => p.isTemplate);
  const visible = (projects.data ?? []).filter((p) => {
    if (view === "templates" && !p.isTemplate) return false;
    if (view === "active" && p.isTemplate) return false;
    if (search !== "" && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.tags.some((tag) => tag.includes(search.toLowerCase()))) return false;
    // En la raíz solo se ven los tours sueltos: lo que está en carpetas se ve
    // entrando en ellas, como en cualquier explorador
    if (view === "active" && search === "") {
      if (folder === "" && p.folder != null && p.folder !== "") return false;
      if (folder !== "" && p.folder !== folder) return false;
    } else if (folder !== "" && p.folder !== folder) return false;
    return true;
  });

  // Las carpetas solo se ven en la raíz de «Proyectos» y sin búsqueda activa;
  // se calcula aquí porque el estado vacío también depende de ellas: enseñar
  // «no hay tours» tapando las carpetas las dejaba inalcanzables.
  const carpetasVisibles = view === "active" && folder === "" && search === "" ? folders : [];

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
      <Cabecera
        title={folder === "" ? t("projects") : folder}
        hint={folder === "" ? t("projects_intro") : contarEn(folder) === 1 ? t("folder_intro_one") : t("folder_intro", { n: String(contarEn(folder)) })}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {folder !== "" && (
          <Button variant="outline" size="sm" onClick={() => setFolder("")}>
            <ChevronLeft className="h-4 w-4" /> {t("all_projects")}
          </Button>
        )}
        <div className="flex-1" />
        {usage.data != null && (
          <div className="text-xs text-[var(--anda-text-dim)]">
            <span className="mr-3">
              {t("storage")}: {gb(usage.data.usedBytes)} {t("of")} {gb(usage.data.quotaBytes)} GB
            </span>
            <span>
              {usage.data.usedTours} {t("of")} {usage.data.quotaTours} {t("tours")}
            </span>
          </div>
        )}
        {view === "active" && (
          <Button variant="outline" onClick={() => setFolderOpen(true)}>
            <FolderPlus className="h-4 w-4" /> {t("new_folder")}
          </Button>
        )}
        <Button onClick={() => { setNewFolder(folder); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" /> {t("new_project")}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="anda-buscador max-w-72 flex-1">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder={t("search_tours")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("search")}
          />
        </div>
        <div className="flex-1" />
        <div className="anda-seg" role="group" aria-label={t("projects")}>
          {(["active", "templates", "trash"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "active" ? t("projects") : v === "templates" ? t("templates") : t("trash")}
            </button>
          ))}
        </div>
      </div>

      {view === "trash" && <p className="mb-4 text-[13px] text-[var(--anda-text-dim)]">{t("trash_note")}</p>}

      {projects.isLoading ? (
        <div className="flex justify-center p-16">
          <Spinner />
        </div>
      ) : visible.length === 0 && carpetasVisibles.length === 0 ? (
        <EmptyState
          icon={<Criatura size={72} andando />}
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
          {/* Las carpetas van primero, como en cualquier explorador */}
          {carpetasVisibles.map((f) => (
              <FolderCard
                key={f}
                name={f}
                count={contarEn(f)}
                dragOver={dragOver === f}
                onOpen={() => setFolder(f)}
                onDragOver={(over) => setDragOver(over ? f : null)}
                onDropProject={(id) => {
                  setDragOver(null);
                  void moverA(id, f);
                }}
                onRename={async (nuevo) => {
                  const lista = folders.map((x) => (x === f ? nuevo : x));
                  await guardarCarpetas(lista);
                  // Y con ella se mudan sus tours
                  await Promise.all(
                    (projects.data ?? [])
                      .filter((p) => p.folder === f)
                      .map((p) => api(`/projects/${p.id}`, { method: "PATCH", body: { folder: nuevo } })),
                  );
                  invalidate();
                }}
                onDelete={async () => {
                  await guardarCarpetas(folders.filter((x) => x !== f));
                  await Promise.all(
                    (projects.data ?? [])
                      .filter((p) => p.folder === f)
                      .map((p) => api(`/projects/${p.id}`, { method: "PATCH", body: { folder: null } })),
                  );
                  invalidate();
                }}
              />
          ))}
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              inTrash={view === "trash"}
              onChanged={invalidate}
              onMoveOut={folder !== "" ? () => void moverA(p.id, null) : undefined}
            />
          ))}
        </div>
      )}

      <Dialog
        open={folderOpen}
        onOpenChange={setFolderOpen}
        title={t("new_folder")}
        description={t("new_folder_hint")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFolderOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => void crearCarpeta()} disabled={newFolderName.trim() === ""}>{t("create")}</Button>
          </>
        }
      >
        <Field label={t("folder")} htmlFor="nf-name">
          <Input id="nf-name" value={newFolderName} autoFocus onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void crearCarpeta(); }} />
        </Field>
      </Dialog>

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
            <Select id="np-folder" value={newFolder} onChange={(e) => setNewFolder(e.target.value)}>
              <option value="">{t("no_folder")}</option>
              {folders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
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

/**
 * Carpeta: se abre pulsándola y acepta que le suelten tours encima. El
 * contador dice cuántos hay dentro, que es lo único que se quiere saber
 * desde fuera.
 */
function FolderCard({ name, count, dragOver, onOpen, onDragOver, onDropProject, onRename, onDelete }: {
  name: string;
  count: number;
  dragOver: boolean;
  onOpen: () => void;
  onDragOver: (over: boolean) => void;
  onDropProject: (projectId: string) => void;
  onRename: (nuevo: string) => Promise<void>;
  onDelete: () => Promise<void>;
}): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      toast.push(String(err instanceof Error ? err.message : err), "error");
    }
  };
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(PROJECT_DRAG)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOver(true);
        }
      }}
      onDragLeave={() => onDragOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(PROJECT_DRAG);
        if (id !== "") {
          e.preventDefault();
          onDropProject(id);
        }
      }}
      className={`anda-tarjeta anda-tarjeta--carpeta anda-enter group flex h-fit items-center gap-3 self-start p-4 ${
        dragOver ? "anda-tarjeta--soltando" : ""
      }`}
    >
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--anda-text)] bg-[var(--anda-yellow)] text-[#33260f] transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105">
          <Folder className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-bold">{name}</span>
          <span className="block text-xs text-[var(--anda-text-dim)]">{count === 1 ? t("one_tour") : t("n_tours", { n: String(count) })}</span>
        </span>
      </button>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actions_for", { name })}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </Dropdown.Trigger>
        <DropdownContent align="end">
          <DropdownItem
            onSelect={() => {
              const nuevo = prompt(t("rename_folder"), name)?.trim();
              if (nuevo != null && nuevo !== "" && nuevo !== name) void run(() => onRename(nuevo));
            }}
          >
            <Tag className="h-4 w-4" /> {t("rename")}
          </DropdownItem>
          <DropdownItem
            danger
            onSelect={() => {
              if (confirm(count > 0 ? t("confirm_delete_folder_full", { n: String(count) }) : t("confirm_delete_folder"))) {
                void run(onDelete);
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </DropdownItem>
        </DropdownContent>
      </Dropdown.Root>
    </div>
  );
}

/** Tipo de arrastre propio: un tour que se suelta sobre una carpeta. */
const PROJECT_DRAG = "application/x-andarama-project";

function ProjectCard({ project, inTrash, onChanged, onMoveOut }: {
  project: ProjectSummary;
  inTrash: boolean;
  onChanged: () => void;
  onMoveOut?: () => void;
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
    <div
      draggable={!inTrash}
      onDragStart={(e) => {
        e.dataTransfer.setData(PROJECT_DRAG, project.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="anda-tarjeta anda-enter group overflow-hidden"
    >
      <button
        type="button"
        className="anda-portada relative block h-32 w-full overflow-hidden border-b-2 border-[var(--anda-text)] text-left"
        aria-label={project.title}
        onClick={() => {
          if (!inTrash) void navigate({ to: "/p/$projectId", params: { projectId: project.id } });
        }}
      >
        {/* Fondo plano de dos tintas: ni degradados tímidos ni fotos falsas */}
        <span
          data-fondo
          className="absolute inset-0"
          style={{ background: `hsl(${hue}, 62%, 52%)` }}
        />
        {/* Portada: la escena inicial vista como planeta, que es lo que
            distingue un tour de otro mucho mejor que una inicial */}
        {planet != null ? (
          <img src={planet} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        ) : (
          <svg className="absolute -left-8 -top-8 h-36 w-36 opacity-25" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="1.5" />
            <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="white" strokeWidth="1" />
            <ellipse cx="50" cy="50" rx="16" ry="42" fill="none" stroke="white" strokeWidth="1" />
          </svg>
        )}
        {/* Sin portada, la criatura asoma por abajo: el hueco deja de ser un
            hueco y la tarjeta se reconoce como de Andarama */}
        {planet == null && (
          <span className="pointer-events-none absolute bottom-1 right-4 drop-shadow-[0_2px_0_rgba(51,38,15,0.25)] transition-transform duration-300 group-hover:-translate-y-1.5">
            <Criatura size={58} />
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
          <h2 className="truncate text-[16.5px] font-bold tracking-tight">{project.title}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--anda-text-dim)]">
            {project.folder != null && project.folder !== "" ? `${project.folder} · ` : ""}
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
                {onMoveOut != null && (
                  <DropdownItem onSelect={onMoveOut}>
                    <FolderPlus className="h-4 w-4" /> {t("move_out_of_folder")}
                  </DropdownItem>
                )}
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
