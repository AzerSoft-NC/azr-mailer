#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

echo "Lint"
yarn --cwd "$ROOT_DIR" lint

echo "Typecheck (astro check)"
yarn --cwd "$ROOT_DIR" check

echo "Tests unitaires"
yarn --cwd "$ROOT_DIR" test
