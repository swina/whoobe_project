#!/usr/bin/env bash
# Generate a native mobile app (Capacitor) from a Whoobe CMS website.
# Usage: ./publish-mobile.sh
#
# This script prompts interactively for all required information,
# then runs the whoobe-mobile CLI generator.
#
# Prerequisites:
#   - Node.js 20+ and pnpm 9+
#   - A running Whoobe CMS with public API access (default: localhost:3003)
#
# For iOS: macOS + Xcode
# For Android: Android Studio
#
# Environment variables:
#   MOBILE_API_URL       Default CMS API URL (default: http://localhost:3003)
#   MOBILE_OUT_DIR       Default output directory (default: ./sites)
#   MOBILE_GATEWAY_URL   Default Gateway URL

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
DEFAULT_API_URL="${MOBILE_API_URL:-http://localhost:3003}"
echo -e "${YELLOW}Tip:${NC} This must be the core-api URL, not the admin dashboard."
echo -e "     Local dev:  ${CYAN}http://localhost:3003${NC}"
echo -e "     Production: ${CYAN}https://cms.example.com${NC}"
echo ""
read -r -p "CMS API URL [$DEFAULT_API_URL]: " API_URL
API_URL="${API_URL:-$DEFAULT_API_URL}"
API_URL="${API_URL%/}"

# Auto-add protocol if missing
if ! echo "$API_URL" | grep -q '://'; then
  API_URL="https://$API_URL"
  echo -e "  → ${CYAN}$API_URL${NC}"
fi

# ── 2. Fetch website list ───────────────────────────────────────────────────
echo ""
echo -e "Fetching website list from ${CYAN}${API_URL}/public/websites${NC}..."
echo ""

WEBSITES_JSON="$(curl -sf "${API_URL}/public/websites" 2>/dev/null || true)"
if [ -z "$WEBSITES_JSON" ]; then
  echo -e "${BOLD}Error:${NC} Could not reach ${API_URL}/public/websites"
  echo "  Is the CMS API running and accessible?"
  exit 1
fi

# Parse into lines: number | name | id
WEBSITE_COUNT="$(echo "$WEBSITES_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('websites',[])))" 2>/dev/null || echo 0)"
if [ "$WEBSITE_COUNT" -eq 0 ]; then
  echo -e "${BOLD}Error:${NC} No websites found on this CMS."
  exit 1
fi

echo -e "Found ${CYAN}${WEBSITE_COUNT}${NC} website(s):"
echo ""
echo "$WEBSITES_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, w in enumerate(data.get('websites', []), 1):
    print(f'  {i}. {w[\"name\"]}  ({w[\"id\"]})')
"

echo ""
read -r -p "Select website number [1-${WEBSITE_COUNT}]: " WEBSITE_NUM
if ! [[ "$WEBSITE_NUM" =~ ^[0-9]+$ ]] || [ "$WEBSITE_NUM" -lt 1 ] || [ "$WEBSITE_NUM" -gt "$WEBSITE_COUNT" ]; then
  echo -e "${BOLD}Error:${NC} Invalid selection."
  exit 1
fi

WEBSITE_ID="$(echo "$WEBSITES_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['websites'][$((WEBSITE_NUM - 1))]['id'])
")"
WEBSITE_NAME="$(echo "$WEBSITES_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['websites'][$((WEBSITE_NUM - 1))]['name'])
")"

echo -e "  → Selected: ${CYAN}${WEBSITE_NAME}${NC}  (${WEBSITE_ID})"

# ── Check if website has a gateway API key configured ───────────────────────
echo ""
echo -e "Checking website configuration..."
WEBSITE_JSON="$(curl -sf "${API_URL}/public/websites/${WEBSITE_ID}" 2>/dev/null || true)"
HAS_GATEWAY_KEY="$(echo "$WEBSITE_JSON" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    prefix = data.get('website', {}).get('gatewayApiKeyPrefix')
    print('true' if prefix else 'false')
except: print('false')
" 2>/dev/null || echo "false")"
GATEWAY_KEY_PREFIX="$(echo "$WEBSITE_JSON" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    prefix = data.get('website', {}).get('gatewayApiKeyPrefix')
    print(prefix or '')
except: print('')
" 2>/dev/null || echo "")"

