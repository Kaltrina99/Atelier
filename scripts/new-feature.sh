#!/usr/bin/env bash
# Scaffolds a new feature (backend + frontend) by copying the Products template.
# Usage: ./scripts/new-feature.sh Customer Customers
set -euo pipefail
NAME=${1:?Singular PascalCase name, e.g. Customer}
PLURAL=${2:?Plural PascalCase name, e.g. Customers}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
lc() { echo "$(echo "${1:0:1}" | tr '[:upper:]' '[:lower:]')${1:1}"; }
NAME_L=$(lc "$NAME"); PLURAL_L=$(lc "$PLURAL")

replace() { sed -e "s/Products/$PLURAL/g" -e "s/products/$PLURAL_L/g" -e "s/Product/$NAME/g" -e "s/product/$NAME_L/g"; }

copy_template() {
  local src=$1 dst=$2
  [[ -e "$dst" ]] && { echo "$dst already exists"; exit 1; }
  mkdir -p "$dst"
  for f in "$src"/*; do
    local new; new=$(basename "$f" | replace)
    replace < "$f" > "$dst/$new"
    echo "  + $new"
  done
}

API_DIR=$(find "$ROOT/backend/src" -mindepth 1 -maxdepth 1 -type d | head -1)
echo "Backend:";  copy_template "$API_DIR/Features/Products" "$API_DIR/Features/$PLURAL"
echo "Frontend:"; copy_template "$ROOT/frontend/src/features/products" "$ROOT/frontend/src/features/$PLURAL_L"
echo
echo "Next:"
echo "  1. Edit the fields in $NAME.cs, ${NAME}Contracts.cs, types.ts and ${NAME}Form.tsx"
echo "  2. Create the database migration (run AFTER editing the fields):"
echo "       dotnet tool restore"
echo "       dotnet build \"$API_DIR\""
echo "       dotnet ef migrations add Add$PLURAL --project \"$API_DIR\" --output-dir Common/Data/Migrations"
echo "  3. Restart the API - the migration is applied on startup in Development."
