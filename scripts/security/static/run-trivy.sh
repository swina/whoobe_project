#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
docker run --rm -v "$ROOT:/repo" aquasec/trivy:latest config --format json --output /repo/scripts/security/reports/$(basename "$REPORTS")/trivy-config.json /repo
docker run --rm -i hadolint/hadolint hadolint -f json - < "$ROOT/Dockerfile" > "$REPORTS/hadolint.json"
