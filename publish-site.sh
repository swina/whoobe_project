#!/usr/bin/env bash
# Generate a standalone published website from a Whoobe CMS website.
#
# Interactive:      ./publish-site.sh
# Non-interactive:  ./publish-site.sh --yes --api-url https://cms.example.com --website <uuid> --framework next --gateway-url https://gw.example.com
#
# The script lists the websites of the CMS to pick from, looks at the pages to see whether the site uses the API Gateway
# (data bindings, tables, containers, forms) and only then asks for the gateway URL and the site key, proposes a gateway URL
# that really answers, and checks every gateway binding of the pages before generating. The network work is in
# scripts/publish-preflight.mjs.
#
# Every answer can be given as a flag or as a PUBLISH_* variable; with --yes nothing is asked and the defaults are used.
#   --api-url / PUBLISH_API_URL            CMS API (core-api) URL            --website / PUBLISH_WEBSITE_ID   website UUID
#   --framework / PUBLISH_FRAMEWORK        nuxt|vue, next, docs              --out-dir / PUBLISH_OUT_DIR      output directory
#   --domain / PUBLISH_DOMAIN              custom domain                     --asset-url / PUBLISH_ASSET_URL  public asset base URL
#   --gateway-url / PUBLISH_GATEWAY_URL    API Gateway URL                   --site-key / PUBLISH_SITE_KEY    gateway site key
#   --base-path / PUBLISH_BASE_PATH        mount path (default /)            --revalidate / PUBLISH_REVALIDATE seconds (default 60)
#   --site-url / PUBLISH_SITE_URL          public address of a docs site     --yes                            no prompts
#
# Prerequisites:
#   - Node.js 20+ and pnpm 9+
#   - A running Whoobe CMS with public API access

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
PREFLIGHT=(node "$LOCAL_ROOT/scripts/publish-preflight.mjs")

# ── Color helpers ───────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ── Answers: flags, then PUBLISH_* variables ────────────────────────────────
API_URL="${PUBLISH_API_URL:-}"
WEBSITE_ID="${PUBLISH_WEBSITE_ID:-}"
FRAMEWORK_CHOICE="${PUBLISH_FRAMEWORK:-}"
CHOOSEN_OUT_DIR="${PUBLISH_OUT_DIR_EXACT:-}"
OUT_DIR="${PUBLISH_OUT_DIR:-./sites}"
DOMAIN="${PUBLISH_DOMAIN:-}"
ASSET_URL="${PUBLISH_ASSET_URL:-}"
GATEWAY_URL="${PUBLISH_GATEWAY_URL:-}"
SITE_KEY="${PUBLISH_SITE_KEY:-}"
BASE_PATH="${PUBLISH_BASE_PATH:-}"
REVALIDATE="${PUBLISH_REVALIDATE:-}"
SITE_URL="${PUBLISH_SITE_URL:-}"
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --api-url|--website|--framework|--out-dir|--domain|--asset-url|--gateway-url|--site-key|--base-path|--revalidate|--site-url)
      [ $# -ge 2 ] || { echo -e "${RED}Error:${NC} $1 needs a value." >&2; exit 2; }
      case "$1" in
        --api-url) API_URL="$2" ;;
        --website) WEBSITE_ID="$2" ;;
        --framework) FRAMEWORK_CHOICE="$2" ;;
        --out-dir) CHOOSEN_OUT_DIR="$2" ;;
        --domain) DOMAIN="$2" ;;
        --asset-url) ASSET_URL="$2" ;;
        --gateway-url) GATEWAY_URL="$2" ;;
        --site-key) SITE_KEY="$2" ;;
        --base-path) BASE_PATH="$2" ;;
        --revalidate) REVALIDATE="$2" ;;
        --site-url) SITE_URL="$2" ;;
      esac
      shift 2 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo -e "${RED}Error:${NC} unknown option $1 (see --help)." >&2; exit 2 ;;
  esac
done

# Without a terminal nothing can be asked
[ -t 0 ] || ASSUME_YES=1

