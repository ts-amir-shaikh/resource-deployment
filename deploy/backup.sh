#!/usr/bin/env bash
# Copy the live database to S3. Safe while sqld is running: SQLite's .backup
# produces a consistent snapshot. Runs nightly from cron and before every
# deploy; pass a label to name the object, default is today's date.
#
#   ./backup.sh                 -> sqld-2026-09-15.db
#   ./backup.sh pre-release-1.2 -> sqld-pre-release-1.2.db
set -euo pipefail
cd "$(dirname "$0")"

LABEL="${1:-$(date +%F)}"
BUCKET="${BACKUP_BUCKET:-techstalwarts-resource-deployment-backups}"
SRC=data/sqld/dbs/default/data
OUT="/tmp/sqld-$LABEL.db"

[ -f "$SRC" ] || { echo "no database at $SRC yet" >&2; exit 1; }
sqlite3 "$SRC" ".backup '$OUT'"
aws s3 cp "$OUT" "s3://$BUCKET/sqld-$LABEL.db" --only-show-errors
rm -f "$OUT"
echo "backed up to s3://$BUCKET/sqld-$LABEL.db"
