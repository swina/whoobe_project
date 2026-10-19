#!/usr/bin/env bash
# A real Keycloak for the single sign-on checks (docs/plans/system/oidc-login-plan.md, step 6). It listens on 0.0.0.0:8180 so that the
# containers of the test stack reach it through the gateway of their Docker network, as they reach the mock provider.
#   scripts/security/keycloak/run.sh up | down | status
# Then:  KEYCLOAK_ISSUER=http://<that address>:8180/realms/whoobe-test npx playwright test --config playwright.config.ts browser/oidc-keycloak.spec.ts
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
NAME=whoobe-sectest-keycloak
case "${1:-}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -p 8180:8080 \
      -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin \
      -v "$DIR/realm.json:/opt/keycloak/data/import/realm.json:ro" \
      quay.io/keycloak/keycloak:26.0 start-dev --import-realm >/dev/null
    HOST="$(docker network inspect whoobe-sectest_default --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo 172.17.0.1)"
    echo "waiting for the realm at http://$HOST:8180/realms/whoobe-test ..."
    for _ in $(seq 1 90); do
      curl -fs "http://$HOST:8180/realms/whoobe-test/.well-known/openid-configuration" >/dev/null 2>&1 && { echo "ready: KEYCLOAK_ISSUER=http://$HOST:8180/realms/whoobe-test"; exit 0; }
      sleep 2
    done
    echo "Keycloak did not come up"; docker logs --tail 30 "$NAME"; exit 1 ;;
  down)   docker rm -f "$NAME" ;;
  status) docker ps --filter "name=$NAME" --format '{{.Names}} {{.Status}}' ;;
  *) echo "usage: $0 up|down|status"; exit 1 ;;
esac