# ask VAR "label" "default": keeps a value already given (flag/variable), asks otherwise, uses the default with --yes.
ask() {
  local var="$1" label="$2" default="${3:-}" current="${!1:-}" answer
  if [ -n "$current" ]; then return 0; fi
  if [ "$ASSUME_YES" = 1 ]; then printf -v "$var" '%s' "$default"; return 0; fi
  read -r -p "${label}${default:+ [$default]}: " answer
  printf -v "$var" '%s' "${answer:-$default}"
}

die() { echo -e "${BOLD}${RED}Error:${NC} $*" >&2; exit 1; }

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Whoobe CMS — Publish Website             ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. CMS API URL ─────────────────────────────────────────────────────────
if [ -z "$API_URL" ] && [ "$ASSUME_YES" = 0 ]; then
  echo -e "${YELLOW}Tip:${NC} This must be the core-api URL, not the admin dashboard."
  echo -e "     Production: ${CYAN}https://cms.example.com${NC}  (no port)"
  echo -e "     Local dev:  ${CYAN}http://whoobecms.local:3003${NC}  (port 3003)"
  echo ""
fi
ask API_URL "CMS API URL" "http://localhost:3003"
API_URL="${API_URL%/}"

# Auto-add protocol if missing
if ! echo "$API_URL" | grep -q '://'; then
  API_URL="https://$API_URL"
  echo -e "  → ${CYAN}$API_URL${NC}"
fi

# ── 2. Website: a list to pick from ─────────────────────────────────────────
SITE_LIST=""
if ! SITE_LIST="$("${PREFLIGHT[@]}" sites "$API_URL" 2>&1)"; then
  die "The CMS API does not answer at $API_URL (${SITE_LIST}). It must be the core-api URL (port 3003 in dev)."
fi

if [ -z "$WEBSITE_ID" ]; then
  [ "$ASSUME_YES" = 0 ] || die "--website <uuid> is required without prompts."
  [ -n "$SITE_LIST" ] || die "No website found at $API_URL."
  IDS=(); NAMES=()
  while IFS=$'\t' read -r id name; do IDS+=("$id"); NAMES+=("$name"); done <<< "$SITE_LIST"
  echo ""
  echo "Websites on $API_URL:"
  for i in "${!IDS[@]}"; do
    printf '  %2d) %s  %s\n' "$((i + 1))" "${NAMES[$i]}" "$(echo -e "${CYAN}${IDS[$i]:0:8}…${NC}")"
  done
  echo ""
  read -r -p "Number, or paste a website UUID: " PICK
  if [[ "$PICK" =~ ^[0-9]+$ ]] && [ "$PICK" -ge 1 ] && [ "$PICK" -le "${#IDS[@]}" ]; then
    WEBSITE_ID="${IDS[$((PICK - 1))]}"
  else
    WEBSITE_ID="$PICK"
  fi
fi
[ -n "$WEBSITE_ID" ] || die "Website ID is required."
if ! echo "$SITE_LIST" | cut -f1 | grep -qix "$WEBSITE_ID"; then
  die "Website $WEBSITE_ID is not one of the websites of $API_URL."
fi
SITE_NAME="$(echo "$SITE_LIST" | awk -F'\t' -v id="$WEBSITE_ID" 'tolower($1)==tolower(id){print $2; exit}')"
echo -e "  → ${CYAN}${SITE_NAME}${NC}"

# ── 3. Target framework ────────────────────────────────────────────────────
if [ -z "$FRAMEWORK_CHOICE" ] && [ "$ASSUME_YES" = 0 ]; then
  echo ""
  echo "Select target framework:"
  echo "  1) Nuxt 3   (Vue 3 — SSR/SSG, Nitro)  [default]"
  echo "  2) Next.js  (React — SSR/ISR, Vercel)"
  echo "  3) Svelte   (SvelteKit SSR — coming soon)"
  echo "  4) Documentation (static HTML, for a documentation website: index, search, no framework)"
  echo ""
  read -r -p "Framework [1]: " FRAMEWORK_CHOICE
