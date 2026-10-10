#!/usr/bin/env bash
# Scan the built stack images with `trivy image` (OS packages + app dependencies), HIGH/CRITICAL, fixed-only.
# Usage: run-trivy-image.sh [image ...]   (default: the throwaway-stack images, Garage and postgres)
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REPORTS="${SECURITY_REPORTS:-$ROOT/scripts/security/reports/$(date +%F)}"
mkdir -p "$REPORTS" "$HOME/.cache/trivy"
IMAGES=("$@")
if [ ${#IMAGES[@]} -eq 0 ]; then
  IMAGES=(whoobe-sectest-core-api:latest whoobe-sectest-gateway:latest whoobe-sectest-asset-processor:latest
          whoobe-sectest-admin-dashboard:latest whoobe-sectest-whoobe-one-spike:latest
          whoobe-garage:v2.4.1 postgres:16-alpine)
fi
# Third-party images whose findings sit in the vendor's own pinned dependencies (postgres' gosu):
# reported, not gating. We cannot patch them without forking (F-050).
ADVISORY='^(postgres:)'
rc=0
for img in "${IMAGES[@]}"; do
  out="$REPORTS/trivy-image-$(echo "$img" | tr '/:' '__').json"
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$HOME/.cache/trivy:/root/.cache" \
    -v "$ROOT/scripts/security/images:/cfg:ro" aquasec/trivy:latest image --quiet --scanners vuln \
    --severity HIGH,CRITICAL --ignore-unfixed --ignorefile /cfg/.trivyignore \
    --format json "$img" > "$out" 2>"$out.err" || { echo "scan error: $img (see $out.err)"; rc=1; continue; }
  if python3 "$ROOT/scripts/security/images/summarize.py" "$out" "$img"; then :;
  elif [[ "$img" =~ $ADVISORY ]]; then echo "  (advisory image: not gating)";
  else rc=1; fi
done
exit $rc
