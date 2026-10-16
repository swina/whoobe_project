#!/usr/bin/env bash
# shellcheck disable=SC1091
source "$(dirname "$0")/lib.sh"
docker run --rm -v "$ROOT:/repo" aquasec/trivy:latest config --skip-dirs node_modules --skip-dirs .claude --skip-dirs sites --skip-dirs apps/publisher/published --format json --output "/repo/scripts/security/reports/${RUN_NAME}/trivy-config.json" /repo
docker run --rm -i hadolint/hadolint hadolint -f json - < "$ROOT/Dockerfile" > "$REPORTS/hadolint.json"
