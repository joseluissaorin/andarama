/**
 * Valores por defecto en cascada.
 *
 * `instancia → organización → usuario → plantilla → tour`. Cada nivel solo
 * escribe lo que define; lo demás lo hereda del anterior. Antes esto no
 * existía: los ajustes de un tour nuevo se escribían a mano en la ruta de
 * creación, la columna `settings_json` de la organización no la leía nadie y
 * los `defaultLangs` de la instancia se cargaban para tirarlos acto seguido.
 */

/** Ajustes que una organización puede fijar para todos sus tours. */
export interface OrgDefaults {
  langs?: string[];
  defaultLang?: string;
  /** Bloque `ui` del tour: tema, componentes, pantallas, marca de agua. */
  ui?: Record<string, unknown>;
  transition?: Record<string, unknown>;
  vr?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
  author?: string;
}

/** Preferencias de una persona. */
export interface UserPrefs {
  /** Idioma de la interfaz del Studio. */
  editorLang?: string;
  /** Idioma por defecto de los tours que crea. */
  defaultLang?: string;
  /** Modo de entrada preferido al crear pasos de navegación. */
  entryMode?: string;
}

/** Claves de los ajustes de un tour que participan en la herencia. */
export const INHERITED_KEYS = ["langs", "defaultLang", "ui", "transition", "vr", "analytics", "author"] as const;
export type InheritedKey = (typeof INHERITED_KEYS)[number];

/**
 * Mezcla profunda pero conservadora: los objetos se combinan clave a clave y
 * cualquier otra cosa (arrays incluidos) la reemplaza el nivel más específico.
 * Un array de idiomas no se debe fusionar: si el tour dice ["es"], son esos.
 */
export function mergeDefaults<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) out[key] = mergeDefaults(current, value);
    else out[key] = value;
  }
  return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Ajustes iniciales de un tour nuevo, resolviendo la cascada. `explicit` son
 * las decisiones tomadas en el propio diálogo de creación, que mandan sobre
 * todo lo heredado.
 */
export function resolveNewTourSettings(input: {
  instanceLangs: string[];
  org: OrgDefaults;
  user: UserPrefs;
  template?: Record<string, unknown> | null;
  explicit: { defaultLang?: string };
}): Record<string, unknown> {
  const instanceLevel: Record<string, unknown> = {
    langs: input.instanceLangs.length > 0 ? [...input.instanceLangs] : ["es"],
    defaultLang: input.instanceLangs[0] ?? "es",
    ui: { theme: { base: "ull" } },
  };

  let settings = mergeDefaults(instanceLevel, pick(input.org as Record<string, unknown>, INHERITED_KEYS));
  if (input.user.defaultLang != null) settings = mergeDefaults(settings, { defaultLang: input.user.defaultLang });
  if (input.template != null) settings = mergeDefaults(settings, input.template);

  // Lo elegido al crear el tour manda sobre lo heredado
  if (input.explicit.defaultLang != null && input.explicit.defaultLang !== "") {
    settings = mergeDefaults(settings, { defaultLang: input.explicit.defaultLang });
  }

  // El idioma por defecto tiene que estar entre los idiomas del tour
  const langs = Array.isArray(settings.langs) ? (settings.langs as string[]) : [];
  const defaultLang = String(settings.defaultLang ?? "es");
  settings.langs = langs.includes(defaultLang) ? langs : [defaultLang, ...langs];
  return settings;
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

/**
 * Propaga un cambio de los ajustes de la organización a un borrador que nunca
 * personalizó esa clave. Los tours publicados no se tocan: son instantáneas
 * compiladas y deben seguir viéndose igual hasta que se republiquen.
 *
 * `overrides` lleva la lista de claves que el tour ha personalizado a mano.
 */
export function propagateOrgDefaults(
  tourSettings: Record<string, unknown>,
  orgDefaults: OrgDefaults,
  changedKeys: InheritedKey[],
): Record<string, unknown> {
  const overrides = new Set(readOverrides(tourSettings));
  const next = { ...tourSettings };
  for (const key of changedKeys) {
    if (overrides.has(key)) continue;
    const value = (orgDefaults as Record<string, unknown>)[key];
    if (value === undefined) continue;
    next[key] = value;
  }
  return next;
}

/** Claves que el tour ha personalizado y que ya no siguen a la organización. */
export function readOverrides(tourSettings: Record<string, unknown>): InheritedKey[] {
  const raw = (tourSettings.__overrides as unknown) ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is InheritedKey => (INHERITED_KEYS as readonly string[]).includes(String(k)));
}

/** Marca una clave como personalizada (deja de heredar). */
export function markOverride(tourSettings: Record<string, unknown>, key: InheritedKey): void {
  const current = new Set(readOverrides(tourSettings));
  current.add(key);
  tourSettings.__overrides = [...current];
}

/** Devuelve una clave a la herencia. */
export function clearOverride(tourSettings: Record<string, unknown>, key: InheritedKey): void {
  const current = readOverrides(tourSettings).filter((k) => k !== key);
  if (current.length === 0) delete tourSettings.__overrides;
  else tourSettings.__overrides = current;
}
