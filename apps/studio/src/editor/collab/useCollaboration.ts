import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../../api";
import { useEditor } from "../../stores";
import { CollabConnection, CollabRefused, type SocketLike } from "./connection";
import type { ChangeEvent } from "./merge";
import { resendView, resetCollab, setCollabSender, useCollab, type PresenceLock, type PresenceUser, type RemoteView } from "./store";
import type { RemoteSync } from "./sync";

/** Avisos que tocan el tour en pantalla (los demás solo refrescan otras vistas). */
const CONTENT_KINDS = new Set(["scene", "hotspot", "order", "settings"]);
/** Se agrupan los avisos que llegan seguidos (alguien arrastrando, pegando...). */
const BATCH_MS = 120;

/**
 * Conecta el editor con la sala del recorrido: presencia, bloqueos, miradas
 * y cambios de los demás. Sin permiso de edición (o en una instancia sin
 * tiempo real) no hace nada y el editor funciona como siempre.
 */
export function useCollaboration(opts: {
  projectId: string;
  enabled: boolean;
  myUserId: string | null;
  tab: string;
  remote: RemoteSync;
  /** Ha cambiado algo del proyecto que no es el tour (título, publicación). */
  onProject: (patch: { title?: string; reload?: boolean }) => void;
  /** Otra persona ha borrado lo que se tenía abierto. */
  onLostSelection?: (by: string | null) => void;
}): void {
  const queryClient = useQueryClient();
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const connRef = useRef<CollabConnection | null>(null);
  const selectedSceneId = useEditor((s) => s.selectedSceneId);
  const selectedHotspotId = useEditor((s) => s.selectedHotspotId);
  const status = useCollab((s) => s.status);

  useEffect(() => {
    if (!opts.enabled) return;
    const { projectId } = opts;
    let pending: ChangeEvent[] = [];
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    // Los avisos se aplican de uno en uno: un lote no empieza hasta que acaba el anterior
    let applying: Promise<void> = Promise.resolve();

    const flushEvents = (): void => {
      batchTimer = null;
      const events = pending;
      pending = [];
      applying = applying.then(() => optsRef.current.remote.applyEvents(events)).catch((err) => console.error("[colab]", err));
    };

    const onChanged = (ev: ChangeEvent): void => {
      const mine = ev.origin != null && ev.origin === useCollab.getState().connectionId;
      if (CONTENT_KINDS.has(ev.kind)) {
        // Lo propio ya está en la base: se guardó desde aquí
        if (mine) return;
        const sel = useEditor.getState();
        const lost =
          ev.op === "delete" &&
          ((ev.kind === "hotspot" && ev.id === sel.selectedHotspotId) || (ev.kind === "scene" && ev.id === sel.selectedSceneId));
        if (lost) optsRef.current.onLostSelection?.(ev.by ?? null);
        pending.push(ev);
        if (batchTimer == null) batchTimer = setTimeout(flushEvents, BATCH_MS);
        return;
      }
      if (ev.kind === "project" && typeof ev.title === "string") optsRef.current.onProject({ title: ev.title });
      else if (ev.kind === "publication" && !mine) optsRef.current.onProject({ reload: true });
      else if (ev.kind === "comments") void queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
      else if (ev.kind === "translations") void queryClient.invalidateQueries({ queryKey: ["translations", projectId] });
    };

    const conn = new CollabConnection({
      ticketUrl: async () => {
        let res: { path: string };
        try {
          res = await api<{ path: string }>(`/projects/${projectId}/realtime`, { method: "POST", body: {} });
        } catch (err) {
          // Sin permiso, sin plan o sin tiempo real en la instancia: no se insiste
          if (err instanceof ApiRequestError && [401, 403, 404, 503].includes(err.status)) throw new CollabRefused(err.message);
          throw err;
        }
        const proto = location.protocol === "https:" ? "wss" : "ws";
        return `${proto}://${location.host}${res.path}`;
      },
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      onStatus: (s) => {
        // Sin sala no se sabe quién está ni qué tiene abierto: nada de
        // bloqueos fantasma que impidan editar
        if (s === "online") useCollab.setState({ status: s });
        else useCollab.setState({ status: s, users: [], locks: {}, views: {} });
      },
      onReconnected: () => {
        // Mientras no había sala pudieron perderse avisos: se trae todo
        void optsRef.current.remote.resync(false).catch((err) => console.error("[colab]", err));
      },
      onMessage: (msg) => {
        switch (msg.type) {
          case "welcome":
            useCollab.setState({ connectionId: String(msg.connectionId) });
            sendWhere();
            resendView();
            return;
          case "presence":
            useCollab.setState({
              users: (msg.users as PresenceUser[]) ?? [],
              locks: (msg.locks as Record<string, PresenceLock>) ?? {},
            });
            return;
          case "view": {
            const id = String(msg.connectionId);
            const view = msg.view as RemoteView | null;
            const views = { ...useCollab.getState().views };
            if (view == null) delete views[id];
            else views[id] = view;
            useCollab.setState({ views });
            return;
          }
          case "changed":
            onChanged(msg as unknown as ChangeEvent);
            return;
          default:
            return;
        }
      },
    });
    connRef.current = conn;
    useCollab.setState({ myUserId: optsRef.current.myUserId, status: "connecting" });
    setCollabSender((m) => conn.send(m));
    conn.start();

    const nudge = (): void => conn.nudge();
    const onVisible = (): void => {
      if (document.visibilityState === "visible") conn.nudge();
    };
    window.addEventListener("online", nudge);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", nudge);
      document.removeEventListener("visibilitychange", onVisible);
      if (batchTimer != null) clearTimeout(batchTimer);
      conn.stop();
      connRef.current = null;
      setCollabSender(null);
      resetCollab();
    };
  }, [opts.projectId, opts.enabled]);

  /** Dónde está y qué panel tiene abierto: es lo que bloquea a los demás. */
  const sendWhere = (): void => {
    const st = useEditor.getState();
    const tab = optsRef.current.tab;
    const sceneId = st.selectedSceneId;
    const focus =
      tab !== "scenes" || sceneId == null
        ? null
        : st.selectedHotspotId != null
          ? { kind: "hotspot", id: st.selectedHotspotId }
          : { kind: "scene", id: sceneId };
    connRef.current?.send({ type: "where", sceneId, tab, focus });
  };

  useEffect(() => {
    if (status === "online") sendWhere();
  }, [selectedSceneId, selectedHotspotId, opts.tab, status]);
}
