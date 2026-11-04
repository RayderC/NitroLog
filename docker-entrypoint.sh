#!/bin/sh
set -e

CONFIG_DIR="${CONFIG_DIR:-/config}"
SECRET_FILE="$CONFIG_DIR/.session_secret"

# Starts as root only to make the data folder writable, since a bind-mounted folder is usually
# owned by root. The app itself then runs as the unprivileged node user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CONFIG_DIR"
  find "$CONFIG_DIR" ! -user node -exec chown node:node {} + || echo "Warning: couldn't take ownership of $CONFIG_DIR" >&2
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

mkdir -p "$CONFIG_DIR"

if [ -z "${SESSION_SECRET:-}" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64"))' > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE" 2>/dev/null || true
  fi
  SESSION_SECRET="$(cat "$SECRET_FILE")"
  export SESSION_SECRET
fi

exec node server.js
