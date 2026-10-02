#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
cd "$ROOT" && pnpm audit --prod --json > "$REPORTS/pnpm-audit.json"
pnpm audit --prod --audit-level high >/dev/null 2>&1; rc=$?
echo "pnpm audit exit=$rc (report: $REPORTS/pnpm-audit.json)"; exit $rc
