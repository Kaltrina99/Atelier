#!/usr/bin/env bash
# Renames the whole template (namespaces, project files, folders, app title).
# Usage: ./scripts/rename-project.sh RiskPortal
set -euo pipefail
NEW=${1:?New PascalCase name, e.g. RiskPortal}
OLD=${2:-Starter}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OLD_K=$(echo "$OLD" | tr '[:upper:]' '[:lower:]'); NEW_K=$(echo "$NEW" | tr '[:upper:]' '[:lower:]')
PRUNE=( -name node_modules -o -name bin -o -name obj -o -name dist -o -name .git )

# 1. File contents
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -type f ! -name 'rename-project.*' -print0 |
  xargs -0 grep -lE "$OLD|$OLD_K-web" 2>/dev/null |
  while read -r f; do sed -i.bak -e "s/$OLD/$NEW/g" -e "s/$OLD_K-web/$NEW_K-web/g" "$f" && rm "$f.bak"; done

# 2. File and folder names (deepest first)
find "$ROOT" \( "${PRUNE[@]}" \) -prune -o -name "*$OLD*" -print | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2- |
  while read -r p; do mv "$p" "$(dirname "$p")/$(basename "$p" | sed "s/$OLD/$NEW/g")"; done

echo "Renamed $OLD -> $NEW"
