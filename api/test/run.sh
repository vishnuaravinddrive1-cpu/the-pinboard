#!/usr/bin/env bash
# API tests against a throw-away local Postgres 16 (migrations applied exactly as in production).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; PGBIN=/usr/lib/postgresql/16/bin; DIR=${PGDIR:-/tmp/pinboard-pg-api}; PORT=${PGPORT:-54330}
[ -d "$DIR/data" ] && su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null 2>&1" || true
rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true' EXIT
psql -h "$DIR" -p $PORT -U postgres -q -c "create database pb"
export DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/pb" TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/pb"
node "$HERE/../../db/migrate.mjs"
cd "$HERE/.." && node --import tsx --test test/*.test.ts
