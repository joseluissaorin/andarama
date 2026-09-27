#!/bin/sh
# Copia de seguridad de una instalación propia (§4.3): base de datos SQLite + medios.
# Uso: ./backup.sh /ruta/de/destino   (prográmalo con cron; funciona desde cualquier carpeta)
# Cada ejecución deja anda-FECHA.db y storage-FECHA/ en el destino.
set -eu
DEST="${1:?Uso: backup.sh <directorio-destino>}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
# docker compose busca el docker-compose.yml y el .env en la carpeta del script
cd "$(dirname "$0")"

# Base de datos con copia consistente (VACUUM INTO), sin parar el servicio
docker compose exec -T andarama node -e "
const Database = require('better-sqlite3');
const db = new Database('/data/andarama.db', { readonly: true });
db.exec(\"VACUUM INTO '/data/backup-tmp.db'\");
db.close();
"
docker compose cp "andarama:/data/backup-tmp.db" "$DEST/anda-$STAMP.db"
docker compose exec -T andarama rm -f /data/backup-tmp.db

# Medios (panorámicas, teselas, tours publicados)
docker compose cp "andarama:/data/storage" "$DEST/storage-$STAMP" 2>/dev/null || echo "Aviso: sin medios que copiar todavía"

echo "Copia completada en $DEST (anda-$STAMP.db y storage-$STAMP/)"
