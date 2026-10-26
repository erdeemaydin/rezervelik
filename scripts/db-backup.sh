#!/usr/bin/env bash
#
# Automated PostgreSQL backup for the dining-reservation database.
#
# What it does, every run:
#   1. Dumps the whole database to $BACKUP_DIR as a timestamped, compressed
#      custom-format file (dining-YYYYmmdd-HHMMSS.dump). Custom format (-Fc)
#      is restorable with pg_restore and supports SELECTIVE restore (one table,
#      one schema) — see docs/operations/DATABASE_RUNBOOK.md.
#   2. Prunes: deletes any dump older than RETENTION_DAYS so old backups are
#      removed automatically and the disk never fills up.
#   3. Appends a one-line summary to $BACKUP_DIR/backup.log.
#
# It reads the connection string straight from the app's .env, so there is no
# second place to keep the password in sync.
#
# Designed to be run from cron (see the install note at the bottom of the
# runbook). Safe to run by hand any time — pg_dump is read-only and never locks
# the app out.
#
# Override any of these with environment variables if needed:
#   APP_DIR         where the repo (and .env) live         (default: ~/dining-reservation)
#   BACKUP_DIR      where dumps are written                (default: ~/db-backups)
#   RETENTION_DAYS  delete dumps older than this many days (default: 14)

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/dining-reservation}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/db-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "ERROR: $APP_DIR/.env not found — cannot read DATABASE_URL" >&2
  exit 1
fi

# Pull DATABASE_URL from .env and strip the Prisma-only "?schema=public" query
# param, which libpq (pg_dump/psql) rejects.
DBURL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 \
  | sed -E 's/^DATABASE_URL="?//; s/"?$//; s/\?schema=public//')"

if [[ -z "$DBURL" ]]; then
  echo "ERROR: DATABASE_URL is empty in $APP_DIR/.env" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/dining-$TS.dump"

# --- 1. Dump -------------------------------------------------------------------
# Write to a .partial file first, then rename on success, so a crash mid-dump
# never leaves a truncated file that looks like a valid backup.
pg_dump "$DBURL" -Fc -f "$OUT.partial"
mv "$OUT.partial" "$OUT"

# --- 2. Prune old backups ------------------------------------------------------
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -name 'dining-*.dump' -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"

# --- 3. Log --------------------------------------------------------------------
KEPT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'dining-*.dump' -type f | wc -l)"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "$(date '+%F %T')  backup=$OUT  size=$SIZE  pruned=$DELETED  kept=$KEPT  retention=${RETENTION_DAYS}d" \
  | tee -a "$BACKUP_DIR/backup.log"
