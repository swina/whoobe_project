#!/usr/bin/env bash
# Fleet commands: act on every workspace of this host (or on the ones you name) by calling the scripts that already act on one.
# The source of truth stays the .env.<slug> files at the repository root; there is no central database.
#
# Usage: ./scripts/workspaces.sh <command> [slug ...] [options]
#   list                     one line per workspace: slug, hostname, core-api port, containers running / total / not healthy
#   status                   list, plus the answer of each core-api /health
#   verify                   like status, but the exit status is not zero when a workspace is not running and healthy
#   backup                   scripts/backup/nightly.sh for each workspace (encrypted database dump + env file + bucket copy)
#   upgrade <tag> [options]  back up each workspace, check out <tag> ONCE (all workspaces of a host share this tree), rebuild
#                            and restart each one, wait for it to be healthy. A workspace that runs released images
#                            (WHOOBE_VERSION in its env file, set by provision-workspace.sh --image-version) is moved to
#                            the images of <tag> (pulled when missing, nothing built)
#       --canary <slug>      only that workspace; run it again without --canary for the others after you have looked
#       --no-backup          skip the backup (a workspace is never upgraded when its backup was asked for and failed)
#       --yes                do not ask for confirmation
#
# One workspace failing does not stop the others. The exit status is 0 when every workspace succeeded, 1 when at least one
# failed (the slugs are printed at the end), 2 for a wrong command line.
#
# Every action is appended to a log: when, who (the user, and SUDO_USER when there is one), command, workspace, result.
# Default $HOME/.whoobe/fleet-actions.log (directory 700, file 600), or WHOOBE_FLEET_LOG. One JSON object per line.
# Environment: WORKSPACES_UPGRADE_TIMEOUT (seconds to wait for a workspace to be healthy after an upgrade, default 300),
# BACKUP_* for the backup (docs/release/operations/backup-restore-and-dr.md).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

LOG="${WHOOBE_FLEET_LOG:-$HOME/.whoobe/fleet-actions.log}"
TIMEOUT="${WORKSPACES_UPGRADE_TIMEOUT:-300}"

usage() { sed -n '2,/^set -uo/p' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^# \{0,1\}//'; }

die_usage() { echo "workspaces.sh: $1" >&2; echo "Try: scripts/workspaces.sh --help" >&2; exit 2; }

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n\t' '  '; }

# log_action <command> <slug> <result> [detail]
log_action() {
  local dir; dir="$(dirname "$LOG")"
  mkdir -p "$dir" 2>/dev/null && chmod 700 "$dir" 2>/dev/null
  [ -e "$LOG" ] || { : > "$LOG" 2>/dev/null && chmod 600 "$LOG" 2>/dev/null; }
  printf '{"time":"%s","user":"%s","sudoUser":"%s","command":"%s","workspace":"%s","result":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(json_escape "$(id -un)")" "$(json_escape "${SUDO_USER:-}")" \
    "$(json_escape "$1")" "$(json_escape "$2")" "$(json_escape "$3")" "$(json_escape "${4:-}")" >> "$LOG" 2>/dev/null \
    || echo "workspaces.sh: warning: could not write $LOG" >&2
}

# env_get <slug> <KEY>: last value of KEY in .env.<slug>, without surrounding quotes
env_get() {
  grep -E "^$2=" ".env.$1" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# every workspace has WS_CORE_API_PORT in its env file (provision-workspace.sh); .env, .env.example, .env.dashboard have not
all_workspaces() {
  local f
  for f in .env.*; do
    [ -f "$f" ] || continue
    case "$f" in *.bak|*.old|*~) continue ;; esac
    grep -q '^WS_CORE_API_PORT=' "$f" && echo "${f#.env.}"
  done
}

# containers <slug>: "running total notHealthy". A container that ran once and exited with code 0 (garage-perms) is done, not down.
containers() {
  local out total=0 running=0 bad=0 state health code
  out="$(docker compose -p "ws-$1" --env-file ".env.$1" ps -a --format '{{.State}}|{{.Health}}|{{.ExitCode}}' 2>/dev/null)" || { echo "? ? ?"; return 1; }
  while IFS='|' read -r state health code; do
    [ -n "$state" ] || continue
    [ "$state" = exited ] && [ "$code" = 0 ] && continue
    total=$((total + 1))
    [ "$state" = running ] && running=$((running + 1))
    case "$health" in unhealthy|starting) bad=$((bad + 1)) ;; esac
  done <<< "$out"
  echo "$running $total $bad"
}

