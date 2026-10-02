#!/usr/bin/env bash
# Runs every static scan (no running stack needed). Individual scans keep going if one fails;
# the exit code is non-zero if any did. Reports: scripts/security/reports/<date>/
cd "$(dirname "$0")" || exit 1
rc=0
for s in run-audit.sh run-gitleaks.sh run-semgrep.sh run-shellcheck.sh run-trivy.sh run-vhtml-inventory.sh; do
  echo "== $s"; bash "$s" || { echo "!! $s exit $?"; rc=1; }
done
exit $rc
