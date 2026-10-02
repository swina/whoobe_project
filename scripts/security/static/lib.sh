#!/usr/bin/env bash
# Shared helpers for static security scans. Tools run from docker images so nothing is installed on the host.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REPORTS="${SECURITY_REPORTS:-$ROOT/scripts/security/reports/$(date +%F)}"
mkdir -p "$REPORTS"
# shellcheck disable=SC2034  # used by the scripts that source this file
RUN_NAME="$(basename "$REPORTS")"
# shellcheck disable=SC2034
EXCLUDES='node_modules|\.claude/worktrees|/dist/|/\.next/|/\.nuxt/|pnpm-lock\.yaml'
