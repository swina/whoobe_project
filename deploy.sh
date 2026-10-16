#!/usr/bin/env bash
# Deploy Whoobe CMS to production server.
# Usage: ./deploy.sh [--dry-run]
#   --dry-run  Show what would be synced without transferring anything.
#
# This is the single-host PM2 path (docs/release/operations/deployment.md, section 7): it copies the repository to the
# host, installs, builds every app and (re)starts the processes from ecosystem.config.cjs. The Docker Compose path
# for one workspace per customer is scripts/create-workspace.sh (docs/release/operations/creating-workspaces.md).
#
# Prerequisites:
#   1. Export DEPLOY_HOST (user@host) and DEPLOY_PATH (absolute directory on the host). There are no defaults:
#      the script never guesses a server.
#   2. SSH key authentication set up for the remote host.
#   3. The remote .env is maintained separately (never overwritten by rsync).

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
REMOTE_HOST="${DEPLOY_HOST:?Set DEPLOY_HOST to user@host (there is no default)}"
REMOTE_PATH="${DEPLOY_PATH:?Set DEPLOY_PATH to the directory on the host (there is no default)}"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"

RSYNC_FLAGS=(-avz --delete)
EXCLUDES=(
  --include '.env.example'
  --exclude '.env'
  --exclude '.env.*'
  --exclude '.git'
  --exclude '.claude'
  --exclude '.turbo'
  --exclude 'node_modules'
  --exclude 'deploy.sh'
  --exclude '*.log'
  --exclude 'sites'
  --exclude '.release'
  --exclude '.opencode'
  --exclude 'examples'
  --exclude 'scripts/security/reports'
  --exclude 'scripts/security/test-results'
  # --delete would remove, on the host, whatever exists only there. Protect what the host creates and the repository
  # does not contain: Let's Encrypt state (certificates AND private keys) and the nginx files generated per workspace.
  --filter 'P /deploy/certbot/***'
  --filter 'P /deploy/nginx/*.conf'
  --filter 'P /deploy/nginx/_locations-*.inc'
)

DRY_RUN=()
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=(--dry-run)
  echo ">>> DRY RUN - no files will be transferred"
fi

# ── Sync files ──────────────────────────────────────────────────────────────
echo ">>> Syncing $LOCAL_ROOT → $REMOTE_HOST:$REMOTE_PATH ..."
rsync "${RSYNC_FLAGS[@]}" "${EXCLUDES[@]}" "${DRY_RUN[@]}" "$LOCAL_ROOT/" "$REMOTE_HOST:$REMOTE_PATH/"

if [ "${#DRY_RUN[@]}" -gt 0 ]; then
  echo ">>> Dry run complete. Remove --dry-run to deploy."
  exit 0
fi

# ── Remote build & restart ───────────────────────────────────────────────────
echo ""
echo ">>> Installing dependencies & building on remote..."
# The heredoc is intentionally unquoted: $REMOTE_PATH expands here, \$-escaped vars on the host.
# shellcheck disable=SC2087
ssh "$REMOTE_HOST" <<-SSH_EOF
  set -e
  export NVM_DIR="\$HOME/.nvm"
  [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
  cd "$REMOTE_PATH"

  echo "--- pnpm install ---"
  pnpm install --frozen-lockfile

  echo "--- pnpm build ---"
  pnpm build

  echo "--- pm2 restart ---"
  ls -la "$REMOTE_PATH/ecosystem.config.cjs" && cd "$REMOTE_PATH" && pm2 start ecosystem.config.cjs --update-env
  pm2 save

  echo "--- status ---"
  pm2 list
SSH_EOF

echo ""
echo ">>> Deploy complete on $REMOTE_HOST. Check the services: ssh $REMOTE_HOST pm2 list"