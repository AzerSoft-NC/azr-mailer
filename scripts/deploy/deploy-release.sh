#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=deploy/_helpers.sh
source "$SCRIPT_DIR/_helpers.sh"

BUMP_KIND="patch"
for arg in "$@"; do
  case "$arg" in
    --minor) BUMP_KIND="minor" ;;
  esac
done

CURRENT="$(deploy_read_version "$ROOT_DIR")"
NEXT="$(deploy_bump_semver "$CURRENT" "$BUMP_KIND")"

echo "Version : $CURRENT -> $NEXT (${BUMP_KIND})"
deploy_set_package_version_semver "$ROOT_DIR" "$NEXT"

echo "Commit, tag et push (v${NEXT})"
git -C "$ROOT_DIR" add package.json
git -C "$ROOT_DIR" commit -m "RELEASE: version ${NEXT}"
git -C "$ROOT_DIR" tag -a "v${NEXT}" -m "RELEASE: version ${NEXT}"
git -C "$ROOT_DIR" push
git -C "$ROOT_DIR" push --tags
