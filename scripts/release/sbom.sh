#!/usr/bin/env bash
# Software bill of materials (CycloneDX JSON) for a release: the source tree (the pnpm lockfile, all workspaces) and
# optionally the service images. Written to .release/sbom/ (git-ignored); attach the files to the GitHub Release.
#
# Usage: scripts/release/sbom.sh [--images]
#   --images   also scan the images of the running disposable stack (scripts/security/stack.sh up), one SBOM each
#
# Uses the same scanner as the security workflow (aquasec/trivy). Needs Docker and network access for the first run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT=".release/sbom"
mkdir -p "$OUT"
VERSION="$(node -p "require('./package.json').version || ''")"
[ -n "$VERSION" ] || VERSION="dev"   # the version is set by scripts/release.sh prepare

echo ">>> Source tree (pnpm-lock.yaml) -> $OUT/whoobe-cms-$VERSION-source.cdx.json"
docker run --rm -u "$(id -u):$(id -g)" -v "$ROOT:/repo" aquasec/trivy:latest fs \
  --skip-dirs node_modules --skip-dirs .claude --skip-dirs sites --skip-dirs .release --skip-dirs scripts/security/reports \
  --format cyclonedx --output "/repo/$OUT/whoobe-cms-$VERSION-source.cdx.json" /repo

if [ "${1:-}" = "--images" ]; then
  for img in $(docker images --format '{{.Repository}}' | grep -E '^whoobe-sectest-(core-api|asset-processor|gateway|admin-dashboard|whoobe-one-spike)$' | sort -u); do
    svc="${img#whoobe-sectest-}"
    echo ">>> Image $img -> $OUT/whoobe-$svc-$VERSION.cdx.json"
    docker run --rm -u "0:0" -v /var/run/docker.sock:/var/run/docker.sock -v "$ROOT:/repo" aquasec/trivy:latest image \
      --format cyclonedx --output "/repo/$OUT/whoobe-$svc-$VERSION.cdx.json" "$img"
  done
fi
echo ">>> Done:"; ls -l "$OUT"
