import { createIconSvg } from "@andarama/viewer";

/** Utilidades DOM compactas para construir la skin sin framework. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | number | undefined> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "className") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

export function iconButton(iconName: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { className: "anda-btn", type: "button", "aria-label": label, title: label });
  btn.appendChild(createIconSvg(iconName, 20));
  btn.addEventListener("click", onClick);
  return btn;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(container: HTMLElement, message: string): void {
  // El contador del tesoro también es un .anda-toast, pero fijo: no se toca
  container.querySelector(".anda-toast:not(.anda-toast--hud)")?.remove();
  const t = el("div", { className: "anda-toast", role: "status", text: message });
  container.appendChild(t);
  if (toastTimer != null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/** Trampa de foco simple para dialogos (accesibilidad de teclado). */
export function trapFocus(container: HTMLElement, onEscape: () => void): () => void {
  const selector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
  const handler = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = [...container.querySelectorAll<HTMLElement>(selector)].filter(
      (n) => n.offsetParent != null || n === document.activeElement,
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", handler);
  return () => container.removeEventListener("keydown", handler);
}

/**
 * Monta una pantalla modal (`.anda-screen`, ya con role="dialog") dentro del
 * visor: encierra el foco, la cierra con Escape (salvo `escape: false`) y, al
 * cerrarla, devuelve el foco a donde estaba. Devuelve la función que la
 * cierra; `onClose` se llama una sola vez, la cierre quien la cierre.
 */
export function mountScreen(
  container: HTMLElement,
  screen: HTMLElement,
  opts: { focus?: HTMLElement | null; onClose?: () => void; escape?: boolean } = {},
): () => void {
  const previous = document.activeElement as HTMLElement | null;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    release();
    screen.remove();
    if (previous != null && previous.isConnected && previous !== document.body) previous.focus();
    opts.onClose?.();
  };
  const release = trapFocus(screen, () => {
    if (opts.escape !== false) close();
  });
  container.appendChild(screen);
  const target =
    opts.focus ?? screen.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
  target?.focus();
  return close;
}
