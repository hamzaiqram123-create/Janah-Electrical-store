#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh into the database in DATABASE_URL.
# This REPLACES the current data. Stop the application first.
#
#   DATABASE_URL=postgres://… scripts/restore.sh backups/db-20261008-023000.dump [backups/uploads-20261008-023000.tar.gz]
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
DUMP="${1:?usage: restore.sh <db dump> [uploads archive]}"
UPLOADS="${2:-}"
UPLOAD_DIR="${UPLOAD_DIR:-./storage/uploads}"

[ -f "$DUMP" ] || { echo "no such file: $DUMP" >&2; exit 1; }
if [ "${CONFIRM:-}" != "yes" ]; then
  read -r -p "This will overwrite the database in DATABASE_URL. Type 'yes' to continue: " answer
  [ "$answer" = "yes" ] || { echo "aborted"; exit 1; }
fi

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname "$DATABASE_URL" "$DUMP"
echo "database restored from $DUMP"

if [ -n "$UPLOADS" ]; then
  [ -f "$UPLOADS" ] || { echo "no such file: $UPLOADS" >&2; exit 1; }
  mkdir -p "$UPLOAD_DIR"
  tar -xzf "$UPLOADS" -C "$UPLOAD_DIR"
  echo "uploads restored into $UPLOAD_DIR"
fi
