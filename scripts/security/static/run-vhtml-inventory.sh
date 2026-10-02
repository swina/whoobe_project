#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
cd "$ROOT" && grep -rnE 'v-html|innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write' apps packages --include='*.vue' --include='*.ts' --include='*.tsx' --include='*.js' \
  | grep -vE "$EXCLUDES" > "$REPORTS/vhtml-inventory.txt"; wc -l "$REPORTS/vhtml-inventory.txt"
