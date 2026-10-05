#!/bin/sh
set -eu
mkdir -p "$DATA_DIR"
chown node:node "$DATA_DIR"
runuser -u node -- node /app/scripts/bootstrap.mjs
runuser -u node -- node /app/scripts/seed-evidence.mjs
runuser -u node -- node /app/scripts/seed-shoulder.mjs
runuser -u node -- node /app/scripts/seed-knee.mjs
runuser -u node -- node /app/scripts/seed-foot.mjs
runuser -u node -- node /app/scripts/seed-low-back.mjs
runuser -u node -- node /app/scripts/seed-muscle.mjs
runuser -u node -- node /app/scripts/seed-hip.mjs
runuser -u node -- node /app/scripts/seed-nutrition.mjs
runuser -u node -- node /app/scripts/seed-neuro.mjs
exec runuser -u node -- "$@"
