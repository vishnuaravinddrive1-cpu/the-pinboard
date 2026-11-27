#!/usr/bin/env bash
# Runs the migrations + tests against a throw-away local Postgres 16 (needs the postgresql-16 server package).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; PGBIN=/usr/lib/postgresql/16/bin; DIR=${PGDIR:-/tmp/pinboard-pg}; PORT=${PGPORT:-54329}
[ -d "$DIR/data" ] && su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null 2>&1" || true
rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true' EXIT
P="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database pb" ; P="$P -d pb"
$P -f "$HERE/../migrations/0001_schema.sql"
$P -f "$HERE/tests.sql"
# Seed + real 100-cap test (default limit of 100, 110 posters)
$P -c "update settings set board_limit = 100, terms_version = '0.1'"
$P -f "$HERE/../seed/seed.sql"
$P -c "select seed_filler(90)"
$P -At -c "select 'seed check: live=' || count(*) filter (where status='live') || ' waiting=' || count(*) filter (where status='waiting') from posters where organiser_email='demo-organiser@example.com'"
$P -At -c "select 'public view rows=' || count(*) from public_posters"
# Removing the sample data again must leave nothing behind
$P -c "select seed_remove()"
$P -At -c "select 'after seed_remove: demo posters=' || (select count(*) from posters where organiser_email='demo-organiser@example.com') || ' demo users=' || (select count(*) from users where email='demo-organiser@example.com') || ' seed images=' || (select count(*) from image_blobs where key like 'seed/%')"
