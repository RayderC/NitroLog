#!/bin/sh
set -e

CONFIG_DIR="${CONFIG_DIR:-/config}"
SECRET_FILE="$CONFIG_DIR/.session_secret"

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
