// Indice de migraciones en orden de aplicacion. Cada entrada corresponde a un
// fichero .sql en este directorio. Lo consumen el runner self-host y el
// bootstrap de Cloudflare (wrangler d1 migrations usa el directorio tal cual).
export const MIGRATIONS = ["0001_init.sql", "0002_media_project.sql", "0003_custom_domain.sql", "0004_drop_connections.sql"];
