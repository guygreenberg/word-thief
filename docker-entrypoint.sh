#!/bin/sh
set -e
# Persistent disks (e.g. Render's at /var/data) are mounted owned by root. Make DATA_DIR writable for the
# unprivileged "node" user, then drop root before starting the app.
if [ "$(id -u)" = "0" ]; then
  if [ -n "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
    chown -R node:node "$DATA_DIR"
  fi
  exec su-exec node "$@"
fi
exec "$@"
