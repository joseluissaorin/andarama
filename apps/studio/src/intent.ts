/**
 * El plan que alguien eligió en la web antes de tener cuenta.
 *
 * Los botones de precios de andarama.com llevan a `/register?plan=paseo`. Ese
 * `?plan=` tiene que sobrevivir al alta de Clerk (que redirige por su cuenta)
 * y llegar hasta la página de planes, que abre ese plan directamente. Se
 * guarda en sessionStorage nada más arrancar el Studio y se consume una vez.
 */

const CLAVE = "andarama:plan-intent";

/** Slugs de plan que se aceptan (los mismos que la API). */
const PLANES = new Set(["andar", "aula", "paseo", "excursion", "formacion", "vitalicio"]);

export function normalizePlanSlug(value: string | null | undefined): string | null {
  const slug = value?.trim().toLowerCase() ?? "";
  return PLANES.has(slug) ? slug : null;
}

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Apunta el `?plan=` de la URL de entrada, si lo hay. */
export function rememberPlanIntent(search: string = location.search, storage: Almacen = sessionStorage): string | null {
  const slug = normalizePlanSlug(new URLSearchParams(search).get("plan"));
  if (slug != null) {
    try {
      storage.setItem(CLAVE, slug);
    } catch {
      // almacenamiento no disponible: se pierde el atajo, no el alta
    }
  }
  return slug;
}

/** El plan pendiente, sin consumirlo. */
export function peekPlanIntent(storage: Almacen = sessionStorage): string | null {
  try {
    return normalizePlanSlug(storage.getItem(CLAVE));
  } catch {
    return null;
  }
}

/** El plan pendiente, consumiéndolo: solo se abre una vez. */
export function takePlanIntent(storage: Almacen = sessionStorage): string | null {
  const slug = peekPlanIntent(storage);
  try {
    storage.removeItem(CLAVE);
  } catch {
    // nada
  }
  return slug;
}

/** Sufijo `?plan=…` para los enlaces entre /login y /register. */
export function planQuery(storage: Almacen = sessionStorage): string {
  const slug = peekPlanIntent(storage);
  return slug != null ? `?plan=${slug}` : "";
}
