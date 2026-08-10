import { create } from "zustand";

/**
 * Aplicación instalable.
 *
 * Dos cosas que la gente espera de una app de escritorio o de iPad: que se
 * pueda instalar y que avise cuando hay una versión nueva en vez de cambiar el
 * código por debajo mientras se edita.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** El navegador ofrece instalarla (Chrome, Edge, Android). */
  installable: boolean;
  /** Ya se está usando instalada. */
  installed: boolean;
  /** Safari de iPad y iPhone: se instala a mano desde Compartir. */
  iosManual: boolean;
  /** Hay una versión nueva esperando a que se recargue. */
  updateReady: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
  applyUpdate: () => void;
}

let deferredPrompt: InstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;

export const usePwa = create<PwaState>((set) => ({
  installable: false,
  installed: false,
  iosManual: false,
  updateReady: false,
  install: async () => {
    if (deferredPrompt == null) return "unavailable";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    set({ installable: false });
    return outcome;
  },
  applyUpdate: () => {
    if (waitingWorker == null) return;
    // Solo a partir de aquí vale recargar: la primera instalación también
    // cambia de controlador y recargar entonces te tira la página en la cara
    // nada más entrar.
    esperandoRecarga = true;
    waitingWorker.postMessage({ type: "skipWaiting" });
  },
}));

let esperandoRecarga = false;

/** ¿Se está ejecutando ya como aplicación instalada? */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** Safari de iOS y iPadOS no ofrece el diálogo: hay que explicarlo. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function setupPwa(): void {
  usePwa.setState({ installed: isStandalone(), iosManual: isIosSafari() && !isStandalone() });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    usePwa.setState({ installable: true });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    usePwa.setState({ installable: false, installed: true });
  });

  if (!("serviceWorker" in navigator)) return;
  // En desarrollo no hay service worker construido: registrarlo serviría el
  // armazón viejo por encima de Vite y volvería loco a cualquiera.
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/studio/sw.js", { scope: "/studio/" })
      .then((registration) => {
        const track = (worker: ServiceWorker | null): void => {
          if (worker == null) return;
          worker.addEventListener("statechange", () => {
            // Solo es «actualización» si ya había una versión mandando
            if (worker.state === "installed" && navigator.serviceWorker.controller != null) {
              waitingWorker = worker;
              usePwa.setState({ updateReady: true });
            }
          });
        };
        if (registration.waiting != null && navigator.serviceWorker.controller != null) {
          waitingWorker = registration.waiting;
          usePwa.setState({ updateReady: true });
        }
        track(registration.installing);
        registration.addEventListener("updatefound", () => track(registration.installing));
      })
      .catch(() => {
        // sin service worker se sigue funcionando igual, solo que sin instalar
      });

    let recargando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!esperandoRecarga || recargando) return;
      recargando = true;
      location.reload();
    });
  });
}
