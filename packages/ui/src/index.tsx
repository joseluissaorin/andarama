import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import * as RadixPopover from "@radix-ui/react-popover";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as RadixTabs from "@radix-ui/react-tabs";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { Loader2, X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Design system del Studio: componentes accesibles sobre primitivas Radix
 * con Tailwind y el tema ULL. Iconografia exclusivamente SVG (lucide-react).
 */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--ull-primary)] text-white hover:bg-[var(--ull-primary-dark)] disabled:opacity-50",
  secondary: "bg-[var(--ull-surface-2)] text-[var(--ull-text)] hover:bg-[var(--ull-border)] disabled:opacity-50",
  ghost: "bg-transparent text-[var(--ull-text)] hover:bg-[var(--ull-surface-2)] disabled:opacity-40",
  outline:
    "bg-transparent border border-[var(--ull-border)] text-[var(--ull-text)] hover:bg-[var(--ull-surface-2)] disabled:opacity-50",
  danger: "bg-[var(--ull-danger)] text-white hover:brightness-90 disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, ...rest },
  ref,
) {
  const sizeCls =
    size === "sm"
      ? "h-8 px-3 text-[13px] gap-1.5"
      : size === "lg"
        ? "h-11 px-5 text-[15px] gap-2"
        : size === "icon"
          ? "h-9 w-9 justify-center"
          : "h-9 px-4 text-sm gap-2";
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled === true || loading}
      className={cx(
        "inline-flex items-center justify-center rounded-[var(--ull-radius)] font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ull-primary)]",
        BUTTON_STYLES[variant],
        sizeCls,
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Campos de formulario
// ---------------------------------------------------------------------------

const FIELD_CLS =
  "w-full rounded-[var(--ull-radius)] border border-[var(--ull-border)] bg-[var(--ull-surface)] px-3 py-2 text-sm text-[var(--ull-text)] placeholder:text-[var(--ull-text-dim)] focus:outline focus:outline-2 focus:outline-[var(--ull-primary)] disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(FIELD_CLS, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(FIELD_CLS, "min-h-[80px]", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(FIELD_CLS, className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, htmlFor, hint, error, children }: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[var(--ull-text)]">
        {label}
      </label>
      {children}
      {hint != null && error == null && <p className="text-xs text-[var(--ull-text-dim)]">{hint}</p>}
      {error != null && <p className="text-xs text-[var(--ull-danger)]">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, id, label, disabled }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
}): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <RadixSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative h-5 w-9 rounded-full bg-[var(--ull-border)] transition-colors data-[state=checked]:bg-[var(--ull-primary)] disabled:opacity-50"
      >
        <RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </RadixSwitch.Root>
      {label != null && (
        <label htmlFor={id} className="text-sm text-[var(--ull-text)]">
          {label}
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}): ReactNode {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <RadixDialog.Content
          className={cx(
            "fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-[var(--ull-surface)] p-5 shadow-xl",
            wide === true ? "max-w-3xl" : "max-w-lg",
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="text-base font-semibold text-[var(--ull-text)]">{title}</RadixDialog.Title>
              {description != null && (
                <RadixDialog.Description className="mt-1 text-sm text-[var(--ull-text-dim)]">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </Button>
            </RadixDialog.Close>
          </div>
          {children}
          {footer != null && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Dropdown / Popover / Tabs / Tooltip re-exports con estilo
// ---------------------------------------------------------------------------

export const Dropdown = RadixDropdown;
export const Popover = RadixPopover;
export const Tabs = RadixTabs;

export function DropdownContent({ children, ...rest }: RadixDropdown.DropdownMenuContentProps): ReactNode {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={6}
        className="z-50 min-w-[180px] rounded-lg border border-[var(--ull-border)] bg-[var(--ull-surface)] p-1 shadow-lg"
        {...rest}
      >
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownItem({ children, className, danger, ...rest }: RadixDropdown.DropdownMenuItemProps & { danger?: boolean }): ReactNode {
  return (
    <RadixDropdown.Item
      className={cx(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none",
        danger === true ? "text-[var(--ull-danger)]" : "text-[var(--ull-text)]",
        "data-[highlighted]:bg-[var(--ull-surface-2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </RadixDropdown.Item>
  );
}

export function TabList({ children }: { children: ReactNode }): ReactNode {
  return (
    <RadixTabs.List className="flex gap-1 rounded-lg bg-[var(--ull-surface-2)] p-1">{children}</RadixTabs.List>
  );
}

export function TabTrigger({ value, children }: { value: string; children: ReactNode }): ReactNode {
  return (
    <RadixTabs.Trigger
      value={value}
      className="rounded-md px-3 py-1.5 text-sm text-[var(--ull-text-dim)] outline-none transition-colors data-[state=active]:bg-[var(--ull-surface)] data-[state=active]:text-[var(--ull-text)] data-[state=active]:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ull-primary)]"
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export function Tooltip({ content, children }: { content: string; children: ReactNode }): ReactNode {
  return (
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            sideOffset={6}
            className="z-50 rounded-md bg-[var(--ull-text)] px-2.5 py-1.5 text-xs text-[var(--ull-bg)] shadow"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastItem {
  id: number;
  message: string;
  kind: "ok" | "error" | "info";
}

const ToastContext = createContext<{ push: (message: string, kind?: ToastItem["kind"]) => void }>({
  push: () => {},
});

export function useToast(): { push: (message: string, kind?: ToastItem["kind"]) => void } {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, kind: ToastItem["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "pointer-events-auto rounded-full px-4 py-2 text-sm shadow-lg",
              t.kind === "error"
                ? "bg-[var(--ull-danger)] text-white"
                : t.kind === "ok"
                  ? "bg-[var(--ull-ok)] text-white"
                  : "bg-[var(--ull-text)] text-[var(--ull-bg)]",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Varios
// ---------------------------------------------------------------------------

export function Spinner({ className }: { className?: string }): ReactNode {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-[var(--ull-primary)]", className)} aria-label="Cargando" />;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" }): ReactNode {
  const cls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        : tone === "danger"
          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
          : "bg-[var(--ull-surface-2)] text-[var(--ull-text-dim)]";
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

export function EmptyState({ icon, title, hint, action }: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--ull-border)] p-10 text-center">
      {icon != null && <div className="text-[var(--ull-text-dim)]">{icon}</div>}
      <p className="text-sm font-medium text-[var(--ull-text)]">{title}</p>
      {hint != null && <p className="max-w-sm text-[13px] text-[var(--ull-text-dim)]">{hint}</p>}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  );
}
