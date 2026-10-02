#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
docker run --rm -v "$ROOT:/src" semgrep/semgrep semgrep scan --config p/typescript --config p/nodejs \
  --config p/expressjs --config p/xss --config p/secrets --exclude node_modules --exclude .claude --exclude dist \
  --exclude sites --json -o /src/scripts/security/reports/$(basename "$REPORTS")/semgrep.json /src
