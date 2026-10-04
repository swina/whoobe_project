#!/usr/bin/env bash
# Workspace-isolation tests: stack A (the usual throwaway stack) and stack B (SEC_STACK=b, ports +200, own DB, bucket
# and secrets), only the services the tests need (no SPAs). B is removed afterwards; A is left as it was found.
# Usage: scripts/security/isolation/run.sh [--keep]     (--keep leaves stack B running)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
KEEP=false; [ "${1:-}" = "--keep" ] && KEEP=true
SVC="postgres garage core-api asset-processor gateway"
A_WAS_UP=$(docker compose -p whoobe-sectest ps -q core-api 2>/dev/null | head -1)
SEC_SERVICES="$SVC" "$ROOT/scripts/security/stack.sh" up >/dev/null
SEC_STACK=b SEC_SERVICES="$SVC" "$ROOT/scripts/security/stack.sh" up >/dev/null
cleanup() {
  $KEEP || SEC_STACK=b "$ROOT/scripts/security/stack.sh" down >/dev/null 2>&1 || true
  [ -n "$A_WAS_UP" ] || [ -n "${SEC_KEEP_A:-}" ] || "$ROOT/scripts/security/stack.sh" down >/dev/null 2>&1 || true
}
trap cleanup EXIT
cd "$ROOT" && pnpm --filter @whoobe-cms/security test:isolation