fi

KIND=site
case "${FRAMEWORK_CHOICE:-1}" in
  4|docs|Docs|DOCS)
    KIND=docs
    FRAMEWORK="docs"
    ;;
  1|vue|Vue|VUE|nuxt|Nuxt|NUXT)
    FRAMEWORK="vue"
    ;;
  2|next|Next|NEXT)
    FRAMEWORK="next"
    ;;
  3|svelte|Svelte|SVELTE)
    echo -e "${YELLOW}Note:${NC} Svelte framework support is planned. Defaulting to Nuxt."
    FRAMEWORK="vue"
    ;;
  *)
    FRAMEWORK="vue"
    ;;
esac

# ── 4. Custom domain, assets ───────────────────────────────────────────────
echo ""
ask DOMAIN "Custom domain (e.g. www.example.com), empty for the CMS hostname" ""

if [ -z "$ASSET_URL" ] && [ "$ASSUME_YES" = 0 ]; then
  echo ""
  echo -e "${YELLOW}Tip:${NC} The public URL for DAM assets (S3 public base). It can differ from the API URL"
  echo -e "     when using a CDN or separate asset domain (CMS settings → S3_PUBLIC_BASE_URL)."
fi
ask ASSET_URL "Public Asset Base URL" "$API_URL"
ASSET_URL="${ASSET_URL%/}"

# ── 5. API Gateway: asked only when the pages use it ───────────────────────
GATEWAY_COUNT=0; GATEWAY_DANGLING=0; GATEWAY_BINDINGS=""
if [ "$KIND" = "site" ]; then
  SCAN="$("${PREFLIGHT[@]}" scan "$API_URL" "$WEBSITE_ID" 2>/dev/null || true)"
  GATEWAY_COUNT="$(echo "$SCAN" | sed -n 's/^gateway=//p')"; GATEWAY_COUNT="${GATEWAY_COUNT:-0}"
  GATEWAY_DANGLING="$(echo "$SCAN" | sed -n 's/^dangling=//p')"; GATEWAY_DANGLING="${GATEWAY_DANGLING:-0}"
  GATEWAY_BINDINGS="$(echo "$SCAN" | sed -n 's/^bindings=//p')"
fi

