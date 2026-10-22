#!/bin/sh
# Runs when an nginx container starts (/docker-entrypoint.d). Writes the deployment settings of this workspace into
# /tmp/whoobe-config.js, which nginx serves as /config.js; the app reads them before the values baked in at build time.
# Only the variables that are set and not empty are written. Values are escaped for a JavaScript string.
set -eu

out=/tmp/whoobe-config.js
names="VITE_CORE_API_URL VITE_ASSET_PROCESSOR_URL VITE_GATEWAY_URL VITE_WHOOBE_ONE_URL VITE_FONT_FAMILIES VITE_PLACEHOLDER_IMAGES VITE_GATEWAY_CORE_API_URL VITE_GATEWAY_ASSET_PROCESSOR_URL VITE_GATEWAY_DEFAULT_RATE_LIMIT_RPS"

{
  echo "window.__WHOOBE_CONFIG__ = {"
  for name in $names; do
    value=$(printenv "$name" || true)
    [ -n "$value" ] || continue
    escaped=$(printf '%s' "$value" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g' | tr -d '\r\n')
    printf '  "%s": "%s",\n' "$name" "$escaped"
  done
  echo "}"
} > "$out"
