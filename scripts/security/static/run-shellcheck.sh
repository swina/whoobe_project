#!/usr/bin/env bash
# shellcheck disable=SC1091
source "$(dirname "$0")/lib.sh"
cd "$ROOT" || exit 1
git ls-files '*.sh' | grep -v '^\.claude/' | xargs docker run --rm -v "$ROOT:/mnt" -w /mnt koalaman/shellcheck:stable -f json > "$REPORTS/shellcheck.json"