if [ "$GATEWAY_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}This site uses the API Gateway${NC} ($GATEWAY_COUNT data bindings / forms: tables, containers, fields)."
  echo -e "     The gateway URL is the address of the ${BOLD}gateway service${NC} (port 3001 in dev), NOT the CMS API (3003):"
  echo -e "     the generated site calls it from its own server and from the visitor's browser, so it must be reachable from both."
  if [ -z "$GATEWAY_URL" ]; then
    SUGGESTED="$("${PREFLIGHT[@]}" suggest "$API_URL" 2>/dev/null || true)"
    if [ -n "$SUGGESTED" ]; then
      echo -e "     A gateway answers at ${CYAN}${SUGGESTED}${NC}."
    else
      echo -e "     ${RED}No gateway answers${NC} on the usual addresses (${API_URL}, port 3001). Start it, or enter its public URL."
    fi
  fi
  ask GATEWAY_URL "Gateway API URL" "${SUGGESTED:-${API_URL}}"
  GATEWAY_URL="${GATEWAY_URL%/}"

  if ! "${PREFLIGHT[@]}" probe "$GATEWAY_URL"; then
    echo -e "${YELLOW}Warning:${NC} nothing that looks like the Whoobe Gateway answers at ${GATEWAY_URL} — tables and bound fields would stay empty."
    if [ "$ASSUME_YES" = 0 ]; then
      read -r -p "Use it anyway? [y/N]: " ANYWAY
      case "$ANYWAY" in y|Y|yes|Yes) ;; *) echo "Aborted."; exit 1 ;; esac
    else
      die "Gateway check failed at ${GATEWAY_URL}."
    fi
  fi

  if [ -z "$SITE_KEY" ] && [ "$ASSUME_YES" = 0 ]; then
    echo ""
    echo -e "${YELLOW}Tip:${NC} Gateway site key (Settings → Publish → Gateway site key), only if this website has one."
    echo -e "     It stays on the site's server, never in the browser bundle. A static export cannot use it."
    read -r -s -p "Site key [none]: " SITE_KEY
    echo ""
  fi
  if [ "$GATEWAY_DANGLING" -gt 0 ]; then
    echo -e "${YELLOW}Warning:${NC} $GATEWAY_DANGLING binding(s) in the published pages are not tied to a gateway route (endpoint or route missing when the page was saved): they will stay empty. Re-save those pages in the editor."
  fi
  if [ -n "$GATEWAY_BINDINGS" ]; then
    CHECK_RC=0
    FAILED="$(SITE_KEY="$SITE_KEY" "${PREFLIGHT[@]}" check "$GATEWAY_URL" "$WEBSITE_ID" "$GATEWAY_BINDINGS")" || CHECK_RC=$?
    if [ "$CHECK_RC" = 0 ]; then
      echo -e "  → ${GREEN}every gateway binding resolves at ${GATEWAY_URL}${NC}"
    elif [ "$CHECK_RC" = 4 ]; then
      echo -e "  → ${YELLOW}the gateway asks for the website's site key${NC} (none given: the bindings could not be checked). Pass it with --site-key or PUBLISH_SITE_KEY (Publish tab → Gateway site key)."
    else
      echo -e "${RED}These gateway bindings do not resolve at ${GATEWAY_URL}:${NC}"
      echo "$FAILED" | sed 's/^/     /'
      echo -e "     Wrong gateway URL, a missing site key, or the route was deleted in the Gateway."
      if [ "$ASSUME_YES" = 0 ]; then
        read -r -p "Generate anyway? [y/N]: " ANYWAY
        case "$ANYWAY" in y|Y|yes|Yes) ;; *) echo "Aborted."; exit 1 ;; esac
      else
        die "Gateway bindings do not resolve."
      fi
    fi
  fi
elif [ "$KIND" = "site" ]; then
  echo -e "  → no gateway bindings or forms in the pages: ${CYAN}gateway URL not needed${NC}"
fi

# ── 6. Base path ───────────────────────────────────────────────────────────
if [ -z "$BASE_PATH" ] && [ "$ASSUME_YES" = 0 ]; then
  echo ""
  echo -e "${YELLOW}Tip:${NC} Path this site will be mounted under behind nginx in production (e.g. /blog)."
  echo -e "     Leave as / to serve it at the domain root. Independent from the CMS's own website rootPath."
fi
ask BASE_PATH "Base path" "/"

# ── 7. Output directory ────────────────────────────────────────────────────
ask CHOOSEN_OUT_DIR "Output directory" "${OUT_DIR}/$(echo "${WEBSITE_ID}" | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

# ── 8. ISR revalidate (sites) / public address (documentation) ──────────────
if [ "$KIND" = "docs" ]; then
  ask SITE_URL "Public address of the documentation (for the sitemap, e.g. https://docs.example.com), empty for none" ""
  REVALIDATE=60
else
  ask REVALIDATE "Revalidate (seconds)" "60"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}${CYAN}│              Publishing Summary              │${NC}"
echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────┘${NC}"
echo -e "  ${BOLD}CMS API URL:${NC}     $API_URL"
echo -e "  ${BOLD}Website:${NC}         $SITE_NAME ($WEBSITE_ID)"
echo -e "  ${BOLD}Domain:${NC}          ${DOMAIN:-(CMS hostname)}"
echo -e "  ${BOLD}Asset Base URL:${NC}  $ASSET_URL"
echo -e "  ${BOLD}Gateway URL:${NC}     ${GATEWAY_URL:-(not used)}${SITE_KEY:+  (site key set)}"
echo -e "  ${BOLD}Base path:${NC}       $BASE_PATH"
echo -e "  ${BOLD}Framework:${NC}       $FRAMEWORK"
echo -e "  ${BOLD}Output dir:${NC}      $CHOOSEN_OUT_DIR"
echo -e "  ${BOLD}ISR revalidate:${NC}  ${REVALIDATE}s"
echo ""

