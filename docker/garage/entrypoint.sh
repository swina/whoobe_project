#!/bin/sh
# Starts Garage and, on every start, makes sure the single-node layout, the application's access key and its
# bucket exist (all steps idempotent), so `docker compose up` needs no manual setup.
set -eu
: "${S3_ACCESS_KEY_ID:?set S3_ACCESS_KEY_ID}" "${S3_SECRET_ACCESS_KEY:?set S3_SECRET_ACCESS_KEY}" "${S3_BUCKET:?set S3_BUCKET}"

case "$S3_ACCESS_KEY_ID" in
  GK????????????????????????) ;;
  *) echo "S3_ACCESS_KEY_ID must be 'GK' followed by 24 hex characters (Garage key format), e.g. GK$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')" >&2; exit 1 ;;
esac
if [ "${#S3_SECRET_ACCESS_KEY}" -ne 64 ]; then
  echo "S3_SECRET_ACCESS_KEY must be 64 hex characters (Garage key format), e.g. $(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >&2; exit 1
fi

[ -n "${GARAGE_RPC_SECRET:-}" ] || GARAGE_RPC_SECRET="$(printf 'whoobe-garage-rpc:%s' "$S3_SECRET_ACCESS_KEY" | sha256sum | cut -d' ' -f1)"
export GARAGE_RPC_SECRET
CFG=/tmp/garage.toml
sed "s|__S3_REGION__|${S3_REGION:-us-east-1}|" /etc/garage.toml.tpl > "$CFG"
G="garage -c $CFG"

rm -f /tmp/ready
garage -c "$CFG" server &
PID=$!
trap 'kill -TERM "$PID" 2>/dev/null; wait "$PID"; exit 0' TERM INT

i=0
until $G status >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 120 ] && { echo "garage did not come up" >&2; exit 1; }
  kill -0 "$PID" 2>/dev/null || { echo "garage exited" >&2; exit 1; }
  sleep 0.5
done

NODE="$($G node id -q | cut -d@ -f1)"
if $G status | grep -q "NO ROLE ASSIGNED"; then
  $G layout assign -z dc1 -c "${GARAGE_CAPACITY:-100G}" "$NODE"
  $G layout apply --version 1
fi
$G key info "$S3_ACCESS_KEY_ID" >/dev/null 2>&1 || $G key import --yes -n whoobe "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
$G bucket info "$S3_BUCKET" >/dev/null 2>&1 || $G bucket create "$S3_BUCKET" >/dev/null
$G bucket allow --read --write --owner "$S3_BUCKET" --key "$S3_ACCESS_KEY_ID" >/dev/null
touch /tmp/ready
echo "garage ready: bucket $S3_BUCKET"
wait "$PID"
