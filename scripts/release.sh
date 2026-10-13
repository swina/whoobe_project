#!/usr/bin/env bash
# Release helper (docs/release/release-process.md).
#
# Usage:
#   ./scripts/release.sh check                          run the release gates on the current commit; changes nothing
#   ./scripts/release.sh prepare <version> [options]    run the gates, then set the version everywhere, stamp
#                                                       CHANGES.md and the documentation, draft the release notes
#
# prepare options:
#   --dry-run       show what would change, write nothing
#   --skip-checks   do not run the gates (testing the script itself; never for a real release)
#
# prepare does NOT commit, tag or push: those steps are printed at the end and are yours to run.
# One product version for the whole monorepo: the root package.json and every app/package (apps/*, packages/*,
# packages/sdk/*) carry the same number. scripts/security is a test package and is not versioned with the product.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail=0
ok()   { echo "  ok    $1"; }
bad()  { echo "  FAIL  $1"; fail=1; }
todo() { echo "  todo  $1"; }

version_files() {
  local f
  echo "package.json"
  for f in apps/*/package.json packages/*/package.json packages/sdk/*/package.json; do
    [ -f "$f" ] && echo "$f"
  done
}

# Newest released version = highest v* tag (none before the first release).
latest_tag() { git tag --list 'v[0-9]*' | sed 's/^v//' | sort -V | tail -1; }

gate_git() {
  echo "Git"
  if [ -z "$(git status --porcelain)" ]; then ok "working tree is clean"; else bad "working tree has uncommitted changes (commit or stash them first)"; fi
  local branch; branch="$(git rev-parse --abbrev-ref HEAD)"
  case "$branch" in
    master|release/*) ok "on branch $branch" ;;
    *) bad "on branch '$branch': release from master, or from a release/<major>.<minor> branch for a patch" ;;
  esac
  if git fetch -q origin 2>/dev/null; then
    local local_sha remote_sha
    local_sha="$(git rev-parse HEAD)"; remote_sha="$(git rev-parse "origin/$branch" 2>/dev/null || true)"
    if [ "$local_sha" = "$remote_sha" ]; then ok "HEAD ${local_sha:0:7} is pushed to origin/$branch"
    else bad "HEAD ${local_sha:0:7} differs from origin/$branch (${remote_sha:0:7}): push or pull first, the CI result must belong to this commit"; fi
  else
    bad "cannot reach origin to compare the commit"
  fi
}

gate_ci() {
  echo "CI (workflow 'security' on this commit, DAST included)"
  local rc=0
  python3 scripts/release/ci-status.py "$(git rev-parse HEAD)" || rc=$?
  case "$rc" in
    0) ok "security workflow and DAST passed" ;;
    2) bad "could not verify the CI result (set GITHUB_TOKEN if the repository is private)" ;;
    *) bad "CI gate not satisfied" ;;
  esac
}

gate_license() {
  echo "License"
  if [ -f LICENSE.md ] && grep -q "^MIT License" LICENSE.md; then ok "LICENSE.md (MIT) present"; else bad "LICENSE.md missing or not the MIT text"; fi
  local f missing=""
  while read -r f; do grep -q '"license": "MIT"' "$f" || missing="$missing $f"; done <<< "$(version_files)"
  if [ -z "$missing" ]; then ok "every product package.json declares \"license\": \"MIT\""; else bad "no MIT license field in:$missing"; fi
  if python3 scripts/release/third-party-notices.py --check >/dev/null; then ok "THIRD_PARTY_NOTICES.md is current and every dependency licence is allowed or reviewed"; else bad "third-party licences: run python3 scripts/release/third-party-notices.py --check"; fi
}

gate_docs() {
  echo "Documentation (docs/release)"
  if python3 scripts/release/check-docs.py; then ok "API docs complete and current, no broken links or paths"; else bad "documentation checks failed"; fi
}

manual_items() {
  echo "Manual items (not automated yet)"
  todo "upgrade test: install the previous release, load data, upgrade to this commit, check migrations and login"
  todo "fresh install test: follow docs/release/operations/creating-workspaces.md on an empty host"
  todo "release notes: list the behaviour changes (new/changed environment variables, new defaults) for operators"
  todo "security status summary (docs/release/security/status-summary.md) is up to date and open items are acknowledged"
}

cmd_check() {
  gate_git; gate_ci; gate_license; gate_docs; manual_items
  echo
  if [ "$fail" = 0 ]; then echo "Gates passed (manual items above are yours)."; else echo "Gates NOT passed."; return 1; fi
}

set_version() {
  # $1 file, $2 version. Keeps the file's formatting: only the first "version" value changes; the root file, which has
  # none, gets one right after "name".
  local f="$1" v="$2"
  if grep -q -m1 '"version"' "$f"; then
    sed -i -E '0,/"version"[[:space:]]*:[[:space:]]*"[^"]*"/s//"version": "'"$v"'"/' "$f"
  else
    sed -i -E '0,/^(\s*)"name"[[:space:]]*:[[:space:]]*"[^"]*",?/s//&\n\1"version": "'"$v"'",/' "$f"
  fi
}

cmd_prepare() {
  local version="${1:-}"; shift || true
  local dry=0 skip=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry=1 ;;
      --skip-checks) skip=1 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
  done
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: $0 prepare <major.minor.patch> [--dry-run] [--skip-checks]" >&2; exit 1; }
  if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then echo "Tag v$version already exists." >&2; exit 1; fi
  local prev; prev="$(latest_tag)"
  if [ -n "$prev" ] && [ "$(printf '%s\n%s\n' "$prev" "$version" | sort -V | tail -1)" != "$version" ]; then
    echo "Version $version is not higher than the latest release $prev." >&2; exit 1
  fi
  echo "Preparing v$version (previous release: ${prev:-none})"
  echo

  if [ "$skip" = 1 ]; then
    echo "WARNING: gates skipped (--skip-checks). Not for a real release."
  else
    cmd_check || { echo; echo "Fix the failed gates and run again."; exit 1; }
  fi
  echo

  local today branch; today="$(date +%F)"; branch="$(git rev-parse --abbrev-ref HEAD)"
  local files; files="$(version_files)"
  echo "Version files ($(echo "$files" | wc -l)):"
  while read -r f; do echo "  $f"; done <<< "$files"
  if [ "$dry" = 1 ]; then
    echo; echo "Dry run: would set the version to $version in those files, add the release marker and entry to CHANGES.md,"
    echo "stamp docs/release/README.md and write .release/notes-v$version.md. Nothing written."
    return 0
  fi

  while read -r f; do set_version "$f" "$version"; done <<< "$files"

  # CHANGES.md: newest first. The marker goes at the very top: everything below it, down to the next marker, belongs to
  # this release; entries written after it land above it and are "unreleased".
  python3 - "$version" "$today" "$branch" "$(echo "$files" | wc -l)" <<'EOF'
import sys
version, today, branch, n = sys.argv[1:5]
entry = (f"# Release v{version} — {today}\n\n"
         f"## [Release v{version}] — {today}\n"
         f"- Branch: `{branch}`. Version {version} set in {n} package.json files (one product version, see docs/release/release-process.md); "
         f"`docs/release/README.md` aligned to this release.\n\n")
s = open('CHANGES.md', encoding='utf-8').read()
open('CHANGES.md', 'w', encoding='utf-8').write(entry + s)
EOF

  python3 - "$version" "$today" <<'EOF'
import re, sys
version, today = sys.argv[1:3]
p = 'docs/release/README.md'
s = open(p, encoding='utf-8').read()
line = f"**Aligned to release:** v{version} ({today}) - see [`release-process.md`](release-process.md)"
s, n = re.subn(r'^\*\*Aligned to release:\*\*.*$', line, s, count=1, flags=re.M)
assert n == 1, 'alignment line not found'
open(p, 'w', encoding='utf-8').write(s)
EOF

  mkdir -p .release
  python3 - "$version" "$today" > ".release/notes-v$version.md" <<'EOF'
import re, sys
version, today = sys.argv[1:3]
s = open('CHANGES.md', encoding='utf-8').read()
# this release = from its marker to the next marker
parts = re.split(r'^# Release v.*$', s, flags=re.M)
body = parts[1] if len(parts) > 1 else s
titles = re.findall(r'^## \[(.+?)\] — (\d{4}-\d{2}-\d{2})', body, flags=re.M)
print(f"# Whoobe CMS v{version}\n")
print(f"Released {today}. DRAFT: written from CHANGES.md headings; edit before publishing.\n")
print("## Highlights\n\n_(write 3-6 lines for operators and buyers)_\n")
print("## Behaviour changes to check when upgrading\n\n_(new or changed environment variables, new defaults, anything that stops working until configured)_\n")
print("## Security\n\nSecurity workflow, including DAST, passed on the release commit. Status and open items: `docs/release/security/status-summary.md`.\n")
print("## Documentation\n\n`docs/release/` at the tag matches this release.\n")
print(f"## Changes ({len(titles)} entries in CHANGES.md)\n")
for t, d in titles:
    print(f"- {t} ({d})")
EOF

  echo
  echo "Done. Review: git diff --stat; edit .release/notes-v$version.md"
  echo "Then, yourself:"
  echo "  git add -A && git commit -m \"Release v$version\""
  echo "  git tag -a v$version -m \"Whoobe CMS v$version\""
  echo "  git push origin $branch --follow-tags"
}

case "${1:-}" in
  check) cmd_check ;;
  prepare) shift; cmd_prepare "$@" ;;
  *) echo "Usage: $0 check | prepare <version> [--dry-run] [--skip-checks]" >&2; exit 1 ;;
esac
