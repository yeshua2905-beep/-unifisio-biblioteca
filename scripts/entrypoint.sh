#!/bin/sh
set -eu
mkdir -p "$DATA_DIR"
chown node:node "$DATA_DIR"
runuser -u node -- node /app/scripts/bootstrap.mjs
runuser -u node -- node /app/scripts/seed-evidence.mjs
exec runuser -u node -- "$@"
