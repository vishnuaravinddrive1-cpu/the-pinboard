#!/usr/bin/env bash
# Full-stack server for browser tests: Postgres + migrations + 20 seeded posters + the API serving web/dist.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; PGBIN=/usr/lib/postgresql/16/bin; DIR=${PGDIR:-/tmp/pinboard-pg-e2e}; PGP=${PGPORT:-54331}
[ -d "$DIR/data" ] && su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null 2>&1" || true
rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -o '-p $PGP -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true' EXIT
psql -h "$DIR" -p $PGP -U postgres -q -c "create database pb"
export DATABASE_URL="postgres://postgres@127.0.0.1:$PGP/pb"
node "$HERE/../../db/migrate.mjs" >/dev/null
node "$HERE/../../db/seed.mjs" >/dev/null
export BOOTSTRAP_ADMIN_EMAIL=admin@e2e.test PORT=${PORT:-4180} DIST="$HERE/../../web/dist"
cd "$HERE/.." && node --import tsx dev/server.ts
