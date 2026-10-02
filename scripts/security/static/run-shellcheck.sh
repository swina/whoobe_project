#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
git ls-files '*.sh' | grep -v '^\.claude/' | xargs docker run --rm -v "$ROOT:/mnt" -w /mnt koalaman/shellcheck:stable -f json > "$REPORTS/shellcheck.json"
