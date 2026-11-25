#!/usr/bin/env bash
# Runs the migrations + tests against a throw-away local Postgres 16 (needs the postgresql-16 server package).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; PGBIN=/usr/lib/postgresql/16/bin; DIR=${PGDIR:-/tmp/pinboard-pg}; PORT=${PGPORT:-54329}
rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true' EXIT
P="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database pb" ; P="$P -d pb"
$P -f "$HERE/shim.sql"
$P -f "$HERE/../migrations/0001_schema.sql"
# storage policies only (pg_cron / pg_net are Supabase-only)
sed -n '/^-- ---*[ ]*storage/,/^-- Public read/p' "$HERE/../migrations/0002_storage_cron.sql" | $P -f -
$P -c "grant execute on all functions in schema public to service_role; grant all on all tables in schema public to service_role"
$P -f "$HERE/tests.sql"
# Seed + real 100-cap test (default limit of 100, 110 posters)
$P -c "update settings set board_limit = 100, terms_version = '2026-11-01'"
$P -f "$HERE/../seed/seed.sql"
$P -c "select seed_filler(90)"
$P -At -c "select 'seed check: live=' || count(*) filter (where status='live') || ' waiting=' || count(*) filter (where status='waiting') from posters where organiser_email='demo-organiser@example.com'"
$P -At -c "select 'public view rows=' || count(*) from public_posters"
