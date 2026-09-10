#!/usr/bin/env bash
# Generate a standalone published website from a Whoobe CMS website.
# Usage: ./publish-site.sh
#
# This script prompts interactively for all required information,
# then runs the whoobe-publish CLI generator.
#
# Prerequisites:
#   - Node.js 20+ and pnpm 9+
#   - A running Whoobe CMS with public API access
#   - The website UUID (available in admin dashboard → Websites)

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${PUBLISH_OUT_DIR:-./sites}"

# ── Color helpers ───────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Whoobe CMS — Publish Website            ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. CMS API URL ─────────────────────────────────────────────────────────
DEFAULT_API_URL="${PUBLISH_API_URL:-https://whoobecms.example.com}"
echo -e "${YELLOW}Tip:${NC} This must be the core-api URL, not the admin dashboard."
echo -e "     Production: ${CYAN}https://cms.example.com${NC}  (no port)"
echo -e "     Local dev:  ${CYAN}http://whoobecms.local:3003${NC}  (port 3003)"
echo ""
read -r -p "CMS API URL [$DEFAULT_API_URL]: " API_URL
API_URL="${API_URL:-$DEFAULT_API_URL}"
API_URL="${API_URL%/}"

# Auto-add protocol if missing
if ! echo "$API_URL" | grep -q '://'; then
  API_URL="https://$API_URL"
  echo -e "  → ${CYAN}$API_URL${NC}"
fi

# ── 2. Website ID ──────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Tip:${NC} Find the website ID in the admin dashboard → Websites."
echo -e "     Click the truncated ID (e.g. ${CYAN}abc12345…${NC}) to copy the full UUID."
echo ""
read -r -p "Website ID: " WEBSITE_ID
if [ -z "$WEBSITE_ID" ]; then
  echo -e "${BOLD}Error:${NC} Website ID is required." >&2
  exit 1
fi

# ── 3. Custom domain ───────────────────────────────────────────────────────
read -r -p "Custom domain (e.g. www.example.com) [leave empty for CMS hostname]: " DOMAIN

# ── 4. Public Asset URL ────────────────────────────────────────────────────
echo ""
DEFAULT_ASSET_URL="${API_URL%/}"
echo -e "${YELLOW}Tip:${NC} The public URL for DAM assets (S3/MinIO public base)."
echo -e "     This can differ from the API URL when using a CDN or separate asset domain."
echo -e "     Check your CMS settings for the Public DAM URL (S3_PUBLIC_BASE_URL)."
echo -e "     Leave empty to use the CMS API URL (${CYAN}${API_URL%/}/dam-asset${NC})."
echo ""
read -r -p "Public Asset Base URL [${DEFAULT_ASSET_URL}]: " ASSET_URL
ASSET_URL="${ASSET_URL:-$DEFAULT_ASSET_URL}"
ASSET_URL="${ASSET_URL%/}"

# ── 4. Target framework ────────────────────────────────────────────────────
echo ""
echo "Select target framework:"
echo "  1) Next.js  (recommended — SSR/ISR, Vercel deployable)"
echo "  2) Vue 3    (Nuxt SSR — coming soon)"
echo "  3) Svelte   (SvelteKit SSR — coming soon)"
echo ""
read -r -p "Framework [1]: " FRAMEWORK_CHOICE

case "${FRAMEWORK_CHOICE:-1}" in
  1|next|Next|NEXT)
    FRAMEWORK="next"
    ;;
  2|vue|Vue|VUE)
    FRAMEWORK="vue"
    echo -e "${YELLOW}Note:${NC} Vue framework support is planned. Defaulting to Next.js."
    FRAMEWORK="next"
    ;;
  3|svelte|Svelte|SVELTE)
    FRAMEWORK="svelte"
    echo -e "${YELLOW}Note:${NC} Svelte framework support is planned. Defaulting to Next.js."
    FRAMEWORK="next"
    ;;
  *)
    FRAMEWORK="next"
    ;;
esac

# ── 5. Output directory ────────────────────────────────────────────────────
DEFAULT_OUT_DIR="${OUT_DIR}/$(echo "${WEBSITE_ID}" | tr '[:upper:]' '[:lower:]' | cut -c1-8)"
read -r -p "Output directory [$DEFAULT_OUT_DIR]: " CHOOSEN_OUT_DIR
CHOOSEN_OUT_DIR="${CHOOSEN_OUT_DIR:-$DEFAULT_OUT_DIR}"

# ── 6. ISR revalidate ──────────────────────────────────────────────────────
read -r -p "ISR revalidate (seconds) [60]: " REVALIDATE
REVALIDATE="${REVALIDATE:-60}"

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${CYAN}│              Publishing Summary              │${NC}"
echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────┘${NC}"
echo -e "  ${BOLD}CMS API URL:${NC}     $API_URL"
echo -e "  ${BOLD}Website ID:${NC}      $WEBSITE_ID"
echo -e "  ${BOLD}Domain:${NC}          ${DOMAIN:-(CMS hostname)}"
echo -e "  ${BOLD}Asset Base URL:${NC}  $ASSET_URL"
echo -e "  ${BOLD}Framework:${NC}       $FRAMEWORK"
echo -e "  ${BOLD}Output dir:${NC}      $CHOOSEN_OUT_DIR"
echo -e "  ${BOLD}ISR revalidate:${NC}  ${REVALIDATE}s"
echo ""

# ── Confirm ─────────────────────────────────────────────────────────────────
read -r -p "Proceed? [Y/n]: " CONFIRM
case "$CONFIRM" in
  n|N|no|No) echo "Aborted."; exit 0 ;;
esac

# ── Run generator ───────────────────────────────────────────────────────────
cd "$LOCAL_ROOT"

echo ""
echo -e "${GREEN}Generating published site...${NC}"
echo ""

DOMAIN_ARG=""
if [ -n "$DOMAIN" ]; then
  DOMAIN_ARG="--domain $DOMAIN"
fi

ASSET_ARG=""
if [ -n "$ASSET_URL" ]; then
  ASSET_ARG="--asset-base-url $ASSET_URL"
fi

# Build the publish package first, then run
pnpm run --filter @whoobe-cms/publish build
node packages/publish/bin/whoobe-publish.js \
  --api-url "$API_URL" \
  --website-id "$WEBSITE_ID" \
  --out-dir "$CHOOSEN_OUT_DIR" \
  --framework "$FRAMEWORK" \
  --revalidate "$REVALIDATE" \
  $DOMAIN_ARG \
  $ASSET_ARG

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✔ Site generated successfully!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  ${CYAN}cd ${CHOOSEN_OUT_DIR}${NC}"
echo -e "  ${CYAN}pnpm install${NC}"
echo -e "  ${CYAN}pnpm build${NC}"
echo -e "  ${CYAN}pnpm start${NC}"
echo ""
echo -e "Or deploy to Vercel:"
echo -e "  ${CYAN}cd ${CHOOSEN_OUT_DIR} && npx vercel --prod${NC}"
echo ""
