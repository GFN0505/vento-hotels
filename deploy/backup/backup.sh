#!/bin/sh
# Usage: backup.sh schedule | now | restore-test
#   schedule      run forever: a dump every hour (and a daily one at 02:00 UTC), prune, monthly test
#   now           one dump straight away (before a risky change, for example)
#   restore-test  load the newest daily dump into a scratch database and check it, then drop it
# Settings come from the environment: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, BACKUP_BUCKET and
# rclone's R2 remote (RCLONE_CONFIG_R2_*). Every line it prints starts with "backup:".
set -eu

say() { echo "backup: $*"; }

dump() {
  kind=$1
  stamp=$(date -u +%Y%m%dT%H%MZ)
  file="/tmp/${PGDATABASE}-${stamp}.dump"
  pg_dump --format=custom --no-owner --file="$file"
  rclone copyto "$file" "r2:${BACKUP_BUCKET}/${kind}/$(basename "$file")"
  size=$(du -h "$file" | cut -f1)
  rm -f "$file"
  say "ok ${kind} $(basename "$file") ${size}"
}

prune() {
  rclone delete --min-age 48h "r2:${BACKUP_BUCKET}/hourly" || say "prune hourly failed"
  rclone delete --min-age 35d "r2:${BACKUP_BUCKET}/daily" || say "prune daily failed"
}

restore_test() {
  latest=$(rclone lsf "r2:${BACKUP_BUCKET}/daily" | sort | tail -n 1)
  if [ -z "$latest" ]; then
    say "RESTORE TEST FAILED: no daily dump yet"
    return 1
  fi
  rclone copyto "r2:${BACKUP_BUCKET}/daily/${latest}" /tmp/restore.dump
  dropdb --if-exists restore_check
  createdb restore_check
  if pg_restore --no-owner --dbname=restore_check /tmp/restore.dump; then
    groups=$(psql -d restore_check -Atc 'select count(*) from organizations')
    say "RESTORE TEST OK ${latest}: ${groups} hotel groups"
  else
    say "RESTORE TEST FAILED: ${latest} did not load"
  fi
  dropdb --if-exists restore_check
  rm -f /tmp/restore.dump
}

case "${1:-schedule}" in
  now) dump manual ;;
  restore-test) restore_test ;;
  schedule)
    say "started: hourly dumps, daily at 02:00 UTC, restore test on the 1st at 03:00 UTC"
    while true; do
      # Sleep to the top of the next hour.
      now=$(date -u +%s)
      sleep $(( 3600 - now % 3600 ))
      hour=$(date -u +%H)
      day=$(date -u +%d)
      dump hourly || say "FAILED hourly dump"
      if [ "$hour" = "02" ]; then dump daily || say "FAILED daily dump"; fi
      prune
      if [ "$day" = "01" ] && [ "$hour" = "03" ]; then restore_test || true; fi
    done
    ;;
  *) echo "Usage: backup.sh schedule | now | restore-test" >&2; exit 2 ;;
esac
