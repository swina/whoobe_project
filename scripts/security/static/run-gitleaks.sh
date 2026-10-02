#!/usr/bin/env bash
# shellcheck disable=SC1091
source "$(dirname "$0")/lib.sh"
# Full git history + working tree; report values are redacted.
docker run --rm -v "$ROOT:/repo" zricethezav/gitleaks:latest detect --source /repo --redact \
  --report-format json --report-path "/repo/scripts/security/reports/${RUN_NAME}/gitleaks.json" --exit-code 1
