import { useState } from "react";
import { AlertTriangle, CheckCircle2, Wrench, X } from "lucide-react";
import { Button } from "@ull360/ui";
import { useT } from "../i18n";
import type { GraphIssue } from "./graphModel";

/**
 * Avisos del grafo.
 *
 * Un contador que solo dice «3 avisos» obliga a adivinar. Cada aviso explica
 * qué pasa, señala dónde —al pulsarlo, el grafo enfoca el nodo o la arista— y
 * ofrece el arreglo cuando se puede aplicar solo.
 */

export interface IssueAction {
  label: string;
  run: () => void;
}

export function GraphIssues({
  issues,
  onFocus,
  actionFor,
}: {
  issues: GraphIssue[];
  onFocus: (issue: GraphIssue) => void;
  actionFor: (issue: GraphIssue) => IssueAction | null;
}): React.ReactNode {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (issues.length === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("all_reachable")}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-500/25"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {t("graph_issues", { count: String(issues.length) })}
      </button>
      {open && (
        <>
          <button type="button" aria-label={t("close")} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-3 top-11 z-40 w-[min(32rem,92vw)] overflow-hidden rounded-2xl border border-[var(--ull-border)] bg-[var(--ull-surface)] shadow-[var(--ull-shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--ull-border)] px-4 py-2.5">
              <h3 className="text-[13px] font-semibold">{t("graph_issues_title")}</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("close")} onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-[var(--ull-border)] overflow-y-auto">
              {issues.map((issue, i) => {
                const action = actionFor(issue);
                return (
                  <li key={`${issue.kind}-${issue.hotspotId ?? issue.sceneId}-${i}`} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-amber-600">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{t(`graph_issue_${issue.kind}` as never)}</p>
                        <p className="truncate text-xs text-[var(--ull-text-dim)]">{issue.label}</p>
                        <p className="mt-0.5 text-xs text-[var(--ull-text-dim)]">{t(`graph_fix_${issue.kind}` as never)}</p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex gap-1.5 pl-6">
                      <Button size="sm" variant="ghost" onClick={() => onFocus(issue)}>
                        {t("show_me")}
                      </Button>
                      {action != null && (
                        <Button size="sm" variant="outline" onClick={action.run}>
                          <Wrench className="h-3.5 w-3.5" /> {action.label}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
