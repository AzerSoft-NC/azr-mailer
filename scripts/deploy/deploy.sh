#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

MINOR=0
NO_RELEASE=0

for arg in "$@"; do
  case "$arg" in
    --minor) MINOR=1 ;;
    --no-release) NO_RELEASE=1 ;;
  esac
done

if [[ -f "$ROOT_DIR/.deploy" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.deploy"
  set +a
fi

echo "==> 1/6 Pré-check (git)"
bash "$SCRIPT_DIR/deploy-pre-check.sh"

echo "==> 2/6 Prettier"
bash "$SCRIPT_DIR/deploy-prettier.sh"

echo "==> 3/6 Lint, typecheck, tests"
bash "$SCRIPT_DIR/deploy-check.sh"

echo "==> 4/6 Build"
yarn --cwd "$ROOT_DIR" build

if [[ "$NO_RELEASE" -eq 0 ]]; then
  echo "==> 5/6 Release (package.json, tag, push)"
  RELEASE_ARGS=()
  [[ "$MINOR" -eq 1 ]] && RELEASE_ARGS+=(--minor)
  bash "$SCRIPT_DIR/deploy-release.sh" "${RELEASE_ARGS[@]}"
else
  echo "==> 5/6 Release (ignoré, --no-release)"
fi

echo "==> 6/6 Déploiement droplet"
bash "$SCRIPT_DIR/deploy-droplet.sh"
