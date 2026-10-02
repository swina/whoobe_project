#!/usr/bin/env bash
# Shared helpers for static security scans. Tools run from docker images so nothing is installed on the host.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REPORTS="${SECURITY_REPORTS:-$ROOT/scripts/security/reports/$(date +%F)}"
mkdir -p "$REPORTS"
EXCLUDES='node_modules|\.claude/worktrees|/dist/|/\.next/|/\.nuxt/|pnpm-lock\.yaml'
