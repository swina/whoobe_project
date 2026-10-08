#!/usr/bin/env bash
# Encrypted backup of a workspace: its Postgres database and its .env.<slug> (the only copy of the workspace's
# credentials and encryption keys). Nothing is ever written to disk unencrypted: pg_dump | gzip | encrypt.
#
# Usage: ./scripts/backup-workspace.sh <slug> [--out-dir DIR] [--no-env] [--keep N]
#
# Encryption (one of, chosen by what you set):
#   BACKUP_AGE_RECIPIENT      an age public key (age1...) or a recipients file; needs `age`.     <- preferred
#   BACKUP_GPG_RECIPIENT      the id/e-mail of a GPG public key in your keyring; needs `gpg`.
# The key that DECRYPTS (age identity / gpg secret key) is NOT needed here and should not live on this host: keep it
# with whoever restores. A backup you cannot decrypt is not a backup - test with restore-workspace-db.sh --check.
#
# --out-dir  where the files go (default ./backups, created mode 700)
# --no-env   do not back up .env.<slug>
# --keep N   afterwards keep only the newest N backups of this workspace (default: keep all)
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 1 ] || usage
SLUG="$1"; shift
OUT_DIR="./backups"; WITH_ENV=true; KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir) OUT_DIR="${2:?--out-dir needs a value}"; shift 2 ;;
    --no-env)  WITH_ENV=false; shift ;;
    --keep)    KEEP="${2:?--keep needs a number}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "Error: slug must be lowercase letters, digits and hyphens." >&2; exit 1; }
[[ "$KEEP" =~ ^[0-9]+$ ]] || { echo "Error: --keep must be a number." >&2; exit 1; }

ENV_FILE=".env.${SLUG}"
[ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found - not a workspace of this checkout." >&2; exit 1; }
get_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }

# ── which encryption ────────────────────────────────────────────────────────
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  command -v age >/dev/null 2>&1 || { echo "Error: BACKUP_AGE_RECIPIENT is set but 'age' is not installed (apt install age / brew install age)." >&2; exit 1; }
  EXT="age"
  if [ -f "$BACKUP_AGE_RECIPIENT" ]; then ENC=(age -R "$BACKUP_AGE_RECIPIENT"); else ENC=(age -r "$BACKUP_AGE_RECIPIENT"); fi
elif [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  command -v gpg >/dev/null 2>&1 || { echo "Error: BACKUP_GPG_RECIPIENT is set but 'gpg' is not installed." >&2; exit 1; }
  EXT="gpg"
  ENC=(gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output -)
else
  echo "Error: no encryption configured. Set BACKUP_AGE_RECIPIENT (age public key or recipients file) or BACKUP_GPG_RECIPIENT." >&2
  echo "       This script does not write unencrypted backups. See docs/release/operations/encryption.md." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_OUT="$OUT_DIR/${SLUG}-${STAMP}.sql.gz.${EXT}"
ENV_OUT="$OUT_DIR/${SLUG}-${STAMP}.env.${EXT}"
DB_USER="$(get_env DB_USER)"; DB_NAME="$(get_env DB_NAME)"
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || { echo "Error: DB_USER / DB_NAME missing in $ENV_FILE." >&2; exit 1; }

cleanup() { rm -f "${DB_OUT}.part" "${ENV_OUT}.part"; }
trap cleanup EXIT

echo ">>> Database ${DB_NAME} -> ${DB_OUT}"
# pipefail makes a failing pg_dump fail the whole pipeline; the file is only renamed when everything succeeded
docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip | "${ENC[@]}" > "${DB_OUT}.part"
[ -s "${DB_OUT}.part" ] || { echo "Error: the dump is empty." >&2; exit 1; }
mv "${DB_OUT}.part" "$DB_OUT"

if $WITH_ENV; then
  echo ">>> ${ENV_FILE} -> ${ENV_OUT}"
  "${ENC[@]}" < "$ENV_FILE" > "${ENV_OUT}.part"
  mv "${ENV_OUT}.part" "$ENV_OUT"
fi

if [ "$KEEP" -gt 0 ]; then
  # newest first; everything past the first N goes (the .env of the same stamp goes with its dump)
  mapfile -t OLD < <(ls -1t "$OUT_DIR"/"${SLUG}"-*.sql.gz."${EXT}" 2>/dev/null | tail -n +"$((KEEP + 1))")
  for f in "${OLD[@]:-}"; do
    [ -n "$f" ] || continue
    rm -f "$f" "${f%.sql.gz.${EXT}}.env.${EXT}"
    echo "    removed old backup $(basename "$f")"
  done
fi

echo ">>> Done. Assets (Garage/S3) are not part of this file: see docs/release/operations/creating-workspaces.md (Backups)."
echo "    Keep the decryption key away from this host, and try a restore: ./scripts/restore-workspace-db.sh --check <file>"
