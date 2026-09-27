/**
 * Memoria del visitante en este navegador: un identificador anónimo (sirve
 * al servidor para no aceptar dos veces el mismo formulario de un solo envío
 * y para agrupar el resultado del quiz) y los formularios ya enviados.
 *
 * Sin almacenamiento (modo privado estricto, iframes sin permiso), todo
 * sigue funcionando: solo se pierde la memoria entre visitas.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const VISITOR_KEY = "andarama.visitor";

function safeStorage(storage?: KeyValueStore | null): KeyValueStore | null {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Identificador anónimo y estable del visitante en este navegador. */
export function visitorId(storage?: KeyValueStore | null): string {
  const st = safeStorage(storage);
  try {
    const saved = st?.getItem(VISITOR_KEY);
    if (saved != null && /^[A-Za-z0-9-]{8,64}$/.test(saved)) return saved;
    const id = randomId();
    st?.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export function formSentKey(hotspotId: string): string {
  return `andarama.form.${hotspotId}`;
}

export function wasFormSent(hotspotId: string, storage?: KeyValueStore | null): boolean {
  try {
    return safeStorage(storage)?.getItem(formSentKey(hotspotId)) != null;
  } catch {
    return false;
  }
}

export function rememberFormSent(hotspotId: string, storage?: KeyValueStore | null): void {
  try {
    safeStorage(storage)?.setItem(formSentKey(hotspotId), String(Date.now()));
  } catch {
    // sin almacenamiento: solo se recuerda durante esta visita
  }
}
