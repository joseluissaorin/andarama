import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Box,
  ClipboardList,
  Columns2,
  Film,
  FileText,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Images,
  Link as LinkIcon,
  MessageSquare,
  MoveRight,
  Pentagon,
  ToggleLeft,
  Volume2,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { Dialog, Input } from "@andarama/ui";
import { useT } from "../i18n";
import { FAMILY_ORDER, searchCatalog, type HotspotFamily, type HotspotKind } from "./hotspotCatalog";

const ICONS: Record<string, LucideIcon> = {
  "move-right": MoveRight,
  link: LinkIcon,
  "toggle-left": ToggleLeft,
  pentagon: Pentagon,
  "align-left": AlignLeft,
  "message-square": MessageSquare,
  image: ImageIcon,
  images: Images,
  "file-text": FileText,
  globe: Globe,
  film: Film,
  youtube: Youtube,
  "volume-2": Volume2,
  box: Box,
  "help-circle": HelpCircle,
  "clipboard-list": ClipboardList,
  "columns-2": Columns2,
};

/**
 * Paleta de tipos de hotspot: se escribe lo que se busca y se pulsa Intro.
 * Sustituye a la rejilla de diecisiete botones que vivía dentro del formulario
 * de la escena, donde los rótulos se desbordaban y había que bajar hasta el
 * final del panel para llegar a ella.
 */
export function HotspotPalette({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (type: string) => void;
}): React.ReactNode {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchCatalog(query, (type) => t(`hotspot_${type}` as never)), [query, t]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const pick = (type: string): void => {
    onPick(type);
    onClose();
  };

  const grouped = FAMILY_ORDER.map((family) => ({
    family,
    items: results.filter((k) => k.family === family),
  })).filter((g) => g.items.length > 0);

  // Índice plano para moverse con las flechas sin pensar en los grupos
  const flat: HotspotKind[] = grouped.flatMap((g) => g.items);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t("add_hotspot")} wide>
      <Input
        autoFocus
        value={query}
        placeholder={t("hotspot_search_placeholder")}
        aria-label={t("search")}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(flat.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && flat[active] != null) {
            e.preventDefault();
            pick(flat[active]!.type);
          }
        }}
      />
      <div ref={listRef} className="mt-3 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {grouped.map((group) => (
          <section key={group.family}>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--anda-text-dim)]">
              {t(`hotspot_family_${group.family}` as never)}
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {group.items.map((kind) => {
                const Icon = ICONS[kind.icon] ?? AlignLeft;
                const index = flat.indexOf(kind);
                return (
                  <button
                    key={kind.type}
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(kind.type)}
                    className={`anda-ficha flex w-full items-start gap-2.5 p-2.5 text-left ${
                      index === active ? "anda-ficha--activa" : ""
                    }`}
                  >
                    <span className="anda-hueco mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center !rounded-lg text-[var(--anda-primary)]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-tight">{t(`hotspot_${kind.type}` as never)}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-[var(--anda-text-dim)]">
                        {t(`hotspot_desc_${kind.type}` as never)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {flat.length === 0 && <p className="py-6 text-center text-sm text-[var(--anda-text-dim)]">{t("no_results")}</p>}
      </div>
      <p className="mt-2 text-xs text-[var(--anda-text-dim)]">{t("hotspot_palette_hint")}</p>
    </Dialog>
  );
}

export type { HotspotFamily };
