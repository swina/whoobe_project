#!/usr/bin/env bash
# Deploy Whoobe CMS to production server.
# Usage: ./deploy.sh [--dry-run]
#   --dry-run  Show what would be synced without transferring anything.
#
# Prerequisites:
#   1. Set DEPLOY_HOST and DEPLOY_PATH below (or export them as env vars).
#   2. SSH key authentication set up for the remote host.
#   3. The remote .env is maintained separately (never overwritten by rsync).

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
REMOTE_HOST="${DEPLOY_HOST:-ubuntu@whoobecms.devophub.space}"
REMOTE_PATH="${DEPLOY_PATH:-/opt/whoobe/whoobe_cms}"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"

RSYNC_FLAGS="-avz --delete"
EXCLUDES=(
  --exclude '.env'
  --exclude '.git'
  --exclude '.turbo'
  --exclude 'node_modules'
  --exclude 'deploy.sh'
  --exclude '*.log'
  --exclude 'sites'
)

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  echo ">>> DRY RUN - no files will be transferred"
fi

# ── Sync files ──────────────────────────────────────────────────────────────
echo ">>> Syncing $LOCAL_ROOT → $REMOTE_HOST:$REMOTE_PATH ..."
rsync $RSYNC_FLAGS "${EXCLUDES[@]}" $DRY_RUN "$LOCAL_ROOT/" "$REMOTE_HOST:$REMOTE_PATH/"

if [ -n "$DRY_RUN" ]; then
  echo ">>> Dry run complete. Remove --dry-run to deploy."
  exit 0
fi

# ── Remote build & restart ───────────────────────────────────────────────────
echo ""
echo ">>> Installing dependencies & building on remote..."
ssh "$REMOTE_HOST" <<-SSH_EOF
  set -e
  export NVM_DIR="\$HOME/.nvm"
  [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
  cd "$REMOTE_PATH"

  echo "--- pnpm install ---"
  pnpm install

  echo "--- pnpm build ---"
  pnpm build

  echo "--- pm2 restart ---"
  ls -la "$REMOTE_PATH/ecosystem.config.cjs" && cd "$REMOTE_PATH" && pm2 start ecosystem.config.cjs --update-env
  pm2 save

  echo "--- status ---"
  pm2 list
SSH_EOF

echo ""
echo ">>> Deploy complete. Verify at https://whoobecms.devophub.space"