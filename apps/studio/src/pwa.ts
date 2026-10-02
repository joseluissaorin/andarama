import { create } from "zustand";
import { useEditor } from "./stores";

/**
 * Aplicación instalable.
 *
 * Dos cosas que la gente espera de una app de escritorio o de iPad: que se
 * pueda instalar y que avise cuando hay una versión nueva en vez de cambiar el
 * código por debajo mientras se edita.
 *
 * El service worker nuevo toma el mando en cuanto se instala (skipWaiting):
 * antes esperaba a que se cerraran todas las pestañas y en el móvil eso no
 * pasa nunca. La página abierta sigue con su código hasta recargar; recarga
 * sola solo cuando es seguro (no hay nada sin guardar y la pestaña no está a
 * la vista) y, si no, enseña el aviso «Hay una versión nueva».
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
  /** Hay una versión nueva mandando: falta recargar para usarla. */
  updateReady: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
  applyUpdate: () => void;
}

let deferredPrompt: InstallPromptEvent | null = null;

/** ¿Hay cambios del editor sin guardar (o guardándose)? */
function hayCambiosSinGuardar(): boolean {
  const { dirty, saving } = useEditor.getState();
  return dirty || saving === "saving";
}

/** Espera (con tope) a que el autoguardado termine antes de recargar. */
async function esperarGuardado(maxMs = 8000): Promise<void> {
  const fin = Date.now() + maxMs;
  while (hayCambiosSinGuardar() && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

let recargando = false;
function recargar(): void {
  if (recargando) return;
  recargando = true;
  location.reload();
}

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
    // Lo pendiente se guarda antes: recargar a mitad de un guardado lo perdería
    void esperarGuardado().then(recargar);
  },
}));

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
    // En app.andarama.com el Studio vive en la raíz y el ámbito es "/";
    // en /studio (workers.dev, self-host) se queda en su carpeta.
    const enRaiz = !location.pathname.startsWith("/studio");
    // Solo cuenta como actualización si ya había una versión mandando: la
    // primera instalación también cambia de controlador y recargar entonces
    // te tira la página en la cara nada más entrar.
    const habiaControlador = navigator.serviceWorker.controller != null;
    void navigator.serviceWorker
      .register("/studio/sw.js", { scope: enRaiz ? "/" : "/studio/" })
      .then((registration) => {
        // Una versión vieja del service worker (sin skipWaiting) que se quedó
        // esperando: se le pide que tome el mando ya.
        registration.waiting?.postMessage({ type: "skipWaiting" });
        // Una pestaña abierta días (el Studio instalado en el móvil) no vuelve
        // a navegar y el navegador no busca versiones: se le pregunta al volver
        // a la app y cada media hora.
        const buscar = (): void => {
          void registration.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") buscar();
        });
        setInterval(buscar, 30 * 60 * 1000);
      })
      .catch(() => {
        // sin service worker se sigue funcionando igual, solo que sin instalar
      });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!habiaControlador) return;
      usePwa.setState({ updateReady: true });
      // Seguro: la pestaña no está a la vista y no hay nada sin guardar
      if (document.visibilityState === "hidden" && !hayCambiosSinGuardar()) recargar();
    });
    // Con el aviso puesto, al irse a otra app se recarga en silencio si se
    // puede: al volver ya está la versión nueva.
    document.addEventListener("visibilitychange", () => {
      if (usePwa.getState().updateReady && document.visibilityState === "hidden" && !hayCambiosSinGuardar()) recargar();
    });
  });
}
