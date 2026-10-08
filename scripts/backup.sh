#!/usr/bin/env bash
# Daily backup: a compressed PostgreSQL dump plus an archive of uploaded media.
#
#   DATABASE_URL=postgres://… UPLOAD_DIR=./storage/uploads BACKUP_DIR=./backups KEEP_DAYS=14 scripts/backup.sh
#
# Schedule it with cron (example, 02:30 every night):
#   30 2 * * * cd /srv/janah && set -a && . ./.env && set +a && scripts/backup.sh >> backups/backup.log 2>&1
# Copy BACKUP_DIR to another machine or object storage afterwards (rclone, aws s3 sync …):
# a backup that lives on the same disk as the database is not a backup.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
UPLOAD_DIR="${UPLOAD_DIR:-./storage/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
umask 077  # dumps contain customer data: owner-only

echo "[$(date -u +%FT%TZ)] dumping database"
pg_dump --format=custom --no-owner --no-privileges --file "$BACKUP_DIR/db-$STAMP.dump.partial" "$DATABASE_URL"
mv "$BACKUP_DIR/db-$STAMP.dump.partial" "$BACKUP_DIR/db-$STAMP.dump"

if [ -d "$UPLOAD_DIR" ]; then
  echo "[$(date -u +%FT%TZ)] archiving uploads"
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz.partial" -C "$UPLOAD_DIR" .
  mv "$BACKUP_DIR/uploads-$STAMP.tar.gz.partial" "$BACKUP_DIR/uploads-$STAMP.tar.gz"
fi

# verify the dump is readable before deleting anything older
pg_restore --list "$BACKUP_DIR/db-$STAMP.dump" > /dev/null

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "[$(date -u +%FT%TZ)] done: $BACKUP_DIR/db-$STAMP.dump"
