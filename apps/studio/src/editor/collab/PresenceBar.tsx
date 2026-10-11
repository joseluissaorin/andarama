import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { Tooltip } from "@andarama/ui";
import { useEditor } from "../../stores";
import { useT } from "../../i18n";
import { initials, useCollab, type PresenceUser } from "./store";

const TAB_LABELS: Record<string, string> = {
  scenes: "scenes",
  graph: "graph",
  preview: "preview",
  translations: "translations",
  settings: "settings",
  analytics: "analytics",
  comments: "comments",
  versions: "versions",
};

/**
 * Cabecera del editor: quién más está en el recorrido (una burbuja por
 * persona, con su color) y, si se corta la sala, un aviso discreto. Pulsar una
 * burbuja lleva a la escena en la que está esa persona.
 */
export function PresenceBar({ onGoTo }: { onGoTo: (user: PresenceUser) => void }): React.ReactNode {
  const t = useT();
  const users = useCollab((s) => s.users);
  const myConn = useCollab((s) => s.connectionId);
  const myUserId = useCollab((s) => s.myUserId);
  const status = useCollab((s) => s.status);
  const scenes = useEditor((s) => s.snapshot?.scenes);

  // El aviso espera un poco: una reconexión rápida no tiene por qué verse
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    if (status !== "offline") {
      setShowOffline(false);
      return;
    }
    const id = setTimeout(() => setShowOffline(true), 2500);
    return () => clearTimeout(id);
  }, [status]);

  // Una burbuja por persona aunque tenga el recorrido abierto en dos pestañas
  const people = new Map<string, PresenceUser>();
  for (const u of users) {
    if (u.connectionId === myConn || (myUserId != null && u.userId === myUserId)) continue;
    if (!people.has(u.userId)) people.set(u.userId, u);
  }
  const others = [...people.values()];

  const whereOf = (u: PresenceUser): string => {
    const name = u.name !== "" ? u.name : t("collab_someone");
    const scene = u.tab === "scenes" || u.tab == null ? scenes?.find((s) => s.id === u.sceneId)?.title : undefined;
    if (scene != null) return t("collab_in_scene", { name, scene });
    if (u.tab != null && TAB_LABELS[u.tab] != null) return t("collab_in_tab", { name, tab: t(TAB_LABELS[u.tab]!) });
    return name;
  };

  return (
    <>
      {others.length > 0 && (
        <div className="flex items-center -space-x-1.5" role="list" aria-label={t("a11y_editing_now")}>
          {others.slice(0, 6).map((u) => (
            <Tooltip key={u.userId} content={whereOf(u)}>
              <button
                type="button"
                role="listitem"
                aria-label={`${whereOf(u)}. ${t("collab_go_to", { name: u.name !== "" ? u.name : t("collab_someone") })}`}
                onClick={() => onGoTo(u)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-[var(--anda-surface)] transition-transform hover:z-10 hover:scale-110 focus-visible:z-10"
                style={{ background: u.color }}
                data-collab-user={u.name}
              >
                {initials(u.name !== "" ? u.name : "?")}
              </button>
            </Tooltip>
          ))}
          {others.length > 6 && (
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--anda-surface-2)] px-1.5 text-[11px] font-semibold ring-2 ring-[var(--anda-surface)]">
              +{others.length - 6}
            </span>
          )}
        </div>
      )}
      {showOffline && (
        <Tooltip content={t("collab_offline_hint")}>
          <span
            role="status"
            tabIndex={0}
            className="flex items-center gap-1.5 rounded-full border border-[var(--anda-border)] px-2 py-0.5 text-[11.5px] text-[var(--anda-text-dim)]"
          >
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            {t("collab_offline")}
          </span>
        </Tooltip>
      )}
    </>
  );
}
