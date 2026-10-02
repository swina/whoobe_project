#!/usr/bin/env bash
# shellcheck disable=SC1091
source "$(dirname "$0")/lib.sh"
docker run --rm -v "$ROOT:/src" semgrep/semgrep semgrep scan --config p/typescript --config p/nodejs \
  --config p/expressjs --config p/xss --config p/secrets --exclude node_modules --exclude .claude --exclude dist \
  --exclude sites --json -o "/src/scripts/security/reports/${RUN_NAME}/semgrep.json" /src
