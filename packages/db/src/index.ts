export * from "./schema.js";

/**
 * Divide un fichero de migracion SQL en sentencias individuales.
 * D1 (`d1 migrations apply`) traga el fichero entero; el runner self-host y
 * los tests necesitan sentencia a sentencia.
 */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"))
    .map((s) => s + ";");
}
