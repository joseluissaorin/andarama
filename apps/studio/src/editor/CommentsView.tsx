import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, CornerDownRight, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button, Select, Textarea } from "@andarama/ui";
import { api } from "../api";
import { useEditor } from "../stores";
import { useT } from "../i18n";
import type { ProjectInfo } from "./EditorPage";

interface Comment {
  id: string;
  sceneId: string | null;
  hotspotId: string | null;
  parentId: string | null;
  authorName: string;
  body: string;
  resolved: boolean;
  createdAt: number;
}

/** Comentarios con hilos y estado resuelto/abierto (revision editorial §3.5). */
export function CommentsView({ project }: { project: ProjectInfo }): React.ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const editor = useEditor();
  const [body, setBody] = useState("");
  const [sceneId, setSceneId] = useState<string>("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["comments", project.id],
    queryFn: () => api<Comment[]>(`/projects/${project.id}/comments`),
  });

  const invalidate = (): void => void queryClient.invalidateQueries({ queryKey: ["comments", project.id] });

  const send = async (): Promise<void> => {
    if (body.trim() === "") return;
    await api(`/projects/${project.id}/comments`, {
      method: "POST",
      body: {
        body: body.trim(),
        sceneId: replyTo == null && sceneId !== "" ? sceneId : undefined,
        parentId: replyTo ?? undefined,
      },
    });
    setBody("");
    setReplyTo(null);
    invalidate();
  };

  const roots = (q.data ?? []).filter((c) => c.parentId == null);
  const childrenOf = (id: string): Comment[] => (q.data ?? []).filter((c) => c.parentId === id);
  const sceneTitle = (id: string | null): string | null =>
    id != null ? (editor.snapshot?.scenes.find((s) => s.id === id)?.title ?? id) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {roots.map((c) => (
        <div key={c.id} className={`rounded-xl border p-4 ${c.resolved ? "border-[var(--anda-border)] opacity-60" : "border-[var(--anda-border)] bg-[var(--anda-surface)]"}`}>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{c.authorName}</span>
            <span className="text-xs text-[var(--anda-text-dim)]">{new Date(c.createdAt).toLocaleString()}</span>
            {sceneTitle(c.sceneId) != null && (
              <button type="button" onClick={() => editor.select(c.sceneId)}>
                <Badge>{sceneTitle(c.sceneId)}</Badge>
              </button>
            )}
            {c.resolved && <Badge tone="ok">{t("resolved")}</Badge>}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={c.resolved ? t("reopen") : t("resolve")}
              onClick={() => void api(`/projects/${project.id}/comments/${c.id}`, { method: "PATCH", body: { resolved: !c.resolved } }).then(invalidate)}
            >
              {c.resolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("delete")}
              onClick={() => void api(`/projects/${project.id}/comments/${c.id}`, { method: "DELETE" }).then(invalidate)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
          {childrenOf(c.id).map((reply) => (
            <div key={reply.id} className="ml-6 mt-3 border-l-2 border-[var(--anda-border)] pl-3">
              <p className="text-sm">
                <span className="font-semibold">{reply.authorName}</span>{" "}
                <span className="text-xs text-[var(--anda-text-dim)]">{new Date(reply.createdAt).toLocaleString()}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{reply.body}</p>
            </div>
          ))}
          <button type="button" className="mt-2 flex items-center gap-1 text-xs text-[var(--anda-primary)] hover:underline" onClick={() => setReplyTo(c.id)}>
            <CornerDownRight className="h-3 w-3" /> {t("reply")}
          </button>
        </div>
      ))}

      <div className="rounded-xl border border-dashed border-[var(--anda-border)] p-4">
        {replyTo != null && (
          <p className="mb-2 text-xs text-[var(--anda-text-dim)]">
            {t("reply")}...{" "}
            <button type="button" className="underline" onClick={() => setReplyTo(null)}>
              {t("cancel")}
            </button>
          </p>
        )}
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("comment_placeholder")} rows={3} aria-label={t("comment_placeholder")} />
        <div className="mt-2 flex items-center gap-2">
          {replyTo == null && (
            <Select value={sceneId} onChange={(e) => setSceneId(e.target.value)} className="max-w-52" aria-label={t("scenes")}>
              <option value="">Tour</option>
              {(editor.snapshot?.scenes ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          )}
          <div className="flex-1" />
          <Button onClick={() => void send()} disabled={body.trim() === ""}>
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