# ── 3. App name ────────────────────────────────────────────────────────────
DEFAULT_APP_NAME="${WEBSITE_NAME}"
echo ""
echo -e "${YELLOW}Tip:${NC} This is the display name users see on their home screen."
echo ""
read -r -p "App display name [${DEFAULT_APP_NAME}]: " APP_NAME
APP_NAME="${APP_NAME:-$DEFAULT_APP_NAME}"

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
echo ""
echo -e "${YELLOW}Tip:${NC} For Android Studio from Windows, use a Windows path"
echo -e "     like ${CYAN}/mnt/c/Users/YourName/projects/my-mobile-app${NC}"
echo ""
read -r -p "Output directory [${DEFAULT_OUT_DIR}]: " CHOOSEN_OUT_DIR
CHOOSEN_OUT_DIR="${CHOOSEN_OUT_DIR:-$DEFAULT_OUT_DIR}"

# ── 6. Gateway URL (optional) ──────────────────────────────────────────────
DEFAULT_GATEWAY_URL="${MOBILE_GATEWAY_URL:-}"
echo ""
echo -e "${YELLOW}Tip:${NC} Base URL of the API Gateway, needed for gateway-backed forms/bindings."
echo -e "     Example: ${CYAN}https://cms.example.com:3001${NC}"
echo -e "     Leave empty if the website has no Gateway bindings."
echo ""
read -r -p "Gateway URL${DEFAULT_GATEWAY_URL:+ [$DEFAULT_GATEWAY_URL]}: " GATEWAY_URL
GATEWAY_URL="${GATEWAY_URL:-$DEFAULT_GATEWAY_URL}"

# ── 7. Site API key (optional) ─────────────────────────────────────────────
echo ""
if [ "$HAS_GATEWAY_KEY" = "true" ] && [ -n "$GATEWAY_KEY_PREFIX" ]; then
  echo -e "${YELLOW}This website has a Gateway API key configured${NC} (prefix: ${CYAN}${GATEWAY_KEY_PREFIX}...${NC})"
  echo -e "     Paste it below, or leave empty to skip."
  echo -e "     To find the key: admin dashboard → Settings → Publish → Gateway site key."
  echo -e "     If you lost it, generate a new one from the dashboard (this invalidates the old one)."
else
  echo -e "${YELLOW}Gateway API key${NC} — leave empty if the website has no Gateway key configured."
fi
echo ""
read -r -p "Site API key: " SITE_API_KEY

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${CYAN}│              Publishing Summary              │${NC}"
echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────┘${NC}"
echo -e "  ${BOLD}CMS API URL:${NC}     $API_URL"
echo -e "  ${BOLD}Website:${NC}         $WEBSITE_NAME  ($WEBSITE_ID)"
echo -e "  ${BOLD}App name:${NC}        $APP_NAME"
echo -e "  ${BOLD}Bundle ID:${NC}       $APP_ID"
echo -e "  ${BOLD}Output dir:${NC}      $CHOOSEN_OUT_DIR"
echo -e "  ${BOLD}Gateway URL:${NC}     ${GATEWAY_URL:-(none)}"
echo -e "  ${BOLD}Site API key:${NC}    ${SITE_API_KEY:+(set)}${SITE_API_KEY:-"(none)"}"
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

# Optional flags as an array: values keep their spaces/globs literal (no word splitting).
EXTRA_ARGS=()
[ -n "$APP_NAME" ] && EXTRA_ARGS+=(--app-name "$APP_NAME")

echo ""
read -r -p "Generate fully static app (no CMS runtime needed)? [y/N]: " STATIC_ANSWER
case "$STATIC_ANSWER" in
  y|Y|yes|Yes) EXTRA_ARGS+=(--static) ;;
esac

[ -n "$GATEWAY_URL" ] && EXTRA_ARGS+=(--gateway-url "$GATEWAY_URL")
[ -n "$SITE_API_KEY" ] && EXTRA_ARGS+=(--site-api-key "$SITE_API_KEY")

# Build the mobile-app package first
pnpm run --filter @whoobe-cms/mobile-app... build

node packages/mobile-app/bin/whoobe-mobile.js \
  --api-url "$API_URL" \
  --website-id "$WEBSITE_ID" \
  --out-dir "$CHOOSEN_OUT_DIR" \
  --app-id "$APP_ID" \
  "${EXTRA_ARGS[@]}"

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