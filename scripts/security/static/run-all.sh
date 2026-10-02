#!/usr/bin/env bash
# Runs every static scan (no running stack needed), then summarises them against baseline.json.
# Individual scans never stop the run; the exit code comes from the summary: non-zero only for findings
# that are NOT in baseline.json (or baseline entries past their review date).
# Reports: scripts/security/reports/<date>/ (scan output + static-<date>_<time>.txt/.json)
cd "$(dirname "$0")" || exit 1
for s in run-audit.sh run-gitleaks.sh run-semgrep.sh run-shellcheck.sh run-trivy.sh run-vhtml-inventory.sh; do
  echo "== $s"; bash "$s" >/dev/null 2>&1 || echo "   ($s exited non-zero - judged by the summary below)"
done
# shellcheck disable=SC1091
source ./lib.sh
python3 ./summarize.py "$REPORTS"
