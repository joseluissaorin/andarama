import es from "./es.json";
import en from "./en.json";

/**
 * «Qué hay de nuevo»: changelog curado a mano en es.json y en.json (el
 * resto de idiomas ve el inglés). Cada entrada lleva su fecha (AAAA-MM-DD);
 * el punto de «sin leer» se enciende cuando hay alguna más reciente que la
 * última que la persona vio, guardada en su cuenta (prefs.novedadesVistas)
 * y, de respaldo, en este navegador.
 */

export interface EntradaNovedades {
  fecha: string;
  titulo: string;
  items: string[];
}

const CLAVE_LOCAL = "andarama:novedades-vistas";

/** Entradas del idioma de la interfaz, de la más reciente a la más antigua. */
export function entradasNovedades(lang: string): EntradaNovedades[] {
  const lista: EntradaNovedades[] = lang === "es" ? es : en;
  return [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Fecha de la entrada más reciente, o null si no hay ninguna. */
export function ultimaFecha(entradas: readonly EntradaNovedades[]): string | null {
  let max: string | null = null;
  for (const e of entradas) if (max == null || e.fecha > max) max = e.fecha;
  return max;
}

/** La más tardía de dos fechas AAAA-MM-DD (cualquiera puede faltar). */
export function fechaMasReciente(a: string | null | undefined, b: string | null | undefined): string | null {
  const validas = [a, b].filter((f): f is string => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f));
  if (validas.length === 0) return null;
  return validas.reduce((x, y) => (y > x ? y : x));
}

/** ¿Hay alguna entrada posterior a la última vista? Quien nunca ha abierto el panel las tiene todas por leer. */
export function hayNovedadesSinLeer(entradas: readonly EntradaNovedades[], vista: string | null | undefined): boolean {
  const ultima = ultimaFecha(entradas);
  if (ultima == null) return false;
  return vista == null || ultima > vista;
}

export function leerVistaLocal(): string | null {
  try {
    return localStorage.getItem(CLAVE_LOCAL);
  } catch {
    return null;
  }
}

export function guardarVistaLocal(fecha: string): void {
  try {
    localStorage.setItem(CLAVE_LOCAL, fecha);
  } catch {
    // almacenamiento bloqueado: queda la preferencia de la cuenta
  }
}
