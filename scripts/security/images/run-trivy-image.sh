#!/usr/bin/env bash
# Scan the built stack images with `trivy image` (OS packages + app dependencies), HIGH/CRITICAL, fixed-only.
# Usage: run-trivy-image.sh [image ...]   (default: the throwaway-stack images, Garage, postgres and the publisher)
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REPORTS="${SECURITY_REPORTS:-$ROOT/scripts/security/reports/$(date +%F)}"
mkdir -p "$REPORTS" "$HOME/.cache/trivy"
IMAGES=("$@")
if [ ${#IMAGES[@]} -eq 0 ]; then
  # the images the stack's compose file names (since 2026-10-22 `${WHOOBE_IMAGE_PREFIX:-whoobe}-<service>:${WHOOBE_VERSION:-local}`,
  # before that `<project>-<service>`): ask compose instead of keeping a list that goes stale
  while IFS= read -r img; do IMAGES+=("$img"); done < <(cd "$ROOT" && docker compose -p whoobe-sectest config --images 2>/dev/null | sort -u)
  [ ${#IMAGES[@]} -gt 0 ] || IMAGES=(whoobe-core-api:local whoobe-gateway:local whoobe-asset-processor:local whoobe-admin-dashboard:local whoobe-whoobe-one-spike:local postgres:16-alpine)
  case " ${IMAGES[*]} " in *" whoobe-garage:v2.4.1 "*) ;; *) IMAGES+=(whoobe-garage:v2.4.1) ;; esac
  # the publisher is a released image but no service of the stack's compose file (F-063: left out of every scan until 0.3.1):
  # build it from the same Dockerfile when it is not there
  PUB="${WHOOBE_IMAGE_PREFIX:-whoobe}-publisher:${WHOOBE_VERSION:-local}"
  docker image inspect "$PUB" >/dev/null 2>&1 || docker build -q --target publisher -t "$PUB" "$ROOT" >/dev/null || echo "build error: $PUB"
  IMAGES+=("$PUB")
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
