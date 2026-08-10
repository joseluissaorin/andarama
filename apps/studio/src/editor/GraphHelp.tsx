import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { Button } from "@ull360/ui";
import { useT } from "../i18n";

/**
 * Guía de controles del grafo.
 *
 * Antes era una línea de texto gris apretada en la barra superior, ilegible y
 * fea. Un editor de nodos tiene muchos gestos y no caben en una frase: van en
 * una hoja desplegable, agrupados y con las teclas como teclas.
 */

interface Shortcut {
  keys: string[];
  what: string;
}

function Key({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <kbd className="rounded-md border border-[var(--ull-border)] bg-[var(--ull-surface-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold shadow-sm">
      {children}
    </kbd>
  );
}

export function GraphHelp({ mode }: { mode: "scenes" | "plan" | "geo" | "autopilot" }): React.ReactNode {
  const t = useT();
  const [open, setOpen] = useState(false);

  const canvas: { title: string; items: Shortcut[] } = {
    title: t("help_group_canvas"),
    items: [
      { keys: [t("key_wheel")], what: t("help_zoom") },
      { keys: [t("key_two_fingers")], what: t("help_pinch") },
      { keys: ["Alt", "+", t("key_drag")], what: t("help_pan") },
      { keys: ["F"], what: t("help_fit") },
      { keys: ["."], what: t("help_fit_selection") },
      { keys: ["Ctrl", "+", "F"], what: t("help_search") },
      { keys: ["G"], what: t("help_snap") },
    ],
  };

  const nodes: { title: string; items: Shortcut[] } = {
    title: t("help_group_nodes"),
    items: [
      { keys: [t("key_drag")], what: t("help_move_node") },
      { keys: [t("key_arrows")], what: t("help_nudge") },
      { keys: ["Mayús", "+", t("key_click")], what: t("help_multiselect") },
      { keys: [t("key_drag_empty")], what: t("help_marquee") },
      { keys: ["Ctrl", "+", t("key_drag_empty")], what: t("help_marquee_subtract") },
      { keys: ["A"], what: t("help_select_all") },
      { keys: ["F2"], what: t("help_rename") },
      { keys: ["Supr"], what: t("help_delete_scene") },
      { keys: [t("key_dblclick")], what: t("help_open_scene") },
      { keys: [t("key_rightclick")], what: t("help_context") },
      { keys: ["Tab"], what: t("help_keyboard_walk") },
      { keys: ["C"], what: t("help_keyboard_connect") },
    ],
  };

  const groups: { title: string; items: Shortcut[] }[] =
    mode === "autopilot"
      ? [
          {
            title: t("help_group_autopilot"),
            items: [
              { keys: [t("key_click")], what: t("help_route_add") },
              { keys: [t("key_drag")], what: t("help_route_reorder") },
              { keys: [t("key_wheel")], what: t("help_zoom") },
              { keys: ["F"], what: t("help_fit") },
            ],
          },
        ]
      : [
          {
            title: t("help_group_connect"),
            items: [
              { keys: [t("key_drag_edge")], what: t("help_connect") },
              { keys: ["Esc"], what: t("help_cancel_connect") },
              { keys: [t("key_click"), t("key_on_edge")], what: t("help_select_edge") },
              { keys: [t("key_drag_end")], what: t("help_reconnect") },
              { keys: ["Supr"], what: t("help_delete_edge") },
              { keys: [t("key_dblclick"), t("key_on_edge")], what: t("help_open_edge") },
            ],
          },
          nodes,
          canvas,
          ...(mode === "plan"
            ? [
                {
                  title: t("help_group_plan"),
                  items: [
                    { keys: [t("key_drag")], what: t("help_plan_place") },
                    { keys: [t("key_drag_out")], what: t("help_plan_remove") },
                    { keys: [t("key_drag_cone")], what: t("help_plan_north") },
                  ],
                },
              ]
            : []),
          ...(mode === "geo"
            ? [
                {
                  title: t("help_group_geo"),
                  items: [
                    { keys: [t("key_drag")], what: t("help_geo_place") },
                    { keys: [t("key_drag_list")], what: t("help_geo_from_list") },
                  ],
                },
              ]
            : []),
        ];

  return (
    <>
      <Button size="sm" variant="ghost" aria-label={t("shortcuts")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Keyboard className="h-4 w-4" /> {t("shortcuts")}
      </Button>
      {open && (
        <>
          <button type="button" aria-label={t("close")} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-3 top-11 z-40 max-h-[70vh] w-[min(34rem,92vw)] overflow-y-auto rounded-2xl border border-[var(--ull-border)] bg-[var(--ull-surface)] p-4 shadow-[var(--ull-shadow-lg)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ull-text-dim)]">{t("shortcuts")}</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("close")} onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {groups.map((group) => (
                <section key={group.title}>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ull-primary)]">{group.title}</h4>
                  <ul className="space-y-1">
                    {group.items.map((item) => (
                      <li key={item.what} className="flex items-start gap-2 text-[13px]">
                        <span className="flex shrink-0 items-center gap-0.5 pt-0.5">
                          {item.keys.map((k, i) =>
                            k === "+" ? (
                              <span key={i} className="text-[var(--ull-text-dim)]">
                                +
                              </span>
                            ) : (
                              <Key key={i}>{k}</Key>
                            ),
                          )}
                        </span>
                        <span className="text-[var(--ull-text-dim)]">{item.what}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