health_url() {
  local bind port; bind="$(env_get "$1" WS_APP_BIND_ADDRESS)"; port="$(env_get "$1" WS_CORE_API_PORT)"
  case "$bind" in ''|0.0.0.0) bind=127.0.0.1 ;; esac
  echo "http://$bind:$port/health"
}

# healthy <slug>: every container running, none unhealthy, /health answers 200
healthy() {
  local r t b
  read -r r t b < <(containers "$1")
  [ "$t" != "?" ] && [ "$t" -gt 0 ] && [ "$r" -eq "$t" ] && [ "$b" -eq 0 ] && curl -fsS -m 5 -o /dev/null "$(health_url "$1")" 2>/dev/null
}

# select_workspaces: sets SELECTED from the names on the command line, or all of them
select_workspaces() {
  local known s; known="$(all_workspaces)"
  SELECTED=()
  if [ "$#" -eq 0 ]; then
    while IFS= read -r s; do [ -n "$s" ] && SELECTED+=("$s"); done <<< "$known"
  else
    for s in "$@"; do
      grep -qx -- "$s" <<< "$known" || die_usage "no workspace '$s' (no .env.$s with WS_CORE_API_PORT in $ROOT)"
      SELECTED+=("$s")
    done
  fi
  [ "${#SELECTED[@]}" -gt 0 ] || { echo "No workspace found in $ROOT (an .env.<slug> file with WS_CORE_API_PORT)."; exit 0; }
}

FAILED=()
fail() { FAILED+=("$1"); }
finish() {
  if [ "${#FAILED[@]}" -gt 0 ]; then
    echo; echo "FAILED (${#FAILED[@]}): ${FAILED[*]}"; exit 1
  fi
  exit 0
}

cmd_list() {  # list|status|verify
  local mode="$1"; shift
  select_workspaces "$@"
  local tree; tree="$(git describe --tags --always 2>/dev/null || echo unknown)"
  echo "tree: $tree   workspaces: ${#SELECTED[@]}"
  printf '%-20s %-32s %-6s %-14s %s\n' WORKSPACE HOSTNAME PORT "RUN/TOTAL/BAD" "$([ "$mode" = list ] && echo '' || echo HEALTH)"
  local s r t b h=''
  for s in "${SELECTED[@]}"; do
    read -r r t b < <(containers "$s")
    if [ "$mode" != list ]; then
      if curl -fsS -m 5 -o /dev/null "$(health_url "$s")" 2>/dev/null; then h=ok; else h=DOWN; fi
    fi
    printf '%-20s %-32s %-6s %-14s %s\n' "$s" "$(env_get "$s" WHOOBE_HOSTNAME)" "$(env_get "$s" WS_CORE_API_PORT)" "$r/$t/$b" "$h"
    if [ "$mode" = verify ]; then
      if healthy "$s"; then log_action verify "$s" ok; else log_action verify "$s" failed "running $r of $t, not healthy $b, health $h"; fail "$s"; fi
    fi
  done
  [ "$mode" = verify ] && finish
  exit 0
}

cmd_backup() {
  select_workspaces "$@"
  local s out
  for s in "${SELECTED[@]}"; do
    echo ">>> backup $s"
    if out="$(scripts/backup/nightly.sh "$s" 2>&1)"; then
      echo "$out" | tail -n 3; log_action backup "$s" ok
    else
      echo "$out" | tail -n 8; log_action backup "$s" failed "$(echo "$out" | tail -n 1)"; fail "$s"
    fi
  done
  finish
}