# ── Confirm ─────────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" = 0 ]; then
  read -r -p "Proceed? [Y/n]: " CONFIRM
  case "$CONFIRM" in
    n|N|no|No) echo "Aborted."; exit 0 ;;
  esac
fi

# ── Run generator ───────────────────────────────────────────────────────────
cd "$LOCAL_ROOT"

echo ""
echo -e "${GREEN}Generating published site...${NC}"
echo ""

# Optional flags as an array: values keep their spaces/globs literal (no word splitting).
EXTRA_ARGS=()
[ -n "$DOMAIN" ] && EXTRA_ARGS+=(--domain "$DOMAIN")
[ -n "$ASSET_URL" ] && EXTRA_ARGS+=(--asset-base-url "$ASSET_URL")
[ -n "$GATEWAY_URL" ] && EXTRA_ARGS+=(--gateway-url "$GATEWAY_URL")
[ -n "$SITE_KEY" ] && EXTRA_ARGS+=(--site-api-key "$SITE_KEY")
[ -n "$BASE_PATH" ] && EXTRA_ARGS+=(--base-path "$BASE_PATH")

# A documentation website: static HTML, nothing to install or build afterwards
if [ "$KIND" = "docs" ]; then
  pnpm run --filter @whoobe-cms/publish... build
  DOCS_ARGS=()
  [ -n "$SITE_URL" ] && DOCS_ARGS+=(--site-url "$SITE_URL")
  node packages/publish/bin/whoobe-publish.js --kind docs \
    --api-url "$API_URL" \
    --website-id "$WEBSITE_ID" \
    --out-dir "$CHOOSEN_OUT_DIR" \
    "${EXTRA_ARGS[@]}" "${DOCS_ARGS[@]}"
  echo ""
  echo -e "${BOLD}${GREEN}✔ Documentation generated${NC}  ${CYAN}${CHOOSEN_OUT_DIR}${NC}"
  echo -e "Plain HTML: copy the folder to any web server (the base path above is already in the links), e.g."
  echo -e "  ${CYAN}rsync -a --delete ${CHOOSEN_OUT_DIR}/ user@host:/var/www/docs/${NC}"
  echo -e "Preview it here:  ${CYAN}npx serve ${CHOOSEN_OUT_DIR}${NC}"
  exit 0
fi

# Build the publish package and SDK first, then run
pnpm run --filter @whoobe-cms/publish... build
if [ "$FRAMEWORK" = "vue" ]; then
  pnpm run --filter @whoobe-cms/nuxt... build
fi
node packages/publish/bin/whoobe-publish.js \
  --api-url "$API_URL" \
  --website-id "$WEBSITE_ID" \
  --out-dir "$CHOOSEN_OUT_DIR" \
  --framework "$FRAMEWORK" \
  --revalidate "$REVALIDATE" \
  "${EXTRA_ARGS[@]}"

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✔ Site generated successfully!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  ${CYAN}cd ${CHOOSEN_OUT_DIR}${NC}"
echo -e "  ${CYAN}pnpm install${NC}"
if [ "$FRAMEWORK" = "vue" ]; then
  echo -e "  ${CYAN}pnpm dev          # start dev server${NC}"
  echo -e "  ${CYAN}pnpm generate    # static export${NC}"
  echo -e "  ${CYAN}pnpm build       # SSR build${NC}"
  echo ""
  echo -e "Or deploy to Vercel / Netlify:"
  echo -e "  ${CYAN}cd ${CHOOSEN_OUT_DIR} && npx nuxi build && npx vercel --prod${NC}"
else
  echo -e "  ${CYAN}pnpm build${NC}"
  echo -e "  ${CYAN}pnpm start${NC}"
  echo ""
  echo -e "Or deploy to Vercel:"
  echo -e "  ${CYAN}cd ${CHOOSEN_OUT_DIR} && npx vercel --prod${NC}"
fi
echo ""
