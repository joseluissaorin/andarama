#!/bin/sh
# Copia de seguridad self-host (§4.3): SQLite + medios.
# Uso: ./backup.sh /ruta/de/destino  (programalo con cron)
set -eu
DEST="${1:?Uso: backup.sh <directorio-destino>}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

# Base de datos con copia consistente (VACUUM INTO)
docker compose exec -T andarama node -e "
const Database = require('better-sqlite3');
const db = new Database('/data/andarama.db', { readonly: true });
db.exec(\"VACUUM INTO '/data/backup-tmp.db'\");
db.close();
"
docker compose cp "andarama:/data/backup-tmp.db" "$DEST/anda-$STAMP.db"
docker compose exec -T andarama rm -f /data/backup-tmp.db

# Medios (rsync incremental del volumen)
docker compose cp "andarama:/data/storage" "$DEST/storage-sync" 2>/dev/null || true

echo "Copia completada en $DEST (considera litestream para replicación continua)"
