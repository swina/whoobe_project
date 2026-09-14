#!/usr/bin/env bash
# Generate a native mobile app (Capacitor) from a Whoobe CMS website.
# Usage: ./publish-mobile.sh
#
# This script prompts interactively for all required information,
# then runs the whoobe-mobile CLI generator.
#
# Prerequisites:
#   - Node.js 20+ and pnpm 9+
#   - A running Whoobe CMS with public API access
#   - The website UUID (available in admin dashboard → Websites)
#   - At least one page with kind "app" in the website
#
# For iOS: macOS + Xcode
# For Android: Android Studio

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${MOBILE_OUT_DIR:-./sites}"

# ── Color helpers ───────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Whoobe CMS — Publish Mobile App        ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. CMS API URL ─────────────────────────────────────────────────────────
DEFAULT_API_URL="${MOBILE_API_URL:-https://whoobecms.example.com}"
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

# ── 3. App name ────────────────────────────────────────────────────────────
DEFAULT_APP_NAME=""
echo -e "${YELLOW}Tip:${NC} This is the display name users see on their home screen."
echo -e "     Leave empty to use the website name from the CMS."
echo ""
read -r -p "App display name [${DEFAULT_APP_NAME:-website name}]: " APP_NAME

# ── 4. Bundle identifier ────────────────────────────────────────────────────
DEFAULT_APP_ID="com.whoobe.mobile.$(echo "${WEBSITE_ID}" | tr '[:upper:]' '[:lower:]' | cut -c1-8)"
echo ""
echo -e "${YELLOW}Tip:${NC} A reverse-domain identifier, e.g. ${CYAN}com.mycompany.myapp${NC}"
echo -e "     Default: ${CYAN}${DEFAULT_APP_ID}${NC}"
echo ""
read -r -p "Bundle identifier [${DEFAULT_APP_ID}]: " APP_ID
APP_ID="${APP_ID:-$DEFAULT_APP_ID}"

# ── 5. Output directory ────────────────────────────────────────────────────
DEFAULT_OUT_DIR="${OUT_DIR}/mobile-$(echo "${WEBSITE_ID}" | tr '[:upper:]' '[:lower:]' | cut -c1-8)"
read -r -p "Output directory [$DEFAULT_OUT_DIR]: " CHOOSEN_OUT_DIR
CHOOSEN_OUT_DIR="${CHOOSEN_OUT_DIR:-$DEFAULT_OUT_DIR}"

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${CYAN}│              Publishing Summary              │${NC}"
echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────┘${NC}"
echo -e "  ${BOLD}CMS API URL:${NC}     $API_URL"
echo -e "  ${BOLD}Website ID:${NC}      $WEBSITE_ID"
echo -e "  ${BOLD}App name:${NC}        ${APP_NAME:-(website name)}"
echo -e "  ${BOLD}Bundle ID:${NC}       $APP_ID"
echo -e "  ${BOLD}Output dir:${NC}      $CHOOSEN_OUT_DIR"
echo ""

# ── Confirm ─────────────────────────────────────────────────────────────────
read -r -p "Proceed? [Y/n]: " CONFIRM
case "$CONFIRM" in
  n|N|no|No) echo "Aborted."; exit 0 ;;
esac

# ── Run generator ───────────────────────────────────────────────────────────
cd "$LOCAL_ROOT"

echo ""
echo -e "${GREEN}Generating mobile app project...${NC}"
echo ""

APP_NAME_ARG=""
if [ -n "$APP_NAME" ]; then
  APP_NAME_ARG="--app-name $APP_NAME"
fi

# Build the mobile-app package first
pnpm run --filter @whoobe-cms/mobile-app build

node packages/mobile-app/bin/whoobe-mobile.js \
  --api-url "$API_URL" \
  --website-id "$WEBSITE_ID" \
  --out-dir "$CHOOSEN_OUT_DIR" \
  --app-id "$APP_ID" \
  $APP_NAME_ARG

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✔ Mobile app project generated successfully!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  ${CYAN}cd ${CHOOSEN_OUT_DIR}${NC}"
echo -e "  ${CYAN}npm install${NC}"
echo -e "  ${CYAN}npm run build${NC}"
echo -e "  ${CYAN}npx cap add android${NC}"
echo -e "  ${CYAN}npx cap add ios      # macOS only${NC}"
echo -e "  ${CYAN}npx cap sync${NC}"
echo -e "  ${CYAN}npx cap open android${NC}"
echo -e "  ${CYAN}npx cap open ios     # macOS only${NC}"
echo ""