#!/usr/bin/env bash
# Decrypts a backup made by backup-workspace.sh and either checks it or restores the database.
#
# Usage:
#   ./scripts/restore-workspace-db.sh --check <file>                 decrypt and test it, restore nothing
#   ./scripts/restore-workspace-db.sh <slug> <file> [--yes]          restore into the workspace's database
#
# Decryption uses what is on the machine you run it on: an age identity (AGE_IDENTITY=/path/to/key.txt) for *.age,
# the gpg secret key in your keyring for *.gpg. --check needs no workspace and no Docker.
#
# A restore REPLACES the workspace's database content (the database is dropped and created again): it asks for
# confirmation unless --yes is given. Stop the workspace's apps first (docker compose ... stop core-api asset-processor gateway).
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

decrypt() { # $1 = file
  case "$1" in
    *.age) command -v age >/dev/null 2>&1 || { echo "Error: 'age' is not installed." >&2; return 1; }
           [ -n "${AGE_IDENTITY:-}" ] || { echo "Error: set AGE_IDENTITY=/path/to/your/age-key.txt" >&2; return 1; }
           age -d -i "$AGE_IDENTITY" "$1" ;;
    *.gpg) command -v gpg >/dev/null 2>&1 || { echo "Error: 'gpg' is not installed." >&2; return 1; }
           gpg --batch --quiet --decrypt "$1" ;;
    *) echo "Error: $1 is not a .age or .gpg file." >&2; return 1 ;;
  esac
}

[ $# -ge 1 ] || usage
if [ "$1" = "--check" ]; then
  [ $# -eq 2 ] && [ -f "$2" ] || usage
  echo ">>> Decrypting and testing $2 ..."
  case "$2" in
    *.sql.gz.*)
      N="$(decrypt "$2" | gzip -dc | grep -c '^CREATE TABLE' || true)"
      [ "$N" -gt 0 ] || { echo "Error: decrypted, but it holds no CREATE TABLE: not a database dump." >&2; exit 1; }
      echo "    OK: a valid dump with ${N} tables." ;;
    *.env.*)
      N="$(decrypt "$2" | grep -c '^[A-Z_]*=' || true)"
      [ "$N" -gt 0 ] || { echo "Error: decrypted, but it holds no variables." >&2; exit 1; }
      echo "    OK: an environment file with ${N} variables (values not shown)." ;;
    *) echo "Error: the name does not say whether this is a dump or an env file." >&2; exit 1 ;;
  esac
  exit 0
fi

[ $# -ge 2 ] || usage
SLUG="$1"; FILE="$2"; shift 2
ASSUME_YES=false
for a in "$@"; do [ "$a" = "--yes" ] && ASSUME_YES=true || usage; done
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "Error: slug must be lowercase letters, digits and hyphens." >&2; exit 1; }
[ -f "$FILE" ] || { echo "Error: $FILE not found." >&2; exit 1; }
[[ "$FILE" == *.sql.gz.* ]] || { echo "Error: restore needs the database dump (*.sql.gz.age / *.sql.gz.gpg)." >&2; exit 1; }
ENV_FILE=".env.${SLUG}"
[ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found." >&2; exit 1; }
get_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
DB_USER="$(get_env DB_USER)"; DB_NAME="$(get_env DB_NAME)"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Error: DB_NAME in $ENV_FILE is missing or not a plain identifier." >&2; exit 1; }

# test it BEFORE touching anything
"$0" --check "$FILE"

if ! $ASSUME_YES; then
  read -r -p "This DROPS and recreates database '${DB_NAME}' of workspace '${SLUG}'. Type the slug to continue: " ANSWER
  [ "$ANSWER" = "$SLUG" ] || { echo "Cancelled."; exit 1; }
fi

PSQL=(docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" exec -T postgres psql -U "$DB_USER" -v ON_ERROR_STOP=1)
echo ">>> Recreating ${DB_NAME} ..."
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS \"${DB_NAME}\" WITH (FORCE)" -c "CREATE DATABASE \"${DB_NAME}\""
echo ">>> Loading the dump ..."
decrypt "$FILE" | gzip -dc | "${PSQL[@]}" -d "$DB_NAME" -q
echo ">>> Done. Start the workspace's apps again (docker compose -p ws-${SLUG} --env-file ${ENV_FILE} up -d)."
