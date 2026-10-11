import { useEffect, useState } from "react";
import type { MountedSkin } from "@andarama/viewer-ui";
import { useT } from "../../i18n";
import { useCollab } from "./store";

interface Marker {
  id: string;
  name: string;
  color: string;
  gaze: { x: number; y: number } | null;
  pointer: { x: number; y: number } | null;
}

/**
 * Dónde miran y apuntan los demás en el panorama de esta escena: un anillo
 * de su color en el centro de su vista y una flecha con su nombre donde
 * tienen el ratón. Se reproyecta en cada fotograma con la vista propia.
 */
export function RemoteCursors({ contenedor, viewer, sceneId }: {
  contenedor: React.RefObject<HTMLDivElement>;
  viewer: React.MutableRefObject<MountedSkin | null>;
  sceneId: string;
}): React.ReactNode {
  const t = useT();
  const views = useCollab((s) => s.views);
  const users = useCollab((s) => s.users);
  const myConn = useCollab((s) => s.connectionId);
  const [markers, setMarkers] = useState<Marker[]>([]);

  const here = Object.entries(views).filter(([cid, v]) => cid !== myConn && v.sceneId === sceneId);

  useEffect(() => {
    if (here.length === 0) {
      setMarkers([]);
      return;
    }
    let frame = 0;
    let alive = true;
    const inside = (p: { x: number; y: number } | null, w: number, h: number): { x: number; y: number } | null =>
      p != null && p.x >= -20 && p.y >= -20 && p.x <= w + 20 && p.y <= h + 20 ? p : null;
    const loop = (): void => {
      if (!alive) return;
      const v = viewer.current?.viewer;
      const box = contenedor.current;
      if (v != null && box != null) {
        const w = box.clientWidth;
        const h = box.clientHeight;
        const next: Marker[] = here.map(([cid, view]) => {
          const user = users.find((u) => u.connectionId === cid);
          return {
            id: cid,
            name: user?.name !== "" && user?.name != null ? user.name : t("collab_someone"),
            color: user?.color ?? "#868e96",
            gaze: inside(v.hotspotCoordsToScreen(view.yaw, view.pitch), w, h),
            pointer: view.pointer != null ? inside(v.hotspotCoordsToScreen(view.pointer.yaw, view.pointer.pitch), w, h) : null,
          };
        });
        setMarkers((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [JSON.stringify(here), users, contenedor, viewer]);

  if (markers.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true" data-testid="remote-cursors">
      {markers.map((m) => (
        <div key={m.id}>
          {m.gaze != null && (
            <span
              className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] opacity-80 transition-[left,top] duration-100 ease-linear"
              style={{ left: m.gaze.x, top: m.gaze.y, borderColor: m.color, boxShadow: "0 0 0 1.5px rgba(255,255,255,.7)" }}
              title={t("collab_looking_here", { name: m.name })}
            />
          )}
          {(m.pointer ?? m.gaze) != null && (
            <span
              className="absolute flex items-start transition-[left,top] duration-100 ease-linear"
              style={{ left: (m.pointer ?? m.gaze)!.x, top: (m.pointer ?? m.gaze)!.y }}
            >
              {m.pointer != null && (
                <svg width="16" height="18" viewBox="0 0 16 18" className="-ml-0.5 -mt-0.5 drop-shadow">
                  <path d="M1 1 L14 9 L8 10.5 L5 17 Z" fill={m.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              )}
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow ${m.pointer != null ? "ml-0.5 mt-3" : "ml-4 -mt-2.5"}`}
                style={{ background: m.color }}
              >
                {m.name}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
