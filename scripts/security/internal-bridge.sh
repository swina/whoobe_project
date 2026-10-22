#!/usr/bin/env bash
# Test rig for a stack on an internal Docker network (stack.sh with SEC_COMPOSE_FILE=offline.override.yml, or a workspace
# started with that override): Docker does not publish ports of a network with no route out, so the suites and
# scripts/workspaces.sh cannot reach it from the host. This starts ONE forwarding container that sits on the stack's network and on
# the default bridge, publishes the given host ports and forwards each to a service of the stack. The stack's own containers
# stay on the internal network only: they still have no way out. The forwarder is the only thing that crosses.
#
# Usage: internal-bridge.sh up <network> <hostPort:service:containerPort> ...
#        internal-bridge.sh down
# Example: internal-bridge.sh up whoobe-sectest-b_default 3303:core-api:3003 3301:gateway:3001 3302:asset-processor:3002 3300:admin-dashboard:8080 3306:whoobe-one-spike:8080
set -euo pipefail
NAME=whoobe-internal-bridge
IMAGE="${BRIDGE_IMAGE:-$(sed -n 's/^FROM \(node:[^ ]*\) AS base$/\1/p' "$(dirname "$0")/../../Dockerfile")}"
case "${1:-}" in
  up)
    shift; net="${1:?network name}"; shift
    [ "$#" -gt 0 ] || { echo "give at least one hostPort:service:containerPort" >&2; exit 2; }
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    args=(); spec=''
    for f in "$@"; do
      [[ "$f" =~ ^[0-9]+:[a-z0-9-]+:[0-9]+$ ]] || { echo "bad forward: $f" >&2; exit 2; }
      args+=(-p "127.0.0.1:${f%%:*}:${f%%:*}"); spec="$spec $f"
    done
    docker create --name "$NAME" "${args[@]}" -e "FORWARDS=${spec# }" "$IMAGE" node -e '
      const net = require("net")
      for (const f of process.env.FORWARDS.split(" ")) {
        const [lp, host, port] = f.split(":")
        net.createServer((c) => {
          const u = net.connect(Number(port), host)
          c.pipe(u).pipe(c)
          const end = () => { c.destroy(); u.destroy() }
          c.on("error", end); u.on("error", end)
        }).listen(Number(lp), "0.0.0.0")
      }' >/dev/null
    docker network connect "$net" "$NAME"
    docker start "$NAME" >/dev/null
    echo "bridge up on 127.0.0.1:${spec// /, }" ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 || true; echo "bridge removed" ;;
  *) echo "usage: $0 up <network> <hostPort:service:containerPort>... | down" >&2; exit 2 ;;
esac