cmd_upgrade() {
  local tag='' canary='' backup=1 yes=0 a
  while [ "$#" -gt 0 ]; do
    a="$1"; shift
    case "$a" in
      --canary) [ "$#" -gt 0 ] || die_usage "--canary needs a slug"; canary="$1"; shift ;;
      --no-backup) backup=0 ;;
      --yes) yes=1 ;;
      -*) die_usage "unknown option $a" ;;
      *) [ -z "$tag" ] || die_usage "one tag only"; tag="$a" ;;
    esac
  done
  [ -n "$tag" ] || die_usage "upgrade needs a tag, e.g. upgrade v0.3.0"
  [ -d .git ] || die_usage "this tree has no .git directory; copy the release over by hand (docs/release/operations/upgrade-and-migrations.md, step 3)"
  git fetch --tags -q 2>/dev/null || echo "warning: git fetch --tags failed, using the tags already here" >&2
  git rev-parse -q --verify "refs/tags/$tag" >/dev/null || die_usage "no tag $tag in this repository"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die_usage "the working tree has uncommitted changes; an upgrade checks out another tag"

  if [ -n "$canary" ]; then select_workspaces "$canary"; else select_workspaces; fi
  local from; from="$(git describe --tags --always)"
  echo "Upgrade of ${#SELECTED[@]} workspace(s): ${SELECTED[*]}"
  echo "Tree: $from -> $tag (one checkout; every workspace of this host builds from it)"
  if [ "$yes" -ne 1 ]; then
    read -r -p "Type the tag to confirm: " a
    [ "$a" = "$tag" ] || { echo "Not confirmed."; exit 2; }
  fi

  local s ready=() out
  for s in "${SELECTED[@]}"; do
    if [ "$backup" -eq 1 ]; then
      echo ">>> backup $s"
      if out="$(scripts/backup/nightly.sh "$s" 2>&1)"; then log_action backup "$s" ok "before upgrade to $tag"
      else
        echo "$out" | tail -n 5; log_action upgrade "$s" skipped "backup failed, not upgraded to $tag"; echo "!!! $s: backup failed, not upgraded"; fail "$s"; continue
      fi
    fi
    ready+=("$s")
  done
  if [ "${#ready[@]}" -eq 0 ]; then echo "Nothing to upgrade."; finish; fi

  local prev_ref; prev_ref="$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)"
  echo ">>> git checkout $tag"
  if ! git checkout -q "$tag"; then
    for s in "${ready[@]}"; do log_action upgrade "$s" failed "git checkout $tag failed"; fail "$s"; done
    finish
  fi

  local waited failed_before="${#FAILED[@]}"
  for s in "${ready[@]}"; do
    echo ">>> upgrade $s"
    local mode=--build prev_version
    prev_version="$(env_get "$s" WHOOBE_VERSION)"
    if [ -n "$prev_version" ]; then
      mode=--no-build
      sed -i "s|^WHOOBE_VERSION=.*|WHOOBE_VERSION=${tag#v}|" ".env.$s"
    fi
    if ! docker compose -p "ws-$s" --env-file ".env.$s" up -d $mode >"/tmp/workspaces-upgrade-$s.log" 2>&1; then
      tail -n 8 "/tmp/workspaces-upgrade-$s.log"
      # the env file must keep naming the version that is running, or the next restart asks for images that are not there
      [ -n "$prev_version" ] && sed -i "s|^WHOOBE_VERSION=.*|WHOOBE_VERSION=${prev_version}|" ".env.$s"
      log_action upgrade "$s" failed "docker compose up failed ($from -> $tag); output in /tmp/workspaces-upgrade-$s.log"; fail "$s"; continue
    fi
    waited=0
    until healthy "$s"; do
      if [ "$waited" -ge "$TIMEOUT" ]; then break; fi
      sleep 5; waited=$((waited + 5))
    done
    if healthy "$s"; then echo "    $s healthy after ${waited}s"; log_action upgrade "$s" ok "$from -> $tag"
    else echo "!!! $s not healthy after ${TIMEOUT}s"; log_action upgrade "$s" failed "not healthy after ${TIMEOUT}s ($from -> $tag)"; fail "$s"; fi
  done
  # nothing runs the new tag: leave the tree where it was, so a rebuild or a later upgrade starts from what is running
  if [ "$(( ${#FAILED[@]} - failed_before ))" -ge "${#ready[@]}" ]; then
    echo ">>> every upgrade failed: tree back on $prev_ref"; git checkout -q "$prev_ref" || echo "warning: could not check out $prev_ref" >&2
  fi
  [ -n "$canary" ] && [ "${#FAILED[@]}" -eq 0 ] && echo && echo "Canary done. Look at $canary, then run the upgrade again without --canary for the others (it will upgrade $canary again, which is harmless)."
  finish
}

case "${1:-}" in
  ''|-h|--help|help) usage; exit 0 ;;
  list|status|verify) c="$1"; shift; cmd_list "$c" "$@" ;;
  backup) shift; cmd_backup "$@" ;;
  upgrade) shift; cmd_upgrade "$@" ;;
  *) die_usage "unknown command '$1'" ;;
esac
